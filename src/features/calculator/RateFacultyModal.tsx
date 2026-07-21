// src/features/calculator/RateFacultyModal.tsx
//
// The faculty-review modal on the shell /calculator route (#319): the React
// counterpart of js/ui/reviews.js openReviewModal, driven by the pure
// reviewDraft model. Same fields and flow — prefilled initials (live-
// normalized), the five star dimensions, the optional 500-char note with a
// live counter, the legacy validation order and messages, Skip/Submit with a
// submitting state — behind the shell's dialog conventions (role=dialog,
// labelled, focus trap + restore, Escape and backdrop close), matching
// ModalProvider's ConfirmDialog. Submission goes through the injected
// onSubmit boundary (reviewSubmit.ts); a success hands the payload to
// onSubmitted (the route writes the initials onto the course + toasts).
//
// Deviation (documented): the legacy existing-review probe needs a signed-in
// uid + the Firestore fetch hook, which the standalone shell never has — the
// probe's signed-out behavior is "skip", so it ports with the typed Firebase
// boundary (Phase 5G/6), not here.

import { useEffect, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button';
import { trapTabKey, useRestoreFocus } from '../../shared/ui/useFocusTrap';
import type { RatingKey, ReviewLike } from '../../core/reviews';
import {
  RATING_FIELDS,
  REVIEW_TEXT_MAX,
  buildReviewPayload,
  emptyReviewDraft,
  firstDraftError,
  setDraftInitials,
  setDraftRating,
  setDraftText,
  type ReviewPayload,
} from './reviewDraft';
import type { ReviewSubmitResult } from './reviewSubmit';

export interface RateFacultyModalProps {
  readonly courseCode: string;
  readonly semester: string;
  readonly prefillInitials: string;
  /** The submit boundary (reviewSubmit.ts submitReview, environment applied). */
  readonly onSubmit: (payload: ReviewPayload) => Promise<ReviewSubmitResult>;
  /** Called once after an ok submit, before closing (write-back + toast). */
  readonly onSubmitted: (payload: ReviewPayload) => void;
  /** Close without submitting (Skip, ×, Escape, backdrop). */
  readonly onClose: () => void;
  /**
   * The existing-review probe (reviewProbe.ts). When omitted the form shows
   * immediately (signed-out standalone); when present, an existing review
   * renders read-only instead of the form (reviews are client-immutable).
   */
  readonly probe?: () => Promise<ReviewLike | null>;
}

function StarRow({
  field,
  value,
  onSelect,
}: {
  readonly field: (typeof RATING_FIELDS)[number];
  readonly value: number;
  readonly onSelect: (value: number) => void;
}) {
  return (
    <div className="rv-row">
      <div className="rv-row-label">
        <div className="rv-row-title">{field.label}</div>
        <div className="rv-row-hint">{field.hint}</div>
      </div>
      <div className="rv-row-stars" role="radiogroup" aria-label={field.label} data-dim={field.key}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''} for ${field.label}`}
            className={`rv-star${n <= value ? ' filled' : ''}`}
            onClick={() => onSelect(n)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RateFacultyModal({
  courseCode,
  semester,
  prefillInitials,
  onSubmit,
  onSubmitted,
  onClose,
  probe,
}: RateFacultyModalProps) {
  const [draft, setDraft] = useState(() => emptyReviewDraft(prefillInitials));
  const [error, setError] = useState<string | null>(null);
  const [initialsError, setInitialsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // undefined = probing, null = none (show form), review = show read-only.
  const [existing, setExisting] = useState<ReviewLike | null | undefined>(probe ? undefined : null);

  // Probe once when the modal opens. `probe` is recreated each parent render, so
  // read it through a ref and run on mount only (not on every identity change).
  const probeRef = useRef(probe);
  probeRef.current = probe;
  useEffect(() => {
    const run = probeRef.current;
    if (!run) return;
    let live = true;
    void run().then((review) => {
      if (live) setExisting(review ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);
  const initialsRef = useRef<HTMLInputElement>(null);
  useRestoreFocus();

  useEffect(() => {
    // Legacy: focus the first empty field. The form (and this ref) only
    // exists once `existing` settles to null, so re-run as that lands —
    // a probe resolves after the initial mount effect would've already fired.
    if (existing === null) initialsRef.current?.focus();
  }, [existing]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!submitting) onClose();
      return;
    }
    trapTabKey(event, dialogRef);
  };

  const submit = async () => {
    setError(null);
    const draftError = firstDraftError(draft);
    if (draftError) {
      if (draftError.field === 'initials') {
        setInitialsError(true);
        initialsRef.current?.focus();
      } else {
        setError(draftError.message);
      }
      return;
    }
    setSubmitting(true);
    const payload = buildReviewPayload(draft, courseCode, semester);
    const res = await onSubmit(payload);
    if (res.ok) {
      onSubmitted(payload);
      onClose();
      return;
    }
    setSubmitting(false);
    setError(res.error || 'Submission failed');
  };

  return (
    <div
      className="shell-modal-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        className="shell-modal rv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rv-modal-title"
        data-testid="rate-faculty-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rv-modal-title" className="shell-modal-title">
          {existing ? 'Review already submitted' : 'Rate your faculty'}
        </h2>
        <p className="shell-modal-message rv-subtitle">
          {existing
            ? 'You already used your one public review slot for this faculty-course pair. To preserve review integrity, client-side editing is disabled.'
            : 'Pseudonymous to other students.'}
          {courseCode && (
            <>
              <br />
              Course: <strong>{courseCode}</strong>
              {semester && <> · {semester}</>}
            </>
          )}
        </p>

        {existing === undefined ? (
          <p className="rv-probing" role="status">
            Checking your reviews…
          </p>
        ) : existing ? (
          <>
            <div className="rv-existing" data-testid="existing-review">
              <div className="rv-existing-heading">Existing Review</div>
              <div className="rv-existing-ratings">
                {RATING_FIELDS.map((field) => (
                  <div key={field.key} className="rv-existing-row">
                    <span className="rv-existing-label">{field.label}</span>
                    <span className="rv-existing-value">
                      {existing.ratings?.[field.key] ?? '—'}/5
                    </span>
                  </div>
                ))}
              </div>
              {existing.text && (
                <div className="rv-existing-note">
                  <div className="rv-existing-heading">Your Note</div>
                  <div className="rv-existing-text">{existing.text}</div>
                </div>
              )}
            </div>
            <div className="shell-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rv-field">
              <label className="rv-field-label" htmlFor="rv-initials">
                Faculty Initials
              </label>
              <input
                id="rv-initials"
                ref={initialsRef}
                className="rv-input rv-initials"
                type="text"
                maxLength={6}
                placeholder="e.g. MNR"
                autoComplete="off"
                value={draft.initials}
                onChange={(e) => {
                  setDraft((d) => setDraftInitials(d, e.target.value));
                  setInitialsError(false);
                }}
              />
              {initialsError && <div className="rv-field-error">Initials must be 2–6 letters.</div>}
            </div>

            <div className="rv-stars-box">
              {RATING_FIELDS.map((field) => (
                <StarRow
                  key={field.key}
                  field={field}
                  value={draft.ratings[field.key as RatingKey]}
                  onSelect={(v) => setDraft((d) => setDraftRating(d, field.key, v))}
                />
              ))}
            </div>

            <div className="rv-field">
              <label className="rv-field-label" htmlFor="rv-text">
                Your experience (optional)
              </label>
              <textarea
                id="rv-text"
                className="rv-input rv-text"
                rows={3}
                maxLength={REVIEW_TEXT_MAX}
                placeholder="What stood out? Keep it honest and respectful."
                value={draft.text}
                onChange={(e) => setDraft((d) => setDraftText(d, e.target.value))}
              />
              <div className="rv-count" aria-hidden="true">
                {draft.text.length} / {REVIEW_TEXT_MAX}
              </div>
            </div>

            {error && (
              <div className="rv-error" role="alert">
                {error}
              </div>
            )}

            <div className="shell-modal-actions">
              <Button variant="secondary" disabled={submitting} onClick={onClose}>
                Skip
              </Button>
              <Button variant="primary" disabled={submitting} onClick={() => void submit()}>
                {submitting ? 'Submitting…' : 'Submit Review'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
