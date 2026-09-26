// Twin of src/features/tasks/priorityExplainer.ts — hand-maintained, not generated.
// src/features/tasks/priorityExplainer.ts is the source of truth: change it
// there first, then mirror the change here. tests/twinParity.test.js fails if
// the two drift.
//
// Why a task ranks where it does, in words (#723), for the legacy Tasks tab
// (#767). The tone rule: describe the TASK, never the student.

import { explainPriority } from './tasksApi.js';

function _prioHoursUntil(task, now) {
  if (task.dueAt === null) return null;
  const due = Date.parse(task.dueAt);
  if (Number.isNaN(due)) return null;
  return (due - now.getTime()) / 3_600_000;
}

function _prioUrgencyText(task, now) {
  const hours = _prioHoursUntil(task, now);
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

function _prioFactorText(factor, task, assessmentWeight, now) {
  if (factor.name === 'urgency') return _prioUrgencyText(task, now);
  if (factor.name === 'weight') {
    return assessmentWeight === null
      ? 'Counts toward your grade'
      : `Worth ${_prioFormatPercent(assessmentWeight)} of the course`;
  }
  if (factor.name === 'workload') {
    const minutes = task.estimatedMinutes ?? 0;
    const hours = minutes / 60;
    return hours < 2
      ? `You estimated ${minutes} minutes`
      : `You estimated about ${Math.round(hours)} hours`;
  }
  return `You marked it ${task.priority.toLowerCase()}`;
}

function _prioFormatPercent(value) {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))}%`;
}

/** The factors that moved the score, as sentences, largest first. */
export function priorityReasons(task, options = {}) {
  const now = options.now ?? new Date();
  const weight = options.assessmentWeight ?? null;
  const factors = explainPriority(task);
  const total = factors.reduce((sum, factor) => sum + factor.points, 0);
  if (total <= 0) return [];

  return factors.map((factor) => ({
    name: factor.name,
    text: _prioFactorText(factor, task, weight, now),
    points: factor.points,
    share: factor.points / total,
  }));
}

/** One line for a row: the top reason, plus the second when it mattered. */
export function prioritySummary(reasons) {
  const first = reasons[0];
  if (first === undefined) return null;
  const second = reasons[1];
  if (second !== undefined && second.share >= 0.2) {
    return `${first.text} · ${second.text}`;
  }
  return first.text;
}

export function priorityBand(score) {
  if (score === null) return null;
  if (score >= 60) return 'urgent';
  if (score >= 40) return 'high';
  if (score >= 20) return 'normal';
  return 'low';
}

export const PRIORITY_BAND_LABELS = {
  urgent: 'Needs attention',
  high: 'Coming up',
  normal: 'On the list',
  low: 'No rush',
};
