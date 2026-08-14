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

test('the default campus is registered', () => {
    assert.ok(isUniversityId(DEFAULT_UNIVERSITY_ID));
    assert.equal(getUniversity(DEFAULT_UNIVERSITY_ID)?.id, DEFAULT_UNIVERSITY_ID);
});

test('getUniversity and isUniversityId reject anything unregistered', () => {
    for (const junk of ['nsu', 'BRACU', '', null, undefined, 42, {}, 'constructor', '__proto__', 'toString']) {
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
