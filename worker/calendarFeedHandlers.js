// worker/calendarFeedHandlers.js — minting and revoking a feed URL (#744).
//
// Two documents, deliberately:
//
//   shohojUsers/{uid}.calendarFeedToken   what THIS student's feed is
//   calendarFeeds/{token}                 whose feed THAT is
//
// The forward pointer is authoritative: anonymous reads must check BOTH
// documents. Atomic commits keep the pointers together, and the owner document's
// updateTime serializes rotations/revocations even across Worker isolates.

import {
  CALENDAR_FEED_COLLECTION,
  calendarFeedPath,
  calendarFeedToken,
  isCalendarFeedToken,
} from './calendarFeed.js';

const MAX_WRITE_ATTEMPTS = 5;

function feedDocPath(token) {
  return `${CALENDAR_FEED_COLLECTION}/${token}`;
}

/** The absolute URL a student pastes into their calendar app. */
function feedUrl(origin, token) {
  return `${origin}${calendarFeedPath(token)}`;
}

/** What the API reports about a student's feed. Null token means none exists. */
function feedBody(ctx, token, createdAt) {
  if (token === null) return { feed: null };
  return { feed: { url: feedUrl(ctx.feedOrigin, token), createdAt: createdAt ?? null } };
}

/** Only valid tokens may become reverse-index document paths. */
function currentToken(fields) {
  const token = fields?.calendarFeedToken;
  return isCalendarFeedToken(token) ? token : null;
}

/** GET — what feed, if any, this student has. */
export async function getCalendarFeed(ctx) {
  const fields = await ctx.deps.getDoc(`shohojUsers/${ctx.firebaseUid}`);
  const token = currentToken(fields);
  if (token === null) return { status: 200, body: feedBody(ctx, null) };

  // Read the reverse doc for its timestamp rather than storing the date twice.
  const feed = await ctx.deps.getDoc(feedDocPath(token));
  if (!feed || feed.firebaseUid !== ctx.firebaseUid) {
    // The forward pointer outlived its reverse doc. The URL is already dead,
    // so report honestly rather than handing back a link that 404s.
    return { status: 200, body: feedBody(ctx, null) };
  }
  return { status: 200, body: feedBody(ctx, token, feed.createdAt) };
}

/**
 * POST — mint a feed, or rotate an existing one.
 *
 * A single conditional commit creates the new reverse pointer, moves only the
 * owner's calendarFeedToken field, and deletes the previous reverse pointer.
 * If another request changes the owner first, reread and retry. A token collision
 * also retries instead of overwriting someone else's credential.
 */
export async function createCalendarFeed(ctx) {
  const userPath = `shohojUsers/${ctx.firebaseUid}`;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const user = await ctx.deps.getDocSnapshot(userPath);
    if (!user?.updateTime) throw new Error('Calendar feed owner is unavailable');
    const previous = currentToken(user.fields);
    const token = calendarFeedToken(ctx.randomHex(16));
    const createdAt = ctx.now().toISOString();
    const writes = [
      {
        path: feedDocPath(token),
        fields: { firebaseUid: ctx.firebaseUid, createdAt },
        exists: false,
      },
      {
        path: userPath,
        fields: { calendarFeedToken: token },
        updateTime: user.updateTime,
      },
    ];
    if (previous !== null && previous !== token) {
      writes.push({ path: feedDocPath(previous), delete: true });
    }
    try {
      await ctx.deps.commitWrites(writes);
      return { status: 200, body: feedBody(ctx, token, createdAt) };
    } catch (error) {
      if (!error.conflict || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
    }
  }
}

/**
 * DELETE — revoke.
 *
 * Clear the authoritative pointer and remove its reverse index atomically.
 * A concurrent rotation forces a retry, so revocation cannot clear the new
 * pointer while leaving its credential accessible.
 */
export async function deleteCalendarFeed(ctx) {
  const userPath = `shohojUsers/${ctx.firebaseUid}`;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const user = await ctx.deps.getDocSnapshot(userPath);
    const token = currentToken(user?.fields);
    if (token === null) break;
    if (!user.updateTime) throw new Error('Calendar feed owner is unavailable');
    try {
      await ctx.deps.commitWrites([
        { path: userPath, fields: { calendarFeedToken: '' }, updateTime: user.updateTime },
        { path: feedDocPath(token), delete: true },
      ]);
      break;
    } catch (error) {
      if (!error.conflict || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
    }
  }
  // Idempotent: revoking a feed that is already gone is a success, not a 404.
  // A student clicking twice should not see an error for getting what they
  // asked for.
  return { status: 200, body: feedBody(ctx, null) };
}
