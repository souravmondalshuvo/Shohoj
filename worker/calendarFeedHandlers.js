// worker/calendarFeedHandlers.js — minting and revoking a feed URL (#744).
//
// Two documents, deliberately:
//
//   shohojUsers/{uid}.calendarFeedToken   what THIS student's feed is
//   calendarFeeds/{token}                 whose feed THAT is
//
// The second is the reverse index that makes an anonymous fetch resolvable in
// one keyed read, with no query and no index — the same property the derived
// ids buy everywhere else, reached from the other direction. The first is what
// lets a student see and revoke their own feed without the server having to
// search for it.
//
// Keeping both in step matters more than usual here, because the failure is
// asymmetric. A forward pointer with no reverse doc is a dead link — annoying.
// A reverse doc with no forward pointer is a LIVE URL the student can no longer
// see or revoke, which is the one outcome this feature must never produce. So
// every write order below is chosen to fail in the first direction.

import { CALENDAR_FEED_COLLECTION, calendarFeedPath, calendarFeedToken } from './calendarFeed.js';

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

/** The student's current token, or null. */
async function currentToken(ctx) {
  const fields = await ctx.deps.getDoc(`shohojUsers/${ctx.firebaseUid}`);
  const token = fields?.calendarFeedToken;
  return typeof token === 'string' && token !== '' ? token : null;
}

/** GET — what feed, if any, this student has. */
export async function getCalendarFeed(ctx) {
  const token = await currentToken(ctx);
  if (token === null) return { status: 200, body: feedBody(ctx, null) };

  // Read the reverse doc for its timestamp rather than storing the date twice.
  const feed = await ctx.deps.getDoc(feedDocPath(token));
  if (!feed) {
    // The forward pointer outlived its reverse doc. The URL is already dead,
    // so report honestly rather than handing back a link that 404s.
    return { status: 200, body: feedBody(ctx, null) };
  }
  return { status: 200, body: feedBody(ctx, token, feed.createdAt) };
}

/**
 * POST — mint a feed, or rotate an existing one.
 *
 * Rotation is the revocation story: one call replaces the URL and the old one
 * stops working immediately. The new reverse doc is written BEFORE the old one
 * is deleted and before the pointer moves, so a failure part-way leaves the
 * student with a working feed rather than none.
 *
 * The old doc is deleted LAST. If that delete fails the old URL outlives its
 * rotation, which is the one failure worth being loud about — so it is not
 * swallowed.
 */
export async function createCalendarFeed(ctx) {
  const previous = await currentToken(ctx);
  const token = calendarFeedToken(ctx.randomHex(16));
  const createdAt = ctx.now().toISOString();

  await ctx.deps.patchDoc(feedDocPath(token), {
    firebaseUid: ctx.firebaseUid,
    createdAt,
  });
  await ctx.deps.patchDoc(`shohojUsers/${ctx.firebaseUid}`, { calendarFeedToken: token });

  if (previous !== null && previous !== token) {
    await ctx.deps.deleteDoc(feedDocPath(previous));
  }
  return { status: 200, body: feedBody(ctx, token, createdAt) };
}

/**
 * DELETE — revoke.
 *
 * The reverse doc goes first: that is what actually kills the URL. Clearing the
 * pointer afterwards is bookkeeping, and if it fails the student is left seeing
 * a feed that no longer works — recoverable, and the safe direction.
 */
export async function deleteCalendarFeed(ctx) {
  const token = await currentToken(ctx);
  if (token !== null) {
    await ctx.deps.deleteDoc(feedDocPath(token));
    await ctx.deps.patchDoc(`shohojUsers/${ctx.firebaseUid}`, { calendarFeedToken: '' });
  }
  // Idempotent: revoking a feed that is already gone is a success, not a 404.
  // A student clicking twice should not see an error for getting what they
  // asked for.
  return { status: 200, body: feedBody(ctx, null) };
}
