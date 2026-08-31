// Keep the semesters the CONNECT feed forgets.
//
// `usis-cdn.eniamza.com/connect.json` is an advising feed. It carries exactly
// one semester and replaces it wholesale the moment the next opens for
// registration — on 2026-08-31 it held only Fall 2026 while Summer 2026 was
// still in progress, and the Summer timetable was simply gone. There is no
// archive endpoint upstream (#633).
//
// So we keep our own. The Worker already polls this feed every two minutes for
// seat alerts; this rides the same scheduled handler but at its own, much
// slower cadence, because an archive only has to be recent enough to catch the
// outgoing semester before it disappears.
//
// Pure helpers first, I/O at the bottom, so the interesting decisions are
// testable without R2 or the network.

/** R2 key prefix. One object per semester, holding the raw feed payload. */
export const ARCHIVE_PREFIX = 'semesters/';

/** R2 key of the manifest: what we hold, without downloading any of it. */
export const ARCHIVE_INDEX_KEY = 'semesters/index.json';

/**
 * How long a snapshot stays good enough.
 *
 * The cron fires every two minutes for seat alerts. Archiving on every tick
 * would mean 720 fetches and 720 multi-megabyte writes a day to record a thing
 * that changes three times a year. Six hours costs four extra fetches a day and
 * still catches a semester well before a flip: registration opens weeks ahead
 * of the changeover, not minutes.
 */
export const ARCHIVE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Refuse to archive a payload too small to be a real semester. */
const MIN_PLAUSIBLE_SECTIONS = 50;

/**
 * The most common value, ties broken by sort order.
 *
 * Deliberately the same rule as `describeSemester` in the app's semesterIdentity
 * module: term dates come from the majority, because the feed has genuine
 * outliers (43 of 2086 Fall sections started three weeks early) and one
 * late-added section must not redefine when a semester begins. The two cannot
 * share code — this bundle is built from worker/ alone — so they share the rule
 * and a test that pins it.
 */
function modalValue(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value) {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : null;
}

/**
 * Describe a raw CONNECT payload well enough to index it.
 *
 * Returns null for anything that is not recognisably one semester's sections —
 * a truncated response, an error page parsed as JSON, a feed mid-changeover
 * holding two sessions. Refusing is the point: an archive is only worth having
 * if a bad fetch cannot overwrite a good snapshot.
 */
export function summarizeArchivePayload(payload) {
  if (!Array.isArray(payload) || payload.length < MIN_PLAUSIBLE_SECTIONS) return null;

  const sessionIds = [];
  const starts = [];
  const ends = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.semesterSessionId === 'number') sessionIds.push(entry.semesterSessionId);
    const schedule = entry.sectionSchedule;
    if (schedule && typeof schedule === 'object') {
      const start = dateOrNull(schedule.classStartDate);
      const end = dateOrNull(schedule.classEndDate);
      if (start !== null) starts.push(start);
      if (end !== null) ends.push(end);
    }
  }

  const sessionId = modalValue(sessionIds);
  if (sessionId === null) return null;

  return {
    sessionId,
    classStartDate: modalValue(starts),
    classEndDate: modalValue(ends),
    sections: payload.length,
  };
}

/** Read a manifest defensively — a corrupt one must not lose what we hold. */
export function normalizeArchiveIndex(raw) {
  const list = raw && Array.isArray(raw.semesters) ? raw.semesters : [];
  const semesters = [];
  for (const entry of list) {
    if (!entry || typeof entry.sessionId !== 'number') continue;
    const row = {
      sessionId: entry.sessionId,
      classStartDate: dateOrNull(entry.classStartDate),
      classEndDate: dateOrNull(entry.classEndDate),
      sections: Number.isFinite(entry.sections) ? Number(entry.sections) : 0,
      archivedAt: Number.isFinite(entry.archivedAt) ? Number(entry.archivedAt) : 0,
    };
    // Carried through untouched. A hand-imported snapshot records what it could
    // not capture — frozen seat counts, unassigned faculty — and the client
    // shows that to the student. The cron never writes it, but it must never
    // erase it either: a re-archive that dropped provenance would turn a
    // labelled capture back into one pretending to be live.
    if (entry.provenance && typeof entry.provenance === 'object') {
      row.provenance = entry.provenance;
    }
    semesters.push(row);
  }
  return { semesters };
}

/**
 * Fold one snapshot into the manifest, newest session first.
 *
 * Re-archiving a session we already hold updates it in place: the feed keeps
 * moving during registration and the last snapshot before a flip is the one
 * worth keeping.
 */
export function mergeArchiveIndex(index, summary, archivedAt) {
  const { semesters } = normalizeArchiveIndex(index);
  const previous = semesters.find((s) => s.sessionId === summary.sessionId);
  const entry = { ...summary, archivedAt };
  // A snapshot's provenance outlives the snapshot. If the live feed ever serves
  // this session again the cron overwrites the payload, but the entry keeps
  // saying where it came from until someone decides otherwise — silently
  // upgrading a capture to "live" is the one claim we must not make by accident.
  if (previous && previous.provenance) entry.provenance = previous.provenance;
  const next = semesters.filter((s) => s.sessionId !== summary.sessionId);
  next.push(entry);
  next.sort((a, b) => b.sessionId - a.sessionId);
  return { semesters: next };
}

/**
 * Is a fetch worth spending?
 *
 * `lastArchivedAt` is the newest archivedAt in the manifest. An unknown or
 * future timestamp means archive now — a clock we cannot reason about should
 * make us keep data, not skip it.
 */
export function archiveIsDue(lastArchivedAt, now, minIntervalMs = ARCHIVE_MIN_INTERVAL_MS) {
  if (!Number.isFinite(lastArchivedAt) || lastArchivedAt <= 0) return true;
  if (lastArchivedAt > now) return true;
  return now - lastArchivedAt >= minIntervalMs;
}

/** Newest archivedAt across a manifest, or 0 when it holds nothing. */
export function lastArchivedAt(index) {
  const { semesters } = normalizeArchiveIndex(index);
  let latest = 0;
  for (const s of semesters) if (s.archivedAt > latest) latest = s.archivedAt;
  return latest;
}

/** R2 key for one semester's raw payload. */
export function archiveKeyFor(sessionId) {
  return `${ARCHIVE_PREFIX}${sessionId}.json`;
}

// ── I/O ──────────────────────────────────────────────────────────────────────

async function readIndex(bucket) {
  const obj = await bucket.get(ARCHIVE_INDEX_KEY);
  if (!obj) return { semesters: [] };
  try {
    return normalizeArchiveIndex(await obj.json());
  } catch {
    // A manifest we cannot parse is treated as empty, which re-archives the
    // current semester and rewrites it. The payload objects are untouched.
    return { semesters: [] };
  }
}

/**
 * Snapshot the current semester if the last one is old enough.
 *
 * Reads the manifest before fetching, so a skipped run costs one small R2 get
 * and no CDN traffic at all.
 */
export async function runSemesterArchiveCron(env, options = {}) {
  const bucket = env.PAPERS_BUCKET;
  if (!bucket) return { configured: false, reason: 'no R2 bucket binding' };

  const now = options.now ?? Date.now();
  const fetcher = options.fetcher ?? fetch;
  const feedUrl = options.feedUrl ?? 'https://usis-cdn.eniamza.com/connect.json';
  const minIntervalMs = options.minIntervalMs ?? ARCHIVE_MIN_INTERVAL_MS;

  const index = await readIndex(bucket);
  if (!archiveIsDue(lastArchivedAt(index), now, minIntervalMs)) {
    return { configured: true, skipped: true, held: index.semesters.length };
  }

  const response = await fetcher(feedUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Feed fetch ${response.status}`);
  const body = await response.text();

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { configured: true, rejected: 'unparseable', held: index.semesters.length };
  }

  const summary = summarizeArchivePayload(payload);
  if (summary === null) {
    // Leave what we hold alone. A short or malformed response overwriting a
    // good snapshot is the one failure this whole thing exists to prevent.
    return { configured: true, rejected: 'not one semester', held: index.semesters.length };
  }

  // Payload first, manifest second. A crash between the two leaves an object
  // nothing points at, which is recoverable; the reverse would advertise a
  // semester that is not there.
  await bucket.put(archiveKeyFor(summary.sessionId), body, {
    httpMetadata: { contentType: 'application/json' },
  });
  const nextIndex = mergeArchiveIndex(index, summary, now);
  await bucket.put(ARCHIVE_INDEX_KEY, JSON.stringify(nextIndex), {
    httpMetadata: { contentType: 'application/json' },
  });

  return {
    configured: true,
    archived: summary.sessionId,
    sections: summary.sections,
    held: nextIndex.semesters.length,
  };
}
