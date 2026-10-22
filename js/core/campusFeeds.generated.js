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
// `revision` names the file's contents, so a copy cached before a
// regeneration is never served as the new one.
// `capturedOn` is the day the snapshot was true. Nothing here is live: no
// seat count is carried, and faculty and rooms are as published on that day.
// `freeRooms` is whether it holds enough of the timetable to say which rooms
// are free; `programs`, when set, are the only programs whose sections it has.

/** campus id → { url, revision, capturedOn, freeRooms, term, semesterSessionId, source, … }. */
export const CAMPUS_FEED_SNAPSHOTS = {
  "nsu": {"url":"feeds/nsu-263.json","revision":"b55cf52361","capturedOn":"2026-09-28","freeRooms":true,"term":"263","semesterSessionId":20263,"source":"nsuer-263","programs":null,"sectionCount":3818,"courseCount":734,"untimedCount":252,"classStartDate":"2026-09-20","classEndDate":"2026-12-20","noClassDays":[{"date":"2026-10-19","event":"No Classes"},{"date":"2026-10-20","event":"Holiday- Durga Puja"},{"date":"2026-10-21","event":"Holiday- Durga Puja"},{"date":"2026-10-22","event":"No Classes"},{"date":"2026-11-07","event":"Holiday - National Revolution and Solidarity Day"},{"date":"2026-12-06","event":"No Classes"},{"date":"2026-12-16","event":"Holiday- Victory Day"}],"lastClassDays":[{"date":"2026-12-15","days":["SUNDAY","TUESDAY"]},{"date":"2026-12-19","days":["THURSDAY","SATURDAY"]},{"date":"2026-12-20","days":["MONDAY","WEDNESDAY"]}],"examStartDate":"2026-12-22","examEndDate":"2026-12-28"},
  "diu": {"url":"feeds/diu-263.json","revision":"310ff9e75b","capturedOn":"2026-10-14","freeRooms":false,"term":"263","semesterSessionId":20263,"source":"diu-cse-routine-263-v41","programs":["CSE","ENG","SWE"],"sectionCount":1884,"courseCount":180,"untimedCount":0,"classStartDate":"2026-09-09","classEndDate":"2026-12-16","noClassDays":[],"lastClassDays":[],"examStartDate":"2026-12-17","examEndDate":"2026-12-24"},
};
