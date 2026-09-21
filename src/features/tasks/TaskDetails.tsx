// src/features/tasks/TaskDetails.tsx
//
// A task, opened up (#723): why it ranks where it does, and what it is worth.
//
// Two things a student never needs at a glance and sometimes needs badly, so
// both live behind a disclosure rather than on every row. A list where every
// item explains itself is a list nobody can scan.

import { useId, useState, type FormEvent } from 'react';

import type { Assessment, Reminder, Task } from '../../platform/api/tasks.ts';
import { TaskReminders } from './TaskReminders.tsx';
import { PRIORITY_BAND_LABELS, priorityBand, priorityReasons } from './priorityExplainer.ts';

export interface TaskDetailsProps {
  readonly task: Task;
  readonly assessment: Assessment | null;
  readonly onSaveAssessment: (input: {
    totalMarks: number;
    weightPercent: number;
    earnedMarks: number | null;
  }) => Promise<string | null>;
  readonly onRemoveAssessment: () => Promise<string | null>;
  readonly reminders: readonly Reminder[];
  readonly onAddReminder: (offsetMinutes: number) => Promise<string | null>;
  readonly onRemoveReminder: (id: string) => Promise<string | null>;
}

export function TaskDetails({
  task,
  assessment,
  onSaveAssessment,
  onRemoveAssessment,
  reminders,
  onAddReminder,
  onRemoveReminder,
}: TaskDetailsProps) {
  const reasons = priorityReasons(task, {
    assessmentWeight: assessment?.weightPercent ?? null,
  });
  const band = priorityBand(task.priorityScore);

  return (
    <div className="tasks-details" data-testid="tasks-details">
      {reasons.length > 0 && (
        <section className="tasks-why">
          <h4 className="tasks-why-title">
            Why this is here
            {band !== null && (
              <span className={`tasks-band tasks-band-${band}`}>{PRIORITY_BAND_LABELS[band]}</span>
            )}
          </h4>
          <ul className="tasks-why-list" data-testid="tasks-why-list">
            {reasons.map((reason) => (
              <li key={reason.name} className="tasks-why-item">
                <span className="tasks-why-text">{reason.text}</span>
                {/* The bar is decoration for a number already in the text, so
                    it is hidden from assistive tech rather than announced as a
                    second, meaningless reading of the same thing. */}
                <span
                  className="tasks-why-bar"
                  aria-hidden="true"
                  style={{ width: `${Math.round(reason.share * 100)}%` }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <TaskReminders
        reminders={reminders}
        hasDeadline={task.dueAt !== null}
        onAdd={onAddReminder}
        onRemove={onRemoveReminder}
      />

      <AssessmentEditor
        assessment={assessment}
        onSave={onSaveAssessment}
        onRemove={onRemoveAssessment}
      />
    </div>
  );
}

interface AssessmentEditorProps {
  readonly assessment: Assessment | null;
  readonly onSave: TaskDetailsProps['onSaveAssessment'];
  readonly onRemove: TaskDetailsProps['onRemoveAssessment'];
}

/**
 * Marks entry.
 *
 * The one field that needs care is `earnedMarks`. It stays EMPTY until a mark
 * exists, and an empty box submits null — not zero. Defaulting it to 0 would
 * turn "not marked yet" into "scored zero" on the way in, which is exactly the
 * distinction the rest of the system goes to lengths to preserve, and it would
 * be undone by a placeholder.
 */
function AssessmentEditor({ assessment, onSave, onRemove }: AssessmentEditorProps) {
  const baseId = useId();
  const [weight, setWeight] = useState(assessment === null ? '' : String(assessment.weightPercent));
  const [total, setTotal] = useState(assessment === null ? '' : String(assessment.totalMarks));
  const [earned, setEarned] = useState(
    assessment === null || assessment.earnedMarks === null ? '' : String(assessment.earnedMarks),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const weightPercent = Number(weight);
    const totalMarks = Number(total);
    if (!Number.isFinite(weightPercent) || weight.trim() === '') {
      setError('How much of the course is this worth?');
      return;
    }
    if (!Number.isFinite(totalMarks) || total.trim() === '' || totalMarks <= 0) {
      setError('What is it marked out of?');
      return;
    }

    // An empty box is null — not marked yet — and never 0.
    const earnedMarks = earned.trim() === '' ? null : Number(earned);
    if (earnedMarks !== null && !Number.isFinite(earnedMarks)) {
      setError('Marks earned should be a number, or blank if it is not marked yet.');
      return;
    }

    setBusy(true);
    const failure = await onSave({ totalMarks, weightPercent, earnedMarks });
    setBusy(false);
    setError(failure);
  };

  return (
    <form className="tasks-assessment" data-testid="tasks-assessment" onSubmit={submit}>
      <h4 className="tasks-why-title">What it is worth</h4>
      <div className="tasks-composer-row">
        <label className="tasks-field tasks-field-narrow" htmlFor={`${baseId}-weight`}>
          <span className="tasks-label">% of course</span>
          <input
            id={`${baseId}-weight`}
            className="tasks-input"
            type="number"
            min={0}
            max={100}
            step="any"
            value={weight}
            placeholder="40"
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="tasks-field tasks-field-narrow" htmlFor={`${baseId}-total`}>
          <span className="tasks-label">Out of</span>
          <input
            id={`${baseId}-total`}
            className="tasks-input"
            type="number"
            min={1}
            step="any"
            value={total}
            placeholder="40"
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        <label className="tasks-field tasks-field-narrow" htmlFor={`${baseId}-earned`}>
          <span className="tasks-label">You scored</span>
          <input
            id={`${baseId}-earned`}
            className="tasks-input"
            type="number"
            min={0}
            step="any"
            value={earned}
            // Not "0". An empty box means not marked yet, and a zero
            // placeholder invites a student to read it as their score.
            placeholder="—"
            onChange={(e) => setEarned(e.target.value)}
          />
        </label>
      </div>
      <p className="tasks-assessment-hint shell-muted">
        Leave “You scored” blank until it is marked — blank is not the same as zero.
      </p>

      {error !== null && (
        <p className="tasks-error" role="alert">
          {error}
        </p>
      )}

      <div className="tasks-composer-actions">
        <button
          type="submit"
          className="tasks-save magnetic"
          disabled={busy}
          data-testid="tasks-assessment-save"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {assessment !== null && (
          <button
            type="button"
            className="tasks-cancel"
            onClick={async () => {
              setBusy(true);
              const failure = await onRemove();
              setBusy(false);
              setError(failure);
            }}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
