// ── ACTIVE FEED (legacy bundle) ──────────────────────────────────────────────
//
// Where the Routine tab's sections come from for the campus the page is
// showing. Two kinds of answer:
//
//   null      the live CONNECT feed (BRACU): fetched from the CDN, polled, and
//             shared with the Seats and Free Rooms tabs
//   snapshot  a section file generated from the campus database
//             (js/core/campusFeeds.generated.js): fetched from this site, once,
//             and true only as of the day it was captured
//
// A snapshot is in the same raw shape as the live feed — that is the point of
// scripts/campus_feed.mjs — so the tab parses, grids and clash-checks it with
// the code it already has. What differs is everything about freshness: a
// snapshot is not polled, is not broadcast to the other feed tabs, has no seat
// counts, and has to say how old it is.

import { getActiveCampus } from './activeCampus.js';
import { CAMPUS_FEED_SNAPSHOTS } from './campusFeeds.generated.js';

/** Long, because nothing changes between deploys; the ETag still revalidates. */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

const SNAPSHOT_CACHE_PREFIX = 'shohoj_campus_feed_';

const snapshotCacheKey = (campusId, snapshot) =>
  `${SNAPSHOT_CACHE_PREFIX}${campusId}_${snapshot.term}_${snapshot.revision}`;

/** Whether a campus's sections come from a snapshot rather than a live feed. */
export function campusHasFeedSnapshot(campusId) {
  return Object.prototype.hasOwnProperty.call(CAMPUS_FEED_SNAPSHOTS, campusId);
}

/**
 * Whether a campus's snapshot can also say which rooms are free: it has to
 * hold every class that could be in a room. DIU's holds a few departments'.
 */
export function campusFeedSnapshotHasRooms(campusId) {
  return campusHasFeedSnapshot(campusId) && CAMPUS_FEED_SNAPSHOTS[campusId].freeRooms === true;
}

/** The snapshot for a campus, with the options to fetch it, or null. */
export function feedSnapshotFor(campusId) {
  if (!campusHasFeedSnapshot(campusId)) return null;
  const snapshot = CAMPUS_FEED_SNAPSHOTS[campusId];
  return {
    ...snapshot,
    campusId,
    // Its own cache slot per campus, term and revision: it must never evict,
    // or be served in place of, the live feed, another term's snapshot, or
    // this one as it was before a regeneration. The revision rides on the URL
    // too, past any HTTP cache still holding the old file.
    fetchOptions: {
      url: `${snapshot.url}?v=${snapshot.revision}`,
      cacheKey: snapshotCacheKey(campusId, snapshot),
      ttlMs: SNAPSHOT_TTL_MS,
    },
  };
}

/**
 * Remove saved snapshots this build no longer serves — an older revision or
 * term, under the old revision-less key, or a campus dropped from the list —
 * so each regeneration does not leave a megabyte behind in localStorage.
 */
export function pruneFeedSnapshotCaches(
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
) {
  if (!storage) return;
  const keep = new Set(
    Object.entries(CAMPUS_FEED_SNAPSHOTS).map(([id, snapshot]) => snapshotCacheKey(id, snapshot)),
  );
  try {
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(SNAPSHOT_CACHE_PREFIX) && !keep.has(key)) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    /* storage unavailable: nothing to prune */
  }
}

/** The active campus's snapshot, or null when it is on the live feed. */
export function getActiveFeedSnapshot() {
  return feedSnapshotFor(getActiveCampus().id);
}
