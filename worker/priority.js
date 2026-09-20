// worker/priority.js
//
// The automatic priority score (#721).
//
// Shohoj ranks a student's work. That is a claim about their life, so this file
// is written to be argued with: every constant is justified where it is
// defined, the output carries its own breakdown, and nothing here reads a clock
// or a database.
//
// THE MODEL
//
//   score = Σ (factor value × factor weight) × 100
//
// Four factors, each normalised to 0..1 so the weights are comparable and the
// breakdown is readable. The weights sum to 1, so the score is 0..100 and a
// factor's contribution is directly a number of points out of a hundred.
//
//   urgency     how soon it is due
//   weight      how much of the course grade rides on it
//   workload    how long the student said it takes
//   importance  what the student said themselves
//
// FOUR RULES THIS FILE KEEPS
//
//   1. Deterministic. `now` is a parameter. Two calls with the same inputs give
//      the same score, which is what makes the tests below meaningful.
//   2. No magic numbers. Every threshold has a sentence saying why it is that
//      value and not another.
//   3. Configurable. Weights are an argument with a documented default, and a
//      test proves overriding them actually changes the ranking.
//   4. Manual priority survives. `priority` is an INPUT here and is never
//      written back — a student who marks something CRITICAL keeps that, and
//      the score reflects it rather than replacing it.
//
// WHAT THIS IS NOT
//
// It is not a claim to know better than the student. It is a default order for
// a list, and the breakdown exists so a student who disagrees can see exactly
// which factor they disagree with.

const HOUR_MS = 60 * 60 * 1000;

/**
 * Default factor weights.
 *
 * Urgency dominates because a deadline is the one factor that is not a matter
 * of opinion — a 40% exam next month is genuinely less pressing than a 10% quiz
 * tomorrow, and a ranking that says otherwise is wrong in a way students
 * notice immediately.
 *
 * Assessment weight is second: among things due at similar times, what the
 * grade rides on is the best available tiebreak.
 *
 * Workload and the student's own importance are equal and smaller. Workload
 * matters for planning more than for ordering — a long task is not more urgent,
 * it just needs starting sooner, which is the study planner's job rather than
 * this one. And importance is deliberately not dominant: if a student's manual
 * pick outranked everything, the automatic score would be doing nothing.
 *
 * These sum to 1. `scoreTask` asserts that rather than trusting it, because a
 * set that does not sum to 1 silently changes the scale of every score.
 */
export const DEFAULT_WEIGHTS = Object.freeze({
  urgency: 0.45,
  weight: 0.25,
  workload: 0.15,
  importance: 0.15,
});

/**
 * The horizon urgency decays over, in hours.
 *
 * Fourteen days: past a fortnight, "when is it due" stops discriminating
 * usefully — everything further out reads as "later" to a student, and letting
 * urgency keep falling would mean a 5% quiz three weeks out and a 40% final six
 * weeks out sort only by date, which is precisely when weight should take over.
 */
const URGENCY_HORIZON_HOURS = 14 * 24;

/**
 * Workload saturation, in minutes.
 *
 * Eight hours — a full day's work. Anything at or beyond this is "a big job"
 * and further minutes should not keep pushing it up the list; a 20-hour project
 * due next month must not outrank tomorrow's quiz on size alone.
 */
const WORKLOAD_SATURATION_MINUTES = 8 * 60;

/**
 * Manual priority, normalised.
 *
 * Evenly spaced on purpose. Any other spacing would encode a claim about how
 * much more a HIGH matters than a MEDIUM, which is not a claim this file is in
 * a position to make.
 */
const IMPORTANCE = Object.freeze({ LOW: 0, MEDIUM: 1 / 3, HIGH: 2 / 3, CRITICAL: 1 });

/**
 * Urgency from a deadline, 0..1.
 *
 * Overdue is 1 and stays 1 — there is no "more overdue". Something a week late
 * is not more urgent than something a day late; both are simply late, and
 * scaling past 1 would let ancient forgotten work outrank a final tomorrow.
 *
 * Between now and the horizon it decays linearly. Linear rather than
 * exponential because it has to be explainable: "half the fortnight away, half
 * the urgency" is a sentence a student can check. An exponential curve ranks
 * marginally better and cannot be described in one line.
 *
 * An undated task scores 0. Not low — zero. A task with no deadline is not
 * slightly urgent, and the alternative (treating null as "far away") would
 * quietly place undated work ahead of anything past the horizon.
 */
export function urgencyFactor(dueAtMs, nowMs) {
  if (dueAtMs === null || dueAtMs === undefined || Number.isNaN(dueAtMs)) return 0;
  const hoursAway = (dueAtMs - nowMs) / HOUR_MS;
  if (hoursAway <= 0) return 1;
  if (hoursAway >= URGENCY_HORIZON_HOURS) return 0;
  return 1 - hoursAway / URGENCY_HORIZON_HOURS;
}

/**
 * Assessment weight, 0..1.
 *
 * A course's components sum to 100%, so a percent maps straight onto the scale.
 * Clamped: a student who mistypes 400 gets the same treatment as one who typed
 * 100, rather than a score that dwarfs every other task they own.
 *
 * No assessment means 0, and that is correct rather than a gap — a task nobody
 * said was graded contributes nothing on this axis, and the other three still
 * rank it.
 */
export function weightFactor(weightPercent) {
  if (typeof weightPercent !== 'number' || !Number.isFinite(weightPercent)) return 0;
  if (weightPercent <= 0) return 0;
  return Math.min(1, weightPercent / 100);
}

/** Estimated effort, 0..1, saturating at a full day's work. */
export function workloadFactor(estimatedMinutes) {
  if (typeof estimatedMinutes !== 'number' || !Number.isFinite(estimatedMinutes)) return 0;
  if (estimatedMinutes <= 0) return 0;
  return Math.min(1, estimatedMinutes / WORKLOAD_SATURATION_MINUTES);
}

/** The student's own call, 0..1. An unknown value reads as MEDIUM. */
export function importanceFactor(priority) {
  return IMPORTANCE[priority] ?? IMPORTANCE.MEDIUM;
}

function assertWeightsSumToOne(weights) {
  const total = weights.urgency + weights.weight + weights.workload + weights.importance;
  // Floating point: 0.45 + 0.25 + 0.15 + 0.15 is not exactly 1 in binary.
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`priority weights must sum to 1, got ${total}`);
  }
}

/**
 * Score one task.
 *
 * Returns `{ score, factors }`. `factors` is the breakdown — one entry per
 * axis, carrying the normalised value, the weight applied and the points
 * contributed — and it exists because a ranking a student cannot interrogate is
 * a ranking they will not trust. The UI shows it; the tests assert on it.
 *
 * `score` is rounded to one decimal. Full float precision would make two
 * practically identical tasks sort on noise, and an integer would make ties too
 * common to break.
 */
export function scoreTask(task, { assessment = null, nowMs, weights = DEFAULT_WEIGHTS } = {}) {
  assertWeightsSumToOne(weights);

  const dueAtMs = task?.dueAt === null || task?.dueAt === undefined ? null : Date.parse(task.dueAt);

  const values = {
    urgency: urgencyFactor(dueAtMs, nowMs),
    weight: weightFactor(assessment?.weightPercent),
    workload: workloadFactor(task?.estimatedMinutes),
    importance: importanceFactor(task?.priority),
  };

  const factors = Object.keys(values).map((name) => ({
    name,
    value: round(values[name], 4),
    weight: weights[name],
    points: round(values[name] * weights[name] * 100, 2),
  }));

  const score = factors.reduce((total, factor) => total + factor.points, 0);
  return { score: round(score, 1), factors };
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Score a list, returning tasks with `priorityScore` and `priorityFactors` set.
 *
 * The score is computed on READ rather than stored, because urgency changes
 * every hour and a stored score is wrong the moment it is written. The cost is
 * arithmetic over a list already in memory; the alternative is a background job
 * rewriting every task in the database every hour, for a number that is cheap
 * to derive.
 */
export function scoreTasks(tasks, { assessmentsByTaskId = {}, nowMs, weights } = {}) {
  return tasks.map((task) => {
    const scored = scoreTask(task, {
      assessment: assessmentsByTaskId[task.id] ?? null,
      nowMs,
      ...(weights === undefined ? {} : { weights }),
    });
    return { ...task, priorityScore: scored.score, priorityFactors: scored.factors };
  });
}

/**
 * Order by score, highest first.
 *
 * Ties fall back to the due date and then the id, so the order is total and
 * stable — two tasks that genuinely score the same must not swap places between
 * requests, which would make a list appear to shuffle itself.
 */
export function byPriorityScore(a, b) {
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  const aDue = a.dueAt ?? '￿';
  const bDue = b.dueAt ?? '￿';
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}
