// tests/reviewsRepo.test.js — unit tests for the typed faculty-reviews read
// repo (#335) over a fake Firestore backend. Covers paging/cursor, the
// pageSize-vs-cap quirk, course uppercasing, the id probe, faculty-profile
// chunking, and empty-input / failed-read guards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReviewsRepo,
  resolvePageSize,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_RECENT,
} from '../src/platform/firebase/reviewsRepo.ts';
import { isShohojError } from '../src/core/errors.ts';

const CONFIG = { apiKey: 'k', authDomain: 'a', projectId: 'p', storageBucket: 'b', messagingSenderId: 'm', appId: 'i' };

// A fake backend over an in-memory review store. Reviews carry a numeric `seq`
// standing in for createdAt (desc). The cursor round-tripped as `after` is the
// last returned doc; the fake finds its position by id to emulate startAfter.
function fakeBackend(reviews = [], profiles = new Map()) {
  const calls = { byFaculty: [], byCourse: [], byId: [], recent: [], profileChunks: [] };
  const sortedDesc = (list) => [...list].sort((a, b) => b.seq - a.seq);
  const sliceAfter = (list, after, limit) => {
    let start = 0;
    if (after) {
      const idx = list.findIndex((r) => r.id === after.id);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const docs = list.slice(start, start + limit);
    return { docs, last: docs.length ? docs[docs.length - 1] : null };
  };
  // `failAll` may be `true` (generic failure) or an Error carrying a Firestore
  // `code`, so tests can exercise the error-code mapping.
  const failure = (f) => (f instanceof Error ? f : new Error('offline'));
  const backend = {
    reviews,
    profiles,
    failAll: false,
    async queryByFaculty({ facultyInitials, courseCode, limit, after }) {
      calls.byFaculty.push({ facultyInitials, courseCode, limit });
      if (backend.failAll) throw failure(backend.failAll);
      const filtered = sortedDesc(
        backend.reviews.filter(
          (r) =>
            r.facultyInitials === facultyInitials &&
            (courseCode === undefined || r.courseCode === courseCode),
        ),
      );
      return sliceAfter(filtered, after, limit);
    },
    async queryByCourse({ courseCode, limit, after }) {
      calls.byCourse.push({ courseCode, limit });
      if (backend.failAll) throw failure(backend.failAll);
      const filtered = sortedDesc(backend.reviews.filter((r) => r.courseCode === courseCode));
      return sliceAfter(filtered, after, limit);
    },
    async getById(id) {
      calls.byId.push(id);
      if (backend.failAll) throw failure(backend.failAll);
      return backend.reviews.find((r) => r.id === id) ?? null;
    },
    async queryRecent(limit) {
      calls.recent.push(limit);
      if (backend.failAll) throw failure(backend.failAll);
      return sortedDesc(backend.reviews).slice(0, limit);
    },
    async getFacultyProfiles(chunk) {
      calls.profileChunks.push([...chunk]);
      if (backend.failAll) throw failure(backend.failAll);
      return chunk
        .filter((id) => backend.profiles.has(id))
        .map((id) => ({ initials: id, ...backend.profiles.get(id) }));
    },
  };
  return { backend, calls };
}

function repoWith(backend, { spyLoads } = {}) {
  let loads = 0;
  const repo = createReviewsRepo({
    config: CONFIG,
    loadBackend: async () => {
      loads++;
      return backend;
    },
  });
  return spyLoads ? { repo, loads: () => loads } : repo;
}

const review = (id, facultyInitials, courseCode, seq) => ({
  id,
  facultyInitials,
  courseCode,
  seq,
  ratings: { teaching: 5, marking: 4, behavior: 5 },
});

test('fetchByFaculty: newest-first, optional course narrowing, normalized inputs', async () => {
  const { backend, calls } = fakeBackend([
    review('r1', 'MRA', 'CSE110', 1),
    review('r2', 'MRA', 'CSE111', 3),
    review('r3', 'MRA', 'CSE110', 2),
    review('r4', 'ZZZ', 'CSE110', 9),
  ]);
  const repo = repoWith(backend);

  const all = await repo.fetchByFaculty({ facultyInitials: 'mra' }); // lowercase → normalized
  assert.deepEqual(all.reviews.map((r) => r.id), ['r2', 'r3', 'r1']);
  assert.equal(all.nextCursor, null);
  assert.equal(calls.byFaculty[0].facultyInitials, 'MRA');

  const scoped = await repo.fetchByFaculty({ facultyInitials: 'MRA', courseCode: 'cse110' });
  assert.deepEqual(scoped.reviews.map((r) => r.id), ['r3', 'r1']);
  assert.equal(calls.byFaculty[1].courseCode, 'CSE110');
});

test('fetchByFaculty: paging returns a cursor only on a full page, then walks it', async () => {
  const reviews = Array.from({ length: 5 }, (_, i) => review(`r${i}`, 'MRA', 'CSE110', i));
  const { backend } = fakeBackend(reviews);
  const repo = repoWith(backend);

  const page1 = await repo.fetchByFaculty({ facultyInitials: 'MRA', pageSize: 2 });
  assert.deepEqual(page1.reviews.map((r) => r.id), ['r4', 'r3']);
  assert.ok(page1.nextCursor, 'full page yields a cursor');

  const page2 = await repo.fetchByFaculty({ facultyInitials: 'MRA', pageSize: 2, after: page1.nextCursor });
  assert.deepEqual(page2.reviews.map((r) => r.id), ['r2', 'r1']);
  assert.ok(page2.nextCursor);

  const page3 = await repo.fetchByFaculty({ facultyInitials: 'MRA', pageSize: 2, after: page2.nextCursor });
  assert.deepEqual(page3.reviews.map((r) => r.id), ['r0']);
  assert.equal(page3.nextCursor, null, 'partial page ends paging');
});

test('fetchByFaculty: over-cap pageSize is capped at 200 AND keeps paging', async () => {
  // Regression: the old code capped the query at 200 but then compared the
  // returned count against the *requested* 500, concluded the page was not
  // full, and dropped the cursor — silently truncating at 200 rows with no way
  // to reach the rest. Both sides now use the resolved size.
  const reviews = Array.from({ length: MAX_PAGE_SIZE + 25 }, (_, i) => review(`r${i}`, 'MRA', 'CSE110', i));
  const { backend, calls } = fakeBackend(reviews);
  const repo = repoWith(backend);

  const page = await repo.fetchByFaculty({ facultyInitials: 'MRA', pageSize: 500 });
  assert.equal(calls.byFaculty[0].limit, MAX_PAGE_SIZE, 'limit capped at 200');
  assert.equal(page.reviews.length, MAX_PAGE_SIZE);
  assert.ok(page.nextCursor, 'a full capped page still yields a cursor');

  // And the cursor actually reaches the remaining rows.
  const page2 = await repo.fetchByFaculty({
    facultyInitials: 'MRA', pageSize: 500, after: page.nextCursor,
  });
  assert.equal(page2.reviews.length, 25, 'the previously unreachable tail');
  assert.equal(page2.nextCursor, null, 'partial page ends paging');
});

test('resolvePageSize: boundary and nonsensical values', () => {
  assert.equal(resolvePageSize(1), 1);
  assert.equal(resolvePageSize(50), 50);
  assert.equal(resolvePageSize(MAX_PAGE_SIZE), MAX_PAGE_SIZE);
  assert.equal(resolvePageSize(MAX_PAGE_SIZE + 1), MAX_PAGE_SIZE);
  assert.equal(resolvePageSize(500), MAX_PAGE_SIZE);
  assert.equal(resolvePageSize(1e9), MAX_PAGE_SIZE);

  // Nonsensical → the safe default, never 0/negative/NaN reaching Firestore.
  for (const bad of [0, -1, -500, Number.NaN, Infinity, -Infinity, 1.5, '  ', 'abc', null, undefined, {}, []]) {
    assert.equal(resolvePageSize(bad), DEFAULT_PAGE_SIZE, `bad input: ${String(bad)}`);
  }
  // A numeric string is still a usable integer.
  assert.equal(resolvePageSize('25'), 25);
  // An explicit fallback is honoured, but never above the cap.
  assert.equal(resolvePageSize(0, MAX_PAGE_SIZE), MAX_PAGE_SIZE);
  assert.equal(resolvePageSize(0, 9999), MAX_PAGE_SIZE);
});

test('fetchByFaculty: empty initials short-circuits without loading the backend', async () => {
  const { backend, calls } = fakeBackend([review('r1', 'MRA', 'CSE110', 1)]);
  const { repo, loads } = repoWith(backend, { spyLoads: true });
  const page = await repo.fetchByFaculty({ facultyInitials: '  ' });
  assert.deepEqual(page, { reviews: [], nextCursor: null });
  assert.equal(calls.byFaculty.length, 0);
  assert.equal(loads(), 0, 'SDK never loads for a no-op');
});

test('fetchByCourse: uppercases the code, defaults pageSize to the 200 cap', async () => {
  const { backend, calls } = fakeBackend([
    review('r1', 'MRA', 'CSE110', 1),
    review('r2', 'ZZZ', 'CSE110', 2),
  ]);
  const repo = repoWith(backend);

  const page = await repo.fetchByCourse('cse110');
  assert.deepEqual(page.reviews.map((r) => r.id), ['r2', 'r1']);
  assert.equal(calls.byCourse[0].courseCode, 'CSE110');
  assert.equal(calls.byCourse[0].limit, MAX_PAGE_SIZE);

  const empty = await repo.fetchByCourse('');
  assert.deepEqual(empty, { reviews: [], nextCursor: null });
  assert.equal(calls.byCourse.length, 1, 'empty code short-circuits');
});

test('fetchById: hit, miss, and non-string guard', async () => {
  const { backend, calls } = fakeBackend([review('CSE_CSE110_' + 'a'.repeat(64), 'CSE', 'CSE110', 1)]);
  const repo = repoWith(backend);

  const hit = await repo.fetchById('CSE_CSE110_' + 'a'.repeat(64));
  assert.equal(hit.id, 'CSE_CSE110_' + 'a'.repeat(64));
  assert.equal(await repo.fetchById('nope'), null);
  assert.equal(await repo.fetchById(''), null);
  assert.equal(await repo.fetchById(undefined), null);
  assert.equal(calls.byId.length, 2, 'guarded ids never hit the backend');
});

test('fetchFacultyProfiles: dedupes, uppercases, chunks by 30, merges results', async () => {
  const profiles = new Map();
  for (let i = 0; i < 35; i++) profiles.set(`F${i}`, { count: i });
  const { backend, calls } = fakeBackend([], profiles);
  const repo = repoWith(backend);

  const initials = [];
  for (let i = 0; i < 35; i++) initials.push(`f${i}`, `f${i}`); // duplicated + lowercase
  const out = await repo.fetchFacultyProfiles(initials);

  assert.equal(out.length, 35);
  assert.deepEqual(calls.profileChunks.map((c) => c.length), [30, 5], 'two chunks: 30 then 5');
  assert.equal(out[0].initials, 'F0');
});

test('fetchFacultyProfiles: empty / all-blank input short-circuits', async () => {
  const { backend, calls } = fakeBackend();
  const { repo, loads } = repoWith(backend, { spyLoads: true });
  assert.deepEqual(await repo.fetchFacultyProfiles([]), []);
  assert.deepEqual(await repo.fetchFacultyProfiles(['', '  ']), []);
  assert.equal(calls.profileChunks.length, 0);
  assert.equal(loads(), 0);
});

// Behaviour change: a failed read is no longer indistinguishable from "no
// reviews". Swallowing it into [] meant a permission-denied or missing-index
// failure rendered as a cheerful empty state.
test('failed reads reject with a typed ShohojError, not an empty result', async () => {
  const { backend } = fakeBackend([review('r1', 'MRA', 'CSE110', 1)]);
  backend.failAll = true;
  const repo = repoWith(backend);

  const reads = [
    () => repo.fetchByFaculty({ facultyInitials: 'MRA' }),
    () => repo.fetchByCourse('CSE110'),
    () => repo.fetchById('r1'),
    () => repo.fetchRecent(),
    () => repo.fetchFacultyProfiles(['MRA']),
  ];
  for (const read of reads) {
    await assert.rejects(read, (e) => {
      assert.ok(isShohojError(e), 'rejects with a ShohojError');
      assert.ok(e.userMessage, 'carries a user-safe message');
      return true;
    });
  }
});

test('permission-denied maps to a permission error; outage maps to unavailable', async () => {
  const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });
  const { backend } = fakeBackend([]);
  backend.failAll = denied;
  const repo = repoWith(backend);
  await assert.rejects(
    () => repo.fetchRecent(),
    (e) => e.code === 'permission' && !e.userMessage.includes('permissions.'),
  );

  const offline = Object.assign(new Error('backend unreachable'), { code: 'unavailable' });
  backend.failAll = offline;
  await assert.rejects(() => repo.fetchRecent(), (e) => e.code === 'firebase_unavailable');

  // A missing composite index is a deployment fault, not "no data".
  const noIndex = Object.assign(new Error('The query requires an index.'), {
    code: 'failed-precondition',
  });
  backend.failAll = noIndex;
  await assert.rejects(() => repo.fetchRecent(), (e) => e.code === 'firebase_unavailable');
});

test('a genuinely empty collection still resolves to an empty result', async () => {
  // The distinction the typed errors buy us: empty must still mean empty.
  const { backend } = fakeBackend([]);
  const repo = repoWith(backend);
  assert.deepEqual(await repo.fetchByFaculty({ facultyInitials: 'MRA' }), { reviews: [], nextCursor: null });
  assert.deepEqual(await repo.fetchRecent(), []);
  assert.equal(await repo.fetchById('nope'), null);
});

test('fetchRecent: newest-first, default limit, and the 1000 cap', async () => {
  const reviews = Array.from({ length: 6 }, (_, i) => review(`r${i}`, 'MRA', 'CSE110', i));
  const { backend, calls } = fakeBackend(reviews);
  const repo = repoWith(backend);

  const recent = await repo.fetchRecent();
  assert.deepEqual(recent.map((r) => r.id), ['r5', 'r4', 'r3', 'r2', 'r1', 'r0']);
  assert.equal(calls.recent[0], 200, 'default limit 200');

  await repo.fetchRecent(50);
  assert.equal(calls.recent[1], 50);

  await repo.fetchRecent(5000);
  assert.equal(calls.recent[2], MAX_RECENT, 'capped at 1000');
});
