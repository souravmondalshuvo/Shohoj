// src/features/calculator/DegreeTracker.tsx
//
// Degree Progress tracker for the shell dashboard (#315), bridge-driven from
// the pure degree-progress model: stats row (credits earned / semesters done /
// pace / est. graduation), the progress bar, and the semester timeline with
// summary, completed, running, projected and graduation nodes. Markup mirrors
// the legacy renderDegreeTracker structure/classes (js/ui/tracker.js) so the
// visual system applies at cutover; colors reuse the shared gpaBadgeColors
// tiers. The clock enters only here (render time), keeping the model pure.

import { useCalculatorBridge } from './calculatorBridge.ts';
import { gpaBadgeColors } from './colors.ts';
import { computeDegreeProgress, type TrackerNode } from './degreeProgress.ts';
import { getDepartment } from './departments.ts';
import { computeCalculatorResults, formatCredits } from './results.ts';

function gpaClass(gpa: number | null): string {
  if (gpa === null) return '';
  if (gpa >= 3.5) return 'gpa-excellent';
  if (gpa >= 3.0) return 'gpa-good';
  if (gpa >= 2.5) return 'gpa-warning';
  return 'gpa-danger';
}

function SemesterNode({ node }: { readonly node: TrackerNode }) {
  const nodeClass = node.running
    ? 'tracker-node running'
    : `tracker-node completed ${gpaClass(node.gpa)}`;
  const gpaColor = node.running
    ? '#F0A500'
    : node.gpa === null
      ? 'var(--text3)'
      : gpaBadgeColors(node.gpa).color;
  return (
    <div className={nodeClass}>
      <div className="tracker-node-dot">
        <div className="tracker-node-dot-inner"></div>
      </div>
      <div className="tracker-node-card">
        <div className="tracker-node-label">{node.label}</div>
        <div className="tracker-node-gpa" style={{ color: gpaColor }}>
          {node.running ? 'In Progress' : node.gpa !== null ? node.gpa.toFixed(2) : '—'}
        </div>
        <div className="tracker-node-meta">
          {node.credits} cr · {node.courseCount} courses
        </div>
      </div>
    </div>
  );
}

export default function DegreeTracker() {
  const inputs = useCalculatorBridge().useInputs();
  const results = computeCalculatorResults(inputs);
  const progress = computeDegreeProgress(
    inputs,
    getDepartment(inputs.currentDept),
    results.earnedCredits,
    new Date(),
  );
  if (!progress) return null;

  return (
    <div className="degree-tracker lg-panel" data-testid="degree-tracker">
      <div className="lg-shine"></div>
      <div>
        <div className="tracker-stats">
          <div className="tracker-stat">
            <div className="tracker-stat-val">
              {formatCredits(progress.earned)}
              <span className="tracker-stat-dim"> / {progress.totalRequired}</span>
            </div>
            <div className="tracker-stat-label">Credits Earned</div>
          </div>
          <div className="tracker-stat">
            <div className="tracker-stat-val">{progress.totalCompletedCount}</div>
            <div className="tracker-stat-label">Semesters Done</div>
          </div>
          <div className="tracker-stat">
            <div className="tracker-stat-val">
              {formatCredits(progress.avgCredits)}
              <span className="tracker-stat-dim"> cr/sem</span>
            </div>
            <div className="tracker-stat-label">Your Pace</div>
          </div>
          <div className="tracker-stat">
            <div className="tracker-stat-val">{progress.gradEstimate}</div>
            <div className="tracker-stat-label">Est. Graduation</div>
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
            <span>{formatCredits(progress.creditsRemaining)} credits remaining</span>
          </div>
        </div>

        {/* css/style.css:1073 makes this horizontally scrollable, so it needs to
            be reachable by keyboard — a scrollable region that cannot be focused
            is unusable without a pointer (axe: scrollable-region-focusable). The
            group role plus label give the stop a meaningful announcement. */}
        <div
          className="tracker-timeline-wrap"
          tabIndex={0}
          role="group"
          aria-label="Degree timeline (scrollable)"
        >
          <div className="tracker-timeline">
            <div className="tracker-timeline-line"></div>

            {progress.summaryNode && (
              <div className="tracker-node completed">
                <div className="tracker-node-dot">
                  <div className="tracker-node-dot-inner"></div>
                </div>
                <div className="tracker-node-card">
                  <div className="tracker-node-label">Past Semesters</div>
                  <div className="tracker-node-gpa" style={{ color: '#2ECC71' }}>
                    {progress.summaryNode.cgpa.toFixed(2)}
                  </div>
                  <div className="tracker-node-meta">
                    {formatCredits(progress.summaryNode.credits)} cr
                  </div>
                </div>
              </div>
            )}

            {progress.semesters.map((node) => (
              <SemesterNode key={node.id} node={node} />
            ))}

            {progress.projectedLabels.map((label) => (
              <div key={label} className="tracker-node projected">
                <div className="tracker-node-dot">
                  <div className="tracker-node-dot-inner"></div>
                </div>
                <div className="tracker-node-card">
                  <div className="tracker-node-label">{label}</div>
                  <div className="tracker-node-gpa" style={{ color: 'var(--text3)' }}>
                    approx. {formatCredits(progress.avgCredits)} cr
                  </div>
                </div>
              </div>
            ))}

            {progress.projectedMore > 0 && (
              <div className="tracker-node projected more">
                <div className="tracker-node-dot">
                  <div className="tracker-node-dot-inner"></div>
                </div>
                <div className="tracker-node-card">
                  <div className="tracker-node-label">+{progress.projectedMore} more</div>
                </div>
              </div>
            )}

            {progress.graduation && (
              <div
                className={`tracker-node graduation${progress.graduation.complete ? ' completed' : ''}`}
              >
                <div className="tracker-node-dot">
                  <div className="tracker-node-dot-inner">🎓</div>
                </div>
                <div className="tracker-node-card">
                  <div className="tracker-node-label">Graduation</div>
                  <div className="tracker-node-gpa" style={{ color: '#2ECC71' }}>
                    {progress.graduation.complete ? 'Complete!' : progress.graduation.estimate}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
