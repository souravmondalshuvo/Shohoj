/**
 * tests/seatWatch.test.js
 * Pure tests for the seat-watch core: watchlist add/remove/dedup/cap, the
 * edge-triggered transition detector (evaluateWatches), and the tolerant
 * localStorage round-trip (serialize/parse).
 */

import {
    MAX_WATCHES,
    hasSeat,
    makeWatch,
    isWatched,
    addWatch,
    removeWatch,
    indexBySectionId,
    evaluateWatches,
    serializeWatches,
    parseWatches,
} from '../js/core/seatWatch.js';
import { parseFeed } from '../js/core/connectFeed.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

function rawSec(over) {
    return {
        courseId: 1, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
        faculties: 'ABC', roomName: 'R1',
        sectionSchedule: { classSchedules: [] },
        ...over,
    };
}

// §01 open (10/30), §02 full (30/30), §10 tight-but-open (18/20, 2 left).
function feed(over02 = {}) {
    return parseFeed([
        rawSec({ sectionId: 1, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '01', capacity: 30, consumedSeat: 10 }),
        rawSec({ sectionId: 2, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '02', capacity: 30, consumedSeat: 30, ...over02 }),
        rawSec({ sectionId: 10, courseCode: 'CSE220', courseName: 'Data Structures', sectionName: '10', capacity: 20, consumedSeat: 18 }),
    ]).sections;
}

function byId(sections) { return indexBySectionId(sections); }
function find(sections, id) { return sections.find(s => s.sectionId === id); }

// ── seat predicate ────────────────────────────────────────────────────────────
test('hasSeat: open true, full false', () => {
    const s = feed();
    assert(hasSeat(find(s, 1)) === true, 'open section has a seat');
    assert(hasSeat(find(s, 2)) === false, 'full section has no seat');
    assert(hasSeat(find(s, 10)) === true, 'tight-but-open section has a seat');
});

// ── makeWatch seeds hadSeat from current state ─────────────────────────────────
test('makeWatch: seeds hadSeat from the section, copies identity fields', () => {
    const s = feed();
    const full = makeWatch(find(s, 2), 1000);
    eq(full, { sectionId: 2, courseCode: 'CSE220', sectionName: '02', addedAt: 1000, hadSeat: false });
    const open = makeWatch(find(s, 1), 2000);
    assert(open.hadSeat === true, 'watching an already-open section seeds hadSeat=true');
});

// ── list ops: add / dedup / remove / cap ───────────────────────────────────────
test('addWatch: appends, dedups, never mutates input', () => {
    const s = feed();
    const a = addWatch([], find(s, 2), 1);
    assert(a.length === 1 && isWatched(a, 2), 'added');
    const b = addWatch(a, find(s, 2), 2);
    assert(b.length === 1, 'dedup by sectionId — no second copy');
    assert(b !== a, 'returns a fresh array even on no-op');
    eq(a, [{ sectionId: 2, courseCode: 'CSE220', sectionName: '02', addedAt: 1, hadSeat: false }], 'original untouched');
});

test('addWatch: refuses past MAX_WATCHES', () => {
    let list = [];
    for (let i = 0; i < MAX_WATCHES; i++) {
        list = addWatch(list, rawOpen(i), i);
    }
    assert(list.length === MAX_WATCHES, 'filled to cap');
    const after = addWatch(list, rawOpen(9999), 1);
    assert(after.length === MAX_WATCHES, 'no growth past cap');
});

function rawOpen(id) {
    return parseFeed([rawSec({ sectionId: id, courseCode: 'X' + id, sectionName: '01', capacity: 30, consumedSeat: 0 })]).sections[0];
}

test('removeWatch: drops by id, leaves rest', () => {
    const s = feed();
    let list = addWatch(addWatch([], find(s, 1), 1), find(s, 2), 2);
    list = removeWatch(list, 1);
    eq(list.map(w => w.sectionId), [2]);
    eq(removeWatch(list, 999).map(w => w.sectionId), [2], 'removing absent id is a no-op copy');
});

// ── the heart: evaluateWatches edge-triggers on full→open ───────────────────────
test('evaluateWatches: fires once when a full section opens, then not again', () => {
    // Watch §02 while full → hadSeat seeded false.
    const before = feed();
    const watch = makeWatch(find(before, 2), 0);

    // No change yet (still full) → no drop, state unchanged.
    let res = evaluateWatches([watch], byId(before));
    eq(res.drops.length, 0, 'still full → no drop');
    assert(res.watches[0].hadSeat === false, 'state stays false while full');

    // §02 frees a seat (30→29) → exactly one drop, hadSeat flips true.
    const opened = feed({ consumedSeat: 29 });
    res = evaluateWatches(res.watches, byId(opened));
    eq(res.drops.length, 1, 'one drop fired');
    eq(res.drops[0].section.sectionId, 2);
    eq(res.drops[0].seatsLeft, 1);
    assert(res.watches[0].hadSeat === true, 'hadSeat now true');

    // Still open next poll → no re-fire (edge-triggered, not level).
    res = evaluateWatches(res.watches, byId(opened));
    eq(res.drops.length, 0, 'no re-fire while it stays open');
});

test('evaluateWatches: re-arms after the section goes full again', () => {
    const opened = feed({ consumedSeat: 29 });
    // Start already open and aware (hadSeat true).
    let watch = makeWatch(find(opened, 2), 0);
    assert(watch.hadSeat === true);

    // Goes full → no drop, but state re-arms to false.
    let res = evaluateWatches([watch], byId(feed()));
    eq(res.drops.length, 0, 'closing does not alert');
    assert(res.watches[0].hadSeat === false, 're-armed');

    // Opens again → fires anew.
    res = evaluateWatches(res.watches, byId(opened));
    eq(res.drops.length, 1, 'second open alerts again');
});

test('evaluateWatches: watching an already-open section does not alert', () => {
    const s = feed();
    const watch = makeWatch(find(s, 1), 0); // §01 open, hadSeat=true
    const res = evaluateWatches([watch], byId(s));
    eq(res.drops.length, 0, 'no alert for a section that was open when watched');
});

test('evaluateWatches: section absent from feed preserves state, no drop', () => {
    const s = feed();
    const watch = makeWatch(find(s, 2), 0); // full, hadSeat=false
    const res = evaluateWatches([watch], byId([])); // empty feed
    eq(res.drops.length, 0, 'missing section → no drop');
    assert(res.watches[0].hadSeat === false, 'state preserved');
    eq(res.watches[0].sectionId, 2);
});

// ── persistence round-trip ──────────────────────────────────────────────────────
test('serialize/parse: round-trips a watchlist', () => {
    const s = feed();
    const list = addWatch(addWatch([], find(s, 1), 1), find(s, 2), 2);
    eq(parseWatches(serializeWatches(list)), list, 'round-trip is identity');
});

test('parseWatches: tolerant of garbage, dedups, caps', () => {
    eq(parseWatches(null), [], 'null → []');
    eq(parseWatches(''), [], 'empty → []');
    eq(parseWatches('not json{'), [], 'bad json → []');
    eq(parseWatches('{"sectionId":1}'), [], 'non-array → []');
    eq(parseWatches('[{"foo":1}]'), [], 'entry missing sectionId dropped');
    const mixed = JSON.stringify([
        { sectionId: 1, courseCode: 'CSE220', sectionName: '01', addedAt: 5, hadSeat: true },
        { sectionId: 1, courseCode: 'CSE220', sectionName: '01', addedAt: 9, hadSeat: false }, // dup
        { sectionId: 'x', courseCode: 'BAD' }, // bad id
        { courseCode: 'NOID' }, // no id
    ]);
    eq(parseWatches(mixed).map(w => w.sectionId), [1], 'dedup + drop invalid');
});

test('parseWatches: defaults missing optional fields', () => {
    const out = parseWatches('[{"sectionId":7,"courseCode":"MAT110"}]');
    eq(out, [{ sectionId: 7, courseCode: 'MAT110', sectionName: '', addedAt: 0, hadSeat: false }]);
});

console.log(`\nseatWatch: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
