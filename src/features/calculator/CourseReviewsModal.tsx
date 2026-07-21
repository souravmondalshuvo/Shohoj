// src/features/calculator/CourseReviewsModal.tsx
//
// Read-only course-reviews viewer on the shell (#343, Phase 5G slice d3c-i),
// the React port of js/ui/reviews.js openCourseReviewsPanel. Opened from the
// planner ⭐, it fetches a course's reviews through the resolved repo
// (FacultyReviewsProvider) and shows one card per faculty — initials, review
// count, overall score, the five dimension averages, and up to two latest
// snippets (the pure courseReviews model). Loading and empty states included.
// Per-review Report (#359) and the card's "+ Add your rating" (#363) are wired
// here; the rating submit shares /calculator's typed path.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button';
import { useNotifications } from '../../state/NotificationProvider';
import { useAuth } from '../../app/providers/AuthProvider';
import { trapTabKey, useRestoreFocus } from '../../shared/ui/useFocusTrap';
import { buildCourseReviewGroups, type CourseReviewGroup } from './courseReviews';
import { isKnownCourseCode } from './catalog';
import {
  useFetchReviewById,
  useFetchReviewsByCourse,
  useSubmitReview,
} from './FacultyReviewsProvider';
import { probeExistingReview } from './reviewProbe';
import { submitReview } from './reviewSubmit';
import RateFacultyModal from './RateFacultyModal';
import ReportReviewModal from './ReportReviewModal';

export interface CourseReviewsModalProps {
  readonly courseCode: string;
  readonly courseName?: string;
  readonly onClose: () => void;
}

const DIMENSIONS: readonly {
  readonly key: 'teaching' | 'marking' | 'behavior' | 'difficulty' | 'workload';
  readonly label: string;
}[] = [
  { key: 'teaching', label: 'Teach' },
  { key: 'marking', label: 'Marks' },
  { key: 'behavior', label: 'Behav' },
  { key: 'difficulty', label: 'Diff' },
  { key: 'workload', label: 'Work' },
];

const fmt = (value: number | null) => (value !== null ? value.toFixed(1) : '—');

function FacultyCard({
  group,
  onReport,
  onAddRating,
}: {
  readonly group: CourseReviewGroup;
  readonly onReport: (reviewId: string) => void;
  readonly onAddRating: (facultyInitials: string) => void;
}) {
  return (
    <div className="rv-cr-card" data-testid="course-review-card" data-fac={group.facultyInitials}>
      <div className="rv-cr-card-head">
        <span className="rv-cr-initials">{group.facultyInitials}</span>
        <span className="rv-cr-count">
          {group.count} review{group.count !== 1 ? 's' : ''}
        </span>
        <span className="rv-cr-overall" aria-label={`Overall ${fmt(group.overall)} out of 5`}>
          ★ {fmt(group.overall)}
        </span>
      </div>
      <div className="rv-cr-dims">
        {DIMENSIONS.map((dim) => (
          <span key={dim.key} className="rv-cr-dim">
            {dim.label}: <strong>{fmt(group.ratings[dim.key])}</strong>
          </span>
        ))}
      </div>
      {group.snippets.length > 0 && (
        <div className="rv-cr-snippets">
          {group.snippets.map((snippet, i) => (
            <p key={snippet.id ?? i} className="rv-cr-snippet">
              {snippet.text}
              {snippet.id && (
                <button
                  type="button"
                  className="rv-cr-report"
                  data-report={snippet.id}
                  aria-label="Report this review"
                  onClick={() => onReport(snippet.id as string)}
                >
                  Report
                </button>
              )}
            </p>
          ))}
        </div>
      )}
      <div className="rv-cr-card-actions">
        <button
          type="button"
          className="rv-cr-add-rating"
          onClick={() => onAddRating(group.facultyInitials)}
        >
          + Add your rating
        </button>
      </div>
    </div>
  );
}

export default function CourseReviewsModal({
  courseCode,
  courseName,
  onClose,
}: CourseReviewsModalProps) {
  const fetchByCourse = useFetchReviewsByCourse();
  const submitToProvider = useSubmitReview();
  const fetchReviewById = useFetchReviewById();
  const auth = useAuth();
  const { notify } = useNotifications();
  // undefined = loading; [] = none; groups = cards.
  const [groups, setGroups] = useState<CourseReviewGroup[] | undefined>(undefined);
  // Kept separate from `groups` so a failed read is not rendered as "No reviews
  // yet" — that made an outage or a permission failure look like a course
  // nobody had reviewed, and invited students to re-submit a review they had
  // already written.
  const [failed, setFailed] = useState(false);
  // The review id the Report dialog is open for (null = closed).
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);
  // The faculty initials the rating dialog is open for (null = closed).
  const [rateInitials, setRateInitials] = useState<string | null>(null);
  // Bumped after a submit to refetch so the new review appears.
  const [reloadKey, setReloadKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useRestoreFocus();
  // No single primary field to focus (it's a viewer, not a form) — focus the
  // dialog container itself so it's announced and Tab starts from the top.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // uid from the shell auth with the window fallback (bundled page / e2e),
  // matching /calculator's probe + submit wiring.
  const currentUid = useCallback(
    () => auth.uid || (typeof window !== 'undefined' ? window._shohoj_currentUid?.() : '') || '',
    [auth.uid],
  );
  const probeEnv = useMemo(
    () => ({ currentUid, fetchById: fetchReviewById }),
    [currentUid, fetchReviewById],
  );

  // Fetch on open and after a submit. fetchByCourse is recreated on provider
  // bumps, so read it through a ref and key the effect on the course + reloadKey.
  const fetchRef = useRef(fetchByCourse);
  fetchRef.current = fetchByCourse;
  useEffect(() => {
    let live = true;
    fetchRef
      .current(courseCode)
      .then((reviews) => {
        if (!live) return;
        setGroups(buildCourseReviewGroups(reviews));
        setFailed(false);
      })
      .catch(() => {
        // The repo logs the machine-readable code; never surface the raw SDK
        // message to a student.
        if (!live) return;
        setGroups([]);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [courseCode, reloadKey]);

  return (
    <>
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
          tabIndex={-1}
          className="shell-modal rv-cr-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rv-cr-title"
          data-testid="course-reviews-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="rv-cr-title" className="shell-modal-title">
            {courseCode} reviews
          </h2>
          {courseName && <p className="shell-modal-message rv-cr-subtitle">{courseName}</p>}

          {groups === undefined ? (
            <p className="rv-cr-loading" role="status">
              Loading course reviews…
            </p>
          ) : failed ? (
            <div className="rv-cr-empty" data-testid="course-reviews-unavailable" role="alert">
              <div className="rv-cr-empty-title">Reviews are unavailable right now</div>
              <div className="rv-cr-empty-note">
                We couldn’t load reviews for {courseCode}. Please try again in a moment.
              </div>
              <button
                type="button"
                className="rv-cr-retry"
                onClick={() => setReloadKey((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="rv-cr-empty" data-testid="course-reviews-empty">
              <div className="rv-cr-empty-title">No reviews yet</div>
              <div className="rv-cr-empty-note">
                Be the first — rate a faculty who taught you {courseCode}.
              </div>
            </div>
          ) : (
            <div className="rv-cr-list">
              {groups.map((group) => (
                <FacultyCard
                  key={group.facultyInitials}
                  group={group}
                  onReport={setReportReviewId}
                  onAddRating={setRateInitials}
                />
              ))}
            </div>
          )}

          <div className="shell-modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      {reportReviewId && (
        <ReportReviewModal
          reviewId={reportReviewId}
          onReported={() => notify({ kind: 'success', message: 'Report submitted — thanks' })}
          onClose={() => setReportReviewId(null)}
        />
      )}

      {rateInitials && (
        <RateFacultyModal
          courseCode={courseCode}
          semester=""
          prefillInitials={rateInitials}
          probe={() => probeExistingReview(rateInitials, courseCode, probeEnv)}
          onSubmit={(payload) =>
            submitReview(payload, {
              isKnownCode: isKnownCourseCode,
              hook: submitToProvider,
              currentUid,
            })
          }
          onSubmitted={() => {
            notify({ kind: 'success', message: 'Review submitted — thank you' });
            // Refetch so the just-added review shows in the viewer.
            setReloadKey((k) => k + 1);
          }}
          onClose={() => setRateInitials(null)}
        />
      )}
    </>
  );
}
