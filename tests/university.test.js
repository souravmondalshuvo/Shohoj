/**
 * tests/university.test.js
 * Constraints over the university registry (multi-campus tenancy). Three jobs:
 * (1) schema tripwires so a malformed profile fails here rather than shipping a
 * wrong grading scale to a real student; (2) a parity guard pinning BRACU's
 * profile to the constants the calculator already uses, so introducing the
 * registry cannot change anyone's CGPA; (3) behaviour of universityForEmail,
 * which feeds an auth decision and must fail closed on anything ambiguous.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    UNIVERSITIES,
    DEFAULT_UNIVERSITY_ID,
    getUniversity,
    isUniversityId,
    universityForEmail,
    allUniversityDomains,
    hasFeature,
    gradePointOn,
} from '../src/core/university.ts';
import { GRADES, POINTS_TO_GRADE } from '../src/core/grades.ts';

const profiles = Object.values(UNIVERSITIES);

test('every profile is well formed and keyed by its own id', () => {
    assert.ok(profiles.length > 0);
    for (const [key, profile] of Object.entries(UNIVERSITIES)) {
        assert.equal(key, profile.id, `${key} keyed by a different id`);
        assert.ok(profile.name.length > 0, `${key} name`);
        assert.ok(profile.shortName.length > 0, `${key} shortName`);
        assert.ok(profile.emailDomains.length > 0, `${key} emailDomains`);
        assert.ok(profile.features.length > 0, `${key} features`);
        assert.equal(new Set(profile.features).size, profile.features.length, `${key} duplicate features`);
    }
});

test('email domains are bare lowercase hosts and unique across campuses', () => {
    const seen = new Set();
    for (const profile of profiles) {
        for (const domain of profile.emailDomains) {
            assert.equal(domain, domain.toLowerCase(), `${domain} not lowercase`);
            assert.ok(!domain.includes('@'), `${domain} should not carry an @`);
            assert.ok(!domain.startsWith('.') && !domain.endsWith('.'), `${domain} stray dot`);
            assert.ok(domain.includes('.'), `${domain} is not a host`);
            // A domain claimed by two campuses would make sign-in non-deterministic.
            assert.ok(!seen.has(domain), `${domain} claimed by more than one campus`);
            seen.add(domain);
        }
    }
    assert.deepEqual([...allUniversityDomains()].sort(), [...seen].sort());
});

test('every grading scale is internally consistent', () => {
    for (const profile of profiles) {
        const { points, pointsToGrade, max } = profile.grades;
        assert.ok(Object.keys(points).length > 0, `${profile.id} empty scale`);

        let previous = Number.POSITIVE_INFINITY;
        for (const [point, letter] of pointsToGrade) {
            // Reverse lookup must agree with the forward table, or detectGrade
            // and the calculator would disagree about the same letter.
            assert.equal(points[letter], point, `${profile.id} ${letter} disagrees with pointsToGrade`);
            assert.ok(point <= previous, `${profile.id} pointsToGrade not descending at ${letter}`);
            previous = point;
        }

        const awarded = Object.values(points).filter((p) => typeof p === 'number');
        assert.equal(Math.max(...awarded), max, `${profile.id} max is not the highest awarded point`);
        assert.ok(awarded.every((p) => p >= 0), `${profile.id} negative grade point`);
    }
});

test('BRACU profile matches the constants the calculator already uses', () => {
    // Parity guard: the registry must not change a single BRACU number.
    const bracu = UNIVERSITIES.bracu;
    assert.deepEqual(bracu.grades.points, GRADES);
    assert.deepEqual(bracu.grades.pointsToGrade, POINTS_TO_GRADE);
    assert.equal(bracu.grades.max, 4.0);
    assert.deepEqual(bracu.emailDomains, ['g.bracu.ac.bd']);
});

test('NSU matches the published grading policy, including what it does NOT award', () => {
    const nsu = UNIVERSITIES.nsu;
    assert.deepEqual(nsu.emailDomains, ['northsouth.edu']);
    assert.equal(nsu.grades.max, 4.0);

    const expected = {
        A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3,
        C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, F: 0.0, I: null, W: null,
    };
    assert.deepEqual(nsu.grades.points, expected);

    // The two differences from BRACU that would silently corrupt a CGPA if the
    // BRACU scale were ever applied to an NSU transcript.
    assert.equal(gradePointOn(nsu.grades, 'A+'), undefined, 'NSU awards no A+');
    assert.equal(gradePointOn(nsu.grades, 'D-'), undefined, 'NSU awards no D-');
    // An A is the ceiling, where BRACU has A+ sharing 4.0 with A.
    assert.equal(gradePointOn(nsu.grades, 'A'), 4.0);
});

test('BRACU and NSU disagree exactly where the policies disagree', () => {
    const bracu = UNIVERSITIES.bracu.grades;
    const nsu = UNIVERSITIES.nsu.grades;
    // Same ceiling, reached by a different letter set.
    assert.equal(bracu.max, nsu.max);
    for (const letter of ['A+', 'D-']) {
        assert.notEqual(gradePointOn(bracu, letter), undefined, `BRACU awards ${letter}`);
        assert.equal(gradePointOn(nsu, letter), undefined, `NSU does not award ${letter}`);
    }
    // Every letter NSU does award must score identically on both campuses, so a
    // shared letter can never mean two different things.
    for (const [letter, point] of Object.entries(nsu.points)) {
        assert.equal(gradePointOn(bracu, letter), point, `${letter} disagrees across campuses`);
    }
});

test('retake policies are campus-specific and well formed', () => {
    // BRACU's rule turns on the student's start term; NSU's does not.
    assert.deepEqual(UNIVERSITIES.bracu.retake, {
        kind: 'best-before',
        cutoff: { season: 'Fall', year: 2024 },
    });
    assert.deepEqual(UNIVERSITIES.nsu.retake, { kind: 'best' });

    for (const profile of profiles) {
        assert.ok(['best', 'latest', 'best-before'].includes(profile.retake.kind), `${profile.id} retake kind`);
        if (profile.retake.kind === 'best-before') {
            assert.ok(Number.isInteger(profile.retake.cutoff.year), `${profile.id} cutoff year`);
            assert.ok(profile.retake.cutoff.season.length > 0, `${profile.id} cutoff season`);
        }
        // An unverified cap must stay unset rather than be guessed at.
        if (profile.maxRetakes !== undefined) {
            assert.ok(Number.isInteger(profile.maxRetakes) && profile.maxRetakes > 0, `${profile.id} maxRetakes`);
        }
    }
});

test('repeat eligibility differs at the boundary, not just the threshold', () => {
    const bracu = UNIVERSITIES.bracu.repeat;
    const nsu = UNIVERSITIES.nsu.repeat;
    // Same number, different boundary — a B is exactly 3.0, so it is repeatable
    // at NSU ("B or lower") and not at BRACU (strictly below 3.0). Collapsing
    // these to one rule would mislead every B student on one campus or the other.
    assert.equal(bracu.threshold, nsu.threshold);
    assert.equal(bracu.inclusive, false);
    assert.equal(nsu.inclusive, true);

    for (const profile of profiles) {
        assert.equal(typeof profile.repeat.threshold, 'number', `${profile.id} threshold`);
        assert.equal(typeof profile.repeat.inclusive, 'boolean', `${profile.id} inclusive`);
        // The threshold has to sit inside the campus's own scale to mean anything.
        assert.ok(
            profile.repeat.threshold <= profile.grades.max,
            `${profile.id} repeat threshold above its own ceiling`,
        );
    }
});

test('credit load rules are coherent, and absent rather than borrowed', () => {
    // BRACU's limits are published and enforced.
    assert.deepEqual(UNIVERSITIES.bracu.creditLoad, { min: 9, max: 15, warnAbove: 12 });
    // NSU's were not confirmed, so no rules at all — a borrowed warning would be
    // wrong with confidence, which is worse than staying quiet.
    assert.equal(UNIVERSITIES.nsu.creditLoad, undefined);

    for (const profile of profiles) {
        const load = profile.creditLoad;
        if (load === undefined) continue;
        assert.ok(load.min > 0, `${profile.id} min`);
        assert.ok(load.min <= load.warnAbove, `${profile.id} min above warnAbove`);
        assert.ok(load.warnAbove <= load.max, `${profile.id} warnAbove above max`);
    }
});

test('NSU keeps feed-dependent features off until it has a data source', () => {
    const nsu = UNIVERSITIES.nsu;
    // These all derive from BRACU's CONNECT feed or hand-collected Merul Badda
    // campus data. Shipping them for NSU would render empty tabs, not features.
    for (const feature of ['seats', 'routine', 'rooms', 'campus', 'bus', 'cafeteria', 'lostFound']) {
        assert.equal(hasFeature(nsu, feature), false, `NSU should not enable ${feature}`);
        assert.equal(hasFeature(UNIVERSITIES.bracu, feature), true, `BRACU should enable ${feature}`);
    }
    // The transcript-driven core must work on day one.
    for (const feature of ['calculator', 'planner', 'degree', 'transcript']) {
        assert.equal(hasFeature(nsu, feature), true, `NSU should enable ${feature}`);
    }
});

test('universityForEmail tells the two campuses apart', () => {
    assert.equal(universityForEmail('someone@northsouth.edu')?.id, 'nsu');
    assert.equal(universityForEmail('someone@g.bracu.ac.bd')?.id, 'bracu');
    // Lookalikes of the newly added domain must fail closed too.
    assert.equal(universityForEmail('someone@notnorthsouth.edu'), null);
    assert.equal(universityForEmail('someone@northsouth.edu.attacker.com'), null);
});

test('the default campus is registered', () => {
    assert.ok(isUniversityId(DEFAULT_UNIVERSITY_ID));
    assert.equal(getUniversity(DEFAULT_UNIVERSITY_ID)?.id, DEFAULT_UNIVERSITY_ID);
});

test('getUniversity and isUniversityId reject anything unregistered', () => {
    for (const junk of ['iub', 'BRACU', 'NSU', '', null, undefined, 42, {}, 'constructor', '__proto__', 'toString']) {
        assert.equal(isUniversityId(junk), false, `isUniversityId(${String(junk)})`);
        assert.equal(getUniversity(junk), null, `getUniversity(${String(junk)})`);
    }
});

test('universityForEmail resolves a registered domain, case-insensitively', () => {
    assert.equal(universityForEmail('someone@g.bracu.ac.bd')?.id, 'bracu');
    assert.equal(universityForEmail('SOMEONE@G.BRACU.AC.BD')?.id, 'bracu');
    assert.equal(universityForEmail('someone@g.bracu.ac.bd  ')?.id, 'bracu');
    assert.equal(universityForEmail('first.last+tag@g.bracu.ac.bd')?.id, 'bracu');
});

test('universityForEmail fails closed on lookalikes and malformed input', () => {
    const rejected = [
        // Substring and suffix lookalikes must not match a registered domain.
        'someone@notg.bracu.ac.bd',
        'someone@g.bracu.ac.bd.attacker.com',
        'someone@bracu.ac.bd',          // staff domain is deliberately not admitted
        'someone@sub.g.bracu.ac.bd',    // a subdomain is a different domain
        // Ambiguous or malformed addresses resolve to nothing, never to a guess.
        'a@b@g.bracu.ac.bd',
        '@g.bracu.ac.bd',
        'someone@',
        'someone',
        '',
        '   ',
        null,
        undefined,
        42,
        {},
    ];
    for (const value of rejected) {
        assert.equal(universityForEmail(value), null, `should reject ${String(value)}`);
    }
});

test('hasFeature is null-safe and honours the profile feature list', () => {
    const bracu = UNIVERSITIES.bracu;
    assert.equal(hasFeature(bracu, 'calculator'), true);
    assert.equal(hasFeature(null, 'calculator'), false);
    assert.equal(hasFeature(bracu, 'nonexistent'), false);
});

test('gradePointOn separates "not awarded here" from "carries no point"', () => {
    const scale = UNIVERSITIES.bracu.grades;
    assert.equal(gradePointOn(scale, 'A'), 4.0);
    assert.equal(gradePointOn(scale, 'B-'), 2.7);
    // P/I/W exist but carry no grade point — null, not undefined.
    assert.equal(gradePointOn(scale, 'W'), null);
    assert.equal(gradePointOn(scale, 'P'), null);
    // Not awarded on this campus at all.
    assert.equal(gradePointOn(scale, 'S'), undefined);
    assert.equal(gradePointOn(scale, ''), undefined);
    // Inherited Object properties must not read as grades.
    assert.equal(gradePointOn(scale, 'toString'), undefined);
    assert.equal(gradePointOn(scale, 'constructor'), undefined);
});
