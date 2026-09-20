/**
 * worker/test/assessments.test.js
 *
 * What a task is worth (#721) — worker/assessments.js, plus the wired
 * /tasks/{id}/assessment endpoints.
 *
 * The distinction these exist to protect is `earnedMarks === null` meaning "not
 * marked yet" and NOT "scored zero". Every projection built on top of an
 * assessment depends on it, and the two are a keystroke apart.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessmentDto,
  buildAssessmentRecord,
  scoredPercent,
  securedCoursePoints,
  validateAssessmentInput,
} from '../assessments.js';
import { createAcademicRepo } from '../academicRepo.js';
import * as academic from '../academicHandlers.js';
import * as tasks from '../taskHandlers.js';

const NOW = new Date('2026-10-05T10:00:00.000Z');

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
let seq = 0;
const randomHex = (bytes) => String(seq++).padStart(bytes * 2, 'a');

function memoryStore() {
  const docs = new Map();
  return {
    docs,
    getDoc: async (p) => (docs.has(p) ? { ...docs.get(p) } : null),
    patchDoc: async (p, f) => {
      docs.set(p, { ...(docs.get(p) || {}), ...f });
    },
    deleteDoc: async (p) => {
      docs.delete(p);
    },
    listDocs: async (c) =>
      [...docs.entries()]
        .filter(([p]) => p.startsWith(`${c}/`) && !p.slice(c.length + 1).includes('/'))
        .map(([, f]) => ({ ...f })),
  };
}

const ctxFor = (store, uid = 'uid-1') => ({
  repo: createAcademicRepo(store, uid),
  userId: 'usr_a',
  university: 'bracu',
  sha256Hex,
  randomHex,
  now: () => NOW,
});

async function withTask(over = {}) {
  const store = memoryStore();
  const ctx = ctxFor(store);
  await academic.createSemester(ctx, { year: 2026, season: 'Fall', status: 'ACTIVE' });
  const enrolled = await academic.createEnrollment(ctx, {
    semesterId: 'sem_bracu_20263',
    courseCode: 'MAT215',
  });
  const created = await tasks.createTask(ctx, {
    title: 'MAT215 Final Exam',
    type: 'EXAM',
    enrollmentId: enrolled.body.enrollment.id,
    ...over,
  });
  return { store, ctx, taskId: created.body.task.id };
}

// ── Validation ──────────────────────────────────────────────────────────────

test('an assessment needs a total and a weight', () => {
  assert.equal(validateAssessmentInput({ weightPercent: 40 }).error.field, 'totalMarks');
  assert.equal(validateAssessmentInput({ totalMarks: 40 }).error.field, 'weightPercent');
  assert.equal(validateAssessmentInput({ totalMarks: 0, weightPercent: 40 }).error.field, 'totalMarks');
});

test('ungraded is null, and null is accepted', () => {
  // THE distinction. Not marked yet is not zero.
  const out = validateAssessmentInput({ totalMarks: 40, weightPercent: 40 });
  assert.equal(out.error, undefined);
  assert.equal(out.value.earnedMarks, null);

  const explicit = validateAssessmentInput({ totalMarks: 40, weightPercent: 40, earnedMarks: null });
  assert.equal(explicit.value.earnedMarks, null);

  const zero = validateAssessmentInput({ totalMarks: 40, weightPercent: 40, earnedMarks: 0 });
  assert.equal(zero.value.earnedMarks, 0, 'and zero is a real score, kept as zero');
});

test('fractional marks are real', () => {
  const out = validateAssessmentInput({ totalMarks: 20, weightPercent: 10, earnedMarks: 17.5 });
  assert.equal(out.value.earnedMarks, 17.5);
});

test('marks above the total are refused', () => {
  // Bonus marks exist, but so do typos, and a component scoring over its own
  // total breaks every percentage derived from it.
  const out = validateAssessmentInput({ totalMarks: 40, weightPercent: 40, earnedMarks: 45 });
  assert.equal(out.error.field, 'earnedMarks');
});

test('a weight outside 0-100 is refused', () => {
  for (const weightPercent of [-1, 101, Number.NaN, '40']) {
    assert.equal(
      validateAssessmentInput({ totalMarks: 40, weightPercent }).error.field,
      'weightPercent',
    );
  }
});

test('the optional text fields are optional and bounded', () => {
  const out = validateAssessmentInput({
    totalMarks: 40,
    weightPercent: 40,
    syllabus: '  Chapters 4-6  ',
    location: 'UB40301',
  });
  assert.equal(out.value.syllabus, 'Chapters 4-6', 'trimmed');
  assert.equal(out.value.notes, null);
  assert.equal(
    validateAssessmentInput({ totalMarks: 40, weightPercent: 40, syllabus: 'x'.repeat(2001) }).error
      .field,
    'syllabus',
  );
});

// ── Derived values ──────────────────────────────────────────────────────────

test('an ungraded assessment has no percentage, rather than zero percent', () => {
  assert.equal(scoredPercent({ earnedMarks: null, totalMarks: 40 }), null);
  assert.equal(securedCoursePoints({ earnedMarks: null, totalMarks: 40, weightPercent: 40 }), null);
});

test('a graded assessment converts to a percentage and to course points', () => {
  // 30/40 on a component worth 40% of the course = 75%, securing 30 of 100.
  const assessment = { earnedMarks: 30, totalMarks: 40, weightPercent: 40 };
  assert.equal(scoredPercent(assessment), 75);
  assert.equal(securedCoursePoints(assessment), 30);
});

test('a genuine zero secures zero points, which is not the same as null', () => {
  const assessment = { earnedMarks: 0, totalMarks: 40, weightPercent: 40 };
  assert.equal(scoredPercent(assessment), 0);
  assert.equal(securedCoursePoints(assessment), 0);
});

test('the record keeps createdAt across a replacement', () => {
  const input = validateAssessmentInput({ totalMarks: 40, weightPercent: 40 }).value;
  const first = buildAssessmentRecord({
    taskId: 'tsk_a',
    userId: 'usr_a',
    input,
    nowIso: '2026-10-01T00:00:00.000Z',
  });
  const second = buildAssessmentRecord({
    taskId: 'tsk_a',
    userId: 'usr_a',
    input,
    nowIso: '2026-10-05T00:00:00.000Z',
    existing: first,
  });
  assert.equal(second.createdAt, '2026-10-01T00:00:00.000Z');
  assert.equal(second.updatedAt, '2026-10-05T00:00:00.000Z');
});

test('the DTO withholds the owner and the storage version', () => {
  const dto = assessmentDto(
    buildAssessmentRecord({
      taskId: 'tsk_a',
      userId: 'usr_a',
      input: validateAssessmentInput({ totalMarks: 40, weightPercent: 40 }).value,
      nowIso: '2026-10-01T00:00:00.000Z',
    }),
  );
  assert.equal('userId' in dto, false);
  assert.equal('schemaVersion' in dto, false);
});

// ── Endpoints ───────────────────────────────────────────────────────────────

test('an assessment can be attached, read, replaced and removed', async () => {
  const { ctx, taskId } = await withTask();

  assert.equal((await tasks.getAssessment(ctx, taskId)).status, 404, 'none to begin with');

  const created = await tasks.putAssessment(ctx, taskId, {
    totalMarks: 40,
    weightPercent: 40,
    syllabus: 'Chapters 4-6',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.assessment.weightPercent, 40);
  assert.equal(created.body.assessment.earnedMarks, null);

  const replaced = await tasks.putAssessment(ctx, taskId, {
    totalMarks: 40,
    weightPercent: 40,
    earnedMarks: 31,
  });
  assert.equal(replaced.status, 200, 'the second write is a replacement, not a second assessment');
  assert.equal(replaced.body.assessment.earnedMarks, 31);
  assert.equal(replaced.body.assessment.syllabus, null, 'PUT replaces rather than merges');

  assert.equal((await tasks.getAssessment(ctx, taskId)).body.assessment.earnedMarks, 31);
  assert.equal((await tasks.deleteAssessment(ctx, taskId)).status, 200);
  assert.equal((await tasks.getAssessment(ctx, taskId)).status, 404);
});

test('an assessment cannot be attached to a task that is not yours', async () => {
  const { store, taskId } = await withTask();
  const theirs = ctxFor(store, 'uid-theirs');

  assert.equal((await tasks.putAssessment(theirs, taskId, { totalMarks: 40, weightPercent: 40 })).status, 404);
  assert.equal((await tasks.getAssessment(theirs, taskId)).status, 404);
  assert.equal((await tasks.deleteAssessment(theirs, taskId)).status, 404);
});

test('deleting a task takes its assessment with it', async () => {
  // An assessment whose task is gone is unreachable through every path the API
  // offers — the same orphan problem as tasks and enrolments.
  const { store, ctx, taskId } = await withTask();
  await tasks.putAssessment(ctx, taskId, { totalMarks: 40, weightPercent: 40 });

  await tasks.deleteTask(ctx, taskId);

  const orphans = [...store.docs.keys()].filter((p) => p.includes('/assessments/'));
  assert.deepEqual(orphans, []);
});

test('dropping a course takes its tasks AND their assessments', async () => {
  const { store, ctx, taskId } = await withTask();
  await tasks.putAssessment(ctx, taskId, { totalMarks: 40, weightPercent: 40 });
  const task = await ctx.repo.getTask(taskId);

  await academic.deleteEnrollment(ctx, task.enrollmentId);

  const left = [...store.docs.keys()].filter(
    (p) => p.includes('/tasks/') || p.includes('/assessments/'),
  );
  assert.deepEqual(left, []);
});

// ── The join ────────────────────────────────────────────────────────────────

test('a task list carries its priority score and breakdown', async () => {
  const { ctx, taskId } = await withTask({ dueAt: '2026-10-07T10:00:00Z', estimatedMinutes: 420 });
  await tasks.putAssessment(ctx, taskId, { totalMarks: 40, weightPercent: 40 });

  const listed = await tasks.listTasks(ctx);
  const [item] = listed.body.items;

  assert.equal(typeof item.priorityScore, 'number');
  assert.ok(item.priorityScore > 0);
  assert.deepEqual(
    item.priorityFactors.map((f) => f.name),
    ['urgency', 'weight', 'workload', 'importance'],
  );
  const weightFactor = item.priorityFactors.find((f) => f.name === 'weight');
  assert.ok(weightFactor.points > 0, 'the assessment reached the score');
});

test('a task with no assessment still scores, on the other three factors', async () => {
  const { ctx } = await withTask({ dueAt: '2026-10-06T10:00:00Z', priority: 'HIGH' });
  const [item] = (await tasks.listTasks(ctx)).body.items;

  assert.ok(item.priorityScore > 0);
  assert.equal(item.priorityFactors.find((f) => f.name === 'weight').points, 0);
});

test('a weighted task outranks an unweighted one due at the same time', async () => {
  const { ctx, taskId } = await withTask({ dueAt: '2026-10-07T10:00:00Z' });
  await tasks.putAssessment(ctx, taskId, { totalMarks: 40, weightPercent: 40 });
  const other = await tasks.createTask(ctx, {
    title: 'Unweighted reading',
    dueAt: '2026-10-07T10:00:00Z',
  });

  const items = (await tasks.listTasks(ctx)).body.items;
  const weighted = items.find((i) => i.id === taskId);
  const plain = items.find((i) => i.id === other.body.task.id);
  assert.ok(weighted.priorityScore > plain.priorityScore);
});
