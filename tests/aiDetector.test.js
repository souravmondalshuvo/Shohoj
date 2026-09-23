/**
 * tests/aiDetector.test.js
 *
 * The model as a detector (#741) — src/features/tasks/detection/aiDetector.ts.
 *
 * The rule under test is the brief's: AI must not become a hard dependency.
 * That is kept or quietly broken in this file, so most of what is asserted is
 * what happens when the model is missing, refusing, broken, or slow — and the
 * answer every time is that the student keeps what they already had.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiDetector, shouldOfferAi } from '../src/features/tasks/detection/aiDetector.ts';

const NOW = new Date(2026, 8, 23, 10, 0, 0);
const CTX = { now: NOW, knownCourseCodes: ['MAT215'] };

/**
 * An ApiClient stub: only `post` is ever reached.
 *
 * `post` resolves the RESPONSE envelope — `{ detected: [...] }` — which the
 * api module then unwraps. Stubbing the unwrapped value instead would pass
 * while the real call returned undefined.
 */
function ok(detected) {
  return { ok: true, value: { detected } };
}

function clientReturning(result, calls = []) {
  return {
    post: async (path, body) => {
      calls.push({ path, body });
      return result;
    },
  };
}

const extracted = (over = {}) => ({
  title: 'Quiz 3',
  type: 'QUIZ',
  dueAt: '2026-09-25T17:59:00.000Z',
  courseCode: 'MAT215',
  syllabus: 'chapters 4-6',
  confidence: 'high',
  evidence: 'Quiz 3 is on 25 September.',
  ...over,
});

const failure = (apiCode, userMessage = 'nope') => ({
  ok: false,
  error: { apiCode, userMessage, code: 'worker' },
});

// ── When to bother asking ───────────────────────────────────────────────────

test('a second reading is offered when the parser found nothing', () => {
  assert.equal(shouldOfferAi([]), true);
});

test('a second reading is offered when nothing found had a date', () => {
  // Precisely the case a model can improve on.
  assert.equal(shouldOfferAi([{ dueAt: null }, { dueAt: null }]), true);
});

test('a second reading is NOT offered when the free parser already worked', () => {
  // The common case must cost nothing.
  assert.equal(shouldOfferAi([{ dueAt: '2026-09-25T17:59:00.000Z' }, { dueAt: null }]), false);
});

// ── The happy path ──────────────────────────────────────────────────────────

test('extracted tasks come back as proposals, marked AI_SUGGESTION', async () => {
  const detector = createAiDetector(clientReturning(ok([extracted()])));
  const result = await detector.detect('some announcement', CTX);

  assert.equal(result.outcome, 'ok');
  assert.equal(result.source, 'AI_SUGGESTION');
  assert.equal(result.detected.length, 1);
  assert.equal(result.detected[0].title, 'Quiz 3');
  assert.equal(result.detected[0].dueAt, '2026-09-25T17:59:00.000Z');
});

test('nothing a detector returns is a task', async () => {
  // Same structural guarantee as the deterministic detector: no id, no status,
  // and therefore no way to hand it to the API.
  const detector = createAiDetector(clientReturning(ok([extracted()])));
  const { detected } = await detector.detect('x', CTX);

  assert.equal(detected[0].id, undefined);
  assert.equal(detected[0].status, undefined);
});

test('the model’s quoted sentence is carried as evidence', async () => {
  const detector = createAiDetector(clientReturning(ok([extracted()])));
  const { detected } = await detector.detect('x', CTX);

  assert.equal(detected[0].evidence.dueAt.text, 'Quiz 3 is on 25 September.');
});

test('a proposal with no quoted sentence carries no invented evidence', async () => {
  const detector = createAiDetector(clientReturning(ok([extracted({ evidence: null })])));
  const { detected } = await detector.detect('x', CTX);

  assert.deepEqual(detected[0].evidence, {});
});

test('course codes are sent, and nothing identifying is', async () => {
  const calls = [];
  const detector = createAiDetector(clientReturning(ok([]), calls));
  await detector.detect('some announcement', CTX);

  assert.equal(calls[0].path, '/tasks/extract');
  assert.deepEqual(calls[0].body.courseCodes, ['MAT215']);
  assert.equal(calls[0].body.text, 'some announcement');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['courseCodes', 'text']);
});

// ── Degradation: the rule that matters ──────────────────────────────────────

test('an unconfigured deployment reports unavailable, not an error', async () => {
  // A student told "unavailable" knows not to retry.
  const detector = createAiDetector(clientReturning(failure('unavailable', 'No reader here.')));
  const result = await detector.detect('x', CTX);

  assert.equal(result.outcome, 'unavailable');
  assert.equal(result.detected.length, 0);
  assert.equal(result.note, 'No reader here.');
});

test('a genuine failure is distinct from unavailable', async () => {
  // A student told "failed" knows it might work next time.
  const detector = createAiDetector(clientReturning(failure('internal', 'Broke.')));
  const result = await detector.detect('x', CTX);

  assert.equal(result.outcome, 'failed');
  assert.equal(result.detected.length, 0);
});

test('a rate-limited reading is a failure, not an absence of the feature', async () => {
  const detector = createAiDetector(clientReturning(failure('rate_limited', 'Slow down.')));
  assert.equal((await detector.detect('x', CTX)).outcome, 'failed');
});

test('no failure path ever returns a proposal', async () => {
  for (const code of ['unavailable', 'internal', 'rate_limited', 'invalid_request', undefined]) {
    const detector = createAiDetector(clientReturning(failure(code)));
    const result = await detector.detect('x', CTX);
    assert.deepEqual(result.detected, [], `${code} must produce nothing`);
    assert.notEqual(result.outcome, 'ok');
  }
});

test('a successful but empty reading is ok, not a failure', async () => {
  // "I read it and there was nothing" is a real answer, and the panel uses the
  // difference to decide whether to keep what the student already had.
  const detector = createAiDetector(clientReturning(ok([])));
  const result = await detector.detect('x', CTX);

  assert.equal(result.outcome, 'ok');
  assert.deepEqual(result.detected, []);
});
