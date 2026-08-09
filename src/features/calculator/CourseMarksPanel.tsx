// src/features/calculator/CourseMarksPanel.tsx
//
// The per-course marks tracker (#500) — the UI half of courseMarks.ts.
//
// Attaches to running-semester course rows only. Every other projection in the
// app is denominated in "GPA across N credits", which is not a lever a student
// can pull in week 9; this one is denominated in the mark on the next exam.
//
// Presentational: components come in as props and every edit is a callback. The
// arithmetic is entirely courseMarks.ts — this file decides only what to show
// and in what words.

import { useId } from 'react';

import type { CourseMarkComponent } from '../../core/types';
import { computeCourseMarks, type MarkComponent } from './courseMarks';

/** A blank row, so an empty tracker still has somewhere to type. */
export function blankMarkComponent(): CourseMarkComponent {
  return { name: '', weight: 0, score: null, outOf: 100 };
}

/** Percentages are shown to one decimal, and never as "83.0" when it is 83. */
function pct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Weight/outOf: a blank field means zero, not NaN. */
function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Score: blank means "not graded yet", which is not the same as zero. */
function toScore(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface CourseMarksPanelProps {
  readonly courseName: string;
  readonly components: readonly CourseMarkComponent[];
  readonly onChange: (next: CourseMarkComponent[]) => void;
  /** Write the pace letter onto the course so the CGPA projection picks it up. */
  readonly onApplyProjected: (letter: string) => void;
  /** The grade already on the course row, so the button can say "applied". */
  readonly currentGrade: string;
}

export default function CourseMarksPanel({
  courseName,
  components,
  onChange,
  onApplyProjected,
  currentGrade,
}: CourseMarksPanelProps) {
  const fieldId = useId();
  // An empty tracker still shows one row; it is not persisted until edited.
  const rows = components.length > 0 ? components : [blankMarkComponent()];
  const result = computeCourseMarks(rows as readonly MarkComponent[]);

  const patchRow = (index: number, patch: Partial<CourseMarkComponent>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const reachable = result?.targets.filter((t) => t.state === 'reachable') ?? [];
  const secured = result?.targets.filter((t) => t.state === 'secured') ?? [];
  const bestSecured = secured[0] ?? null;

  return (
    <div className="course-marks-panel" data-testid="course-marks-panel">
      <div className="course-marks-head">
        <span className="course-marks-title">
          Marks{courseName.trim() ? ` — ${courseName.trim()}` : ''}
        </span>
        <span className="course-marks-hint">
          Enter each graded component off your syllabus. Nothing here changes your CGPA until you
          apply a letter.
        </span>
      </div>

      <div className="course-marks-grid">
        <div className="course-marks-row course-marks-header">
          <span>Component</span>
          <span>Weight %</span>
          <span>Score</span>
          <span>Out of</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div className="course-marks-row" key={i}>
            <input
              type="text"
              className="course-marks-name"
              placeholder="Midterm"
              aria-label={`Component ${i + 1} name`}
              id={`${fieldId}-name-${i}`}
              value={row.name}
              onChange={(e) => patchRow(i, { name: e.target.value })}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="25"
              aria-label={`Component ${i + 1} weight, percent of the course`}
              value={row.weight === 0 ? '' : String(row.weight)}
              onChange={(e) => patchRow(i, { weight: toNumber(e.target.value) })}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="—"
              aria-label={`Component ${i + 1} score, blank if not graded yet`}
              value={row.score === null ? '' : String(row.score)}
              onChange={(e) => patchRow(i, { score: toScore(e.target.value) })}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="25"
              aria-label={`Component ${i + 1} total marks`}
              value={row.outOf === 0 ? '' : String(row.outOf)}
              onChange={(e) => patchRow(i, { outOf: toNumber(e.target.value) })}
            />
            <button
              type="button"
              className="btn-remove-course"
              aria-label={`Remove component ${i + 1}`}
              onClick={() => removeRow(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="add-course-row">
        <button
          type="button"
          className="btn-add-course"
          onClick={() => onChange([...rows, blankMarkComponent()])}
        >
          + Add component
        </button>
      </div>

      {result === null ? (
        <p className="course-marks-empty">
          Give at least one component a weight to see where this course stands.
        </p>
      ) : (
        <div className="course-marks-readout">
          <div className="course-marks-stats">
            <span className="course-marks-stat">
              <strong>
                {result.inHandPercent === null ? '—' : `${pct(result.inHandPercent)}%`}
              </strong>
              <small>in hand</small>
            </span>
            <span className="course-marks-stat">
              <strong>
                {result.worstLetter} → {result.bestLetter}
              </strong>
              <small>floor → ceiling</small>
            </span>
            <span className="course-marks-stat">
              <strong>{result.projectedLetter ?? '—'}</strong>
              <small>on pace for</small>
            </span>
          </div>

          {!result.weightsComplete && (
            <p className="course-marks-note">
              Weights total {pct(result.totalWeight)}%, not 100% — these figures describe the part
              of the syllabus you have entered.
            </p>
          )}

          {bestSecured && (
            <p className="course-marks-note course-marks-secured">
              <strong>{bestSecured.letter}</strong> is secured — you hold it even if everything left
              scores zero.
            </p>
          )}

          {result.remainingWeight > 0 && reachable.length > 0 && (
            <ul className="course-marks-targets">
              {reachable.map((t) => (
                <li key={t.letter}>
                  <span className="course-marks-target-letter">{t.letter}</span>
                  <span>
                    needs <strong>{pct(t.neededOnRemaining as number)}%</strong> of the remaining{' '}
                    {pct(result.remainingWeight)}%
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result.remainingWeight > 0 && reachable.length === 0 && secured.length === 0 && (
            <p className="course-marks-note">No letter above F is still reachable from here.</p>
          )}

          {result.projectedLetter && (
            <button
              type="button"
              className="btn-add-course course-marks-apply"
              onClick={() => onApplyProjected(result.projectedLetter as string)}
              disabled={currentGrade === result.projectedLetter}
            >
              {currentGrade === result.projectedLetter
                ? `${result.projectedLetter} applied to this course`
                : `Use ${result.projectedLetter} in my CGPA projection`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
