// src/core/feedFreshness.ts
//
// How the CONNECT feed describes itself in the header badge: where it came from
// and how old it is.
//
// Legacy carries this twice, once per tab — _frAgeLabel (js/ui/freeRoomsTab.js:376)
// and _seatsAgeLabel (js/ui/seatsTab.js:560), byte-identical. It is one function
// here, with `now` as a parameter so it can be tested without touching the clock.
//
// The badge is not decoration. "Cached" on its own cannot tell a student whether
// the seat counts are two minutes or two days old, and during registration that
// is the difference between a usable number and a misleading one.
//
// No imports on purpose: this is pure formatting, and it keeps the module
// loadable by the type-stripping test runner.

/** Legacy's source names for the feed badge (js/ui/seatsTab.js:354). */
export const FEED_SOURCE_LABEL: Readonly<Record<string, string>> = {
  live: 'Live',
  cache: 'Cached',
  fallback: 'Offline cache',
  // Not a feed origin at all: a schedule the student pasted from CONNECT
  // (#633). The badge's job is to be honest about where the data came from, and
  // an imported routine is neither live nor cached.
  imported: 'Pasted from CONNECT',
  // Also not a feed origin: a semester read back from the Worker's archive
  // (#633). fetchConnectFeed reports how it got the bytes, and for an archived
  // semester that is always a fresh network hit — so left to itself the badge
  // said "Live · just now" over a timetable the feed dropped months ago.
  archive: 'Archived',
};

/**
 * What the badge says about itself when it has no age to give.
 *
 * These stand in for "Updated 2 min ago", so each has to answer the question
 * that phrase was answering — where did this come from and why is it not the
 * feed — rather than restate the label already on screen.
 */
export const FEED_SOURCE_TITLE: Readonly<Record<string, string>> = {
  archive: 'Source: the semester archive, not the live feed — CONNECT no longer carries this semester.',
  imported: 'Source: a schedule you pasted from CONNECT, not the live feed.',
};

/**
 * Does an age reading mean anything for this source?
 *
 * Only for the three that are a feed origin. "Live · 2 min ago" answers how
 * current the data is; the other two have no answer to give. An archived
 * semester would be timestamped when we downloaded the snapshot, not by how
 * recent the timetable inside it is, and a pasted schedule was never fetched at
 * all — its `fetchedAt` is 0, which the ladder below reads as "just now".
 *
 * Both were printing a freshness we have not earned, next to data that is
 * explicitly not the live feed.
 */
export function feedSourceHasAge(source: string | null | undefined): boolean {
  return !(source && source in FEED_SOURCE_TITLE);
}

/** Legacy's source name for a feed origin, falling back to its em dash. */
export function feedSourceLabel(source: string | null | undefined): string {
  return (source && FEED_SOURCE_LABEL[source]) || '—';
}

/** How stale the feed is, in legacy's words. */
export function feedAgeLabel(
  fetchedAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!fetchedAt) return 'just now';
  const diff = now - fetchedAt;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(fetchedAt).toLocaleString();
}

/**
 * The badge's own text: an origin, and an age only where one means something.
 *
 * Assembled here rather than at each call site so a source cannot be added to
 * one twin's badge with an age it should not have.
 */
export function feedBadgeText(
  source: string | null | undefined,
  fetchedAt: number | null | undefined,
  now: number = Date.now(),
): string {
  const label = feedSourceLabel(source);
  return feedSourceHasAge(source) ? `${label} · ${feedAgeLabel(fetchedAt, now)}` : label;
}

/** The badge's tooltip, on the same rule. */
export function feedBadgeTitle(
  source: string | null | undefined,
  fetchedAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!feedSourceHasAge(source)) return FEED_SOURCE_TITLE[source as string];
  return `Source: ${feedSourceLabel(source)} • Updated ${feedAgeLabel(fetchedAt, now)}`;
}
