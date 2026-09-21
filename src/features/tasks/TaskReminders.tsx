// src/features/tasks/TaskReminders.tsx
//
// Setting reminders on a task (#729).
//
// The offsets are buttons rather than a dropdown plus a save: a student
// deciding to be reminded a day before should be one tap from it, and the
// three common offsets cover almost every case. A custom number is there for
// the rest, behind a smaller affordance.

import { useId, useState } from 'react';

import { COMMON_REMINDER_OFFSETS, type Reminder, reminderLabel } from '../../platform/api/tasks.ts';

export interface TaskRemindersProps {
  readonly reminders: readonly Reminder[];
  readonly hasDeadline: boolean;
  readonly onAdd: (offsetMinutes: number) => Promise<string | null>;
  readonly onRemove: (id: string) => Promise<string | null>;
}

export function TaskReminders({ reminders, hasDeadline, onAdd, onRemove }: TaskRemindersProps) {
  const baseId = useId();
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = new Set(reminders.map((r) => r.offsetMinutes));

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setError(await work());
    setBusy(false);
  };

  return (
    <section className="tasks-reminders" data-testid="tasks-reminders">
      <h4 className="tasks-why-title">Remind me</h4>

      {!hasDeadline && (
        <p className="tasks-assessment-hint shell-muted" data-testid="tasks-reminders-nodeadline">
          Reminders count back from the deadline. Add one and they will start working.
        </p>
      )}

      <div className="tasks-reminder-offsets">
        {COMMON_REMINDER_OFFSETS.map((offset) => {
          const already = set.has(offset.minutes);
          return (
            <button
              key={offset.minutes}
              type="button"
              className={`tasks-reminder-chip ${already ? 'is-set' : ''}`}
              disabled={busy}
              // Pressed state rather than a separate "remove" control: the chip
              // IS the setting, so tapping it again is the obvious way to undo.
              aria-pressed={already}
              onClick={() =>
                run(async () => {
                  if (!already) return onAdd(offset.minutes);
                  const existing = reminders.find((r) => r.offsetMinutes === offset.minutes);
                  return existing === undefined ? null : onRemove(existing.id);
                })
              }
            >
              {offset.label}
            </button>
          );
        })}

        {!showCustom && (
          <button type="button" className="tasks-reminder-more" onClick={() => setShowCustom(true)}>
            Custom…
          </button>
        )}
      </div>

      {showCustom && (
        <div className="tasks-composer-row">
          <label className="tasks-field tasks-field-narrow" htmlFor={`${baseId}-custom`}>
            <span className="tasks-label">Minutes before</span>
            <input
              id={`${baseId}-custom`}
              className="tasks-input"
              type="number"
              min={0}
              step={5}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="tasks-save magnetic"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const minutes = Number(custom);
                if (custom.trim() === '' || !Number.isInteger(minutes) || minutes < 0) {
                  return 'Give a whole number of minutes.';
                }
                const failure = await onAdd(minutes);
                if (failure === null) {
                  setCustom('');
                  setShowCustom(false);
                }
                return failure;
              })
            }
          >
            Add
          </button>
        </div>
      )}

      {reminders.length > 0 && (
        <ul className="tasks-reminder-list" data-testid="tasks-reminder-list">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="tasks-reminder-item">
              <span>{reminderLabel(reminder)}</span>
              <button
                type="button"
                className="tasks-delete"
                aria-label={`Remove reminder ${reminderLabel(reminder)}`}
                disabled={busy}
                onClick={() => run(() => onRemove(reminder.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p className="tasks-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
