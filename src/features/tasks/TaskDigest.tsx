// src/features/tasks/TaskDigest.tsx
//
// Shohoj Tasks on the dashboard (#719).
//
// A glance, not a second Tasks screen: five rows at most, overdue first, a tick
// box, and a way through to the real thing. Every label and every deadline tone
// comes from taskView.ts — the same functions /tasks uses — so the two surfaces
// cannot disagree about what a deadline says.
//
// Renders nothing when there is nothing to say. See useTaskDigest for why
// silence rather than an empty card.

import { Link } from 'react-router';

import type { Enrollment } from '../../platform/api/academic.ts';
import { courseLabel, dueLabel, toneClass, typeLabel } from './taskView.ts';
import { digestLink, groupHeading, type DigestGroup } from './taskDigest.ts';
import type { TaskDigestState } from './useTaskDigest.ts';

export interface TaskDigestProps {
  readonly state: TaskDigestState;
  readonly enrollments: readonly Enrollment[];
}

export function TaskDigest({ state, enrollments }: TaskDigestProps) {
  if (state.silent) return null;

  const { digest } = state;
  let previous: DigestGroup | null = null;

  return (
    <section className="tasks-digest lg-panel" data-testid="tasks-digest" aria-label="Your tasks">
      <div className="lg-shine" />
      <header className="tasks-digest-head">
        <h3 className="tasks-digest-title">Coming up</h3>
        {digest.overdueCount > 0 && (
          <span className="tasks-digest-overdue" data-testid="tasks-digest-overdue">
            {digest.overdueCount} overdue
          </span>
        )}
      </header>

      <ul className="tasks-digest-list">
        {digest.entries.map((entry) => {
          const heading = groupHeading(entry.group, previous);
          previous = entry.group;
          const course = courseLabel(entry.task, enrollments);
          return (
            <li key={entry.task.id} className="tasks-digest-item" data-testid="tasks-digest-item">
              {heading !== null && (
                <p className={`tasks-digest-group tasks-digest-group-${entry.group}`}>{heading}</p>
              )}
              <div className="tasks-digest-row">
                <label className="tasks-check">
                  {/* Always unchecked: completing removes the row, so a checked
                      state is never observable here. The checkbox is still the
                      right affordance — it reads and behaves like the one on
                      /tasks — and the row leaving is the confirmation. */}
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => state.complete(entry.task.id)}
                    aria-label={`Mark ${entry.task.title} as done`}
                  />
                  <span className="tasks-check-box" aria-hidden="true" />
                </label>
                <div className="tasks-digest-body">
                  <p className="tasks-digest-item-title">{entry.task.title}</p>
                  <p className="tasks-digest-meta">
                    {course !== null && <span className="tasks-course">{course}</span>}
                    <span className="tasks-type">{typeLabel(entry.task)}</span>
                    <span className={`tasks-due ${toneClass(entry.task)}`}>
                      {dueLabel(entry.task)}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Link className="tasks-digest-link" to={digestLink(digest)}>
        {digest.hiddenCount > 0 ? `View all tasks (${digest.hiddenCount} more)` : 'View all tasks'}
      </Link>
    </section>
  );
}
