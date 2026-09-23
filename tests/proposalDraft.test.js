/**
 * tests/proposalDraft.test.js
 *
 * The Suggest and Confirm halves of the import flow (#735) —
 * src/features/tasks/detection/proposalDraft.ts and ../localInstant.ts.
 *
 * The rule worth pinning is that a detection cannot become a task without
 * passing through a draft the student edited or accepted. That is enforced by
 * the types — there is no DetectedTask → CreateTaskInput path — so what is
 * tested here is the behaviour around it: what is selected by default, what
 * survives an edit, and what a confirmed draft actually sends.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { detectFromText } from '../src/features/tasks/detection/announcementDetector.ts';
import {
  confidenceNote,
  confirmLabel,
  creatable,
  draftToInput,
  patchDraft,
  toDrafts,
} from '../src/features/tasks/detection/proposalDraft.ts';
import {
  instantToLocalInput,
  localInputToInstant,
} from '../src/features/tasks/localInstant.ts';

const NOW = new Date(2026, 8, 21, 10, 0, 0);
const CTX = { now: NOW, knownCourseCodes: ['MAT215'] };

const ENROLLMENTS = [
  { id: 'enr_' + 'a'.repeat(32), courseCode: 'MAT215' },
  { id: 'enr_' + 'b'.repeat(32), courseCode: 'CSE110' },
];

function draftsFrom(text) {
  return toDrafts(detectFromText(text, CTX).detected, ENROLLMENTS);
}

// ── Local time ⇄ instant ────────────────────────────────────────────────────

test('the two conversions are inverses', () => {
  const local = '2026-09-25T23:59';
  assert.equal(instantToLocalInput(localInputToInstant(local)), local);
});

test('an instant displays on the student’s clock, not UTC', () => {
  // Slicing toISOString() would show a Dhaka student 17:59 for a deadline they
  // set at 23:59 — and "correcting" it would move a deadline that was right.
  const local = '2026-09-25T23:59';
  const shown = instantToLocalInput(localInputToInstant(local));
  assert.equal(shown.slice(11), '23:59');
});

test('an empty or unparseable value is empty in both directions', () => {
  assert.equal(localInputToInstant(''), null);
  assert.equal(localInputToInstant('not a date'), null);
  assert.equal(instantToLocalInput(null), '');
  assert.equal(instantToLocalInput('not a date'), '');
});

// ── Suggest ─────────────────────────────────────────────────────────────────

test('a dated proposal is selected; an undated one is not', () => {
  // "Add 3 tasks" should mean three things the parser actually pinned down.
  // An undated proposal is still offered — it is one checkbox away — but it
  // does not ride along by default.
  const drafts = draftsFrom('Quiz 3 on 25 September. Assignment 2 is sometime next week.');

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].selected, true);
  assert.equal(drafts[1].selected, false);
  assert.equal(drafts[1].dueLocal, '');
});

test('a course the student is enrolled in becomes an enrolment id', () => {
  const [draft] = draftsFrom('MAT215 Quiz 3 on 25 September.');

  assert.equal(draft.courseCode, 'MAT215');
  assert.equal(draft.enrollmentId, ENROLLMENTS[0].id);
});

test('a real course the student is NOT taking stays a code, not an enrolment', () => {
  // Showing it explains why the proposal says what it says. Inventing an
  // enrolment would file the task under a course that does not exist for them.
  const [draft] = draftsFrom('CSE220 assignment due 30 September.');

  assert.equal(draft.courseCode, 'CSE220');
  assert.equal(draft.enrollmentId, '');
});

test('a proposal carries the text it was read from', () => {
  const [draft] = draftsFrom('MAT215 Quiz 3 on 25 September, chapters 4-6.');

  assert.match(draft.sourceText, /MAT215/);
  assert.match(draft.sourceText, /25 September/);
});

test('confidence reads as an instruction, never as a score', () => {
  const [dated] = draftsFrom('MAT215 Quiz 3 on 25 September at 9:30 am.');
  const [undated] = draftsFrom('Quiz 3 sometime soon.');

  assert.equal(confidenceNote(dated), 'Date and time read from the text.');
  assert.match(confidenceNote(undated), /No date found/);
  for (const note of [confidenceNote(dated), confidenceNote(undated)]) {
    assert.doesNotMatch(note, /\d+(\.\d+)?%|0\.\d+/, 'no numeric score in the wording');
  }
});

// ── Confirm ─────────────────────────────────────────────────────────────────

test('the confirm button names the count, so it can be checked against the list', () => {
  const drafts = draftsFrom('Quiz 3 on 24 September. Assignment 2 due 30 September.');

  assert.equal(confirmLabel(drafts), 'Add 2 tasks');
  assert.equal(confirmLabel([patchDraft(drafts[0], { selected: false })]), 'Nothing selected');
  assert.equal(confirmLabel([drafts[0]]), 'Add 1 task');
});

test('an edit changes one field and leaves the selection alone', () => {
  const [draft] = draftsFrom('Quiz 3 on 25 September.');
  const edited = patchDraft(draft, { title: 'Quiz 3 — rescheduled' });

  assert.equal(edited.title, 'Quiz 3 — rescheduled');
  assert.equal(edited.selected, draft.selected);
  assert.equal(edited.dueLocal, draft.dueLocal);
  assert.equal(draft.title, 'Quiz 3', 'the original is not mutated');
});

test('a draft with its title emptied is not creatable', () => {
  const [draft] = draftsFrom('Quiz 3 on 25 September.');
  assert.deepEqual(creatable([patchDraft(draft, { title: '   ' })]), []);
});

test('a confirmed task says it came from a paste, and says what from', () => {
  const [draft] = draftsFrom('MAT215 Quiz 3 on 25 September, chapters 4-6.');
  const input = draftToInput(draft);

  assert.equal(input.source, 'PASTE');
  assert.match(input.sourceReference, /25 September/);
  assert.equal(input.title, 'Quiz 3');
  assert.equal(input.type, 'QUIZ');
  assert.equal(input.enrollmentId, ENROLLMENTS[0].id);
  assert.equal(input.description, 'chapters 4-6');
});

test('a draft records WHICH reading produced it', () => {
  // MANUAL, PASTE and AI_SUGGESTION were all approved by the student. What
  // separates them is what read the deadline, and only this says which.
  const [pasted] = draftsFrom('Quiz 3 on 25 September.');
  assert.equal(draftToInput(pasted).source, 'PASTE');

  const [byModel] = toDrafts(
    detectFromText('Quiz 3 on 25 September.', CTX).detected,
    ENROLLMENTS,
    'AI_SUGGESTION',
  );
  assert.equal(draftToInput(byModel).source, 'AI_SUGGESTION');
});

test('a confirmed task sends an instant with an offset, which the server requires', () => {
  const [draft] = draftsFrom('Quiz 3 on 25 September.');
  const input = draftToInput(draft);

  // A bare local time does not name a moment and the Worker refuses it.
  assert.match(input.dueAt, /Z$|[+-]\d{2}:\d{2}$/);
});

test('an undated draft sends a null date rather than a made-up one', () => {
  const [draft] = draftsFrom('Quiz 3 sometime soon.');
  assert.equal(draftToInput(draft).dueAt, null);
});

test('no draft ever proposes a priority', () => {
  // The detector has no view on how much a quiz matters to this student.
  // Priority belongs to the deterministic engine that exists to decide it.
  for (const text of ['MAT215 Quiz 3 on 25 September at 9 am.', 'Quiz 3 sometime soon.']) {
    const [draft] = draftsFrom(text);
    assert.equal(draftToInput(draft).priority, undefined);
  }
});

test('an edited date is what gets sent, not the detected one', () => {
  const [draft] = draftsFrom('Quiz 3 on 25 September.');
  const moved = patchDraft(draft, { dueLocal: '2026-10-02T14:00' });

  assert.equal(draftToInput(moved).dueAt, localInputToInstant('2026-10-02T14:00'));
});
