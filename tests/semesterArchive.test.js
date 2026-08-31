/**
 * tests/semesterArchive.test.js
 * The client's side of the semester archive (#633).
 *
 * The Worker keeps snapshots of semesters the CONNECT feed has dropped. This
 * covers reading its listing without trusting it, building the URLs, and — the
 * part that matters most — saying out loud what a snapshot cannot tell you.
 * A capture presented as though it were the live feed is worse than no capture:
 * it invites a student to trust a seat count frozen months ago.
 */

import {
    archiveCacheKey,
    archiveGapNotice,
    archiveListUrl,
    archivePayloadUrl,
    fetchArchiveListing,
    normalizeArchiveListing,
} from '../js/core/semesterArchive.js';

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

const SNAPSHOT_PROVENANCE = {
    source: 'snapshot', sections: 2010, tbaFaculty: 1184, noSchedule: 27, unnamed: 0, seatsFrozen: true,
};

const LISTING = {
    semesters: [
        { sessionId: 20262, classStartDate: '2026-06-09', classEndDate: '2026-09-08', sections: 2010, archivedAt: 5, provenance: SNAPSHOT_PROVENANCE },
        { sessionId: 20263, classStartDate: '2026-10-03', classEndDate: '2027-01-04', sections: 2086, archivedAt: 9 },
    ],
};

(async () => {

// ---- Reading the listing --------------------------------------------------
await test('the listing reads back newest session first', async () => {
    const out = normalizeArchiveListing(LISTING);
    eq(out.map(s => s.sessionId), [20263, 20262]);
    eq(out[1].classStartDate, '2026-06-09');
    eq(out[1].provenance.tbaFaculty, 1184);
    // A semester the cron took carries no provenance, and that is a real answer.
    eq(out[0].provenance, null);
});

await test('one malformed row costs that row, not the response', async () => {
    // The listing decides whether a semester switcher appears at all. Throwing
    // on a bad field would take away every other semester we hold.
    const out = normalizeArchiveListing({
        semesters: [null, 42, { sessionId: 'x' }, { sessionId: 20261 }, LISTING.semesters[0]],
    });
    eq(out.map(s => s.sessionId), [20262, 20261]);
});

await test('a listing that is not a listing degrades to empty', async () => {
    for (const bad of [null, undefined, {}, { semesters: 'nope' }, [], 'text']) {
        eq(normalizeArchiveListing(bad), [], `expected [] for ${JSON.stringify(bad)}`);
    }
});

await test('an unusable provenance is dropped, not half-read', async () => {
    const out = normalizeArchiveListing({
        semesters: [{ sessionId: 20262, provenance: { source: 7, tbaFaculty: 'lots' } }],
    });
    eq(out[0].provenance, null);
});

// ---- URLs -----------------------------------------------------------------
await test('URLs are built off the worker base, however it is punctuated', async () => {
    eq(archiveListUrl('https://w.example.dev'), 'https://w.example.dev/api/semesters');
    eq(archiveListUrl('https://w.example.dev/'), 'https://w.example.dev/api/semesters');
    eq(archivePayloadUrl('https://w.example.dev/', 20262), 'https://w.example.dev/api/semesters/20262');
});

await test('no worker configured means no URL, not a broken one', async () => {
    // The offline capability set has no worker. A relative "/api/semesters"
    // would resolve against the page and 404 on GitHub Pages.
    for (const bad of [null, undefined, '', 'not-a-url', '//w.example.dev']) {
        eq(archiveListUrl(bad), null, `expected null for ${String(bad)}`);
        eq(archivePayloadUrl(bad, 20262), null);
    }
});

await test('a session id that could not be a session id yields no URL', async () => {
    for (const bad of [12, 20262.5, NaN, Infinity, -20262, 1e9]) {
        eq(archivePayloadUrl('https://w.example.dev', bad), null, `expected null for ${String(bad)}`);
    }
});

await test('an archived semester caches apart from the live feed', async () => {
    // Sharing the live feed's slot would have each eviction rewrite the other.
    assert(!archiveCacheKey(20262).includes('connect_feed'), 'must not collide with the live key');
    assert(archiveCacheKey(20262) !== archiveCacheKey(20263), 'each semester needs its own slot');
});

// ---- Saying what is missing ----------------------------------------------
await test('a snapshot names its gaps, seats first', async () => {
    const [, summer] = normalizeArchiveListing(LISTING);
    const notice = archiveGapNotice(summer);
    // Frozen seats lead because they are the failure that looks fine: a stale
    // number reads exactly like a live one.
    assert(/frozen/.test(notice), notice);
    assert(/1184 of 2010/.test(notice), notice);
    assert(/27 carry no timetable/.test(notice), notice);
});

await test('a snapshot with nothing missing still says it is a snapshot', async () => {
    const notice = archiveGapNotice({
        sessionId: 20262, provenance: { source: 'snapshot', sections: 10, tbaFaculty: 0, noSchedule: 0, unnamed: 0, seatsFrozen: false },
    });
    eq(notice, 'Imported from a saved capture rather than the live feed.');
});

await test('a semester the cron took needs no notice', async () => {
    eq(archiveGapNotice({ sessionId: 20263, provenance: { source: 'feed', sections: 2086, tbaFaculty: 0, noSchedule: 0, unnamed: 0, seatsFrozen: false } }), null);
    eq(archiveGapNotice({ sessionId: 20263, provenance: null }), null);
    eq(archiveGapNotice(null), null);
    eq(archiveGapNotice({}), null);
});

// ---- Fetching -------------------------------------------------------------
await test('the listing is fetched and normalized', async () => {
    let seen = null;
    const fetcher = async (url) => {
        seen = url;
        return { ok: true, async json() { return LISTING; } };
    };
    const out = await fetchArchiveListing({ workerUrl: 'https://w.example.dev', fetcher });
    eq(seen, 'https://w.example.dev/api/semesters');
    eq(out.map(s => s.sessionId), [20263, 20262]);
});

await test('every fetch failure degrades to "only the live feed"', async () => {
    // A switcher that cannot list its options should disappear, not break the
    // route it lives in.
    const cases = [
        async () => ({ ok: false, status: 500, async json() { return {}; } }),
        async () => { throw new Error('offline'); },
        async () => ({ ok: true, async json() { throw new SyntaxError('not json'); } }),
    ];
    for (const fetcher of cases) {
        eq(await fetchArchiveListing({ workerUrl: 'https://w.example.dev', fetcher }), []);
    }
    eq(await fetchArchiveListing({ workerUrl: null, fetcher: cases[0] }), []);
    eq(await fetchArchiveListing({ workerUrl: 'https://w.example.dev', fetcher: null }), []);
});

await test('no worker means no request is attempted at all', async () => {
    let called = 0;
    const fetcher = async () => { called++; return { ok: true, async json() { return LISTING; } }; };
    await fetchArchiveListing({ workerUrl: null, fetcher });
    eq(called, 0);
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

})();
