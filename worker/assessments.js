// worker/assessments.js
//
// What a task is worth (#721).
//
// An Assessment is the graded half of a task: total marks, marks earned so far,
// and the share of the course grade it carries. It is a SEPARATE record, 0..1
// per task, rather than fields on Task — forcing `totalMarks` and
// `weightPercent` onto a reading would mean either nullable clutter on every
// row or a lie about what a reading is.
//
// Pure. The repository keys these by task id, so "one assessment per task" is
// structural rather than a rule anybody has to enforce.

export const ASSESSMENT_SCHEMA_VERSION = 1;

/**
 * Bounds on marks.
 *
 * A thousand is past any real course component and still far from a number that
 * makes the arithmetic strange. The point is not to guess a real ceiling — it
 * is to reject a typo before it becomes a grade projection a student acts on.
 */
const MAX_MARKS = 1000;
const MAX_TEXT = 2000;
const MAX_LOCATION = 200;

function invalid(field, message) {
  return { field, message };
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/** A mark: a finite, non-negative number within bounds. Fractions are real (17.5/20). */
function cleanMarks(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_MARKS) return null;
  return value;
}

/**
 * Validate an assessment.
 *
 * `earnedMarks` is nullable and that nullability is the whole point: **not
 * graded yet is not zero**. A course where the final has not been marked must
 * not read as a final scored 0 — that is the difference between "we do not know
 * yet" and "you failed it", and every projection downstream depends on the
 * distinction.
 */
export function validateAssessmentInput(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }

  const totalMarks = cleanMarks(payload.totalMarks);
  if (totalMarks === null || totalMarks <= 0) {
    return {
      error: invalid('totalMarks', `Total marks must be a number between 0 and ${MAX_MARKS}.`),
    };
  }

  let earnedMarks = null;
  if (payload.earnedMarks !== null && payload.earnedMarks !== undefined) {
    earnedMarks = cleanMarks(payload.earnedMarks);
    if (earnedMarks === null) {
      return {
        error: invalid('earnedMarks', 'Marks earned must be a number, or null if ungraded.'),
      };
    }
    if (earnedMarks > totalMarks) {
      // Bonus marks exist, but so do typos, and a component scoring over its
      // own total breaks every percentage derived from it. Refuse and let the
      // student raise the total if the bonus is real.
      return {
        error: invalid('earnedMarks', 'Marks earned cannot exceed the total for this assessment.'),
      };
    }
  }

  const weightPercent = payload.weightPercent;
  if (
    typeof weightPercent !== 'number' ||
    !Number.isFinite(weightPercent) ||
    weightPercent < 0 ||
    weightPercent > 100
  ) {
    return { error: invalid('weightPercent', 'Weight must be a percentage between 0 and 100.') };
  }

  const optional = {};
  for (const [field, max] of [
    ['syllabus', MAX_TEXT],
    ['notes', MAX_TEXT],
    ['location', MAX_LOCATION],
  ]) {
    if (payload[field] === null || payload[field] === undefined) {
      optional[field] = null;
      continue;
    }
    const text = cleanText(payload[field], max);
    if (text === null) {
      return { error: invalid(field, `Must be text under ${max} characters.`) };
    }
    optional[field] = text;
  }

  return { value: { totalMarks, earnedMarks, weightPercent, ...optional } };
}

export function buildAssessmentRecord({ taskId, userId, input, nowIso, existing = null }) {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    // The document id IS the task id, so there is exactly one per task and no
    // uniqueness rule to enforce.
    id: taskId,
    taskId,
    userId,
    totalMarks: input.totalMarks,
    earnedMarks: input.earnedMarks,
    weightPercent: input.weightPercent,
    syllabus: input.syllabus,
    location: input.location,
    notes: input.notes,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

export function assessmentDto(record) {
  return {
    taskId: record.taskId,
    totalMarks: record.totalMarks,
    earnedMarks: record.earnedMarks ?? null,
    weightPercent: record.weightPercent,
    syllabus: record.syllabus ?? null,
    location: record.location ?? null,
    notes: record.notes ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * The percentage scored, or null when it is not graded yet.
 *
 * Separate from the record because it is derived, and storing a derived value
 * is how two fields end up disagreeing.
 */
export function scoredPercent(assessment) {
  if (assessment === null || assessment === undefined) return null;
  const { earnedMarks, totalMarks } = assessment;
  if (earnedMarks === null || earnedMarks === undefined) return null;
  if (typeof totalMarks !== 'number' || totalMarks <= 0) return null;
  return (earnedMarks / totalMarks) * 100;
}

/**
 * Course-grade points this assessment has already secured, out of 100.
 *
 * `weightPercent × scored%`. The foundation the grade-impact work builds on:
 * summed across a course's assessments it gives marks in hand, and the
 * remaining weight is what a target has to be reached from.
 *
 * Null while ungraded — NOT zero, for the same reason `earnedMarks` is
 * nullable. Zero would mean the student scored nothing; null means nobody has
 * marked it.
 */
export function securedCoursePoints(assessment) {
  const percent = scoredPercent(assessment);
  if (percent === null) return null;
  return (assessment.weightPercent / 100) * percent;
}
