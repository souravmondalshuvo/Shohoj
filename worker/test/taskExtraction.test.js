// worker/test/taskExtraction.test.js
//
// What model output is allowed to become (#741).
//
// The text being extracted is untrusted and the model reading it is not a
// trusted component either, so almost everything here is an assertion about
// REFUSAL. A model that returns six good tasks and one hallucinated date must
// cost the student that date, not their confidence in the feature.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTRACTION_SYSTEM,
  MAX_PROPOSALS,
  buildExtractionPrompt,
  parseExtractionResponse,
} from '../taskExtraction.js';

const NOW = new Date('2026-09-23T10:00:00Z');
const opts = { now: NOW };

/** A well-formed entry, to vary one field at a time. */
function entry(over = {}) {
  return {
    title: 'Quiz 3',
    type: 'QUIZ',
    dueAt: '2026-09-25T17:59:00Z',
    courseCode: 'MAT215',
    syllabus: 'chapters 4-6',
    confidence: 'high',
    evidence: 'Quiz 3 is on 25 September.',
    ...over,
  };
}

const reply = (tasks) => JSON.stringify({ tasks });

// ── The happy path ──────────────────────────────────────────────────────────

test('a well-formed reply becomes proposals', () => {
  const result = parseExtractionResponse(reply([entry()]), opts);

  assert.equal(result.dropped, 0);
  assert.deepEqual(result.tasks, [
    {
      title: 'Quiz 3',
      type: 'QUIZ',
      dueAt: '2026-09-25T17:59:00.000Z',
      courseCode: 'MAT215',
      syllabus: 'chapters 4-6',
      confidence: 'high',
      evidence: 'Quiz 3 is on 25 September.',
    },
  ]);
});

test('an empty extraction is a success, not a failure', () => {
  // Distinct from null below: "I read it and there was nothing" is a real
  // answer, and the student must not be told the feature broke.
  const result = parseExtractionResponse(reply([]), opts);
  assert.deepEqual(result, { tasks: [], dropped: 0 });
});

test('a code fence around the JSON is tolerated', () => {
  // It is told not to. Losing a whole extraction to three backticks would be
  // a silly way to lose a feature.
  const result = parseExtractionResponse('```json\n' + reply([entry()]) + '\n```', opts);
  assert.equal(result.tasks.length, 1);
});

// ── Unparseable output is a FAILURE, not an empty result ────────────────────

test('prose instead of JSON fails the extraction', () => {
  assert.equal(parseExtractionResponse('Sure! I found two deadlines for you.', opts), null);
});

for (const [label, raw] of [
  ['an empty reply', ''],
  ['valid JSON of the wrong shape', '{"result":"ok"}'],
  ['a bare array', '[{"title":"Quiz 3"}]'],
  ['JSON null', 'null'],
  ['tasks that is not an array', '{"tasks":"Quiz 3"}'],
]) {
  test(`${label} fails the extraction rather than returning nothing`, () => {
    assert.equal(parseExtractionResponse(raw, opts), null);
  });
}

// ── Dates: the thing it must not invent ─────────────────────────────────────

test('a date with no offset is dropped — it does not name a moment', () => {
  const result = parseExtractionResponse(reply([entry({ dueAt: '2026-09-25T17:59' })]), opts);

  assert.equal(result.tasks[0].dueAt, null);
  assert.equal(result.tasks.length, 1, 'the task survives; only its date is refused');
});

test('a hallucinated far-future date is dropped', () => {
  const result = parseExtractionResponse(reply([entry({ dueAt: '2031-09-25T17:59:00Z' })]), opts);
  assert.equal(result.tasks[0].dueAt, null);
});

test('a date long in the past is dropped', () => {
  const result = parseExtractionResponse(reply([entry({ dueAt: '2019-01-01T00:00:00Z' })]), opts);
  assert.equal(result.tasks[0].dueAt, null);
});

test('a recent past date is kept — pasting last week’s mail is ordinary', () => {
  const result = parseExtractionResponse(reply([entry({ dueAt: '2026-09-18T17:59:00Z' })]), opts);
  assert.equal(result.tasks[0].dueAt, '2026-09-18T17:59:00.000Z');
});

test('a nonsense date string is dropped', () => {
  const result = parseExtractionResponse(reply([entry({ dueAt: 'next Tuesdayish' })]), opts);
  assert.equal(result.tasks[0].dueAt, null);
});

test('high confidence is downgraded when the date it referred to was refused', () => {
  // The model was confident about something that has just been thrown away,
  // so the claim is no longer about the thing it was made about.
  const result = parseExtractionResponse(
    reply([entry({ dueAt: '2031-01-01T00:00:00Z', confidence: 'high' })]),
    opts,
  );
  assert.equal(result.tasks[0].confidence, 'medium');
});

// ── Hostile and malformed entries ───────────────────────────────────────────

test('an entry with no usable title is dropped and counted', () => {
  const result = parseExtractionResponse(reply([entry({ title: '   ' }), entry()]), opts);

  assert.equal(result.tasks.length, 1);
  assert.equal(result.dropped, 1);
});

test('unknown fields the model invents do not survive', () => {
  // Whatever it adds, a proposal is exactly the shape this module defines.
  const result = parseExtractionResponse(
    reply([entry({ priority: 'CRITICAL', enrollmentId: 'enr_' + 'a'.repeat(32), id: 'tsk_evil' })]),
    opts,
  );

  assert.deepEqual(Object.keys(result.tasks[0]).sort(), [
    'confidence',
    'courseCode',
    'dueAt',
    'evidence',
    'syllabus',
    'title',
    'type',
  ]);
});

test('an unknown type falls back to OTHER rather than through', () => {
  const result = parseExtractionResponse(reply([entry({ type: 'URGENT_DOOM' })]), opts);
  assert.equal(result.tasks[0].type, 'OTHER');
});

test('an unknown confidence falls back to low', () => {
  const result = parseExtractionResponse(reply([entry({ confidence: 'absolute' })]), opts);
  assert.equal(result.tasks[0].confidence, 'low');
});

test('a course code that is not shaped like one is refused', () => {
  for (const bad of ['ROOM 301', 'the usual', '123', 'A1']) {
    const result = parseExtractionResponse(reply([entry({ courseCode: bad })]), opts);
    assert.equal(result.tasks[0].courseCode, null, `${bad} should not be a course code`);
  }
});

test('a well-shaped code the catalogue does not know is refused', () => {
  // The gate is the real course list, not a regex. ROOM301 is shaped exactly
  // like a course code; so is ZZZ999. Only the catalogue separates them.
  const result = parseExtractionResponse(reply([entry({ courseCode: 'ZZZ999' })]), opts);
  assert.equal(result.tasks[0].courseCode, null);
});

test('a lowercase course code is normalised', () => {
  const result = parseExtractionResponse(reply([entry({ courseCode: 'cse 220' })]), opts);
  assert.equal(result.tasks[0].courseCode, 'CSE220');
});

test('an over-long title is refused rather than truncated', () => {
  // Truncating would invent a title the text never used.
  const result = parseExtractionResponse(reply([entry({ title: 'x'.repeat(201) })]), opts);
  assert.equal(result.tasks.length, 0);
  assert.equal(result.dropped, 1);
});

test('non-string fields do not crash the parse', () => {
  const result = parseExtractionResponse(
    reply([entry({ syllabus: 42, evidence: { text: 'x' }, courseCode: ['CSE220'] })]),
    opts,
  );
  assert.equal(result.tasks[0].syllabus, null);
  assert.equal(result.tasks[0].evidence, null);
  assert.equal(result.tasks[0].courseCode, null);
});

test('nulls and non-objects inside the array are dropped, not crashed on', () => {
  const result = parseExtractionResponse(reply([null, 'Quiz 3', 7, entry()]), opts);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.dropped, 3);
});

test('a flood of proposals is capped, and the overflow is counted', () => {
  const many = Array.from({ length: MAX_PROPOSALS + 5 }, () => entry());
  const result = parseExtractionResponse(reply(many), opts);

  assert.equal(result.tasks.length, MAX_PROPOSALS);
  assert.equal(result.dropped, 5);
});

// ── The prompt ──────────────────────────────────────────────────────────────

test('the instructions tell the model to refuse rather than guess a date', () => {
  assert.match(EXTRACTION_SYSTEM, /NEVER invent a date/);
  assert.match(EXTRACTION_SYSTEM, /set dueAt to null/);
});

test('the text is fenced off from the instructions and marked as data', () => {
  const prompt = buildExtractionPrompt('Quiz 3 on 25 September.', { now: NOW });

  assert.match(prompt, /<<<TEXT/);
  assert.match(prompt, /TEXT>>>/);
  assert.match(prompt, /data,\s*\n?not instruction/);
  assert.match(prompt, /2026-09-23/);
});

test('an enormous paste is truncated before it reaches the model', () => {
  const prompt = buildExtractionPrompt('x'.repeat(20000), { now: NOW });
  assert.ok(prompt.length < 9000, `prompt was ${prompt.length} chars`);
});

test('the prompt never carries a student identifier', () => {
  const prompt = buildExtractionPrompt('Quiz 3 on 25 September.', {
    now: NOW,
    courseCodes: ['MAT215', 'CSE220'],
  });

  // Course codes are about the work, not the person. Nothing here identifies
  // who is asking — there is no uid for an injected instruction to reach.
  assert.match(prompt, /MAT215/);
  assert.doesNotMatch(prompt, /uid|user_id|@|usr_/i);
});
