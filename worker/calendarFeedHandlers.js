// worker/calendarFeedHandlers.js — minting and revoking a feed URL (#744).
//
// The handlers decide what the API says; where the token lives, and how a
// rotation stays atomic against a racing one, belongs to the academic store
// (`feedsFor` in academicRepo.js). `ctx.feeds` is already bound to the signed-in
// student, so no handler here can name a different owner.

import { calendarFeedPath, calendarFeedToken } from './calendarFeed.js';

/** The absolute URL a student pastes into their calendar app. */
function feedUrl(origin, token) {
  return `${origin}${calendarFeedPath(token)}`;
}

/** What the API reports about a student's feed. Null token means none exists. */
function feedBody(ctx, token, createdAt) {
  if (token === null) return { feed: null };
  return { feed: { url: feedUrl(ctx.feedOrigin, token), createdAt: createdAt ?? null } };
}

/** GET — what feed, if any, this student has. */
export async function getCalendarFeed(ctx) {
  const feed = await ctx.feeds.current();
  if (feed === null) return { status: 200, body: feedBody(ctx, null) };
  return { status: 200, body: feedBody(ctx, feed.token, feed.createdAt) };
}

/**
 * POST — mint a feed, or rotate an existing one.
 *
 * Each attempt the store makes gets a fresh token, so a retry after a lost race
 * or a collision never reuses a credential somebody else may now hold.
 */
export async function createCalendarFeed(ctx) {
  const { token, createdAt } = await ctx.feeds.rotate(() => ({
    token: calendarFeedToken(ctx.randomHex(16)),
    createdAt: ctx.now().toISOString(),
  }));
  return { status: 200, body: feedBody(ctx, token, createdAt) };
}

/** DELETE — revoke. */
export async function deleteCalendarFeed(ctx) {
  await ctx.feeds.revoke();
  // Idempotent: revoking a feed that is already gone is a success, not a 404.
  // A student clicking twice should not see an error for getting what they
  // asked for.
  return { status: 200, body: feedBody(ctx, null) };
}
