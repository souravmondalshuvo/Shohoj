// Twin of src/features/tasks/taskDigest.ts — hand-maintained, not generated.
// src/features/tasks/taskDigest.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// The few tasks worth seeing on the way past (#719), for the legacy
// Calculator tab (#767): overdue first, then today, then what is coming up,
// open work only, capped, with a count of what did not fit.

export const DIGEST_LIMIT = 5;

export function buildDigest(input) {
  const limit = input.limit ?? DIGEST_LIMIT;
  const open = (tasks) =>
    tasks.filter((task) => task.status === 'TODO' || task.status === 'IN_PROGRESS');

  const overdue = open(input.overdue);
  const today = open(input.dueToday);
  const upcoming = open(input.upcoming);

  const all = [
    ...overdue.map((task) => ({ task, group: 'overdue' })),
    ...today.map((task) => ({ task, group: 'today' })),
    ...upcoming.map((task) => ({ task, group: 'upcoming' })),
  ];

  // A task can be both due today and upcoming; it appears once, in its first group.
  const seen = new Set();
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

/** A heading where the group changes; null inside a run of the same group. */
export function groupHeading(group, previous) {
  if (group === previous) return null;
  if (group === 'overdue') return 'Overdue';
  if (group === 'today') return 'Today';
  return 'Coming up';
}

/** Where "View all" goes, as the shell's route. Legacy maps it to a tab view. */
export function digestLink(digest) {
  return digest.overdueCount > 0 ? '/tasks' : '/tasks?view=upcoming';
}
