/**
 * tests/campusScope.test.js
 * How legacy tags the documents it creates and scopes the ones it lists
 * (#821). The rules-side half of the same contract is pinned in
 * tests/firestore.rules.test.js ("list:" cases).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PRE_TENANCY_CAMPUS, campusReadPlan, campusWriteField } from '../js/auth/campus-scope.js';
import { setActiveCampusForEmail } from '../js/core/activeCampus.js';
import {
  clearFacultyCache,
  getFacultyProfile,
  hasFacultyProfile,
  listKnownFaculty,
  suggestFaculty,
  upsertFacultyProfile,
} from '../js/core/faculty.js';

const BRACU = 'student@g.bracu.ac.bd';
const NSU = 'student@northsouth.edu';
const OUTSIDE = 'someone@gmail.com';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a student is tagged with their own campus', () => {
  assert.deepEqual(campusWriteField(BRACU), { university: 'bracu' });
  assert.deepEqual(campusWriteField(NSU), { university: 'nsu' });
  assert.deepEqual(campusWriteField('Student@NorthSouth.edu'), { university: 'nsu' });
});

test('an address no campus claims writes no field rather than a guess', () => {
  assert.deepEqual(campusWriteField(OUTSIDE), {});
  assert.deepEqual(campusWriteField(null), {});
  assert.deepEqual(campusWriteField('a@g.bracu.ac.bd.attacker.com'), {});
});

test('NSU filters in the query and keeps only NSU rows', () => {
  const plan = campusReadPlan(NSU);
  assert.equal(plan.filter, 'nsu');
  assert.equal(plan.keep({ university: 'nsu' }), true);
  assert.equal(plan.keep({ university: 'bracu' }), false);
  // No field means BRACU's, by the rules' own reading — never NSU's.
  assert.equal(plan.keep({}), false);
});

test('BRACU sends no filter, keeps its pre-tenancy rows and drops other campuses', () => {
  const plan = campusReadPlan(BRACU);
  assert.equal(plan.filter, null);
  assert.equal(plan.keep({ university: 'bracu' }), true);
  assert.equal(plan.keep({}), true);
  assert.equal(plan.keep({ university: 'nsu' }), false);
});

test('an admin on a page that shows no campus sees every campus, whatever their address', () => {
  // The admin dashboard: it does not load activeCampus.js, so nothing is passed.
  for (const email of [BRACU, NSU, OUTSIDE]) {
    for (const plan of [campusReadPlan(email, true), campusReadPlan(email, true, null)]) {
      assert.equal(plan.filter, null);
      assert.equal(plan.keep({ university: 'nsu' }), true);
      assert.equal(plan.keep({ university: 'bracu' }), true);
      assert.equal(plan.keep({}), true);
    }
  }
});

test('an admin viewing a campus is listed what its students are, whatever their address', () => {
  for (const email of [BRACU, NSU, OUTSIDE]) {
    const asNsu = campusReadPlan(email, true, 'nsu');
    assert.equal(asNsu.filter, 'nsu');
    assert.equal(asNsu.keep({ university: 'nsu' }), true);
    assert.equal(asNsu.keep({ university: 'bracu' }), false);
    assert.equal(asNsu.keep({}), false);

    const asBracu = campusReadPlan(email, true, 'bracu');
    assert.equal(asBracu.filter, null);
    assert.equal(asBracu.keep({ university: 'bracu' }), true);
    assert.equal(asBracu.keep({}), true);
    assert.equal(asBracu.keep({ university: 'nsu' }), false);
  }
});

test('the campus being viewed never moves a student off their own', () => {
  // The hook that reports it lives on window, where a student can plant one.
  const planted = campusReadPlan(NSU, false, 'bracu');
  assert.equal(planted.filter, 'nsu');
  assert.equal(planted.keep({ university: 'bracu' }), false);
  assert.equal(planted.keep({}), false);
  assert.equal(campusReadPlan(BRACU, false, 'nsu').keep({ university: 'nsu' }), false);
});

test('the pre-tenancy default is the one firestore.rules uses', () => {
  const rules = read('firestore.rules');
  const match = rules.match(
    /function docCampus\(data\) \{\s*return 'university' in data \? data\.university : '([a-z]+)';/,
  );
  assert.ok(match, 'found docCampus in firestore.rules');
  assert.equal(match[1], PRE_TENANCY_CAMPUS);
});

test('every hook that reads a campus-scoped collection is campus-scoped or a named exception', () => {
  // The collections this client reads and the rules scope by campus. A hook
  // that queries one without the campus helpers is denied for NSU and
  // unfiltered for BRACU, so it has to be a deliberate exception here.
  const SCOPED =
    /collection\(db, '(studyGroups|appFeedback|papers|facultyReviews|facultyProfiles)'\)/;
  const HELPERS = /listForMyCampus\(|pageForMyCampus\(|myCampusReadPlan\(/;
  const src = read('js/auth/firebase.js');
  const hooks = src.split(/^window\.(_shohoj_[A-Za-z]+) = /m);
  const unscoped = [];
  for (let i = 1; i < hooks.length; i += 2) {
    const [name, body] = [hooks[i], hooks[i + 1]];
    if (SCOPED.test(body) && !HELPERS.test(body)) unscoped.push(name);
  }
  assert.deepEqual(
    unscoped.sort(),
    [
      // Creates, not reads: tagged by campusWriteField (next test).
      '_shohoj_createStudyGroup',
      '_shohoj_submitFeedback',
      // The admin dashboard's stats and moderation queue: admins read every campus.
      '_shohoj_fetchAdminStats',
      '_shohoj_fetchUnapprovedPapers',
      // The student's own uploads, which the rules allow by uploaderUid.
      '_shohoj_fetchMyPapers',
    ].sort(),
  );
});

test('both client-created campus documents carry the write field', () => {
  const src = read('js/auth/firebase.js');
  const stamped = src.split('...campusWriteField(currentUser.email)').length - 1;
  assert.equal(stamped, 2, 'study groups and feedback');
});

test('the bundled BRACU review seed is only ever read through the campus check (#823)', () => {
  // SEEDED_REVIEWS is empty in the source tree — build3.py injects it — so the
  // behaviour cannot be exercised here; what can be pinned is that nothing
  // reaches the array except the one function that asks which campus is showing.
  const src = read('js/core/reviews.js');
  const uses = src
    .split('\n')
    .filter((line) => line.includes('SEEDED_REVIEWS') && !line.trim().startsWith('//'));
  assert.deepEqual(
    uses.map((line) => line.trim()),
    [
      'const SEEDED_REVIEWS = []; // injected by build3.py',
      'return getActiveCampus().id === DEFAULT_UNIVERSITY_ID ? SEEDED_REVIEWS : [];',
    ],
  );
  // build3.py finds the declaration by this exact text.
  assert.ok(read('build3.py').includes("'const SEEDED_REVIEWS = []; // injected by build3.py'"));
});

test('the campus being viewed reaches every read plan this client makes', () => {
  // One call to campusReadPlan, inside the helper that passes the viewed
  // campus along. A second, direct call would be a list an admin's switcher
  // does not move.
  const src = read('js/auth/firebase.js');
  assert.equal(src.split('campusReadPlan(').length - 1, 1);
  assert.match(
    src,
    /function myCampusReadPlan\(\) \{\s*return campusReadPlan\(\s*currentUser\?\.email,\s*_isAdminCached,\s*window\._shohoj_activeCampusId\?\.\(\) \?\? null,\s*\);/,
  );
  assert.ok(read('js/core/activeCampus.js').includes('window._shohoj_activeCampusId = () => _activeCampusId;'));
});

test('a faculty profile is known only on the campus it was learned on', () => {
  // Initials are a name inside one university. BRACU's MAK must not answer for
  // NSU's — not in the search box, not on a faculty page, not in a course list.
  clearFacultyCache();
  try {
    setActiveCampusForEmail(BRACU);
    upsertFacultyProfile({ initials: 'MAK', name: 'A BRACU lecturer', courses: ['CSE110'] });
    assert.equal(hasFacultyProfile('MAK'), true);

    setActiveCampusForEmail(NSU);
    assert.equal(hasFacultyProfile('MAK'), false);
    assert.equal(getFacultyProfile('MAK'), null);
    assert.deepEqual(listKnownFaculty(), []);
    assert.deepEqual(suggestFaculty('MA'), []);
    assert.deepEqual(suggestFaculty('BRACU'), []);

    upsertFacultyProfile({ initials: 'MAK', name: 'An NSU lecturer', courses: ['CSE115'] });
    assert.equal(getFacultyProfile('MAK').name, 'An NSU lecturer');

    setActiveCampusForEmail(BRACU);
    assert.equal(getFacultyProfile('MAK').name, 'A BRACU lecturer');
    assert.equal(listKnownFaculty().length, 1);
  } finally {
    setActiveCampusForEmail(null);
    clearFacultyCache();
  }
});

test('the bundled BRACU faculty seed is only ever poured into BRACU\'s cache', () => {
  // Empty in the source tree, like SEEDED_REVIEWS above — build3.py injects it.
  const src = read('js/core/faculty.js');
  const uses = src
    .split('\n')
    .filter((line) => line.includes('SEEDED_FACULTY_PROFILES') && !line.trim().startsWith('//'))
    .map((line) => line.trim());
  assert.deepEqual(uses, [
    'const SEEDED_FACULTY_PROFILES = []; // injected by build3.py',
    'SEEDED_FACULTY_PROFILES.forEach(profile => upsertFacultyProfile(profile, UNIVERSITIES[id]));',
  ]);
  assert.match(
    src,
    /if \(id === DEFAULT_UNIVERSITY_ID\) \{\s*SEEDED_FACULTY_PROFILES\.forEach/,
  );
  // build3.py finds the declaration by this exact text.
  assert.ok(
    read('build3.py').includes("'const SEEDED_FACULTY_PROFILES = []; // injected by build3.py'"),
  );
});
