// tests/globalErrorHandlers.test.js
//
// Covers frontend global error capture (src/platform/observability/globalErrorHandlers.ts):
// it routes window errors and unhandled rejections through the logger, logs only
// safe error fields, and can be uninstalled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLogger } from '../src/platform/observability/logger.ts';
import { installGlobalErrorHandlers } from '../src/platform/observability/globalErrorHandlers.ts';
import { ValidationError } from '../src/core/errors.ts';

// Minimal fake event target that records listeners and can dispatch to them.
function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    dispatch(type, event) {
      const fn = listeners.get(type);
      if (fn) fn(event);
    },
    has: (type) => listeners.has(type),
  };
}

function setup() {
  const records = [];
  const logger = createLogger({ sink: (r) => records.push(r) });
  const target = fakeTarget();
  const dispose = installGlobalErrorHandlers(logger, target);
  return { records, target, dispose };
}

test('logs window error events with safe error fields', () => {
  const { records, target } = setup();
  target.dispatch('error', { error: new ValidationError('bad row 3') });
  assert.equal(records.length, 1);
  assert.equal(records[0].level, 'error');
  assert.equal(records[0].fields.event, 'window_error');
  assert.equal(records[0].fields.errorCode, 'validation');
  assert.equal(records[0].fields.errorMessage, 'bad row 3');
});

test('logs unhandled promise rejections via event.reason', () => {
  const { records, target } = setup();
  target.dispatch('unhandledrejection', { reason: new Error('boom') });
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.event, 'unhandled_rejection');
  assert.equal(records[0].fields.errorName, 'Error');
  assert.equal(records[0].fields.errorMessage, 'boom');
});

test('falls back to event.message when no error object is present', () => {
  const { records, target } = setup();
  target.dispatch('error', { message: 'Script error.' });
  assert.equal(records[0].fields.errorMessage, 'Script error.');
});

test('dispose() removes the listeners', () => {
  const { target, dispose } = setup();
  assert.equal(target.has('error'), true);
  dispose();
  assert.equal(target.has('error'), false);
  assert.equal(target.has('unhandledrejection'), false);
});

test('no-ops safely when target has no addEventListener', () => {
  const logger = createLogger({ sink: () => {} });
  const dispose = installGlobalErrorHandlers(logger, {});
  assert.equal(typeof dispose, 'function');
  dispose(); // must not throw
});

console.log('global error handler tests passed');
