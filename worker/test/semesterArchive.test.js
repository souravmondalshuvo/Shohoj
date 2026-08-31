/**
 * worker/test/semesterArchive.test.js
 *
 * #633: the CONNECT feed carries one semester and replaces it wholesale when
 * the next opens for advising. Summer 2026 vanished from it while students were
 * still attending Summer 2026 classes, and there is no archive endpoint
 * upstream. These cover the cron that keeps our own.
 *
 * The test that matters is the flip: after the feed swaps Summer for Fall, the
 * archive must hold both. Everything else is there to make sure the archive
 * cannot be damaged by a bad fetch, and does not cost a fetch per cron tick.
 */

import {
  ARCHIVE_INDEX_KEY,
  ARCHIVE_MIN_INTERVAL_MS,
  archiveIsDue,
  archiveKeyFor,
  lastArchivedAt,
  mergeArchiveIndex,
  normalizeArchiveIndex,
  runSemesterArchiveCron,
  summarizeArchivePayload,
} from '../semesterArchive.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.stack?.split('\n').slice(0, 3).join('\n      ') || err}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

// A payload shaped like the real feed: one session, one dominant term, and a
// handful of late-added sections on their own dates.
function feed(sessionId, start, end, { outliers = 0, size = 200 } = {}) {
  const out = [];
  for (let i = 0; i < size; i++) {
    const late = i < outliers;
    out.push({
      sectionId: sessionId * 100 + i,
      courseCode: 'CSE110',
      semesterSessionId: sessionId,
      sectionSchedule: {
        classStartDate: late ? '2026-09-12' : start,
        classEndDate: late ? '2026-12-27' : end,
        classSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00' }],
      },
    });
  }
  return out;
}

const SUMMER = feed(20262, '2026-06-09', '2026-09-08');
const FALL = feed(20263, '2026-10-03', '2027-01-04', { outliers: 40 });

/** An in-memory R2 stand-in: put/get over a Map, with the .json() R2 gives. */
function fakeBucket(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async put(key, body) {
      store.set(key, typeof body === 'string' ? body : JSON.stringify(body));
    },
    async get(key) {
      if (!store.has(key)) return null;
      const body = store.get(key);
      return { async json() { return JSON.parse(body); }, async text() { return body; } };
    },
  };
}

/** A fetcher that counts calls, so "we skipped" can be asserted, not assumed. */
function fakeFetcher(payload) {
  const calls = { n: 0 };
  const fetcher = async () => {
    calls.n++;
    return { ok: true, async text() { return JSON.stringify(payload); } };
  };
  return { fetcher, calls };
}

(async () => {
  console.log('\nsemesterArchive');

  // ── Reading a payload ─────────────────────────────────────────────────────

  await test('a payload is summarised by session and its majority term dates', () => {
    const s = summarizeArchivePayload(FALL);
    assertEq(s.sessionId, 20263);
    // 40 of 200 sections start three weeks early. The majority defines the term.
    assertEq(s.classStartDate, '2026-10-03');
    assertEq(s.classEndDate, '2027-01-04');
    assertEq(s.sections, 200);
  });

  await test('a response too short to be a semester is refused', () => {
    // The failure this guards: a truncated or rate-limited response parsing as
    // valid JSON and overwriting a good snapshot with a handful of sections.
    assertEq(summarizeArchivePayload(feed(20263, '2026-10-03', '2027-01-04', { size: 10 })), null);
    assertEq(summarizeArchivePayload([]), null);
    assertEq(summarizeArchivePayload({ error: 'rate limited' }), null);
    assertEq(summarizeArchivePayload(null), null);
  });

  await test('a payload with no session id at all is refused', () => {
    const anonymous = SUMMER.map((section) => {
      const copy = { ...section };
      delete copy.semesterSessionId;
      return copy;
    });
    assertEq(summarizeArchivePayload(anonymous), null);
  });

  // ── The manifest ──────────────────────────────────────────────────────────

  await test('merging keeps every session, newest first', () => {
    let index = { semesters: [] };
    index = mergeArchiveIndex(index, summarizeArchivePayload(SUMMER), 1000);
    index = mergeArchiveIndex(index, summarizeArchivePayload(FALL), 2000);
    assertEq(index.semesters.length, 2);
    assertEq(index.semesters[0].sessionId, 20263);
    assertEq(index.semesters[1].sessionId, 20262);
  });

  await test('re-archiving a session updates it rather than duplicating it', () => {
    let index = mergeArchiveIndex({ semesters: [] }, summarizeArchivePayload(FALL), 1000);
    index = mergeArchiveIndex(index, summarizeArchivePayload(FALL), 5000);
    assertEq(index.semesters.length, 1);
    assertEq(index.semesters[0].archivedAt, 5000);
  });

  await test('a corrupt manifest loses entries, not the ones that are still readable', () => {
    const { semesters } = normalizeArchiveIndex({
      semesters: [null, { sessionId: 'nope' }, { sessionId: 20262, archivedAt: 7 }, 42],
    });
    assertEq(semesters.length, 1);
    assertEq(semesters[0].sessionId, 20262);
    assertEq(normalizeArchiveIndex(null).semesters.length, 0);
    assertEq(normalizeArchiveIndex({ semesters: 'x' }).semesters.length, 0);
  });

  await test('lastArchivedAt reports the newest snapshot', () => {
    assertEq(lastArchivedAt({ semesters: [] }), 0);
    assertEq(lastArchivedAt({ semesters: [{ sessionId: 1, archivedAt: 5 }, { sessionId: 2, archivedAt: 9 }] }), 9);
  });

  // ── When to spend a fetch ─────────────────────────────────────────────────

  await test('a fresh snapshot is not re-fetched; a stale one is', () => {
    const now = 1_000_000_000;
    assert(!archiveIsDue(now - 60_000, now), 'a minute old is fresh');
    assert(archiveIsDue(now - ARCHIVE_MIN_INTERVAL_MS, now), 'exactly the interval is due');
    assert(archiveIsDue(now - ARCHIVE_MIN_INTERVAL_MS * 2, now), 'older is due');
  });

  await test('an unknown or future timestamp archives rather than skips', () => {
    // Erring toward keeping data: a clock we cannot reason about should not be
    // able to talk us out of a snapshot.
    const now = 1_000_000_000;
    assert(archiveIsDue(0, now), 'never archived');
    assert(archiveIsDue(NaN, now), 'unparseable');
    assert(archiveIsDue(now + 86_400_000, now), 'a timestamp from the future');
  });

  // ── The cron ──────────────────────────────────────────────────────────────

  await test('the first run archives the payload and the manifest', async () => {
    const bucket = fakeBucket();
    const { fetcher, calls } = fakeFetcher(SUMMER);
    const r = await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: 1000, fetcher });

    assertEq(r.archived, 20262);
    assertEq(r.sections, 200);
    assertEq(calls.n, 1);
    assert(bucket.store.has(archiveKeyFor(20262)), 'the raw payload is kept');
    assert(bucket.store.has(ARCHIVE_INDEX_KEY), 'the manifest is written');
    // The archive holds the feed verbatim, not our summary of it.
    assertEq(JSON.parse(bucket.store.get(archiveKeyFor(20262))).length, 200);
  });

  await test('a run inside the interval costs no fetch at all', async () => {
    const bucket = fakeBucket();
    const first = fakeFetcher(SUMMER);
    await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: 1000, fetcher: first.fetcher });

    const second = fakeFetcher(SUMMER);
    const r = await runSemesterArchiveCron(
      { PAPERS_BUCKET: bucket },
      { now: 1000 + 60_000, fetcher: second.fetcher },
    );
    assertEq(r.skipped, true);
    // The whole point of gating on the manifest first: the cron fires every two
    // minutes, and a skip must not touch the CDN.
    assertEq(second.calls.n, 0, 'skipping must not fetch');
  });

  await test('after a feed flip the archive holds both semesters', async () => {
    // The failure this exists to prevent. Summer is archived while it is being
    // served; the feed then swaps in Fall, and Summer must survive that.
    const bucket = fakeBucket();
    const summer = fakeFetcher(SUMMER);
    await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: 1000, fetcher: summer.fetcher });

    const fall = fakeFetcher(FALL);
    const later = 1000 + ARCHIVE_MIN_INTERVAL_MS;
    const r = await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: later, fetcher: fall.fetcher });

    assertEq(r.archived, 20263);
    assertEq(r.held, 2);
    assert(bucket.store.has(archiveKeyFor(20262)), 'Summer survives the flip');
    assert(bucket.store.has(archiveKeyFor(20263)), 'Fall is archived');

    const index = JSON.parse(bucket.store.get(ARCHIVE_INDEX_KEY));
    assertEq(index.semesters.length, 2);
    assertEq(index.semesters[0].classStartDate, '2026-10-03');
    assertEq(index.semesters[1].classStartDate, '2026-06-09');
  });

  await test('a bad response leaves the existing archive untouched', async () => {
    const bucket = fakeBucket();
    await runSemesterArchiveCron(
      { PAPERS_BUCKET: bucket },
      { now: 1000, fetcher: fakeFetcher(SUMMER).fetcher },
    );
    const before = bucket.store.get(archiveKeyFor(20262));

    const junk = fakeFetcher([{ sectionId: 1, semesterSessionId: 20262 }]); // 1 section
    const r = await runSemesterArchiveCron(
      { PAPERS_BUCKET: bucket },
      { now: 1000 + ARCHIVE_MIN_INTERVAL_MS, fetcher: junk.fetcher },
    );
    assertEq(r.rejected, 'not one semester');
    assertEq(bucket.store.get(archiveKeyFor(20262)), before, 'the good snapshot is unchanged');
  });

  await test('an unparseable body is rejected, not thrown', async () => {
    const bucket = fakeBucket();
    const fetcher = async () => ({ ok: true, async text() { return '<html>502</html>'; } });
    const r = await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: 1000, fetcher });
    assertEq(r.rejected, 'unparseable');
    assertEq(bucket.store.size, 0);
  });

  await test('a failed fetch throws so the cron logs it', async () => {
    const bucket = fakeBucket();
    const fetcher = async () => ({ ok: false, status: 503, async text() { return ''; } });
    let threw = false;
    try {
      await runSemesterArchiveCron({ PAPERS_BUCKET: bucket }, { now: 1000, fetcher });
    } catch (e) {
      threw = /503/.test(e.message);
    }
    assert(threw, 'a 503 must surface, not be swallowed as a silent no-op');
  });

  await test('no bucket binding reports itself instead of crashing the cron', async () => {
    const r = await runSemesterArchiveCron({}, { now: 1000, fetcher: fakeFetcher(SUMMER).fetcher });
    assertEq(r.configured, false);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
