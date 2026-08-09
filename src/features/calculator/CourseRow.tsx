// src/features/calculator/CourseRow.tsx
//
// Phase 5B presentational island building block: one course row, ported from
// the template-string row in js/ui/render.js. Class names, element ids, and
// structure are preserved verbatim so the existing e2e selectors keep matching
// when this replaces the legacy renderer. It is purely presentational — all
// state lives in the shared calculator state and every interaction is a typed
// callback prop; the parent (the semesters-container island, a later increment)
// owns wiring those to the bridge. Not yet mounted into the live DOM.

import type { CourseEntry } from '../../core/types';
import { gradeLetterColor } from './colors';
import CourseNameInput from './CourseNameInput';
import type { CourseSuggestion } from './courseSearch';
import { useFacultyChipScore } from './FacultyReviewsProvider';

/** Credit values the legacy UI treats as "normal"; anything else flags a dot. */
const NORMAL_CREDITS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 6, 8, 10, 12];

export interface CourseRowFaculty {
  /** Normalized faculty initials shown on the chip. */
  readonly initials: string;
  /** Catalog course code the review is keyed to. */
  readonly courseCode: string;
}

export interface CourseRowProps {
  readonly semId: number;
  readonly index: number;
  readonly course: CourseEntry;
  /** This row's grade is superseded by a later retake/repeat. */
  readonly isRetaken?: boolean;
  /** Show the faculty chip (rated faculty known); else show the "+ Rate" pill if canRate. */
  readonly faculty?: CourseRowFaculty | null;
  /** Course is a valid, graded catalog course → reviewing is allowed. */
  readonly canRate?: boolean;
  /** Catalog list for the name autocomplete. */
  readonly catalog: readonly CourseSuggestion[];

  readonly onNamePick: (course: CourseSuggestion) => void;
  readonly onNameResolve: (course: CourseSuggestion | null, text: string) => void;
  readonly onGradePointChange: (value: string) => void;
  readonly onGradePointBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  readonly onPassFailChange: (value: string) => void;
  readonly onRate: () => void;
  readonly onRemove: () => void;

  /** Running-semester course → offer the marks tracker (#500). */
  readonly canTrackMarks?: boolean;
  readonly marksOpen?: boolean;
  readonly onToggleMarks?: () => void;
  /** The tracker itself, rendered under the row while open. */
  readonly marksPanel?: React.ReactNode;
}

export default function CourseRow({
  semId,
  index,
  course,
  isRetaken = false,
  faculty = null,
  canRate = false,
  catalog,
  onNamePick,
  onNameResolve,
  onGradePointChange,
  onGradePointBlur,
  onPassFailChange,
  onRate,
  onRemove,
  canTrackMarks = false,
  marksOpen = false,
  onToggleMarks,
  marksPanel,
}: CourseRowProps) {
  const name = course.name ?? '';
  const grade = (course.grade ?? '') as string;
  const trimmedName = name.trim();
  // A withdrawal is re-enrolled in, not sat again as a special exam, so it is
  // labelled alongside F rather than with the repeat-eligible grades.
  const supersedeLabel =
    grade === 'F' || grade === 'F(NT)' || grade === 'W' ? 'Retaken' : 'Repeated';

  const showCreditDot =
    !!trimmedName && course.credits > 0 && !NORMAL_CREDITS.includes(course.credits);
  const isPassFailSlot = course.credits === 0 && trimmedName !== '';
  const showChip = canRate && !!faculty?.initials;
  // Live aggregate score for the chip (–- until it loads / when unavailable).
  const chipScore = useFacultyChipScore(faculty?.initials ?? '', faculty?.courseCode ?? '');

  // Mirrors render.js: the gradePoint field shows NT, an explicit gradePoint,
  // the grade's default points, or empty — in that precedence.
  const gradePointValue =
    grade === 'F(NT)'
      ? 'NT'
      : course.gradePoint !== undefined && course.gradePoint !== ''
        ? String(course.gradePoint)
        : '';

  return (
    <>
      <div className={`course-row${isRetaken ? ' retaken' : ''}`}>
        <div className="course-input-wrap" style={{ position: 'relative' }}>
          <CourseNameInput
            id={`course-input-${semId}-${index}`}
            value={name}
            catalog={catalog}
            onPick={onNamePick}
            onResolve={onNameResolve}
          />
          {isRetaken && <span className="retaken-badge">{supersedeLabel}</span>}
        </div>

        <span className="credits-static-wrap">
          <span className="credits-static">{course.credits}</span>
          {showCreditDot && (
            <span className="credit-error-dot" title={`Unusual credit value: ${course.credits}`} />
          )}
        </span>

        {grade === 'W' ? (
          // There is no number to type for a withdrawal, so — as with NT — the
          // row shows the state as a badge instead of a grade-point value. Muted
          // rather than red: a W is not a failing outcome, it is an absent one.
          <span
            className="grade-w-badge"
            title="Withdrawn — counts toward attempted credits, but carries no grade point and does not affect CGPA."
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text3)',
              textAlign: 'center',
              padding: '4px 6px',
              background: 'var(--chip-hover)',
              borderRadius: 6,
              border: '1px solid var(--chip-border)',
            }}
          >
            W
          </span>
        ) : isPassFailSlot ? (
          grade === 'F(NT)' ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#e74c3c',
                textAlign: 'center',
                padding: '4px 6px',
                background: 'rgba(231,76,60,0.10)',
                borderRadius: 6,
                border: '1px solid rgba(231,76,60,0.25)',
              }}
            >
              NT
            </span>
          ) : (
            <select
              className="pf-select"
              value={grade === 'P' || grade === 'F' ? grade : ''}
              onChange={(e) => onPassFailChange(e.target.value)}
            >
              <option value="" disabled>
                Pass / Fail
              </option>
              <option value="P">P - Pass</option>
              <option value="F">F - Fail</option>
            </select>
          )
        ) : (
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0 – 4.0"
            value={gradePointValue}
            onChange={(e) => onGradePointChange(e.target.value)}
            onBlur={onGradePointBlur}
            style={{ textAlign: 'center' }}
          />
        )}

        <span
          className="grade-letter"
          id={`gl-${semId}-${index}`}
          style={{
            color: gradeLetterColor(grade),
            visibility:
              course.credits === 0 && grade !== 'P' && grade !== 'F' ? 'hidden' : undefined,
          }}
        >
          {grade || '—'}
        </span>

        <div className="course-row-actions">
          {canTrackMarks && (
            <button
              type="button"
              className={`course-marks-pill${marksOpen ? ' open' : ''}`}
              title="Track marks and see what you need on what's left"
              aria-expanded={marksOpen}
              onClick={onToggleMarks}
            >
              📊
            </button>
          )}
          {showChip ? (
            <button
              type="button"
              className="course-faculty-chip"
              data-fac={faculty.initials}
              data-ccode={faculty.courseCode}
              title={`${faculty.initials} — view or edit your review`}
              onClick={onRate}
            >
              <span className="fac-init">{faculty.initials}</span>
              <span className="fac-score" data-score>
                {chipScore}
              </span>
            </button>
          ) : (
            canRate && (
              <button
                type="button"
                className="course-rate-pill"
                title="Rate this faculty"
                onClick={onRate}
              >
                + Rate
              </button>
            )
          )}
          <button type="button" className="btn-remove-course" onClick={onRemove}>
            ×
          </button>
        </div>
      </div>
      {canTrackMarks && marksOpen && marksPanel}
    </>
  );
}
