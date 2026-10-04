// js/core/campusFeeds.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:campus-feed
// Source of truth: data/campuses/<id>/sections/ and calendar/
//
// The section feed for each campus whose routine is built from a snapshot in
// the campus database rather than from a live feed. `url` is relative to the
// page; the file is fetched on demand and is not part of the bundle.
//
// `capturedOn` is the day the snapshot was true. Nothing here is live: no
// seat count is carried, and faculty and rooms are as published on that day.

/** campus id → { url, capturedOn, term, semesterSessionId, source, … }. */
export const CAMPUS_FEED_SNAPSHOTS = {
  "nsu": {"url":"feeds/nsu-263.json","capturedOn":"2026-09-23","term":"263","semesterSessionId":20263,"source":"rds4plus-263","sectionCount":3787,"courseCount":721,"untimedCount":252,"classStartDate":"2026-09-20","classEndDate":"2026-12-20"},
};
