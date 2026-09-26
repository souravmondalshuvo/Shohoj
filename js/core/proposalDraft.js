// Twin of src/features/tasks/detection/proposalDraft.ts — hand-maintained, not generated.
// src/features/tasks/detection/proposalDraft.ts is the source of truth: change
// it there first, then mirror the change here. tests/twinParity.test.js fails
// if the two drift.
//
// Detected work as editable proposals (#735), for the legacy Tasks tab (#767).
// Nothing becomes a task until the student confirms it; an undated proposal
// starts unticked, because a deadline is what makes one worth adding.

import { instantToLocalInput, localInputToInstant } from './localInstant.js';

const _DRAFT_MAX_SOURCE_REFERENCE = 512;

export function toDrafts(detected, enrollments = [], source = 'PASTE') {
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
    sourceText: _draftSourceTextOf(task),
    source,
  }));
}

function _draftSourceTextOf(task) {
  const spans = Object.values(task.evidence).filter((e) => e !== undefined);
  if (spans.length === 0) return '';
  const joined = spans.map((span) => span.text).join(' · ');
  return joined.length > _DRAFT_MAX_SOURCE_REFERENCE ? joined.slice(0, _DRAFT_MAX_SOURCE_REFERENCE) : joined;
}

export function patchDraft(draft, patch) {
  return { ...draft, ...patch };
}

export function draftToInput(draft) {
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

export function creatable(drafts) {
  return drafts.filter((draft) => draft.selected && draft.title.trim() !== '');
}

export function confirmLabel(drafts) {
  const count = creatable(drafts).length;
  if (count === 0) return 'Nothing selected';
  return count === 1 ? 'Add 1 task' : `Add ${count} tasks`;
}

export function confidenceNote(draft) {
  if (draft.dueLocal === '') return 'No date found — add one, or add it undated.';
  if (draft.confidence === 'high') return 'Date and time read from the text.';
  if (draft.confidence === 'medium') return 'Date read from the text; the time is a guess.';
  return 'Low confidence — check this one before adding it.';
}
