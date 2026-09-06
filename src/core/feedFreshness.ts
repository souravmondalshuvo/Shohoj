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
 * Does an age reading mean anything for this source?
 *
 * "Live · 2 min ago" answers how current the data is. An archived semester has
 * no answer to give: the timestamp would say when we downloaded the snapshot,
 * not how recent the timetable inside it is. Printed next to a semester CONNECT
 * no longer carries, that reads as a freshness guarantee we have not earned.
 */
export function feedSourceHasAge(source: string | null | undefined): boolean {
  return source !== 'archive';
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
