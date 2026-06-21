// tests/result.test.js — unit tests for the typed Result primitive.
// Imports the .ts source directly (Node runs TypeScript via type stripping).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  map,
  mapErr,
  andThen,
} from '../src/core/result.ts';

test('ok / err build the discriminated shapes', () => {
  assert.deepEqual(ok(5), { ok: true, value: 5 });
  assert.deepEqual(err('boom'), { ok: false, error: 'boom' });
});

test('isOk / isErr narrow correctly', () => {
  assert.equal(isOk(ok(1)), true);
  assert.equal(isOk(err('x')), false);
  assert.equal(isErr(err('x')), true);
  assert.equal(isErr(ok(1)), false);
});

test('unwrapOr returns value on success, fallback on failure', () => {
  assert.equal(unwrapOr(ok(42), 0), 42);
  assert.equal(unwrapOr(err('nope'), 0), 0);
});

test('map transforms success and passes failure through untouched', () => {
  assert.deepEqual(map(ok(2), (n) => n * 3), ok(6));
  const failure = err('bad');
  assert.equal(map(failure, (n) => n * 3), failure);
});

test('mapErr transforms failure and passes success through untouched', () => {
  assert.deepEqual(mapErr(err('bad'), (e) => `${e}!`), err('bad!'));
  const success = ok(7);
  assert.equal(mapErr(success, (e) => e), success);
});

test('andThen chains and short-circuits on the first failure', () => {
  const half = (n) => (n % 2 === 0 ? ok(n / 2) : err('odd'));
  assert.deepEqual(andThen(ok(8), half), ok(4));
  assert.deepEqual(andThen(ok(7), half), err('odd'));
  const failure = err('start');
  assert.equal(andThen(failure, half), failure);
});
