// tests/logger.test.js
//
// Covers the structured logger (src/platform/observability/logger.ts):
// level filtering, bound/child fields, error field extraction, sink shape.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLogger,
  fieldsFromError,
} from '../src/platform/observability/logger.ts';
import { ValidationError } from '../src/core/errors.ts';

function capture(options = {}) {
  const records = [];
  const logger = createLogger({ sink: (r) => records.push(r), ...options });
  return { logger, records };
}

const FIXED = () => new Date('2026-06-28T00:00:00.000Z');

test('emits a structured record with level, message, ISO time and fields', () => {
  const { logger, records } = capture({ now: FIXED });
  logger.info('hello', { a: 1 });
  assert.equal(records.length, 1);
  assert.equal(records[0].level, 'info');
  assert.equal(records[0].message, 'hello');
  assert.equal(records[0].time, '2026-06-28T00:00:00.000Z');
  assert.deepEqual(records[0].fields, { a: 1 });
});

test('drops records below minLevel', () => {
  const { logger, records } = capture({ minLevel: 'warn' });
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  assert.deepEqual(records.map((r) => r.level), ['warn', 'error']);
});

test('default minLevel is info (debug dropped)', () => {
  const { logger, records } = capture();
  logger.debug('nope');
  logger.info('yes');
  assert.deepEqual(records.map((r) => r.message), ['yes']);
});

test('base fields are merged into every record', () => {
  const { logger, records } = capture({ base: { service: 'reviews' } });
  logger.info('x', { id: 7 });
  assert.deepEqual(records[0].fields, { service: 'reviews', id: 7 });
});

test('child() binds extra fields without mutating the parent', () => {
  const { logger, records } = capture({ base: { service: 'reviews' } });
  const req = logger.child({ requestId: 'r1' });
  req.info('handling');
  logger.info('parent');
  assert.deepEqual(records[0].fields, { service: 'reviews', requestId: 'r1' });
  assert.deepEqual(records[1].fields, { service: 'reviews' });
});

test('per-call fields override bound fields', () => {
  const { logger, records } = capture({ base: { env: 'prod' } });
  logger.warn('x', { env: 'test' });
  assert.equal(records[0].fields.env, 'test');
});

test('fieldsFromError: ShohojError exposes machine code, never userMessage as message', () => {
  const f = fieldsFromError(new ValidationError('bad input at row 3'));
  assert.equal(f.errorCode, 'validation');
  assert.equal(f.errorName, 'ValidationError');
  assert.equal(f.errorMessage, 'bad input at row 3');
  // The user-facing string is not promoted into the log message field.
  assert.equal(f.errorMessage.includes('could not be read'), false);
});

test('fieldsFromError: plain Error and non-error values', () => {
  assert.deepEqual(fieldsFromError(new Error('boom')), {
    errorName: 'Error',
    errorMessage: 'boom',
  });
  assert.deepEqual(fieldsFromError('weird'), { errorMessage: 'weird' });
});

console.log('logger tests passed');
