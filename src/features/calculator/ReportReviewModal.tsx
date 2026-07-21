// src/features/calculator/ReportReviewModal.tsx
//
// The report-a-review dialog (#359 UI), the React port of js/ui/reviews.js
// openReportModal: a reason textarea (300-char cap with a live counter) and
// Send/Cancel, submitting the report through the provider (useReportReview →
// reviewReports write). On success the parent toasts and closes; a failure shows
// the message inline and keeps the dialog open. Shell dialog conventions
// (role=dialog, labelled, Tab trapped, Escape + backdrop close, focus the
// textarea on open and restore on close), matching CourseReviewsModal.

import { useEffect, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button';
import { REPORT_REASON_MAX } from '../../platform/firebase/reviewsWriteRepo';
import { trapTabKey, useRestoreFocus } from '../../shared/ui/useFocusTrap';
import { useReportReview } from './FacultyReviewsProvider';

export interface ReportReviewModalProps {
  readonly reviewId: string;
  /** Called once after an ok report, before closing (parent toasts). */
  readonly onReported: () => void;
  readonly onClose: () => void;
}

export default function ReportReviewModal({
  reviewId,
  onReported,
  onClose,
}: ReportReviewModalProps) {
  const reportReview = useReportReview();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useRestoreFocus();
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const send = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await reportReview(reviewId, reason);
    if (result.ok) {
      onReported();
      onClose();
      return;
    }
    setError(result.error ?? 'Report failed');
    setSubmitting(false);
  };

  return (
    <div
      className="shell-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          return;
        }
        trapTabKey(e, dialogRef);
      }}
    >
      <div
        ref={dialogRef}
        className="shell-modal rv-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rv-report-title"
        data-testid="report-review-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rv-report-title" className="shell-modal-title">
          Report this review
        </h2>
        <p className="shell-modal-message">
          Tell us what’s wrong with this review (spam, abuse, off-topic). Reports are private.
        </p>

        <textarea
          ref={textareaRef}
          className="rv-report-reason"
          aria-label="Reason for reporting"
          placeholder="Describe the issue…"
          maxLength={REPORT_REASON_MAX}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="rv-report-counter" aria-hidden="true">
          {reason.length}/{REPORT_REASON_MAX}
        </div>

        {error && (
          <p className="rv-report-error" role="alert">
            {error}
          </p>
        )}

        <div className="shell-modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      </div>
    </div>
  );
}
