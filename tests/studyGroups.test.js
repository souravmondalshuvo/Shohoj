/**
 * tests/studyGroups.test.js
 * Pure-logic coverage for the Study Group Finder core: validateGroupDraft,
 * isKnownCourseCode/isValidMode, and summarizeMembers. The Firestore hook
 * wrappers are exercised via the rules suite + manual/e2e QA.
 */

import {
  validateGroupDraft,
  isKnownCourseCode,
  isValidMode,
  summarizeMembers,
  MODES,
  MAX_CAPACITY,
} from '../js/core/studyGroups.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'not equal') + `\n    got:      ${sa}\n    expected: ${sb}`);
}

const draft = (over = {}) => ({
  courseCode: 'CSE220',
  title: 'Algo grind sessions',
  description: 'Weekly problem-solving before the midterm.',
  mode: 'in-person',
  schedule: 'Sun & Tue, 4–6pm, Library',
  contactLink: 'https://m.me/example',
  capacity: 6,
  ...over,
});

console.log('\nstudyGroups — course/mode helpers:');

test('isKnownCourseCode accepts a real catalog code', () => {
  assert(isKnownCourseCode('CSE220'));
  assert(isKnownCourseCode('cse220'), 'should normalize case');
});

test('isKnownCourseCode rejects unknown / malformed codes', () => {
  assert(!isKnownCourseCode('ZZZ999'));
  assert(!isKnownCourseCode('CSE'));
  assert(!isKnownCourseCode(''));
});

test('isValidMode matches the MODES enum only', () => {
  MODES.forEach(m => assert(isValidMode(m), `${m} should be valid`));
  assert(!isValidMode('in person'));
  assert(!isValidMode('remote'));
});

console.log('\nstudyGroups — validateGroupDraft:');

test('a complete valid draft passes', () => {
  eq(validateGroupDraft(draft()), null);
});

test('unknown course code is rejected', () => {
  assert(validateGroupDraft(draft({ courseCode: 'ZZZ999' })) !== null);
});

test('title must be 3–80 chars', () => {
  assert(validateGroupDraft(draft({ title: 'ab' })) !== null);
  assert(validateGroupDraft(draft({ title: 'x'.repeat(81) })) !== null);
  eq(validateGroupDraft(draft({ title: 'abc' })), null);
});

test('description over 500 chars is rejected, empty is allowed', () => {
  assert(validateGroupDraft(draft({ description: 'x'.repeat(501) })) !== null);
  eq(validateGroupDraft(draft({ description: '' })), null);
});

test('invalid mode is rejected', () => {
  assert(validateGroupDraft(draft({ mode: 'remote' })) !== null);
});

test('contact link must be https://', () => {
  assert(validateGroupDraft(draft({ contactLink: 'http://m.me/x' })) !== null);
  assert(validateGroupDraft(draft({ contactLink: 'javascript:alert(1)' })) !== null);
  assert(validateGroupDraft(draft({ contactLink: 'm.me/x' })) !== null);
  eq(validateGroupDraft(draft({ contactLink: 'https://discord.gg/abc' })), null);
});

test('capacity must be a whole number within 2..MAX', () => {
  assert(validateGroupDraft(draft({ capacity: 1 })) !== null);
  assert(validateGroupDraft(draft({ capacity: MAX_CAPACITY + 1 })) !== null);
  assert(validateGroupDraft(draft({ capacity: 4.5 })) !== null);
  eq(validateGroupDraft(draft({ capacity: 2 })), null);
});

console.log('\nstudyGroups — summarizeMembers:');

test('known count formats joined/capacity and flags full', () => {
  const s = summarizeMembers(4, 6);
  eq(s.label, '4 / 6 joined');
  assert(s.known === true);
  assert(s.isFull === false);
  eq(s.spotsLeft, 2);
});

test('count at/over capacity is full with zero spots', () => {
  const s = summarizeMembers(6, 6);
  assert(s.isFull === true);
  eq(s.spotsLeft, 0);
});

test('null count (non-member) is unknown and not full', () => {
  const s = summarizeMembers(null, 6);
  eq(s.label, 'up to 6');
  assert(s.known === false);
  assert(s.isFull === false);
  eq(s.spotsLeft, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
