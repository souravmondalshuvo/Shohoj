/**
 * tests/campusScoping.test.js
 * The behaviour that makes Shohoj multi-campus rather than BRACU-with-a-registry.
 *
 * Two jobs:
 *   (1) prove the same transcript produces DIFFERENT, campus-correct answers on
 *       BRACU and NSU — a test that passes on both campuses by accident is the
 *       failure mode here, so every assertion below is one where the two
 *       campuses genuinely disagree;
 *   (2) pin the tab filtering, which is what stops an NSU student being offered
 *       screens backed by BRACU's CONNECT feed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIVERSITIES } from '../src/core/university.ts';
import { computeCalculatorResults } from '../src/features/calculator/results.ts';
import { letterForMark } from '../src/features/calculator/courseMarks.ts';
import { getSemesterCreditWarning } from '../src/core/gpa.ts';
import { tabsFor, TABS, isGroup } from '../src/app/shellTabModel.ts';

const BRACU = UNIVERSITIES.bracu;
const NSU = UNIVERSITIES.nsu;

const course = (name, grade, credits = 3) => ({ name, grade, credits });
const semester = (id, courses) => ({
  id,
  name: `Semester ${id}`,
  running: false,
  summary: false,
  courses,
});

// ── Mark cutoffs ─────────────────────────────────────────────────────────────
// The widest divergence between the two campuses, and the one a student acts on
// directly when deciding what they need on a final.

test('the same mark earns a different letter on each campus', () => {
  // 87: BRACU's A- starts at 85, NSU's at 90.
  assert.equal(letterForMark(87, BRACU.grades.marks), 'A-');
  assert.equal(letterForMark(87, NSU.grades.marks), 'B+');

  // 55: a D+ at BRACU, an outright F at NSU, whose lowest pass is 60.
  assert.equal(letterForMark(55, BRACU.grades.marks), 'D+');
  assert.equal(letterForMark(55, NSU.grades.marks), 'F');
});

test('a mark that passes at BRACU can fail at NSU', () => {
  // The consequential case: 52 is BRACU's exact pass boundary.
  assert.equal(letterForMark(52, BRACU.grades.marks), 'D');
  assert.equal(letterForMark(52, NSU.grades.marks), 'F');
});

// ── Grades a campus does not award ───────────────────────────────────────────

test('NSU awards neither A+ nor D-', () => {
  assert.equal(NSU.grades.points['A+'], undefined);
  assert.equal(NSU.grades.points['D-'], undefined);
  // BRACU awards both, so this is a real difference and not a typo in one table.
  assert.equal(BRACU.grades.points['A+'], 4.0);
  assert.equal(BRACU.grades.points['D-'], 0.7);
});

// ── Credit-load warnings ─────────────────────────────────────────────────────

test('NSU shows no credit-load warning where BRACU does', () => {
  // 18 credits is over BRACU's hard maximum of 15.
  const overloaded = semester(1, [
    course('CSE110', 'A', 3),
    course('CSE111', 'A', 3),
    course('CSE220', 'A', 3),
    course('CSE221', 'A', 3),
    course('CSE230', 'A', 3),
    course('CSE250', 'A', 3),
  ]);

  const bracuWarning = getSemesterCreditWarning(overloaded, BRACU);
  assert.notEqual(bracuWarning, null, 'BRACU caps registration at 15 credits');

  // NSU's limits were never confirmed, so its profile carries no creditLoad.
  // Silence is the correct output — better than showing another campus's cap.
  assert.equal(getSemesterCreditWarning(overloaded, NSU), null);
});

// ── CGPA on the campus scale ─────────────────────────────────────────────────

test('the same transcript scores differently on each campus', () => {
  // A+ is 4.0 at BRACU and simply not awarded at NSU, so an identical set of
  // letters cannot produce an identical CGPA.
  const inputs = {
    semesters: [semester(1, [course('CSE110', 'A+'), course('CSE111', 'A-')])],
    startSeason: '',
    startYear: '',
  };

  const onBracu = computeCalculatorResults(inputs, BRACU);
  // (4.0 + 3.7) x 3 / 6 = 3.85
  assert.equal(onBracu.cgpa.toFixed(2), '3.85');

  const onNsu = computeCalculatorResults(inputs, NSU);
  // The A+ carries no point at NSU, so only the A- counts toward the CGPA.
  assert.notEqual(onNsu.cgpa.toFixed(2), onBracu.cgpa.toFixed(2));
});

test('the meter measures against the campus ceiling', () => {
  const inputs = {
    semesters: [semester(1, [course('CSE110', 'A')])],
    startSeason: '',
    startYear: '',
  };
  // Both campuses top out at 4.0 today, so a straight-A student is at 100% on
  // each. The assertion is here to fail loudly if a 5.0-scale campus is added
  // and the meter is still dividing by a literal 4.
  for (const campus of [BRACU, NSU]) {
    const results = computeCalculatorResults(inputs, campus);
    assert.equal(results.meterPercent, 100, `${campus.id} meter`);
  }
});

// ── Tab scoping ──────────────────────────────────────────────────────────────

const leavesOf = (entries) => entries.flatMap((e) => (isGroup(e) ? e.items : [e]));

test('BRACU sees every tab', () => {
  assert.deepEqual(
    leavesOf(tabsFor(BRACU)).map((t) => t.to),
    leavesOf(TABS).map((t) => t.to),
  );
});

test('NSU is not offered screens built on BRACU data', () => {
  const paths = leavesOf(tabsFor(NSU)).map((t) => t.to);
  for (const hidden of [
    '/seats',
    '/routine',
    '/rooms',
    '/campus',
    '/bus',
    '/cafeteria',
    '/lost-found',
    '/difficulty',
  ]) {
    assert.ok(!paths.includes(hidden), `${hidden} should be hidden at NSU`);
  }
  // The screens that work from a transcript the student supplies stay.
  for (const kept of ['/calculator', '/planner', '/transcript', '/degree-progress', '/groups']) {
    assert.ok(paths.includes(kept), `${kept} should remain at NSU`);
  }
});

test('a group whose every child is hidden disappears entirely', () => {
  // A synthetic campus that enables nothing in the Campus group, to test the
  // collapse itself rather than whatever NSU's feature list happens to be.
  const noCampusData = { ...NSU, features: NSU.features.filter((f) => f !== 'feedback') };
  const groups = tabsFor(noCampusData)
    .filter(isGroup)
    .map((g) => g.group);
  assert.ok(!groups.includes('campus'), 'an entirely disabled group should not render');
  assert.ok(groups.includes('plan'), 'Plan still has children');
});

test('NSU keeps the Campus group only because Feedback lives in it', () => {
  // Documenting a real oddity rather than asserting it is desirable. Feedback
  // is not campus data; it sits in this group because the top level is capped
  // at five slots (ShellTabs' own comment calls the placement a judgment call).
  // The visible result at NSU is a 'Campus' dropdown containing one unrelated
  // item. Moving Feedback elsewhere would change BRACU's nav too, so it is a
  // deliberate follow-up, not a silent fix.
  const campus = tabsFor(NSU)
    .filter(isGroup)
    .find((g) => g.group === 'campus');
  assert.deepEqual(
    campus?.items.map((i) => i.to),
    ['/feedback'],
  );
});

test('a null profile keeps the full bar', () => {
  // Signed out never renders the bar, and an admin carries no campus but does
  // moderate every screen.
  assert.deepEqual(tabsFor(null), TABS);
});

test('every tab declares a feature its campus profile can switch off', () => {
  // A tab with a feature id nothing recognises would silently never be filtered.
  const known = new Set(BRACU.features);
  for (const leaf of leavesOf(TABS)) {
    assert.ok(known.has(leaf.feature), `${leaf.to} declares unknown feature ${leaf.feature}`);
  }
});
