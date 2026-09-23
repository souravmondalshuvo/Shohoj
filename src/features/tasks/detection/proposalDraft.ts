// src/features/tasks/detection/proposalDraft.ts
//
// The Suggest and Confirm halves of Detect → Suggest → Confirm → Create (#735).
//
// A DetectedTask is what a parser believes. A ProposalDraft is what the student
// is about to agree to — the same fields, but editable, selectable, and carrying
// the source text that produced each one. Keeping them as separate types is what
// makes the confirm step structural: there is no way to hand a DetectedTask to
// the API, so no future caller can skip the student by accident.
//
// All of this is pure, so the rules that matter — what is selected by default,
// what a draft turns into — can be pinned by tests without a React renderer,
// which this repo does not have.

import type { Enrollment } from '../../../platform/api/academic.ts';
import type { CreateTaskInput, TaskSource, TaskType } from '../../../platform/api/tasks.ts';
import { instantToLocalInput, localInputToInstant } from '../localInstant.ts';
import type { Confidence, DetectedTask } from './types.ts';

/** The Worker's cap on `sourceReference`; a longer one is a 400, not a truncation. */
const MAX_SOURCE_REFERENCE = 512;

export interface ProposalDraft {
  /** Stable across edits, so React keys and checkbox state survive a re-render. */
  readonly key: string;
  readonly selected: boolean;
  readonly title: string;
  readonly type: TaskType;
  /** A `datetime-local` value — the student's own clock. Empty when undated. */
  readonly dueLocal: string;
  /** An enrolment id, or '' when the text named no course the student is taking. */
  readonly enrollmentId: string;
  /** The course code as the text wrote it, even when it matched no enrolment. */
  readonly courseCode: string | null;
  readonly syllabus: string | null;
  readonly confidence: Confidence;
  /** The sentence this came from, shown so a student can check rather than trust. */
  readonly sourceText: string;
  /**
   * Which reading produced this.
   *
   * Carried on the draft rather than decided at create time, because by then
   * the two are indistinguishable — a confirmed proposal looks the same
   * whether a regex or a model read it, and only this says which.
   */
  readonly source: TaskSource;
}

/**
 * Turn detections into drafts a student can review.
 *
 * Only proposals with a date are selected by default. An undated one is not
 * wrong — the text really did fail to say when — but confirming a screenful of
 * dateless tasks is how the list fills with noise, and "Add 6 tasks" should
 * mean six things the parser actually pinned down. Everything else is one
 * checkbox away, which is a much smaller cost than un-adding.
 *
 * A course code only becomes an `enrollmentId` when the student is actually
 * enrolled. "CSE220" in an announcement for a course they have not taken is
 * still worth showing — it is why the proposal says what it says — but it is
 * not an enrolment, and inventing one would put a task under a course that does
 * not exist for them.
 */
export function toDrafts(
  detected: readonly DetectedTask[],
  enrollments: readonly Enrollment[] = [],
  source: TaskSource = 'PASTE',
): ProposalDraft[] {
  const byCourse = new Map(enrollments.map((e) => [e.courseCode.toUpperCase(), e.id]));

  return detected.map((task, index) => ({
    key: `proposal-${index}`,
    selected: task.dueAt !== null,
    title: task.title,
    type: task.type,
    dueLocal: instantToLocalInput(task.dueAt),
    enrollmentId: task.courseCode === null ? '' : (byCourse.get(task.courseCode) ?? ''),
    courseCode: task.courseCode,
    syllabus: task.syllabus,
    confidence: task.confidence,
    sourceText: sourceTextOf(task),
    source,
  }));
}

/**
 * The span of the original text behind this proposal.
 *
 * Built from the widest evidence range rather than the whole paste, so a task
 * created from one sentence of a long email records that sentence. Capped at
 * the Worker's limit here rather than being allowed to fail the create: a
 * student losing a task because their announcement was wordy would be absurd.
 */
function sourceTextOf(task: DetectedTask): string {
  const spans = Object.values(task.evidence).filter((e) => e !== undefined);
  if (spans.length === 0) return '';
  const joined = spans.map((span) => span.text).join(' · ');
  return joined.length > MAX_SOURCE_REFERENCE ? joined.slice(0, MAX_SOURCE_REFERENCE) : joined;
}

/** A draft with one field changed, leaving the rest — and its selection — alone. */
export function patchDraft(
  draft: ProposalDraft,
  patch: Partial<Pick<ProposalDraft, 'selected' | 'title' | 'type' | 'dueLocal' | 'enrollmentId'>>,
): ProposalDraft {
  return { ...draft, ...patch };
}

/**
 * A draft as the API's create input.
 *
 * The source is the draft's own, not a constant: MANUAL, PASTE and
 * AI_SUGGESTION were all approved by the student, and what separates them is
 * what read the deadline in the first place. That is the distinction they will
 * want if one turns out wrong. `sourceReference` carries the text it was read
 * from, which is the same answer in a form they can actually check.
 *
 * Priority is left to the server. The detector has no view on how much a quiz
 * matters to this student, and picking one here would put an invented number in
 * front of the deterministic engine that exists to decide exactly that.
 */
export function draftToInput(draft: ProposalDraft): CreateTaskInput {
  return {
    title: draft.title.trim(),
    type: draft.type,
    dueAt: localInputToInstant(draft.dueLocal),
    enrollmentId: draft.enrollmentId === '' ? null : draft.enrollmentId,
    source: draft.source,
    sourceReference: draft.sourceText === '' ? null : draft.sourceText,
    ...(draft.syllabus === null ? {} : { description: draft.syllabus }),
  };
}

/** Drafts that are both selected and actually creatable. */
export function creatable(drafts: readonly ProposalDraft[]): ProposalDraft[] {
  return drafts.filter((draft) => draft.selected && draft.title.trim() !== '');
}

/**
 * What the confirm button should say.
 *
 * Named for the count, because "Add 3 tasks" is a promise a student can check
 * against the list in front of them and "Add selected" is not.
 */
export function confirmLabel(drafts: readonly ProposalDraft[]): string {
  const count = creatable(drafts).length;
  if (count === 0) return 'Nothing selected';
  return count === 1 ? 'Add 1 task' : `Add ${count} tasks`;
}

/**
 * How a proposal's confidence reads to a student.
 *
 * Words, not a score: a "0.62" tells a student nothing they can act on, and
 * dressing a regex up in a number implies a precision it does not have. Each
 * line says what to DO, since that is the only reason to show this at all.
 */
export function confidenceNote(draft: ProposalDraft): string {
  if (draft.dueLocal === '') return 'No date found — add one, or add it undated.';
  if (draft.confidence === 'high') return 'Date and time read from the text.';
  if (draft.confidence === 'medium') return 'Date read from the text; the time is a guess.';
  // The announcement detector never returns low WITH a date — low is what it
  // says when it found none, which the first branch already covers. This is
  // here for the detectors that come next: a model can be unsure about a date
  // it nonetheless produced, and that is the case most worth flagging.
  return 'Low confidence — check this one before adding it.';
}
