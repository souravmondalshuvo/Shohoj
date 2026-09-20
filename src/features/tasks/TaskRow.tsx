// src/features/tasks/TaskRow.tsx
//
// One task, as a row (#717).
//
// The checkbox is the point of this component. Everything else is text arranged
// around it: a student opens Tasks to tick something off far more often than to
// read anything, so the tick target is large, first in the tab order, and
// labelled with the task's own title rather than a generic "done".

import type { ReactNode } from 'react';

import type { Task } from '../../platform/api/tasks.ts';
import type { Enrollment } from '../../platform/api/academic.ts';
import {
  courseLabel,
  dueLabel,
  priorityClass,
  toneClass,
  typeLabel,
  workloadLabel,
} from './taskView.ts';

export interface TaskRowProps {
  readonly task: Task;
  readonly enrollments: readonly Enrollment[];
  readonly onToggle: (task: Task, completed: boolean) => void;
  readonly onDelete: (task: Task) => void;
  /** Rendered under the row when expanded. Absent means the row cannot expand. */
  readonly details?: ReactNode;
  readonly expanded?: boolean;
  readonly onToggleDetails?: (task: Task) => void;
}

export function TaskRow({
  task,
  enrollments,
  onToggle,
  onDelete,
  details,
  expanded = false,
  onToggleDetails,
}: TaskRowProps) {
  const done = task.status === 'COMPLETED';
  const course = courseLabel(task, enrollments);
  const workload = workloadLabel(task.estimatedMinutes);

  return (
    <li
      className={`tasks-row ${done ? 'tasks-row-done' : ''} ${toneClass(task)}`}
      data-testid="tasks-row"
      data-task-id={task.id}
    >
      <label className="tasks-check">
        <input
          type="checkbox"
          checked={done}
          onChange={(event) => onToggle(task, event.target.checked)}
          // The title, not "done": a screen reader running the list otherwise
          // announces a column of identical checkboxes.
          aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        />
        <span className="tasks-check-box" aria-hidden="true" />
      </label>

      <div className="tasks-row-body">
        <p className="tasks-row-title">{task.title}</p>
        <p className="tasks-row-meta">
          {course !== null && <span className="tasks-course">{course}</span>}
          <span className="tasks-type">{typeLabel(task)}</span>
          <span className={`tasks-due ${toneClass(task)}`}>{dueLabel(task)}</span>
          {workload !== null && <span className="tasks-workload">{workload}</span>}
          <span className={`tasks-priority ${priorityClass(task.priority)}`}>
            {task.priority.toLowerCase()}
          </span>
        </p>
      </div>

      {onToggleDetails !== undefined && (
        <button
          type="button"
          className="tasks-disclose"
          onClick={() => onToggleDetails(task)}
          aria-expanded={expanded}
          // Named for the task, like the checkbox: a list of buttons all
          // called "Details" is unusable by name.
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${task.title}`}
        >
          {expanded ? '▴' : '▾'}
        </button>
      )}

      <button
        type="button"
        className="tasks-delete"
        onClick={() => onDelete(task)}
        aria-label={`Delete ${task.title}`}
        title="Delete"
      >
        ×
      </button>

      {expanded && details !== undefined && details}
    </li>
  );
}
