// src/features/tasks/TaskImport.tsx
//
// Detect → Suggest → Confirm → Create, as a screen (#735).
//
// A student pastes an announcement; Shohoj proposes tasks; the student edits
// and confirms; only then is anything created. The four steps are visible in
// this file in that order, and the third one is not skippable — `onCreate` is
// reached from the confirm button and from nowhere else.
//
// No OAuth, no network, no model. The parse happens in the page, which is what
// makes the whole thing work on a build with no Gmail integration and no AI
// key — the brief's rule that AI must never become a hard dependency, met by
// not having the dependency.

import { useId, useMemo, useState } from 'react';

import type { Enrollment } from '../../platform/api/academic.ts';
import {
  TASK_TYPES,
  TASK_TYPE_LABELS,
  type CreateTaskInput,
  type TaskType,
} from '../../platform/api/tasks.ts';
import { detectFromText } from './detection/announcementDetector.ts';
import {
  confidenceNote,
  confirmLabel,
  creatable,
  draftToInput,
  patchDraft,
  toDrafts,
  type ProposalDraft,
} from './detection/proposalDraft.ts';
import type { CourseOption } from './taskView.ts';

export interface TaskImportProps {
  readonly courses: readonly CourseOption[];
  readonly enrollments: readonly Enrollment[];
  /** Resolves to an error message, or null when the task was created. */
  readonly onCreate: (input: CreateTaskInput) => Promise<string | null>;
  /**
   * Called once when every confirmed draft was created.
   *
   * One notification for the batch, not one per task: confirming six tasks
   * should not bury the screen under six identical toasts.
   */
  readonly onDone: (count: number) => void;
  readonly busy: boolean;
}

type Stage = 'closed' | 'paste' | 'review';

export function TaskImport({ courses, enrollments, onCreate, onDone, busy }: TaskImportProps) {
  const baseId = useId();
  const [stage, setStage] = useState<Stage>('closed');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<readonly ProposalDraft[]>([]);
  const [unrecognised, setUnrecognised] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectable = useMemo(() => creatable(drafts), [drafts]);

  // ── Detect ────────────────────────────────────────────────────────────────

  const detect = () => {
    // `now` is passed in rather than read inside the detector, so a date with
    // no year resolves against one clock the whole way through.
    const result = detectFromText(text, {
      now: new Date(),
      knownCourseCodes: enrollments.map((e) => e.courseCode),
    });
    setDrafts(toDrafts(result.detected, enrollments));
    setUnrecognised(result.unrecognised);
    setError(null);
    setStage('review');
  };

  const reset = () => {
    setText('');
    setDrafts([]);
    setUnrecognised([]);
    setError(null);
    setStage('closed');
  };

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Create the confirmed drafts, one call each.
   *
   * Sequential rather than parallel: the API has no batch create, and firing
   * eight at once would make a partial failure impossible to report sensibly —
   * "three of your five tasks were added" needs to know which three. On the
   * first failure this stops and keeps the remaining drafts on screen, so a
   * student can retry the rest rather than re-paste and re-check everything.
   */
  const confirm = async () => {
    const queue = creatable(drafts);
    if (queue.length === 0) return;

    let added = 0;
    for (const draft of queue) {
      const failure = await onCreate(draftToInput(draft));
      if (failure !== null) {
        setError(
          added === 0
            ? failure
            : `Added ${added} of ${queue.length}. The rest are still here — ${failure}`,
        );
        // Drop only what was actually created, so a retry does not duplicate.
        const done = new Set(queue.slice(0, added).map((d) => d.key));
        setDrafts((current) => current.filter((d) => !done.has(d.key)));
        return;
      }
      added += 1;
    }
    reset();
    onDone(added);
  };

  const update = (key: string, patch: Parameters<typeof patchDraft>[1]) => {
    setDrafts((current) => current.map((d) => (d.key === key ? patchDraft(d, patch) : d)));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === 'closed') {
    return (
      <button
        type="button"
        className="tasks-import-open"
        data-testid="tasks-import-open"
        onClick={() => setStage('paste')}
      >
        Paste an announcement
      </button>
    );
  }

  return (
    <section className="tasks-import" data-testid="tasks-import" aria-label="Import from text">
      {stage === 'paste' ? (
        <>
          <label className="tasks-field tasks-field-grow" htmlFor={`${baseId}-text`}>
            <span className="tasks-label">Announcement</span>
            <textarea
              id={`${baseId}-text`}
              className="tasks-input tasks-import-text"
              rows={5}
              value={text}
              maxLength={5000}
              placeholder="Quiz 3 will be held on 25 September and covers chapters 4-6."
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="tasks-import-note shell-muted">
            Nothing is added until you confirm it. Shohoj reads the text in your browser — it does
            not send it anywhere.
          </p>
          <div className="tasks-import-actions">
            <button
              type="button"
              className="tasks-import-submit"
              data-testid="tasks-import-detect"
              disabled={text.trim() === ''}
              onClick={detect}
            >
              Find deadlines
            </button>
            <button type="button" className="tasks-import-cancel" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {drafts.length === 0 ? (
            <p className="tasks-import-none" data-testid="tasks-import-none">
              No deadlines found in that text. You can edit it and look again, or add the task
              yourself.
            </p>
          ) : (
            <ul className="tasks-import-list" data-testid="tasks-import-list">
              {drafts.map((draft, index) => (
                <li key={draft.key} className="tasks-import-item">
                  <label className="tasks-import-pick">
                    {/* Every field here is numbered. The composer on the same
                        screen already has a "Task" and a "Course", and several
                        proposals would repeat each other — so the number is
                        what makes each control nameable, while still leading
                        with its visible label. */}
                    <input
                      type="checkbox"
                      aria-label={`Add this ${index + 1}`}
                      checked={draft.selected}
                      onChange={(e) => update(draft.key, { selected: e.target.checked })}
                    />
                    <span className="tasks-import-pick-label">Add this</span>
                  </label>

                  <div className="tasks-import-fields">
                    <label className="tasks-field tasks-field-grow">
                      <span className="tasks-label">Task</span>
                      <input
                        className="tasks-input"
                        aria-label={`Task ${index + 1}`}
                        value={draft.title}
                        maxLength={200}
                        onChange={(e) => update(draft.key, { title: e.target.value })}
                      />
                    </label>

                    <label className="tasks-field">
                      <span className="tasks-label">Type</span>
                      <select
                        className="tasks-input"
                        aria-label={`Type ${index + 1}`}
                        value={draft.type}
                        onChange={(e) => update(draft.key, { type: e.target.value as TaskType })}
                      >
                        {TASK_TYPES.map((value) => (
                          <option key={value} value={value}>
                            {TASK_TYPE_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="tasks-field">
                      <span className="tasks-label">Due</span>
                      <input
                        className="tasks-input"
                        aria-label={`Due ${index + 1}`}
                        type="datetime-local"
                        value={draft.dueLocal}
                        onChange={(e) => update(draft.key, { dueLocal: e.target.value })}
                      />
                    </label>

                    <label className="tasks-field">
                      <span className="tasks-label">Course</span>
                      <select
                        className="tasks-input"
                        aria-label={`Course ${index + 1}`}
                        value={draft.enrollmentId}
                        onChange={(e) => update(draft.key, { enrollmentId: e.target.value })}
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
                  </div>

                  <p className="tasks-import-why shell-muted">
                    {confidenceNote(draft)}
                    {draft.sourceText !== '' && (
                      // The source text, so a proposal can be CHECKED rather
                      // than trusted. Rendered as text, never as markup.
                      <span className="tasks-import-source"> Read from: “{draft.sourceText}”</span>
                    )}
                    {draft.courseCode !== null && draft.enrollmentId === '' && (
                      <span className="tasks-import-source">
                        {' '}
                        {draft.courseCode} is not one of your courses this semester.
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {unrecognised.length > 0 && (
            <p className="tasks-import-skipped shell-muted" data-testid="tasks-import-skipped">
              {/* Said out loud, because "it found nothing here" is information:
                  it tells a student the paste worked and the text simply did
                  not say when, rather than leaving them wondering. */}
              {unrecognised.length === 1
                ? '1 line had no deadline in it and was skipped.'
                : `${unrecognised.length} lines had no deadline in them and were skipped.`}
            </p>
          )}

          {error !== null && (
            <p className="tasks-import-error" role="alert">
              {error}
            </p>
          )}

          <div className="tasks-import-actions">
            <button
              type="button"
              className="tasks-import-submit"
              data-testid="tasks-import-confirm"
              disabled={busy || selectable.length === 0}
              onClick={() => void confirm()}
            >
              {confirmLabel(drafts)}
            </button>
            <button
              type="button"
              className="tasks-import-back"
              onClick={() => {
                setError(null);
                setStage('paste');
              }}
            >
              Back to the text
            </button>
            <button type="button" className="tasks-import-cancel" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
