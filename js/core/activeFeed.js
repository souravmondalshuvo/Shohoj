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

/** Whether a campus's sections come from a snapshot rather than a live feed. */
export function campusHasFeedSnapshot(campusId) {
  return Object.prototype.hasOwnProperty.call(CAMPUS_FEED_SNAPSHOTS, campusId);
}

/** The snapshot for a campus, with the options to fetch it, or null. */
export function feedSnapshotFor(campusId) {
  if (!campusHasFeedSnapshot(campusId)) return null;
  const snapshot = CAMPUS_FEED_SNAPSHOTS[campusId];
  return {
    ...snapshot,
    campusId,
    // Its own cache slot per campus and term: it must never evict, or be
    // served in place of, the live feed or another term's snapshot.
    fetchOptions: {
      url: snapshot.url,
      cacheKey: `shohoj_campus_feed_${campusId}_${snapshot.term}`,
      ttlMs: SNAPSHOT_TTL_MS,
    },
  };
}

/** The active campus's snapshot, or null when it is on the live feed. */
export function getActiveFeedSnapshot() {
  return feedSnapshotFor(getActiveCampus().id);
}
