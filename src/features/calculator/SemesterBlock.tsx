// src/features/calculator/SemesterBlock.tsx
//
// Phase 5B presentational island building block: one non-summary semester
// block, ported from js/ui/render.js. Composes CourseRow and renders the head
// badges (GPA via gpaBadgeColors, projected/incomplete/credit-warning, current/
// future) using the typed pure core. Class names, ids and structure are kept
// verbatim for e2e parity. Purely presentational — drag wiring, faculty-chip
// score fetches, and state mutation are the container island's job (a later
// increment). The summary block/form is a separate component. Not yet mounted.

import {
  gpaCoreCalcSemesterGpa as calcSemesterGpa,
  gpaCoreGetSemesterCreditWarning as getSemesterCreditWarning,
} from '../../core/gpa';
import { normalizeInitials } from '../../core/faculty';
import type { SemesterEntry } from '../../core/types';
import CourseRow from './CourseRow';
import type { CourseSuggestion } from './courseSearch';
import { gpaBadgeColors } from './colors';
import { getReviewableCourseCode } from './reviewableCourse';

export interface SemesterBlockProps {
  readonly sem: SemesterEntry;
  /** This is the real-world current semester (parent computes via findCurrentSemesterId). */
  readonly isCurrentSem?: boolean;
  /** This semester is in the future (parent computes via isFutureSemester). */
  readonly isFuture?: boolean;
  /** `${semId}-${courseIdx}` keys whose grade is superseded by a retake/repeat. */
  readonly retakenKeys: ReadonlySet<string>;
  /** Catalog membership check for rate-ability (bulk catalog data stays in JS). */
  readonly isKnownCode: (code: string) => boolean;
  /** Catalog list for the course-name autocomplete. */
  readonly catalog: readonly CourseSuggestion[];

  readonly onAddCourse: () => void;
  readonly onRemoveSemester: () => void;
  readonly onCourseNamePick: (idx: number, course: CourseSuggestion) => void;
  readonly onCourseNameResolve: (
    idx: number,
    course: CourseSuggestion | null,
    text: string,
  ) => void;
  readonly onCourseGradePointChange: (idx: number, value: string) => void;
  readonly onCourseGradePointBlur?: (idx: number, e: React.FocusEvent<HTMLInputElement>) => void;
  readonly onCoursePassFailChange: (idx: number, value: string) => void;
  readonly onRateCourse: (idx: number) => void;
  readonly onRemoveCourse: (idx: number) => void;

  /** This block is the current drag-over target (adds the .drag-over class). */
  readonly isDragOver?: boolean;
  readonly onDragStartBlock?: () => void;
  readonly onDragOverBlock?: () => void;
  readonly onDropBlock?: () => void;
  readonly onDragEndBlock?: () => void;
}

export default function SemesterBlock({
  sem,
  isCurrentSem = false,
  isFuture = false,
  retakenKeys,
  isKnownCode,
  catalog,
  onAddCourse,
  onRemoveSemester,
  onCourseNamePick,
  onCourseNameResolve,
  onCourseGradePointChange,
  onCourseGradePointBlur,
  onCoursePassFailChange,
  onRateCourse,
  onRemoveCourse,
  isDragOver = false,
  onDragStartBlock,
  onDragOverBlock,
  onDropBlock,
  onDragEndBlock,
}: SemesterBlockProps) {
  const isRunning = !!sem.running;
  const gpa = calcSemesterGpa(sem);
  const warning = getSemesterCreditWarning(sem);
  const isIncomplete = !isRunning && sem.courses.some((c) => (c.name ?? '').trim() && !c.grade);

  return (
    <div
      className={`semester-block lg-surface${isRunning ? ' semester-running' : ''}${isDragOver ? ' drag-over' : ''}`}
      id={`sem-${sem.id}`}
      draggable={!isRunning}
      onDragStart={isRunning ? undefined : onDragStartBlock}
      onDragOver={
        isRunning
          ? undefined
          : (e) => {
              e.preventDefault();
              onDragOverBlock?.();
            }
      }
      onDrop={
        isRunning
          ? undefined
          : (e) => {
              e.preventDefault();
              onDropBlock?.();
            }
      }
      onDragEnd={onDragEndBlock}
    >
      <div className="lg-shine" />
      <div className="semester-head">
        <div className="semester-head-left">
          {!isRunning && (
            <span className="drag-handle" title="Drag to reorder">
              ⠿
            </span>
          )}
          <span className="semester-label">{sem.name}</span>

          {isCurrentSem ? (
            <span
              className="semester-running-badge"
              style={{
                background: 'rgba(46,204,113,0.12)',
                color: '#2ECC71',
                borderColor: 'rgba(46,204,113,0.30)',
              }}
            >
              📍 Current
            </span>
          ) : isFuture ? (
            <span
              className="semester-running-badge"
              style={{
                background: 'rgba(86,180,233,0.10)',
                color: '#56B4E9',
                borderColor: 'rgba(86,180,233,0.25)',
              }}
            >
              🔜 Future
            </span>
          ) : null}

          {isRunning ? (
            <>
              <span className="semester-running-badge">🎯 Projected</span>
              {gpa !== null && (
                <span
                  className="semester-gpa-badge"
                  style={{
                    color: '#F0A500',
                    background: 'rgba(240,165,0,0.10)',
                    border: '1px solid rgba(240,165,0,0.25)',
                  }}
                >
                  GPA {gpa.toFixed(2)}
                </span>
              )}
            </>
          ) : (
            gpa !== null &&
            (() => {
              const { color, bg, border } = gpaBadgeColors(gpa);
              return (
                <span
                  className="semester-gpa-badge"
                  style={{ color, background: bg, border: `1px solid ${border}` }}
                >
                  GPA {gpa.toFixed(2)}
                </span>
              );
            })()
          )}

          {isIncomplete && <span className="semester-incomplete-badge">⚠ Incomplete</span>}

          {warning && (
            <span
              className={
                warning.type === 'error'
                  ? 'semester-credit-error-badge'
                  : 'semester-credit-warn-badge'
              }
            >
              {warning.msg}
            </span>
          )}
        </div>
        <div className="semester-actions">
          <button type="button" className="btn-icon danger" onClick={onRemoveSemester}>
            Remove
          </button>
        </div>
      </div>

      <div className="courses-table">
        <div className="course-row course-header">
          <span>Course</span>
          <span>Credits</span>
          <span>Grade Point</span>
          <span>Grade</span>
        </div>
        {sem.courses.map((course, i) => {
          const courseCode = getReviewableCourseCode(course.name, isKnownCode);
          const grade = (course.grade ?? '') as string;
          const canRate =
            !sem.summary &&
            !!(course.name ?? '').trim() &&
            !!grade &&
            grade !== 'I' &&
            !!courseCode;
          const facInit = normalizeInitials(course.faculty ?? '');
          return (
            <CourseRow
              key={i}
              semId={sem.id}
              index={i}
              course={course}
              isRetaken={retakenKeys.has(`${sem.id}-${i}`)}
              canRate={canRate}
              faculty={canRate && facInit ? { initials: facInit, courseCode } : null}
              catalog={catalog}
              onNamePick={(course) => onCourseNamePick(i, course)}
              onNameResolve={(course, text) => onCourseNameResolve(i, course, text)}
              onGradePointChange={(v) => onCourseGradePointChange(i, v)}
              onGradePointBlur={
                onCourseGradePointBlur ? (e) => onCourseGradePointBlur(i, e) : undefined
              }
              onPassFailChange={(v) => onCoursePassFailChange(i, v)}
              onRate={() => onRateCourse(i)}
              onRemove={() => onRemoveCourse(i)}
            />
          );
        })}
      </div>

      <div className="add-course-row">
        <button type="button" className="btn-add-course" onClick={onAddCourse}>
          + Add course
        </button>
      </div>
    </div>
  );
}
