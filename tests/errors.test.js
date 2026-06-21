// tests/errors.test.js — unit tests for the typed error hierarchy.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ShohojError,
  StorageError,
  ValidationError,
  ConfigError,
  FirebaseUnavailableError,
  WorkerError,
  NotFoundError,
  PermissionError,
  isShohojError,
  toShohojError,
} from '../src/core/errors.ts';

test('ShohojError carries code, technical message, and safe userMessage', () => {
  const e = new ShohojError('unknown', 'raw technical detail');
  assert.equal(e.code, 'unknown');
  assert.equal(e.message, 'raw technical detail');
  assert.equal(e.userMessage, 'Something went wrong. Please try again.');
  assert.equal(e.name, 'ShohojError');
  assert.ok(e instanceof Error);
});

test('subclasses set their own code, name, and default userMessage', () => {
  const cases = [
    [new StorageError('disk full'), 'storage', 'StorageError'],
    [new ValidationError('bad shape'), 'validation', 'ValidationError'],
    [new ConfigError('missing key'), 'config', 'ConfigError'],
    [new FirebaseUnavailableError('gstatic blocked'), 'firebase_unavailable', 'FirebaseUnavailableError'],
    [new WorkerError('503'), 'worker', 'WorkerError'],
    [new NotFoundError('no doc'), 'not_found', 'NotFoundError'],
    [new PermissionError('not admin'), 'permission', 'PermissionError'],
  ];
  for (const [e, code, name] of cases) {
    assert.equal(e.code, code, `code for ${name}`);
    assert.equal(e.name, name, `name for ${name}`);
    assert.ok(e.userMessage.length > 0, `userMessage for ${name}`);
    assert.ok(e instanceof ShohojError, `${name} is a ShohojError`);
  }
});

test('caller-supplied userMessage overrides the subclass default', () => {
  const e = new WorkerError('500', { userMessage: 'Upload failed, try a smaller file.' });
  assert.equal(e.userMessage, 'Upload failed, try a smaller file.');
});

test('cause is preserved for logs but kept off userMessage', () => {
  const raw = new Error('FirebaseError: permission-denied (secret-ish)');
  const e = new FirebaseUnavailableError('init failed', { cause: raw });
  assert.equal(e.cause, raw);
  assert.ok(!e.userMessage.includes('permission-denied'));
});

test('isShohojError narrows only Shohoj errors', () => {
  assert.equal(isShohojError(new StorageError('x')), true);
  assert.equal(isShohojError(new Error('plain')), false);
  assert.equal(isShohojError('string'), false);
  assert.equal(isShohojError(null), false);
});

test('toShohojError normalises any thrown value', () => {
  const already = new ConfigError('keep me');
  assert.equal(toShohojError(already), already);

  const fromError = toShohojError(new Error('boom'));
  assert.ok(fromError instanceof ShohojError);
  assert.equal(fromError.code, 'unknown');
  assert.equal(fromError.message, 'boom');

  const fromString = toShohojError('weird');
  assert.equal(fromString.code, 'unknown');
  assert.equal(fromString.message, 'weird');
});
