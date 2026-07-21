// src/features/calculator/reviewDraft.ts
//
// Pure model for the faculty-review modal (#319): the draft a student edits
// before submitting a review. Mirrors js/ui/reviews.js openReviewModal exactly —
// the five rating dimensions and their labels/hints, live initials
// normalization, the 500-char note cap, and the validation order (invalid
// initials first, then the first missing rating in RATING_KEYS order). Payload
// shaping matches what the legacy modal hands to submitReview: normalized
// initials, uppercased course code, trimmed note. No DOM, no Firebase — the
// modal component renders this and the submit boundary consumes the payload.

import { isValidInitials, normalizeInitials } from '../../core/faculty.ts';
import { RATING_KEYS, type RatingKey } from '../../core/reviews.ts';

export interface RatingField {
  readonly key: RatingKey;
  readonly label: string;
  readonly hint: string;
}

/** The modal's rating rows, in render + validation order (RATING_LABELS in reviews.js). */
export const RATING_FIELDS: readonly RatingField[] = [
  { key: 'teaching', label: 'Teaching Quality', hint: 'Clarity, prep, engagement' },
  { key: 'marking', label: 'Marking Fairness', hint: 'Consistency, transparency' },
  { key: 'behavior', label: 'Behavior & Attitude', hint: 'Respect, approachability' },
  { key: 'difficulty', label: 'Course Difficulty', hint: '1 = easy, 5 = brutal' },
  { key: 'workload', label: 'Workload', hint: '1 = light, 5 = heavy' },
];

/** Note length cap (the textarea's maxlength in the legacy modal). */
export const REVIEW_TEXT_MAX = 500;

export interface ReviewDraft {
  /** Always normalized (trimmed, uppercased, letters only, ≤6). */
  readonly initials: string;
  /** 0 = unrated; set values are integers 1–5. */
  readonly ratings: Readonly<Record<RatingKey, number>>;
  /** Raw note text, capped at {@link REVIEW_TEXT_MAX}. */
  readonly text: string;
}

const UNRATED: Readonly<Record<RatingKey, number>> = {
  teaching: 0,
  marking: 0,
  behavior: 0,
  difficulty: 0,
  workload: 0,
};

/** Fresh draft, initials prefilled from the course row (normalized like the input). */
export function emptyReviewDraft(prefillInitials = ''): ReviewDraft {
  return { initials: normalizeInitials(prefillInitials), ratings: UNRATED, text: '' };
}

/** Live-normalize the initials field (the legacy input handler rewrites its value). */
export function setDraftInitials(draft: ReviewDraft, raw: string): ReviewDraft {
  return { ...draft, initials: normalizeInitials(raw) };
}

/** Set one star rating. Out-of-range / non-integer values are ignored (stars only emit 1–5). */
export function setDraftRating(draft: ReviewDraft, key: RatingKey, value: number): ReviewDraft {
  if (!Number.isInteger(value) || value < 1 || value > 5) return draft;
  return { ...draft, ratings: { ...draft.ratings, [key]: value } };
}

/** Update the note, enforcing the modal's 500-char cap. */
export function setDraftText(draft: ReviewDraft, raw: string): ReviewDraft {
  return { ...draft, text: String(raw ?? '').slice(0, REVIEW_TEXT_MAX) };
}

export type ReviewDraftError =
  | { readonly field: 'initials'; readonly message: string }
  | { readonly field: 'rating'; readonly key: RatingKey; readonly message: string };

/**
 * First blocking error, in the legacy submit-handler order: invalid initials
 * (2–6 letters) first, then the first unrated dimension in RATING_KEYS order,
 * with the same user-facing messages.
 */
export function firstDraftError(draft: ReviewDraft): ReviewDraftError | null {
  if (!isValidInitials(draft.initials)) {
    return { field: 'initials', message: 'Initials must be 2–6 letters.' };
  }
  const missing = RATING_KEYS.find((k) => draft.ratings[k] < 1);
  if (missing) {
    const label = RATING_FIELDS.find((f) => f.key === missing)?.label ?? missing;
    return { field: 'rating', key: missing, message: `Please rate "${label}"` };
  }
  return null;
}

export interface ReviewPayload {
  readonly facultyInitials: string;
  readonly courseCode: string;
  readonly semester: string;
  readonly ratings: Readonly<Record<RatingKey, number>>;
  readonly text: string;
}

/** The payload the legacy modal hands to submitReview (note trimmed, code uppercased). */
export function buildReviewPayload(
  draft: ReviewDraft,
  courseCode: string,
  semester: string,
): ReviewPayload {
  return {
    facultyInitials: normalizeInitials(draft.initials),
    courseCode: String(courseCode ?? '')
      .toUpperCase()
      .trim(),
    semester: String(semester ?? ''),
    ratings: draft.ratings,
    text: draft.text.trim(),
  };
}
