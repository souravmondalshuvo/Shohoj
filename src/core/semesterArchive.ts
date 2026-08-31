// Reading the semesters the Worker kept.
//
// The CONNECT feed serves one semester and forgets the rest, so the Worker
// snapshots each one into R2 and serves them back at /api/semesters (#633).
// This is the client's side of that: where the URLs are, how to read the
// listing safely, and how to say out loud what a given snapshot cannot tell
// you.
//
// The payloads themselves go through `fetchConnectFeed`, which already takes a
// `url` and a `cacheKey`. An archived semester is the same JSON from a
// different host, so it needs no second fetch path — only a different pair of
// arguments.

/** What a snapshot could not capture. Absent for a semester taken live. */
export interface ArchiveProvenance {
  /** 'snapshot' for a hand-imported capture, 'feed' for one the cron took. */
  source: string;
  sections: number;
  /** Sections whose instructor was still unassigned at capture. */
  tbaFaculty: number;
  /** Sections with no timetable at all. */
  noSchedule: number;
  /** Sections whose course name could not be resolved. */
  unnamed: number;
  /** Registration numbers stop moving the instant a snapshot is taken. */
  seatsFrozen: boolean;
}

export interface ArchivedSemester {
  sessionId: number;
  classStartDate: string | null;
  classEndDate: string | null;
  sections: number;
  archivedAt: number;
  provenance: ArchiveProvenance | null;
}

// Prefixed because the legacy build flattens every module into one scope:
// a bare ISO_DATE here would collide with semesterIdentity's and one of the
// two would be silently dropped (scripts/check_bundle_collisions.py).
const ARCHIVE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value: unknown): string | null {
  return typeof value === 'string' && ARCHIVE_ISO_DATE.test(value) ? value : null;
}

function intOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeProvenance(raw: unknown): ArchiveProvenance | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.source !== 'string' || p.source === '') return null;
  return {
    source: p.source,
    sections: intOr(p.sections, 0),
    tbaFaculty: intOr(p.tbaFaculty, 0),
    noSchedule: intOr(p.noSchedule, 0),
    unnamed: intOr(p.unnamed, 0),
    seatsFrozen: p.seatsFrozen === true,
  };
}

/**
 * Read the listing defensively, newest session first.
 *
 * A field we cannot make sense of drops that entry rather than the response:
 * one malformed row must not cost the student every other semester we hold.
 */
export function normalizeArchiveListing(raw: unknown): ArchivedSemester[] {
  const body = raw as { semesters?: unknown } | null;
  const list = body && Array.isArray(body.semesters) ? body.semesters : [];
  const out: ArchivedSemester[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.sessionId !== 'number' || !Number.isInteger(entry.sessionId)) continue;
    out.push({
      sessionId: entry.sessionId,
      classStartDate: dateOrNull(entry.classStartDate),
      classEndDate: dateOrNull(entry.classEndDate),
      sections: intOr(entry.sections, 0),
      archivedAt: intOr(entry.archivedAt, 0),
      provenance: normalizeProvenance(entry.provenance),
    });
  }
  out.sort((a, b) => b.sessionId - a.sessionId);
  return out;
}

/** Trailing slash off, so callers can join paths without doubling it. */
function trimBase(workerUrl: string | null | undefined): string | null {
  if (typeof workerUrl !== 'string' || !workerUrl.startsWith('http')) return null;
  return workerUrl.replace(/\/+$/, '');
}

/** URL of the listing, or null when no Worker is configured. */
export function archiveListUrl(workerUrl: string | null | undefined): string | null {
  const base = trimBase(workerUrl);
  return base === null ? null : `${base}/api/semesters`;
}

/** URL of one archived semester's payload, or null when unavailable. */
export function archivePayloadUrl(
  workerUrl: string | null | undefined,
  sessionId: number,
): string | null {
  const base = trimBase(workerUrl);
  if (base === null) return null;
  if (!Number.isInteger(sessionId) || sessionId < 1000 || sessionId > 999999) return null;
  return `${base}/api/semesters/${sessionId}`;
}

/**
 * Cache key for an archived semester.
 *
 * Deliberately not the live feed's key. An archived semester and the live one
 * are different data with different lifetimes, and sharing a slot would have
 * each eviction rewrite the other.
 */
export function archiveCacheKey(sessionId: number): string {
  return `shohoj_semester_archive_v1:${sessionId}`;
}

/**
 * What this semester's data cannot tell you, in a sentence, or null when there
 * is nothing to warn about.
 *
 * A snapshot shown as though it were the live feed is worse than no snapshot:
 * it invites a student to trust a seat count frozen months ago. Faculty and
 * seats are called out separately because they fail differently — one is
 * missing, the other is stale, and "stale" is the one that looks fine.
 */
export function archiveGapNotice(entry: ArchivedSemester | null | undefined): string | null {
  const p = entry?.provenance;
  if (!p || p.source !== 'snapshot') return null;

  const parts: string[] = [];
  if (p.seatsFrozen) parts.push('seat counts are frozen at the moment it was captured');
  if (p.tbaFaculty > 0) {
    parts.push(`${p.tbaFaculty} of ${p.sections} sections had no instructor assigned yet`);
  }
  if (p.noSchedule > 0) parts.push(`${p.noSchedule} carry no timetable`);

  if (parts.length === 0) return 'Imported from a saved capture rather than the live feed.';
  return `Imported from a saved capture rather than the live feed: ${parts.join(', ')}.`;
}

/**
 * Fetch the listing. Returns [] rather than throwing on any failure.
 *
 * The listing decides whether a semester switcher appears at all, so a failure
 * here must degrade to "only the live feed" — never to a broken route.
 */
export async function fetchArchiveListing(
  options: {
    workerUrl?: string | null;
    fetcher?: typeof fetch | null;
    signal?: AbortSignal;
  } = {},
): Promise<ArchivedSemester[]> {
  const url = archiveListUrl(options.workerUrl);
  if (url === null) return [];
  const fetcher =
    options.fetcher === undefined ? (typeof fetch !== 'undefined' ? fetch : null) : options.fetcher;
  if (!fetcher) return [];
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
    if (!response.ok) return [];
    return normalizeArchiveListing(await response.json());
  } catch {
    return [];
  }
}
