// src/features/calculator/MinorTracker.tsx
//
// Minor progress on /degree-progress (#731), driven by the pure model in
// minorProgress.ts: the picker, a stats strip, the progress bar, then the core
// requirements as a checklist and the elective pool beneath it.
//
// The outer chrome deliberately reuses the degree tracker's own classes —
// .degree-tracker, .tracker-stats, .tracker-bar-* — rather than restating them
// under minor-* names. Those live in css/style.css, which both the shell and
// legacy load, and a parallel set of near-identical rules is exactly how the
// route-parity punch list happened. Only the requirement checklist, which the
// degree tracker has no equivalent of, brings new classes.

import { computeMinorProgress, type RequirementProgress } from './minorProgress.ts';
import { MINOR_PROGRAMS, getMinorProgram } from './minors.ts';
import { formatCredits } from './results.ts';
import type { SemesterEntry } from '../../core/types.ts';
import type { GradeScale } from '../../core/university.ts';

export interface MinorTrackerProps {
  readonly semesters: readonly SemesterEntry[];
  /** The selected minor code ('' for none). */
  readonly selected: string;
  readonly onSelect: (code: string) => void;
  readonly scale: GradeScale;
}

const STATUS_MARK: Record<RequirementProgress['status'], string> = {
  earned: '✓',
  'in-progress': '◐',
  unmet: '○',
};

function RequirementRow({ entry }: { readonly entry: RequirementProgress }) {
  const { requirement, status, match } = entry;
  // A requirement with alternatives is shown as published ("MAT223 or CSE330")
  // until one of them is taken — then it names the one that actually counted,
  // so a student can see *why* the box is ticked.
  const codeLabel = match ? match.code : requirement.codes.join(' or ');
  return (
    <li className={`minor-req minor-req--${status}`} data-testid={`minor-req-${requirement.id}`}>
      <span className="minor-req-mark" aria-hidden="true">
        {STATUS_MARK[status]}
      </span>
      <span className="minor-req-body">
        <span className="minor-req-title">
          <span className="minor-req-code">{codeLabel}</span> {requirement.title}
        </span>
        <span className="minor-req-note">
          {status === 'earned' && match
            ? `Earned · ${match.grade}`
            : status === 'in-progress'
              ? 'In progress'
              : 'Not taken'}
        </span>
      </span>
      <span className="minor-req-credits">{requirement.credits} cr</span>
    </li>
  );
}

export default function MinorTracker({ semesters, selected, onSelect, scale }: MinorTrackerProps) {
  const program = getMinorProgram(selected);
  const progress = computeMinorProgress(semesters, program, scale);

  return (
    <div className="degree-tracker minor-tracker lg-panel" data-testid="minor-tracker">
      <div className="lg-shine"></div>
      <div>
        <div className="tracker-header minor-header">
          <div>
            <h4>Minor</h4>
            <div className="tracker-subtitle">
              {progress
                ? `${progress.program.label} · ${progress.program.totalCredits} credits`
                : 'Track a minor alongside your degree.'}
            </div>
          </div>
          <div className="minor-picker">
            {/* Labelled by attribute rather than a visually-hidden span: the
                only sr-only class in the sheet is assistant-scoped, and adding
                a second copy of that rule is how the parity drift starts. */}
            <select
              className="pf-select"
              aria-label="Minor program"
              value={program ? program.code : ''}
              onChange={(e) => onSelect(e.target.value)}
              data-testid="minor-select"
            >
              <option value="">No minor</option>
              {MINOR_PROGRAMS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!progress ? (
          <p className="minor-empty shell-muted" data-testid="minor-empty">
            Pick a minor above and Shohoj will check your courses against its requirements — which
            ones you have cleared, which are in progress, and how many elective credits are left.
          </p>
        ) : (
          <>
            <div className="tracker-stats minor-stats">
              <div className="tracker-stat">
                <div className="tracker-stat-val">
                  {formatCredits(progress.creditsEarned)}
                  <span className="tracker-stat-dim"> / {progress.totalRequired}</span>
                </div>
                <div className="tracker-stat-label">Credits Earned</div>
              </div>
              <div className="tracker-stat">
                <div className="tracker-stat-val">
                  {progress.coreEarned}
                  <span className="tracker-stat-dim"> / {progress.program.core.length}</span>
                </div>
                <div className="tracker-stat-label">Core Courses</div>
              </div>
              <div className="tracker-stat">
                <div className="tracker-stat-val">
                  {formatCredits(progress.electives.creditsEarned)}
                  <span className="tracker-stat-dim"> / {progress.electives.creditsRequired}</span>
                </div>
                <div className="tracker-stat-label">Elective Credits</div>
              </div>
              <div className="tracker-stat">
                <div className="tracker-stat-val">
                  {progress.complete ? 'Done' : formatCredits(progress.creditsRemaining)}
                </div>
                <div className="tracker-stat-label">
                  {progress.complete ? 'Requirements' : 'Credits Left'}
                </div>
                {progress.creditsInProgress > 0 && (
                  <div className="tracker-stat-note">
                    {formatCredits(progress.creditsInProgress)} cr in progress
                  </div>
                )}
              </div>
            </div>

            <div className="tracker-bar-wrap">
              <div className="tracker-bar-bg">
                <div
                  className="tracker-bar-fill"
                  style={{ width: `${progress.progressPct.toFixed(1)}%` }}
                ></div>
              </div>
              <div className="tracker-bar-labels">
                <span>{progress.progressPct.toFixed(0)}% complete</span>
                <span>
                  {progress.complete
                    ? 'All requirements met'
                    : `${formatCredits(progress.creditsRemaining)} credits remaining`}
                </span>
              </div>
            </div>

            <div className="minor-section">
              <h5 className="minor-section-title">
                Core Courses
                <span className="minor-section-dim">
                  {progress.program.core.reduce((s, r) => s + r.credits, 0)} credits
                </span>
              </h5>
              <ul className="minor-req-list" data-testid="minor-core-list">
                {progress.core.map((entry) => (
                  <RequirementRow key={entry.requirement.id} entry={entry} />
                ))}
              </ul>
            </div>

            <div className="minor-section">
              <h5 className="minor-section-title">
                Elective Courses
                <span className="minor-section-dim">
                  {progress.electives.creditsRequired} credits
                </span>
              </h5>
              {progress.electives.earnedCourses.length > 0 ||
              progress.electives.inProgressCourses.length > 0 ? (
                <ul className="minor-req-list" data-testid="minor-elective-list">
                  {progress.electives.earnedCourses.map((course) => (
                    <li key={course.code} className="minor-req minor-req--earned">
                      <span className="minor-req-mark" aria-hidden="true">
                        ✓
                      </span>
                      <span className="minor-req-body">
                        <span className="minor-req-title">
                          <span className="minor-req-code">{course.code}</span> {course.title}
                        </span>
                        <span className="minor-req-note">Earned · {course.grade}</span>
                      </span>
                      <span className="minor-req-credits">{formatCredits(course.credits)} cr</span>
                    </li>
                  ))}
                  {progress.electives.inProgressCourses.map((course) => (
                    <li key={course.code} className="minor-req minor-req--in-progress">
                      <span className="minor-req-mark" aria-hidden="true">
                        ◐
                      </span>
                      <span className="minor-req-body">
                        <span className="minor-req-title">
                          <span className="minor-req-code">{course.code}</span> {course.title}
                        </span>
                        <span className="minor-req-note">In progress</span>
                      </span>
                      <span className="minor-req-credits">{formatCredits(course.credits)} cr</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="minor-elective-empty shell-muted">
                  No elective credits counted yet. Any of these will count:
                </p>
              )}
              <ul className="minor-option-list">
                {progress.program.electives.options.map((option) => (
                  <li key={option.label}>{option.label}</li>
                ))}
              </ul>
            </div>

            <p className="minor-source">
              Requirements transcribed from the {progress.program.source}. Confirm with your
              department before you plan around them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
