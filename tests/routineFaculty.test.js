/**
 * tests/routineFaculty.test.js
 * Pure tests for the Routine ↔ Faculty Reviews bridge:
 * buildFacultyRatingMap / getRatingForSection / ratingTier / formatRatingScore.
 */

import {
    buildFacultyRatingMap,
    getRatingForSection,
    ratingTier,
    formatRatingScore,
    LOW_SAMPLE_THRESHOLD,
} from '../js/core/routineFaculty.js';

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

// ---- ratingTier ----
console.log('\nratingTier:');
test('null overall -> unknown', () => eq(ratingTier(null, 10), 'unknown'));
test('count below threshold -> low-sample even if score is high', () => {
    eq(ratingTier(4.8, LOW_SAMPLE_THRESHOLD - 1), 'low-sample');
});
test('count at threshold + score 4.5 -> excellent', () => {
    eq(ratingTier(4.5, LOW_SAMPLE_THRESHOLD), 'excellent');
});
test('4.0 -> good', () => eq(ratingTier(4.0, 10), 'good'));
test('3.5 -> mid', () => eq(ratingTier(3.5, 10), 'mid'));
test('2.5 -> warn', () => eq(ratingTier(2.5, 10), 'warn'));
test('1.5 -> bad', () => eq(ratingTier(1.5, 10), 'bad'));
test('exact boundary 4.3 -> excellent', () => eq(ratingTier(4.3, 10), 'excellent'));
test('exact boundary 3.7 -> good', () => eq(ratingTier(3.7, 10), 'good'));

// ---- buildFacultyRatingMap ----
console.log('\nbuildFacultyRatingMap:');
test('empty input -> empty map', () => {
    eq(buildFacultyRatingMap([]).size, 0);
});
test('non-array input -> empty map (defensive)', () => {
    eq(buildFacultyRatingMap(null).size, 0);
    eq(buildFacultyRatingMap('nope').size, 0);
});
test('normalizes initials key (lowercase + punctuation stripped)', () => {
    const map = buildFacultyRatingMap([
        { facultyInitials: ' a.bc ', count: 5, overall: 4.2 },
    ]);
    const r = map.get('ABC');
    assert(r !== undefined, 'expected ABC in map');
    eq(r.initials, 'ABC');
});
test('precomputes tier on each entry', () => {
    const map = buildFacultyRatingMap([
        { facultyInitials: 'ABC', count: 5,  overall: 4.5 },
        { facultyInitials: 'XYZ', count: 10, overall: 3.1 },
        { facultyInitials: 'PQR', count: 2,  overall: 4.9 },
        { facultyInitials: 'JKL', count: 7,  overall: null },
    ]);
    eq(map.get('ABC').tier, 'excellent');
    eq(map.get('XYZ').tier, 'mid');
    eq(map.get('PQR').tier, 'low-sample');
    eq(map.get('JKL').tier, 'unknown');
});
test('skips entries with empty initials', () => {
    const map = buildFacultyRatingMap([
        { facultyInitials: '', count: 5, overall: 4 },
        { facultyInitials: '   ', count: 5, overall: 4 },
        { facultyInitials: '123', count: 5, overall: 4 },
        { facultyInitials: 'OK', count: 5, overall: 4 },
    ]);
    eq(map.size, 1);
    assert(map.has('OK'));
});
test('skips malformed entries', () => {
    const map = buildFacultyRatingMap([
        null,
        undefined,
        { facultyInitials: 'ABC' /* missing count, overall */ },
    ]);
    // last one keeps a row but with safe defaults
    const r = map.get('ABC');
    assert(r !== undefined);
    eq(r.count, 0);
    eq(r.overall, null);
    eq(r.tier, 'unknown');
});

// ---- getRatingForSection ----
console.log('\ngetRatingForSection:');
const RM = buildFacultyRatingMap([
    { facultyInitials: 'ABC', count: 10, overall: 4.5 },
]);
test('returns null when section has no faculty initials', () => {
    eq(getRatingForSection({ facultyInitials: '' }, RM), null);
});
test('returns null when faculty is not in the map', () => {
    eq(getRatingForSection({ facultyInitials: 'ZZZ' }, RM), null);
});
test('returns the rating entry when faculty matches', () => {
    const r = getRatingForSection({ facultyInitials: 'abc' }, RM);
    assert(r !== null);
    eq(r.initials, 'ABC');
    eq(r.tier, 'excellent');
});

// ---- formatRatingScore ----
console.log('\nformatRatingScore:');
test('formats to one decimal by default', () => eq(formatRatingScore(4.234), '4.2'));
test('null formats to em-dash', () => eq(formatRatingScore(null), '—'));
test('NaN formats to em-dash', () => eq(formatRatingScore(NaN), '—'));
test('respects custom digits', () => eq(formatRatingScore(4.234, 2), '4.23'));

// -------------
console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
