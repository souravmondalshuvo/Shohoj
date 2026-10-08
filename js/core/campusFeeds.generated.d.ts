// Types for js/core/campusFeeds.generated.js — the section snapshot each
// snapshot-fed campus reads. Hand-written twin of the generated module, same
// convention as catalog.d.ts; scripts/generate_campus_feed.mjs writes the
// fields listed here.

export interface CampusFeedSnapshot {
  /** Relative to the site root, e.g. "feeds/nsu-263.json". */
  url: string;
  /** ISO date the snapshot was true on. Nothing in it is live. */
  capturedOn: string;
  term: string;
  semesterSessionId: number;
  source: string;
  sectionCount: number;
  courseCount: number;
  untimedCount: number;
  classStartDate: string;
  classEndDate: string;
  /** Holidays and "No Classes" days inside the term, in date order. */
  noClassDays: { date: string; event: string }[];
  /** Each day pattern's last class day, where the campus ends them separately. */
  lastClassDays: { date: string; days: string[] }[];
  /** The final exam window, or null when the calendar names none. */
  examStartDate: string | null;
  examEndDate: string | null;
}

/** campus id → its snapshot. Only campuses fed from a snapshot have an entry. */
export const CAMPUS_FEED_SNAPSHOTS: { nsu: CampusFeedSnapshot } & Record<
  string,
  CampusFeedSnapshot | undefined
>;
