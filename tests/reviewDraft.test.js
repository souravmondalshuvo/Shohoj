// tests/reviewDraft.test.js — unit tests for the faculty-review draft model
// (#319), the typed mirror of openReviewModal's form behavior (js/ui/reviews.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { RATING_KEYS } from '../src/core/reviews.ts';
import {
  RATING_FIELDS,
  REVIEW_TEXT_MAX,
  buildReviewPayload,
  emptyReviewDraft,
  firstDraftError,
  setDraftInitials,
  setDraftRating,
  setDraftText,
} from '../src/features/calculator/reviewDraft.ts';

test('RATING_FIELDS matches the legacy RATING_LABELS order and keys', () => {
  assert.deepEqual(
    RATING_FIELDS.map((f) => f.key),
    [...RATING_KEYS],
  );
  assert.deepEqual(
    RATING_FIELDS.map((f) => f.label),
    ['Teaching Quality', 'Marking Fairness', 'Behavior & Attitude', 'Course Difficulty', 'Workload'],
  );
});

test('emptyReviewDraft normalizes the prefill and starts unrated', () => {
  const draft = emptyReviewDraft(' mnr ');
  assert.equal(draft.initials, 'MNR');
  assert.equal(draft.text, '');
  for (const key of RATING_KEYS) assert.equal(draft.ratings[key], 0);
  assert.equal(emptyReviewDraft().initials, '');
});

test('setDraftInitials live-normalizes like the legacy input handler', () => {
  const draft = emptyReviewDraft();
  assert.equal(setDraftInitials(draft, 'm n r').initials, 'MNR');
  assert.equal(setDraftInitials(draft, 'ab-12cd').initials, 'ABCD'); // letters only
  assert.equal(setDraftInitials(draft, 'abcdefgh').initials, 'ABCDEF'); // capped at 6
});

test('setDraftRating stores integers 1–5 and ignores anything else', () => {
  let draft = emptyReviewDraft();
  draft = setDraftRating(draft, 'teaching', 4);
  assert.equal(draft.ratings.teaching, 4);
  // Out-of-range / non-integer values leave the draft untouched.
  assert.equal(setDraftRating(draft, 'teaching', 0).ratings.teaching, 4);
  assert.equal(setDraftRating(draft, 'teaching', 6).ratings.teaching, 4);
  assert.equal(setDraftRating(draft, 'teaching', 2.5).ratings.teaching, 4);
  // Immutability: the original draft is not mutated.
  const before = emptyReviewDraft();
  setDraftRating(before, 'marking', 3);
  assert.equal(before.ratings.marking, 0);
});

test('setDraftText caps the note at the modal maxlength', () => {
  const draft = setDraftText(emptyReviewDraft(), 'x'.repeat(REVIEW_TEXT_MAX + 50));
  assert.equal(draft.text.length, REVIEW_TEXT_MAX);
  assert.equal(setDraftText(emptyReviewDraft(), null).text, '');
});

test('firstDraftError reports invalid initials before any rating', () => {
  let draft = emptyReviewDraft('A'); // 1 letter — invalid
  const err = firstDraftError(draft);
  assert.equal(err.field, 'initials');
  assert.equal(err.message, 'Initials must be 2–6 letters.');

  // Valid initials → the first unrated dimension, in RATING_KEYS order.
  draft = setDraftInitials(draft, 'MNR');
  const err2 = firstDraftError(draft);
  assert.deepEqual(err2, { field: 'rating', key: 'teaching', message: 'Please rate "Teaching Quality"' });

  draft = setDraftRating(draft, 'teaching', 5);
  draft = setDraftRating(draft, 'marking', 4);
  const err3 = firstDraftError(draft);
  assert.equal(err3.key, 'behavior');
  assert.equal(err3.message, 'Please rate "Behavior & Attitude"');
});

test('firstDraftError is null once initials and all five ratings are set', () => {
  let draft = emptyReviewDraft('MNR');
  for (const key of RATING_KEYS) draft = setDraftRating(draft, key, 3);
  assert.equal(firstDraftError(draft), null);
});

test('buildReviewPayload shapes the legacy submitReview payload', () => {
  let draft = emptyReviewDraft('mnr');
  for (const key of RATING_KEYS) draft = setDraftRating(draft, key, 5);
  draft = setDraftText(draft, '  great teacher  ');
  const payload = buildReviewPayload(draft, 'cse220', 'Fall 2024');
  assert.equal(payload.facultyInitials, 'MNR');
  assert.equal(payload.courseCode, 'CSE220');
  assert.equal(payload.semester, 'Fall 2024');
  assert.equal(payload.text, 'great teacher'); // trimmed like textEl.value.trim()
  for (const key of RATING_KEYS) assert.equal(payload.ratings[key], 5);
});
