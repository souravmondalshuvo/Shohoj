/**
 * tests/universityData.test.js
 *
 * data/campuses/ is the source of truth for campus facts, but the calculator
 * reads its rules from the university registry (src/core/university.ts, and
 * its legacy twin js/core/university.js, held together by twinParity). Nothing
 * else ties the registry to the data, so a correction made in one place would
 * leave the calculator scoring on the other. This holds NSU's and DIU's
 * registry profiles to data/campuses/<id>/profile.json on every rule the
 * calculator uses.
 *
 * BRACU's registry profile is held to its data by tests/bracuCampusParity.test.js.
 */

import assert from 'node:assert/strict';

import { loadCampuses } from '../scripts/campus_data.mjs';
import { UNIVERSITIES } from '../js/core/university.js';

const { campuses, errors } = loadCampuses();
assert.deepEqual(errors, [], 'data/campuses must load cleanly before it can be compared');
const data = campuses.find((c) => c.id === 'nsu').profile;
const registry = UNIVERSITIES.nsu;

// Identity.
assert.equal(registry.name, data.name);
assert.equal(registry.shortName, data.shortName);
assert.deepEqual(registry.emailDomains, data.identity.emailDomains);

// Grade points: the same letters, the same points, and the non-GPA letters as
// null — nothing the data leaves out (A+, D-, P) may score in the registry.
const dataPoints = Object.fromEntries([
  ...data.grading.scale.map((g) => [g.letter, g.points]),
  ...data.grading.nonGpaGrades.map((g) => [g.letter, null]),
]);
assert.deepEqual(registry.grades.points, dataPoints);

// Letter from points, highest first.
assert.deepEqual(
  registry.grades.pointsToGrade,
  data.grading.scale.map((g) => [g.points, g.letter]),
);

// Mark cutoffs.
assert.deepEqual(
  registry.grades.marks,
  data.grading.scale.map((g) => ({ letter: g.letter, min: g.minMark })),
);
assert.equal(registry.grades.max, Math.max(...data.grading.scale.map((g) => g.points)));

// Retakes: the best attempt counts, unconditionally.
assert.equal(data.retake.counts, 'best');
assert.deepEqual(registry.retake, { kind: 'best' });

// Repeats: "eligible at or below B" is an inclusive threshold at B's points.
const eligibleAt = data.grading.scale.find((g) => g.letter === data.retake.eligibleAtOrBelow);
assert.deepEqual(registry.repeat, { threshold: eligibleAt.points, inclusive: true });

// Credit load: the data publishes no maximum, so the registry must not warn on
// one — a BRACU limit shown to an NSU student would be wrong.
assert.equal(data.creditLoad.max, null);
assert.equal(registry.creditLoad, undefined);

// ── DIU ─────────────────────────────────────────────────────────────────────
{
  const data = campuses.find((c) => c.id === 'diu').profile;
  const registry = UNIVERSITIES.diu;

  assert.equal(registry.name, data.name);
  assert.equal(registry.shortName, data.shortName);
  assert.deepEqual(registry.emailDomains, data.identity.emailDomains);

  // The same letters and points; C-, D+ and D- are not awarded, and neither a
  // W nor a P is claimed while the data lists them as unknown.
  assert.deepEqual(
    registry.grades.points,
    Object.fromEntries([
      ...data.grading.scale.map((g) => [g.letter, g.points]),
      ...data.grading.nonGpaGrades.map((g) => [g.letter, null]),
    ]),
  );
  for (const letter of ['C-', 'D+', 'D-', ...data.grading.unknown]) {
    assert.equal(letter in registry.grades.points, false, `DIU does not award ${letter}`);
  }
  assert.deepEqual(
    registry.grades.pointsToGrade,
    data.grading.scale.map((g) => [g.points, g.letter]),
  );
  assert.deepEqual(
    registry.grades.marks,
    data.grading.scale.map((g) => ({ letter: g.letter, min: g.minMark })),
  );
  assert.equal(registry.grades.max, Math.max(...data.grading.scale.map((g) => g.points)));

  // Retakes: the last attempt counts, unconditionally.
  assert.equal(data.retake.counts, 'latest');
  assert.deepEqual(registry.retake, { kind: 'latest' });

  // Repeats: "less than B". The data names the highest eligible letter (B-),
  // so the registry's exclusive threshold is the next letter up — a B.
  const scale = data.grading.scale;
  const eligible = scale.findIndex((g) => g.letter === data.retake.eligibleAtOrBelow);
  assert.deepEqual(registry.repeat, { threshold: scale[eligible - 1].points, inclusive: false });

  // The data states a cap for failed courses only, and no load maximum, so the
  // registry claims neither.
  assert.equal(data.retake.maxRetakes, null);
  assert.equal(registry.maxRetakes, undefined);
  assert.equal(data.creditLoad.max, null);
  assert.equal(registry.creditLoad, undefined);
}

console.log('universityData: the NSU and DIU registry profiles match data/campuses/<id>/profile.json');
