// src/features/tasks/priorityExplainer.ts
//
// Why a task ranks where it does, in words (#723).
//
// The API returns a factor breakdown precisely so a student can interrogate the
// ranking. Four numbers are not an interrogation — "urgency 0.857, weight 0.4"
// tells nobody anything. This turns the breakdown into sentences, and it is
// pure so the wording is testable rather than buried in JSX.
//
// The tone rule throughout: describe the TASK, never the student. "Due in two
// days" is a fact about the work. "You left this late" is a judgement, and a
// tool that judges is a tool people stop opening.

import { type PriorityFactor, type Task, explainPriority } from '../../platform/api/tasks.ts';

/** One line of the explanation: what it is, and how much it mattered. */
export interface PriorityReason {
  readonly name: PriorityFactor['name'];
  /** A short phrase, e.g. "Due in 2 days". */
  readonly text: string;
  /** Points contributed out of 100, for a bar or a figure. */
  readonly points: number;
  /** Share of this task's own score, 0-1 — how much of the ranking this explains. */
  readonly share: number;
}

/** Hours until due, or null. Local, because "in 2 days" is a local reading. */
function hoursUntil(task: Task, now: Date): number | null {
  if (task.dueAt === null) return null;
  const due = Date.parse(task.dueAt);
  if (Number.isNaN(due)) return null;
  return (due - now.getTime()) / 3_600_000;
}

/**
 * The urgency line.
 *
 * Rounded to whole days past 48 hours, because "in 2.4 days" is precision
 * nobody asked for; kept in hours below that, where the difference between
 * tonight and tomorrow morning is the whole point.
 */
function urgencyText(task: Task, now: Date): string {
  const hours = hoursUntil(task, now);
  if (hours === null) return 'No deadline';
  if (hours <= 0) return 'Already overdue';
  if (hours < 1) return 'Due within the hour';
  if (hours < 48) {
    const whole = Math.round(hours);
    return `Due in ${whole} hour${whole === 1 ? '' : 's'}`;
  }
  const days = Math.round(hours / 24);
  return `Due in ${days} days`;
}

function factorText(
  factor: PriorityFactor,
  task: Task,
  assessmentWeight: number | null,
  now: Date,
): string {
  if (factor.name === 'urgency') return urgencyText(task, now);
  if (factor.name === 'weight') {
    return assessmentWeight === null
      ? 'Counts toward your grade'
      : `Worth ${formatPercent(assessmentWeight)} of the course`;
  }
  if (factor.name === 'workload') {
    const minutes = task.estimatedMinutes ?? 0;
    const hours = minutes / 60;
    // Under two hours reads better in minutes; past that, hours.
    return hours < 2
      ? `You estimated ${minutes} minutes`
      : `You estimated about ${Math.round(hours)} hours`;
  }
  return `You marked it ${task.priority.toLowerCase()}`;
}

/** Trim a trailing `.0` so 40 reads as "40%" and 12.5 as "12.5%". */
function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))}%`;
}

/**
 * The reasons a task ranks where it does, biggest first.
 *
 * Only factors that actually contributed — a zero-point factor is not a reason,
 * and listing it would pad the explanation with the things that did NOT matter.
 *
 * Returns an empty list when the backend sent no breakdown, so a caller can
 * render nothing rather than an empty box.
 */
export function priorityReasons(
  task: Task,
  options: { readonly assessmentWeight?: number | null; readonly now?: Date } = {},
): readonly PriorityReason[] {
  const now = options.now ?? new Date();
  const weight = options.assessmentWeight ?? null;
  const factors = explainPriority(task);
  const total = factors.reduce((sum, factor) => sum + factor.points, 0);
  if (total <= 0) return [];

  return factors.map((factor) => ({
    name: factor.name,
    text: factorText(factor, task, weight, now),
    points: factor.points,
    share: factor.points / total,
  }));
}

/**
 * A one-line summary of why a task is where it is.
 *
 * The dominant reason, plus the next if it carries real weight. Two is the
 * limit: a summary that lists everything is the breakdown again, and the
 * breakdown is already one tap away.
 *
 * The 20% floor stops a trivial contributor being promoted into the summary
 * just for being second.
 */
export function prioritySummary(reasons: readonly PriorityReason[]): string | null {
  // Indexed access is checked (noUncheckedIndexedAccess), so the guard is not
  // ceremony — an empty list really does read as undefined here.
  const first = reasons[0];
  if (first === undefined) return null;
  const second = reasons[1];
  if (second !== undefined && second.share >= 0.2) {
    return `${first.text} · ${second.text}`;
  }
  return first.text;
}

/**
 * Where a task sits, in words.
 *
 * Bands rather than the raw number, because 71.7 means nothing on its own and
 * inviting a student to compare two scores digit by digit implies a precision
 * the model does not have. The thresholds are round numbers on a 0-100 scale
 * and are not tuned to anything — they exist to turn a number into a word.
 */
export type PriorityBand = 'urgent' | 'high' | 'normal' | 'low';

export function priorityBand(score: number | null): PriorityBand | null {
  if (score === null) return null;
  if (score >= 60) return 'urgent';
  if (score >= 40) return 'high';
  if (score >= 20) return 'normal';
  return 'low';
}

export const PRIORITY_BAND_LABELS: Readonly<Record<PriorityBand, string>> = {
  urgent: 'Needs attention',
  high: 'Coming up',
  normal: 'On the list',
  low: 'No rush',
};
