/**
 * tests/connectFeedClient.test.js
 * Exercises the runtime client: cache hit/miss/refresh, ETag round-trip,
 * stale-cache fallback, and error paths. All fetch and storage I/O is
 * injected so the suite stays offline.
 */

import {
    fetchConnectFeed,
    clearConnectFeedCache,
    peekConnectFeedCache,
    DEFAULT_CACHE_KEY,
    DEFAULT_CACHE_TTL_MS,
} from '../js/core/connectFeedClient.js';

let passed = 0, failed = 0;
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { console.log('  ✓ ' + name); passed++; })
        .catch(e => { console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); failed++; });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

// ---- Helpers ----------------------------------------------------------------
function makeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(k, String(v)); },
        removeItem(k) { map.delete(k); },
    };
}

function makeFetcher({ status = 200, body = null, etag = null, throwOn = false } = {}) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url, headers: init && init.headers ? { ...init.headers } : {} });
        if (throwOn) throw new Error('network down');
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : null) },
            json: async () => body,
        };
    };
    fn.calls = calls;
    return fn;
}

const SAMPLE = [{
    sectionId: 1,
    courseCode: 'CSE220',
    courseName: 'DATA STRUCTURES',
    courseCredit: 3,
    sectionName: '01',
    capacity: 30,
    consumedSeat: 10,
    semesterSessionId: 20262,
    faculties: 'ABC',
    roomName: '09B-12C',
    sectionSchedule: {
        classSchedules: [{ day: 'SUNDAY', startTime: '14:00', endTime: '15:20' }],
        midExamDate: '2026-07-26',
        midExamStartTime: '11:00', midExamEndTime: '13:00',
        finalExamDate: '2026-09-13',
        finalExamStartTime: '11:00', finalExamEndTime: '13:00',
    },
}];

// ---- Cold fetch -------------------------------------------------------------
console.log('\ncold fetch (no cache):');
await test('returns live + writes cache + uses fetcher exactly once', async () => {
    const storage = makeStorage();
    const fetcher = makeFetcher({ body: SAMPLE, etag: 'W/"abc"' });
    const t = 1_700_000_000_000;
    const result = await fetchConnectFeed({
        storage, fetcher, now: () => t,
    });
    eq(result.source, 'live');
    eq(result.fetchedAt, t);
    eq(result.etag, 'W/"abc"');
    eq(result.sections.length, 1);
    eq(result.summary.totalSections, 1);
    eq(fetcher.calls.length, 1);
    // Cache was written
    const peek = peekConnectFeedCache(storage);
    eq(peek, { fetchedAt: t, etag: 'W/"abc"' });
});

await test('throws when no fetcher AND no cache', async () => {
    const storage = makeStorage();
    let caught = null;
    try {
        await fetchConnectFeed({ storage, fetcher: null });
    } catch (e) {
        caught = e;
    }
    assert(caught !== null, 'expected throw');
    assert(/no fetcher/.test(caught.message), 'expected message about missing fetcher, got: ' + caught.message);
});

// ---- Cache hit within TTL ---------------------------------------------------
console.log('\ncache hit within TTL:');
await test('returns cache, does not call fetcher', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: 'W/"abc"', payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ body: [], etag: null });
    const result = await fetchConnectFeed({
        storage, fetcher,
        now: () => t0 + (DEFAULT_CACHE_TTL_MS - 1),
    });
    eq(result.source, 'cache');
    eq(result.fetchedAt, t0);
    eq(result.etag, 'W/"abc"');
    eq(fetcher.calls.length, 0);
});

// ---- forceRefresh bypasses cache -------------------------------------------
console.log('\nforceRefresh:');
await test('forceRefresh refetches even when cache is fresh', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: 'W/"old"', payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ body: SAMPLE, etag: 'W/"new"' });
    const t1 = t0 + 1000;
    const result = await fetchConnectFeed({
        storage, fetcher, forceRefresh: true,
        now: () => t1,
    });
    eq(result.source, 'live');
    eq(result.fetchedAt, t1);
    eq(result.etag, 'W/"new"');
    eq(fetcher.calls.length, 1);
    // Sent If-None-Match with the old etag
    eq(fetcher.calls[0].headers['If-None-Match'], 'W/"old"');
});

// ---- TTL expiry -> refetch --------------------------------------------------
console.log('\nTTL expiry:');
await test('refetches once TTL has passed', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: 'W/"abc"', payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ body: SAMPLE, etag: 'W/"abc2"' });
    const result = await fetchConnectFeed({
        storage, fetcher,
        now: () => t0 + DEFAULT_CACHE_TTL_MS + 1,
    });
    eq(result.source, 'live');
    eq(fetcher.calls.length, 1);
});

// ---- 304 Not Modified -------------------------------------------------------
console.log('\n304 Not Modified:');
await test('serves cached payload and refreshes fetchedAt on 304', async () => {
    const t0 = 1_700_000_000_000;
    const t1 = t0 + DEFAULT_CACHE_TTL_MS + 5000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: 'W/"abc"', payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ status: 304, body: null, etag: 'W/"abc"' });
    const result = await fetchConnectFeed({
        storage, fetcher, now: () => t1,
    });
    eq(result.source, 'cache');
    eq(result.fetchedAt, t1);
    eq(result.etag, 'W/"abc"');
    eq(result.sections.length, 1);
    // Cache fetchedAt was refreshed to t1
    const peek = peekConnectFeedCache(storage);
    eq(peek, { fetchedAt: t1, etag: 'W/"abc"' });
});

// ---- Network failure with stale cache --------------------------------------
console.log('\nstale-cache fallback:');
await test('falls back to stale cache when fetch throws', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: 'W/"abc"', payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ throwOn: true });
    const result = await fetchConnectFeed({
        storage, fetcher,
        now: () => t0 + DEFAULT_CACHE_TTL_MS + 1, // stale
    });
    eq(result.source, 'fallback');
    eq(result.fetchedAt, t0);
    eq(result.sections.length, 1);
});

await test('falls back to stale cache on HTTP 500', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: null, payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ status: 500, body: null });
    const result = await fetchConnectFeed({
        storage, fetcher,
        now: () => t0 + DEFAULT_CACHE_TTL_MS + 1,
    });
    eq(result.source, 'fallback');
});

// ---- Network failure with no cache -----------------------------------------
console.log('\nno cache + network failure:');
await test('throws when fetcher fails and no cache exists', async () => {
    const storage = makeStorage();
    const fetcher = makeFetcher({ throwOn: true });
    let caught = null;
    try {
        await fetchConnectFeed({ storage, fetcher });
    } catch (e) {
        caught = e;
    }
    assert(caught !== null, 'expected throw');
});

// ---- Malformed payload ------------------------------------------------------
console.log('\nmalformed payload:');
await test('throws when response body is not an array (and no cache)', async () => {
    const storage = makeStorage();
    const fetcher = makeFetcher({ body: { not: 'an array' }, etag: null });
    let caught = null;
    try {
        await fetchConnectFeed({ storage, fetcher });
    } catch (e) {
        caught = e;
    }
    assert(caught !== null, 'expected throw');
    assert(/not a JSON array/.test(caught.message), 'unexpected message: ' + caught.message);
});

await test('falls back to cache when response body is malformed', async () => {
    const t0 = 1_700_000_000_000;
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({
            fetchedAt: t0, etag: null, payload: SAMPLE,
        }),
    });
    const fetcher = makeFetcher({ body: 'string-not-array', etag: null });
    const result = await fetchConnectFeed({
        storage, fetcher,
        now: () => t0 + DEFAULT_CACHE_TTL_MS + 1,
    });
    eq(result.source, 'fallback');
});

// ---- Cache helpers ----------------------------------------------------------
console.log('\ncache helpers:');
await test('peekConnectFeedCache returns null when storage is empty', () => {
    const storage = makeStorage();
    eq(peekConnectFeedCache(storage), null);
});

await test('clearConnectFeedCache removes the key', () => {
    const storage = makeStorage({
        [DEFAULT_CACHE_KEY]: JSON.stringify({ fetchedAt: 1, etag: null, payload: [] }),
    });
    clearConnectFeedCache(storage);
    eq(storage.map.has(DEFAULT_CACHE_KEY), false);
});

await test('safeRead survives corrupted JSON', async () => {
    const storage = makeStorage({ [DEFAULT_CACHE_KEY]: '{not valid json' });
    const fetcher = makeFetcher({ body: SAMPLE, etag: 'W/"x"' });
    const result = await fetchConnectFeed({
        storage, fetcher, now: () => 1_700_000_000_000,
    });
    eq(result.source, 'live');
});

await test('safeWrite swallows storage throws (quota etc.)', async () => {
    const throwingStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceeded'); },
        removeItem: () => {},
    };
    const fetcher = makeFetcher({ body: SAMPLE, etag: null });
    const result = await fetchConnectFeed({
        storage: throwingStorage, fetcher, now: () => 1_700_000_000_000,
    });
    eq(result.source, 'live');
});

// ----------------------------------------------------------------------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
