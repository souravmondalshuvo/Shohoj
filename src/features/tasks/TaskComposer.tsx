// src/features/tasks/TaskComposer.tsx
//
// Adding a task (#717).
//
// A deliberately small form. The required part is a title; everything else has
// a working default, because the most common thing a student does is jot down
// "Assignment 2, due Thursday" between classes and fill in the rest later — a
// form that demands a type, a priority and an estimate up front is a form that
// gets skipped.

import { useId, useState, type FormEvent } from 'react';

import {
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  type CreateTaskInput,
  type TaskPriority,
  type TaskType,
} from '../../platform/api/tasks.ts';
import { localInputToInstant } from './localInstant.ts';
import type { CourseOption } from './taskView.ts';
import { PRIORITY_ORDER } from './taskView.ts';

export interface TaskComposerProps {
  readonly courses: readonly CourseOption[];
  /** Pre-selected course, from the list's current filter. */
  readonly defaultEnrollmentId?: string;
  readonly onCreate: (input: CreateTaskInput) => Promise<string | null>;
  readonly busy: boolean;
}

export function TaskComposer({
  courses,
  defaultEnrollmentId = '',
  onCreate,
  busy,
}: TaskComposerProps) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('ASSIGNMENT');
  const [enrollmentId, setEnrollmentId] = useState(defaultEnrollmentId);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [estimate, setEstimate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setType('ASSIGNMENT');
    setDue('');
    setPriority('MEDIUM');
    setEstimate('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const trimmed = title.trim();
    if (trimmed === '') {
      setError('Give the task a title.');
      return;
    }

    const minutes = estimate.trim() === '' ? null : Number(estimate);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) {
      setError('Estimate should be a whole number of minutes.');
      return;
    }

    const input: CreateTaskInput = {
      title: trimmed,
      type,
      priority,
      enrollmentId: enrollmentId === '' ? null : enrollmentId,
      dueAt: localInputToInstant(due),
      estimatedMinutes: minutes,
    };

    const failure = await onCreate(input);
    if (failure !== null) {
      setError(failure);
      return;
    }
    reset();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="tasks-add magnetic"
        data-testid="tasks-add"
        onClick={() => setOpen(true)}
      >
        + Add a task
      </button>
    );
  }

  return (
    <form className="tasks-composer" data-testid="tasks-composer" onSubmit={submit}>
      <div className="tasks-composer-row">
        <label className="tasks-field tasks-field-grow" htmlFor={`${baseId}-title`}>
          <span className="tasks-label">Task</span>
          <input
            id={`${baseId}-title`}
            className="tasks-input"
            value={title}
            maxLength={200}
            placeholder="Assignment 2"
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="tasks-field" htmlFor={`${baseId}-type`}>
          <span className="tasks-label">Type</span>
          <select
            id={`${baseId}-type`}
            className="tasks-input"
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
          >
            {TASK_TYPES.map((value) => (
              <option key={value} value={value}>
                {TASK_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tasks-composer-row">
        <label className="tasks-field" htmlFor={`${baseId}-course`}>
          <span className="tasks-label">Course</span>
          <select
            id={`${baseId}-course`}
            className="tasks-input"
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
          >
            <option value="">No course</option>
            {courses
              .filter((course) => course.value !== '')
              .map((course) => (
                <option key={course.value} value={course.value}>
                  {course.label}
                </option>
              ))}
          </select>
        </label>

        <label className="tasks-field" htmlFor={`${baseId}-due`}>
          <span className="tasks-label">Due</span>
          <input
            id={`${baseId}-due`}
            className="tasks-input"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>

        <label className="tasks-field" htmlFor={`${baseId}-priority`}>
          <span className="tasks-label">Priority</span>
          <select
            id={`${baseId}-priority`}
            className="tasks-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {PRIORITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="tasks-field tasks-field-narrow" htmlFor={`${baseId}-estimate`}>
          <span className="tasks-label">Minutes</span>
          <input
            id={`${baseId}-estimate`}
            className="tasks-input"
            type="number"
            min={1}
            step={5}
            value={estimate}
            placeholder="90"
            onChange={(e) => setEstimate(e.target.value)}
          />
        </label>
      </div>

      {error !== null && (
        <p className="tasks-error" role="alert">
          {error}
        </p>
      )}

      <div className="tasks-composer-actions">
        <button
          type="submit"
          className="tasks-save magnetic"
          data-testid="tasks-save"
          disabled={busy}
        >
          {busy ? 'Adding…' : 'Add task'}
        </button>
        <button
          type="button"
          className="tasks-cancel"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
