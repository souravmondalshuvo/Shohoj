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

test('an admin sees every campus, whatever their address', () => {
  for (const email of [BRACU, NSU, OUTSIDE]) {
    const plan = campusReadPlan(email, true);
    assert.equal(plan.filter, null);
    assert.equal(plan.keep({ university: 'nsu' }), true);
    assert.equal(plan.keep({ university: 'bracu' }), true);
    assert.equal(plan.keep({}), true);
  }
});

test('the pre-tenancy default is the one firestore.rules uses', () => {
  const rules = read('firestore.rules');
  const match = rules.match(/function docCampus\(data\) \{\s*return 'university' in data \? data\.university : '([a-z]+)';/);
  assert.ok(match, 'found docCampus in firestore.rules');
  assert.equal(match[1], PRE_TENANCY_CAMPUS);
});

test('every unfiltered list of a campus-scoped collection goes through listForMyCampus', () => {
  // The three collections this client lists and the rules scope by campus.
  // A new `query(collection(db, '<one of these>'), …)` would be denied for NSU
  // and unfiltered for BRACU, so it has to be a deliberate exception here.
  const src = read('js/auth/firebase.js');
  const direct = [...src.matchAll(/collection\(db, '(studyGroups|appFeedback|papers)'\)/g)].map((m) => {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    return src.slice(lineStart, src.indexOf('\n', m.index)).trim();
  });
  const unscoped = direct.filter(
    (line) => !line.includes('listForMyCampus(') && !line.includes('addDoc('),
  );
  // The exceptions, each allowed by the rules without a campus filter:
  //   - _shohoj_fetchMyPapers: the student's own uploads
  //   - _shohoj_fetchUnapprovedPapers: the admin's moderation queue
  //   - the admin dashboard's stats, two samples each of papers and feedback
  assert.deepEqual(unscoped.sort(), [
    "const col = collection(db, 'papers');",
    "const col = collection(db, 'papers');",
    "getDocs(query(collection(db, 'appFeedback'),",
    "getDocs(query(collection(db, 'appFeedback'),",
    "getDocs(query(collection(db, 'papers'),",
    "getDocs(query(collection(db, 'papers'),",
  ]);
});

test('both client-created campus documents carry the write field', () => {
  const src = read('js/auth/firebase.js');
  const stamped = src.split('...campusWriteField(currentUser.email)').length - 1;
  assert.equal(stamped, 2, 'study groups and feedback');
});
