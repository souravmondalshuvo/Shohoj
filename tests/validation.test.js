// tests/validation.test.js
//
// Covers the runtime-validation boundary (src/shared/validation/schema.ts):
// Zod parsing wrapped into the typed Result + ValidationError hierarchy.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  z,
  validate,
  formatIssues,
  SchemaValidationError,
} from '../src/shared/validation/schema.ts';
import { isOk, isErr } from '../src/core/result.ts';
import { ValidationError, ShohojError } from '../src/core/errors.ts';

const Review = z.object({
  courseCode: z.string().min(1),
  rating: z.number().int().min(1).max(5),
});

test('validate: returns ok with the parsed, typed value', () => {
  const result = validate(Review, { courseCode: 'CSE220', rating: 4 });
  assert.ok(isOk(result));
  assert.deepEqual(result.value, { courseCode: 'CSE220', rating: 4 });
});

test('validate: strips unknown keys per the schema (no passthrough)', () => {
  const result = validate(Review, { courseCode: 'CSE220', rating: 4, evil: 1 });
  assert.ok(isOk(result));
  assert.equal('evil' in result.value, false);
});

test('validate: invalid data returns err with a SchemaValidationError', () => {
  const result = validate(Review, { courseCode: '', rating: 9 });
  assert.ok(isErr(result));
  const e = result.error;
  assert.ok(e instanceof SchemaValidationError);
  assert.ok(e instanceof ValidationError);
  assert.ok(e instanceof ShohojError);
  assert.equal(e.code, 'validation');
  assert.equal(e.name, 'SchemaValidationError');
});

test('validate: error carries structured per-field issues', () => {
  const result = validate(Review, { courseCode: '', rating: 9 });
  assert.ok(isErr(result));
  const paths = result.error.issues.map((i) => i.path).sort();
  assert.deepEqual(paths, ['courseCode', 'rating']);
  for (const issue of result.error.issues) {
    assert.equal(typeof issue.message, 'string');
    assert.ok(issue.message.length > 0);
  }
});

test('validate: userMessage stays generic/safe, technical detail goes to message', () => {
  const result = validate(Review, { courseCode: '', rating: 9 }, 'review submission');
  assert.ok(isErr(result));
  // User-facing text must not leak validator internals.
  assert.equal(result.error.userMessage, 'Some of the data could not be read and was skipped.');
  // Technical message includes the context label for logs.
  assert.ok(result.error.message.startsWith('review submission:'));
});

test('validate: preserves the ZodError as cause for logs only', () => {
  const result = validate(Review, { rating: 'x' });
  assert.ok(isErr(result));
  assert.ok(result.error.cause instanceof z.ZodError);
});

test('formatIssues: dotted paths for nested fields', () => {
  const Nested = z.object({ ratings: z.object({ teaching: z.number() }) });
  const parsed = Nested.safeParse({ ratings: { teaching: 'no' } });
  assert.equal(parsed.success, false);
  const issues = formatIssues(parsed.error);
  assert.equal(issues[0].path, 'ratings.teaching');
});

console.log('validation schema tests passed');
