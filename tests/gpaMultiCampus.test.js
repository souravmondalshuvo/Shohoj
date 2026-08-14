/**
 * tests/gpaMultiCampus.test.js
 * The other half of the tenancy guarantee.
 *
 * typedCoreParity proves the GPA core still behaves exactly as it did for
 * BRACU when called with no profile. This file proves the opposite direction:
 * that passing NSU's profile actually changes the answer, and changes it in
 * precisely the places the two published policies differ — and nowhere else.
 *
 * Every case here is one a real student would hit on a transcript.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateCgpaTotals,
    gpaCoreCalcSemesterGpa,
    gpaCoreClampGradePoint,
    gpaCoreGetImprovementStrategy,
    gpaCoreGetSemesterCreditWarning,
    gpaCoreIsRepeatEligible,
    gpaCoreUsesBestGradePolicy,
} from '../src/core/gpa.ts';
import { UNIVERSITIES } from '../src/core/university.ts';

const BRACU = UNIVERSITIES.bracu;
const NSU = UNIVERSITIES.nsu;

const course = (name, grade, credits = 3) => ({ name, grade, credits });
const semester = (id, courses) => ({ id, courses });

test('an A scores 4.0 on both campuses', () => {
    const sem = semester(1, [course('Intro (CSE101)', 'A')]);
    assert.equal(gpaCoreCalcSemesterGpa(sem, BRACU.grades), 4.0);
    assert.equal(gpaCoreCalcSemesterGpa(sem, NSU.grades), 4.0);
});

test('an A+ scores at BRACU and is ignored at NSU, which does not award it', () => {
    const sem = semester(1, [course('Intro (CSE101)', 'A+')]);
    // BRACU: A+ is a real 4.0.
    assert.equal(gpaCoreCalcSemesterGpa(sem, BRACU.grades), 4.0);
    // NSU: the letter does not exist, so it contributes nothing at all rather
    // than being scored as though it did. No credits, so no GPA.
    assert.equal(gpaCoreCalcSemesterGpa(sem, NSU.grades), null);
});

test('a D- likewise scores at BRACU and is unknown at NSU', () => {
    const sem = semester(1, [course('Intro (CSE101)', 'D-')]);
    // Compared with a tolerance: 0.7 * 3 / 3 is 0.6999999999999998 in binary
    // floating point. Pre-existing behaviour — the UI rounds for display.
    const bracu = gpaCoreCalcSemesterGpa(sem, BRACU.grades);
    assert.ok(Math.abs(bracu - 0.7) < 1e-9, `expected ~0.7, got ${bracu}`);
    assert.equal(gpaCoreCalcSemesterGpa(sem, NSU.grades), null);
});

test('a mixed transcript totals identically where the scales agree', () => {
    // Every letter here exists on both campuses at the same value, so the two
    // must agree exactly — the scales differ only at A+ and D-.
    const semesters = [
        semester(1, [course('A (CSE101)', 'A'), course('B (CSE102)', 'B-')]),
        semester(2, [course('C (CSE201)', 'C+'), course('D (CSE202)', 'D')]),
    ];
    const bracu = calculateCgpaTotals(semesters, { scale: BRACU.grades, retake: BRACU.retake });
    const nsu = calculateCgpaTotals(semesters, { scale: NSU.grades, retake: NSU.retake });
    assert.equal(bracu.cgpa, nsu.cgpa);
    assert.equal(bracu.cgpaCredits, nsu.cgpaCredits);
});

test('a B is repeatable at NSU and not at BRACU', () => {
    // The boundary case. NSU publishes "B or lower"; a B is exactly 3.0, and
    // BRACU's rule is strictly below 3.0.
    assert.equal(gpaCoreIsRepeatEligible('B', BRACU.grades, BRACU.repeat), false);
    assert.equal(gpaCoreIsRepeatEligible('B', NSU.grades, NSU.repeat), true);

    // And the strategy the UI would offer follows it.
    assert.equal(gpaCoreGetImprovementStrategy('B', BRACU.grades, BRACU.repeat), null);
    assert.equal(gpaCoreGetImprovementStrategy('B', NSU.grades, NSU.repeat), 'repeat');
});

test('grades either side of the boundary agree on both campuses', () => {
    // Below the threshold: repeatable everywhere.
    for (const grade of ['B-', 'C+', 'C', 'D']) {
        assert.equal(gpaCoreIsRepeatEligible(grade, BRACU.grades, BRACU.repeat), true, grade);
        assert.equal(gpaCoreIsRepeatEligible(grade, NSU.grades, NSU.repeat), true, grade);
    }
    // Above it: repeatable nowhere.
    for (const grade of ['B+', 'A-', 'A']) {
        assert.equal(gpaCoreIsRepeatEligible(grade, BRACU.grades, BRACU.repeat), false, grade);
        assert.equal(gpaCoreIsRepeatEligible(grade, NSU.grades, NSU.repeat), false, grade);
    }
    // An F is retaken, never repeated, on both.
    assert.equal(gpaCoreGetImprovementStrategy('F', BRACU.grades, BRACU.repeat), 'retake');
    assert.equal(gpaCoreGetImprovementStrategy('F', NSU.grades, NSU.repeat), 'retake');
});

test('NSU keeps the best attempt regardless of when the student started', () => {
    // BRACU's answer swings on the start term...
    assert.equal(
        gpaCoreUsesBestGradePolicy({ retake: BRACU.retake, startSeason: 'Spring', startYear: 2023 }),
        true,
    );
    assert.equal(
        gpaCoreUsesBestGradePolicy({ retake: BRACU.retake, startSeason: 'Fall', startYear: 2024 }),
        false,
    );
    // ...while NSU's does not move.
    for (const [season, year] of [['Spring', 2023], ['Fall', 2024], ['Summer', 2026]]) {
        assert.equal(
            gpaCoreUsesBestGradePolicy({ retake: NSU.retake, startSeason: season, startYear: year }),
            true,
            `${season} ${year}`,
        );
    }
});

test('a retaken course resolves to the better grade for an NSU student', () => {
    // Same course twice: a C first, an A on the retake. NSU counts the best.
    const semesters = [
        semester(1, [course('Intro (CSE101)', 'C')]),
        semester(2, [course('Intro (CSE101)', 'A')]),
    ];
    const totals = calculateCgpaTotals(semesters, { scale: NSU.grades, retake: NSU.retake });
    assert.equal(totals.cgpa, 4.0);
    assert.equal(totals.cgpaCredits, 3);
    // Both attempts still count as attempted credits.
    assert.equal(totals.attemptedCredits, 6);
});

test('the credit warning stays silent for a campus with no confirmed limits', () => {
    const overloaded = semester(1, [
        course('A (CSE101)', 'A', 6),
        course('B (CSE102)', 'A', 6),
        course('C (CSE103)', 'A', 6),
    ]);
    // BRACU publishes a 15-credit maximum, so 18 credits is an error.
    const bracu = gpaCoreGetSemesterCreditWarning(overloaded, BRACU);
    assert.equal(bracu?.type, 'error');
    assert.match(bracu.msg, /15-credit maximum/);

    // NSU's limits are unconfirmed, so it must say nothing rather than borrow
    // BRACU's numbers and be wrong with confidence. This takes the whole
    // profile: passing NSU.creditLoad directly would be undefined, which a
    // default parameter would quietly replace with BRACU's rules.
    assert.equal(gpaCoreGetSemesterCreditWarning(overloaded, NSU), null);
});

test('the grade-point clamp respects each campus ceiling and keeps one decimal', () => {
    // Regression guard: String(4.0) is "4", which is not what the field showed.
    assert.equal(gpaCoreClampGradePoint('5.5', BRACU.grades), '4.0');
    assert.equal(gpaCoreClampGradePoint('5.5', NSU.grades), '4.0');
    assert.equal(gpaCoreClampGradePoint('-1', NSU.grades), '0.0');
    assert.equal(gpaCoreClampGradePoint('3.7', NSU.grades), '3.7');
});
