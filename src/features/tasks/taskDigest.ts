// src/features/tasks/taskDigest.ts
//
// What the dashboard shows of Shohoj Tasks (#719).
//
// Phase 4's rule is that the dashboard must not reimplement Tasks. This module
// is the whole of what it adds: a pure selection over the SAME data
// `/tasks/today` and `/tasks/upcoming` already return, ordered and capped for a
// card rather than a page. No new statuses, no new date arithmetic, no second
// opinion about what "overdue" means — those live in taskView.ts and, on the
// server, in worker/tasks.js, and are reused verbatim.
//
// If this file ever grows a rule of its own, that is the signal the dashboard
// has started duplicating the feature rather than surfacing it.

import type { Task } from '../../platform/api/tasks.ts';

/** Which band a digest row belongs to. Drives the label and the styling only. */
export type DigestGroup = 'overdue' | 'today' | 'upcoming';

export interface DigestEntry {
  readonly task: Task;
  readonly group: DigestGroup;
}

export interface Digest {
  readonly entries: readonly DigestEntry[];
  /** Overdue count across ALL overdue work, not just what fits on the card. */
  readonly overdueCount: number;
  /** How many matching tasks did not fit. Zero when everything is shown. */
  readonly hiddenCount: number;
  readonly isEmpty: boolean;
}

/**
 * How many rows a dashboard card carries.
 *
 * Five, because the card sits below the degree tracker and the GPA trend on a
 * page a student opens to look at their grades — it is a glance, not the Tasks
 * screen. Anything longer and the card stops being a summary and starts being a
 * worse version of `/tasks`.
 */
export const DIGEST_LIMIT = 5;

export interface DigestInput {
  readonly overdue: readonly Task[];
  readonly dueToday: readonly Task[];
  readonly upcoming: readonly Task[];
  readonly limit?: number;
}

/**
 * Build the digest.
 *
 * Order is overdue, then today, then upcoming, and it is not negotiable by
 * priority or anything else: a card that buries a missed deadline under a
 * CRITICAL task due next week has failed at the one job it has. Within each
 * band the server's own ordering is kept — it already sorted by due date then
 * priority, and re-sorting here would be a second opinion about the same
 * question.
 *
 * Completed work is dropped. The Tasks screen keeps it (finishing something
 * should leave evidence), but a dashboard card is about what is left.
 */
export function buildDigest(input: DigestInput): Digest {
  const limit = input.limit ?? DIGEST_LIMIT;
  const open = (tasks: readonly Task[]) =>
    tasks.filter((task) => task.status === 'TODO' || task.status === 'IN_PROGRESS');

  const overdue = open(input.overdue);
  const today = open(input.dueToday);
  const upcoming = open(input.upcoming);

  const all: DigestEntry[] = [
    ...overdue.map((task): DigestEntry => ({ task, group: 'overdue' })),
    ...today.map((task): DigestEntry => ({ task, group: 'today' })),
    ...upcoming.map((task): DigestEntry => ({ task, group: 'upcoming' })),
  ];

  // De-duplicate by id. The two endpoints are disjoint by construction —
  // Upcoming starts tomorrow — but the card is assembled from two independent
  // responses that can be a moment apart, and a task that crosses midnight
  // between them would otherwise appear twice.
  const seen = new Set<string>();
  const unique = all.filter((entry) => {
    if (seen.has(entry.task.id)) return false;
    seen.add(entry.task.id);
    return true;
  });

  const entries = unique.slice(0, limit);
  return {
    entries,
    overdueCount: overdue.length,
    hiddenCount: Math.max(0, unique.length - entries.length),
    isEmpty: unique.length === 0,
  };
}

/** The label above a band. Null when the previous row was in the same band. */
export function groupHeading(group: DigestGroup, previous: DigestGroup | null): string | null {
  if (group === previous) return null;
  if (group === 'overdue') return 'Overdue';
  if (group === 'today') return 'Today';
  return 'Coming up';
}

/**
 * Where the card's "see everything" link should point.
 *
 * Overdue work is on Today, so a student with something late lands where it is
 * rather than on a view that does not contain it.
 */
export function digestLink(digest: Digest): string {
  return digest.overdueCount > 0 ? '/tasks' : '/tasks?view=upcoming';
}
