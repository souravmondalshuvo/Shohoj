// src/features/calculator/CourseReviewsModal.tsx
//
// Read-only course-reviews viewer on the shell (#343, Phase 5G slice d3c-i),
// the React port of js/ui/reviews.js openCourseReviewsPanel. Opened from the
// planner ⭐, it fetches a course's reviews through the resolved repo
// (FacultyReviewsProvider) and shows one card per faculty — initials, review
// count, overall score, the five dimension averages, and up to two latest
// snippets (the pure courseReviews model). Loading and empty states included.
// Deferred (documented): the card's "+ Add your rating" and per-review Report.

import { useEffect, useRef, useState } from 'react';

import { Button } from '../../shared/ui/Button';
import { buildCourseReviewGroups, type CourseReviewGroup } from './courseReviews';
import { useFetchReviewsByCourse } from './FacultyReviewsProvider';

export interface CourseReviewsModalProps {
  readonly courseCode: string;
  readonly courseName?: string;
  readonly onClose: () => void;
}

const DIMENSIONS: readonly { readonly key: 'teaching' | 'marking' | 'behavior' | 'difficulty' | 'workload'; readonly label: string }[] = [
  { key: 'teaching', label: 'Teach' },
  { key: 'marking', label: 'Marks' },
  { key: 'behavior', label: 'Behav' },
  { key: 'difficulty', label: 'Diff' },
  { key: 'workload', label: 'Work' },
];

const fmt = (value: number | null) => (value !== null ? value.toFixed(1) : '—');

function FacultyCard({ group }: { readonly group: CourseReviewGroup }) {
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
          {group.snippets.map((text, i) => (
            <p key={i} className="rv-cr-snippet">
              {text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CourseReviewsModal({ courseCode, courseName, onClose }: CourseReviewsModalProps) {
  const fetchByCourse = useFetchReviewsByCourse();
  // undefined = loading; [] = none; groups = cards.
  const [groups, setGroups] = useState<CourseReviewGroup[] | undefined>(undefined);

  // Fetch once on open. fetchByCourse is recreated on provider bumps, so read it
  // through a ref and key the effect on the (stable) course code.
  const fetchRef = useRef(fetchByCourse);
  fetchRef.current = fetchByCourse;
  useEffect(() => {
    let live = true;
    fetchRef
      .current(courseCode)
      .then((reviews) => {
        if (live) setGroups(buildCourseReviewGroups(reviews));
      })
      .catch(() => {
        if (live) setGroups([]);
      });
    return () => {
      live = false;
    };
  }, [courseCode]);

  return (
    <div
      className="shell-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
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
              <FacultyCard key={group.facultyInitials} group={group} />
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
  );
}
