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
import type { TaskDetector } from './detection/types.ts';
import type { AiDetectionResult } from './detection/aiDetector.ts';
import { shouldOfferAi } from './detection/aiDetector.ts';
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
  /**
   * The model-backed detector, when this build has one.
   *
   * Optional on purpose: a deployment with no key passes nothing and the panel
   * simply never offers a second reading. That is the "AI is not a hard
   * dependency" rule expressed as a type — there is no configuration to check
   * and no failure path to forget, because the feature is absent rather than
   * broken.
   */
  readonly aiDetector?: TaskDetector | null;
  readonly busy: boolean;
}

type Stage = 'closed' | 'paste' | 'review';

export function TaskImport({
  courses,
  enrollments,
  onCreate,
  onDone,
  aiDetector = null,
  busy,
}: TaskImportProps) {
  const baseId = useId();
  const [stage, setStage] = useState<Stage>('closed');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<readonly ProposalDraft[]>([]);
  const [unrecognised, setUnrecognised] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'reading' | 'done'>('idle');
  const [aiNote, setAiNote] = useState<string | null>(null);

  const selectable = useMemo(() => creatable(drafts), [drafts]);
  // What the offer policy reads: a draft's date, in the shape shouldOfferAi
  // wants. Derived from drafts rather than the raw detection so that clearing
  // a date by hand also makes the second reading worth offering.
  const asProposals = useMemo(
    () => drafts.map((d) => ({ dueAt: d.dueLocal === '' ? null : d.dueLocal })),
    [drafts],
  );

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
    // New text, so any previous second reading no longer describes it.
    setAiState('idle');
    setAiNote(null);
    setStage('review');
  };

  /**
   * Ask the model to read the same text.
   *
   * Only ever REPLACES the list when it actually found something. An empty
   * result keeps what the deterministic parser produced — a student who had
   * three dateless proposals should not lose them because the second reading
   * agreed there were no dates.
   */
  const askAi = async () => {
    if (aiDetector === null) return;
    setAiState('reading');
    setAiNote(null);

    const result = (await aiDetector.detect(text, {
      now: new Date(),
      knownCourseCodes: enrollments.map((e) => e.courseCode),
    })) as AiDetectionResult;

    setAiState('done');
    if (result.outcome !== 'ok') {
      setAiNote(result.note);
      return;
    }
    if (result.detected.length === 0) {
      setAiNote('Shohoj read it too and found nothing more.');
      return;
    }
    setDrafts(toDrafts(result.detected, enrollments));
    setAiNote(
      result.detected.length === 1
        ? 'Shohoj read it and found 1 more thing. Check it before adding.'
        : `Shohoj read it and found ${result.detected.length} things. Check them before adding.`,
    );
  };

  const reset = () => {
    setText('');
    setDrafts([]);
    setUnrecognised([]);
    setError(null);
    setAiState('idle');
    setAiNote(null);
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

          {/* Offered only when the free parser came up short, so the common
              case never spends anything. Absent entirely on a build with no
              model configured — nothing to check, nothing to fail. */}
          {aiDetector !== null && aiState !== 'done' && shouldOfferAi(asProposals) && (
            <div className="tasks-import-ai">
              <button
                type="button"
                className="tasks-import-ai-ask"
                data-testid="tasks-import-ai"
                disabled={aiState === 'reading'}
                onClick={() => void askAi()}
              >
                {aiState === 'reading' ? 'Reading…' : 'Ask Shohoj to read it'}
              </button>
              <span className="tasks-import-ai-hint shell-muted">
                Sends this text to Shohoj’s reader. Nothing is added without you.
              </span>
            </div>
          )}

          {aiNote !== null && (
            <p className="tasks-import-ai-note shell-muted" data-testid="tasks-import-ai-note">
              {aiNote}
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
