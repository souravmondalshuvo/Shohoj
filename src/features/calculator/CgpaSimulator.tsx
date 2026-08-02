// src/features/calculator/CgpaSimulator.tsx
//
// The CGPA Goal Simulator on the shell /calculator route (#317), bridge-driven
// from the pure simulator model. Renders the legacy .simulator-box structure:
// target/remaining inputs (remaining auto-fills from the department
// requirement minus earned credits, respecting a manual override exactly like
// recalc()'s dataset.auto rule), the outcome cards, the Smart Retake & Repeat
// table with accessible row toggles, the stacked-impact box and the legend.
// The summary-only nudge offers both legacy actions: transcript import
// (bridge.importTranscript, #323) and "+ Add Past Semester".

import { useEffect, useRef, useState } from 'react';

import { useCalculatorBridge } from './calculatorBridge.ts';
import { getDepartment } from './departments.ts';
import { computeMilestoneLadder, type MilestoneLadder } from './milestones.ts';
import { computeCalculatorResults, formatCredits } from './results.ts';
import {
  computeRetakeCandidates,
  computeRetakeImpact,
  computeSimulation,
  gpaLetterRange,
  isSummaryOnly,
  simulatorTotals,
  type RetakeCandidate,
  type RetakeRanking,
  type SimulatorOutcome,
} from './simulator.ts';

const INSIGHT_COPY = {
  'near-perfect': (
    <>
      <span style={{ color: '#e74c3c' }}>Requires near-perfect grades every semester</span> — focus
      on strategic retakes below.
    </>
  ),
  challenging: (
    <>
      Challenging but doable —{' '}
      <span style={{ color: '#F0A500' }}>consistent B+/A- performance</span> needed across remaining
      semesters.
    </>
  ),
  realistic: (
    <>
      Very realistic — <span style={{ color: '#2ECC71' }}>avoid D/F grades</span> and stay
      consistent.
    </>
  ),
  'great-shape': (
    <>
      <span style={{ color: '#2ECC71' }}>You&apos;re in great shape!</span> Maintain current effort.
    </>
  ),
} as const;

function gradeColor(grade: string): string {
  if (grade === 'F' || grade === 'F(NT)') return '#e74c3c';
  if (grade === 'D' || grade === 'D-' || grade === 'D+') return '#e67e22';
  return '#F0A500';
}

/**
 * The goal ladder shown before a target is typed (#502).
 *
 * Curated rather than exhaustive: every tier the student has not already locked
 * in, plus the single highest one they have. Listing "Satisfactory (2.50)" as an
 * aspiration to someone at 3.80 is noise, but hiding an out-of-reach tier is the
 * omission this feature exists to fix — so unreachable rows always stay.
 */
function MilestoneLadder({ ladder }: { readonly ladder: MilestoneLadder }) {
  const firstSecured = ladder.rows.findIndex((r) => r.state === 'secured');
  const visible = firstSecured === -1 ? ladder.rows : ladder.rows.slice(0, firstSecured + 1);
  if (!visible.length) return null;

  return (
    <div className="sim-ladder" data-testid="sim-ladder">
      <div className="sim-ladder-heading">🪜 Where you can still land</div>
      <div className="sim-ladder-sub">
        Best still possible: <strong>{ladder.ceiling.toFixed(2)}</strong> · guaranteed floor:{' '}
        <strong>{ladder.floor.toFixed(2)}</strong>
      </div>
      <ul className="sim-ladder-list">
        {visible.map((row) => (
          <li key={row.tier.id} className={`sim-ladder-row sim-ladder-row--${row.state}`}>
            <span className="sim-ladder-goal">
              {row.tier.goalLabel}{' '}
              <span className="sim-ladder-thresh">({row.tier.threshold.toFixed(2)})</span>
            </span>
            <span className="sim-ladder-state">
              {row.state === 'secured' && 'Locked in'}
              {row.state === 'reachable' && row.neededGpa !== null && (
                <>
                  needs {row.neededGpa.toFixed(2)} avg{' '}
                  <span className="sim-ladder-letters">({gpaLetterRange(row.neededGpa)})</span>
                </>
              )}
              {row.state === 'out-of-reach' && 'Out of reach'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeCard({ outcome }: { readonly outcome: SimulatorOutcome }) {
  switch (outcome.kind) {
    case 'prompt':
      return (
        <span style={{ color: 'var(--text3)', fontSize: 13 }}>
          Enter your target CGPA and remaining credits above to see what you need.
        </span>
      );
    case 'invalid-target':
      return <span className="warn">Target CGPA must be between 0.0 and 4.0.</span>;
    case 'invalid-remaining':
      return <span className="warn">Remaining credits cannot be negative.</span>;
    case 'secured':
      return (
        <div className="sim-result-card">
          <div className="sim-callout sim-callout--good">
            <div className="sim-callout-title">🎉 Target already secured</div>
            <div className="sim-callout-body">
              You have no remaining credits left, and your current CGPA{' '}
              <strong>{outcome.cgpa.toFixed(2)}</strong> already meets the target of{' '}
              <strong>{outcome.target.toFixed(2)}</strong>.
            </div>
          </div>
        </div>
      );
    case 'no-credits':
      return (
        <div className="sim-result-card">
          <div className="sim-callout sim-callout--bad">
            <div className="sim-callout-title" style={{ color: '#e74c3c' }}>
              ⛔ No remaining credits
            </div>
            <div className="sim-callout-body">
              You have no remaining credits left, so you cannot raise your CGPA to{' '}
              <strong>{outcome.target.toFixed(2)}</strong> through future semesters. Consider
              retakes if you want to improve beyond <strong>{outcome.cgpa.toFixed(2)}</strong>.
            </div>
          </div>
        </div>
      );
    case 'achieved':
      return (
        <div className="sim-result-card">
          <div className="sim-callout sim-callout--good">
            <div className="sim-callout-title">🎉 Already achieved!</div>
            <div className="sim-callout-body">
              Your CGPA {outcome.cgpa.toFixed(2)} already meets the target of{' '}
              {outcome.target.toFixed(2)}. Set a higher goal!
            </div>
          </div>
        </div>
      );
    case 'unreachable':
      return (
        <div className="sim-result-card">
          <div className="sim-before-after sim-before-after--bad">
            <div className="sim-ba-block">
              <div className="sim-ba-label">Current CGPA</div>
              <div className="sim-ba-val">{outcome.cgpa.toFixed(2)}</div>
            </div>
            <div className="sim-ba-arrow" style={{ color: '#e74c3c' }}>
              ✗
            </div>
            <div className="sim-ba-block">
              <div className="sim-ba-label">Your Ceiling</div>
              <div className="sim-ba-val red">{outcome.ceiling.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                with all A grades
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#e74c3c', marginBottom: 10 }}>
            ⛔ Target {outcome.target.toFixed(2)} is out of reach from {outcome.remaining} remaining
            credits. Consider lowering your goal or using strategic retakes below to raise your
            ceiling.
          </div>
        </div>
      );
    case 'plan': {
      const neededColor =
        outcome.difficulty === 'hard'
          ? '#e74c3c'
          : outcome.difficulty === 'medium'
            ? '#F0A500'
            : '#2ECC71';
      const targetColor =
        outcome.target >= 3.5 ? '#2ECC71' : outcome.target >= 3.0 ? '#F0A500' : 'var(--text)';
      const diffLabel =
        outcome.difficulty === 'hard'
          ? '🔴 Very Hard'
          : outcome.difficulty === 'medium'
            ? '🟡 Challenging'
            : '🟢 Achievable';
      return (
        <div className="sim-result-card">
          <div className="sim-before-after">
            <div className="sim-ba-left">
              <div className="sim-ba-block">
                <div className="sim-ba-label">Current CGPA</div>
                <div className="sim-ba-val">{outcome.cgpa.toFixed(2)}</div>
              </div>
              <div className="sim-ba-arrow">→</div>
              <div className="sim-ba-block">
                <div className="sim-ba-label">Target CGPA</div>
                <div className="sim-ba-val" style={{ color: targetColor }}>
                  {outcome.target.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="sim-ba-right">
              <div className="sim-ba-label">Avg GPA Needed</div>
              <div className="sim-ba-val" style={{ color: neededColor }}>
                {outcome.neededGpa.toFixed(2)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  over {outcome.remaining} credits
                </span>
                <span className="sim-ba-delta">+{outcome.delta.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="sim-difficulty-label">
              <span>{diffLabel}</span>
              <span>{outcome.neededGpa.toFixed(2)} / 4.00</span>
            </div>
            <div className="sim-difficulty-bar">
              <div
                className={`sim-difficulty-fill ${outcome.difficulty}`}
                style={{ width: `${outcome.difficultyPct}%` }}
              ></div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
            {INSIGHT_COPY[outcome.insight]}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 4 }}>
            <table
              className="sim-plan-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
            >
              <thead>
                <tr>
                  <th>cr/sem</th>
                  <th>semesters</th>
                  <th>avg grade</th>
                </tr>
              </thead>
              <tbody>
                {outcome.plans.map((plan) => (
                  <tr key={plan.creditsPerSem}>
                    <td style={{ textAlign: 'center', color: 'var(--text2)' }}>
                      {plan.creditsPerSem} cr/sem
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {plan.semesters} sem{plan.semesters !== 1 ? 's' : ''}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text2)' }}>
                      {outcome.letterRange}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }
}

function RetakeSection({
  candidates,
  selected,
  onToggle,
  impact,
  ranking,
  onRankingChange,
}: {
  readonly candidates: readonly RetakeCandidate[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly impact: ReturnType<typeof computeRetakeImpact>;
  readonly ranking: RetakeRanking;
  readonly onRankingChange: (ranking: RetakeRanking) => void;
}) {
  if (!candidates.length) return null;
  return (
    <div
      className="sim-retake-section"
      style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}
    >
      <div className="sim-retake-heading">🔁 Smart Retake &amp; Repeat Strategy</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
        {ranking === 'efficiency' ? (
          <>
            Courses ranked by CGPA gained{' '}
            <strong style={{ color: '#2ECC71' }}>per credit spent</strong>, raising to B (3.0) — the
            cheapest lift first.
          </>
        ) : (
          <>
            Courses ranked by total CGPA impact if raised to{' '}
            <strong style={{ color: '#2ECC71' }}>B (3.0)</strong>, whatever the credit cost.
          </>
        )}{' '}
        Click rows to simulate stacking improvements.
      </div>
      <div
        className="sim-retake-ranking"
        role="group"
        aria-label="Rank retake candidates by"
        style={{ display: 'flex', gap: 6, marginBottom: 10 }}
      >
        {(
          [
            ['efficiency', 'Best value'],
            ['boost', 'Biggest jump'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`sim-rank-chip${ranking === value ? ' active' : ''}`}
            aria-pressed={ranking === value}
            onClick={() => onRankingChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="sim-retake-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th></th>
              <th>Course</th>
              <th>Semester</th>
              <th>Grade → Target</th>
              <th>Type</th>
              <th>Credits</th>
              <th>CGPA (B)</th>
              <th>CGPA (A)</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const checked = selected.has(c.key);
              return (
                <tr
                  key={c.key}
                  className={checked ? 'sim-retake-row selected' : 'sim-retake-row'}
                  onClick={() => onToggle(c.key)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(c.key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Simulate improving ${c.name}`}
                    />
                  </td>
                  <td className="sim-retake-course">{c.name}</td>
                  <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
                    {c.semLabel}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: gradeColor(c.grade) }}>{c.grade}</span>
                    <span style={{ color: 'var(--text3)' }}> → </span>
                    <span style={{ fontWeight: 700, color: '#2ECC71' }}>B</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      className={`sim-strategy-badge ${c.strategy === 'repeat' ? 'repeat' : 'retake'}`}
                    >
                      {c.strategy === 'repeat' ? 'Repeat' : 'Retake'}
                    </span>
                  </td>
                  <td
                    style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}
                    title="Credits you spend to take this course again"
                  >
                    {c.credits}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#2ECC71' }}>
                    {c.cgpaIfB.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
                    {c.cgpaIfA.toFixed(2)} <span style={{ fontSize: 9 }}>(if A)</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {impact.checkedCount > 0 ? (
        <div className="sim-impact-box" data-testid="sim-impact">
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            ✅{' '}
            <strong>
              {impact.checkedCount} course{impact.checkedCount > 1 ? 's' : ''} selected
            </strong>{' '}
            — CGPA goes from <strong>{(impact.cgpaAfter - impact.cumBoost).toFixed(2)}</strong> →{' '}
            <strong style={{ fontSize: 14, color: '#2ECC71' }}>
              {impact.cgpaAfter.toFixed(2)}
            </strong>{' '}
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>
              (+{impact.cumBoost.toFixed(2)} boost if all raised to B)
            </span>
          </div>
          {impact.targetLine && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
              {impact.targetLine.kind === 'over-perfect' &&
                'Even with these improvements, reaching the target requires more than perfect grades from remaining credits.'}
              {impact.targetLine.kind === 'exceeds' &&
                "🎉 With these improvements alone, you'd already exceed your target!"}
              {impact.targetLine.kind === 'need' && (
                <>
                  After these improvements, you&apos;d need avg GPA{' '}
                  <strong
                    style={{ color: impact.targetLine.neededGpa >= 3.5 ? '#F0A500' : '#2ECC71' }}
                  >
                    {impact.targetLine.neededGpa.toFixed(2)}
                  </strong>{' '}
                  from your remaining credits to hit the target.
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          💡 Click any row to select it and see how your CGPA changes after those improvements.
        </div>
      )}

      <div className="sim-legend">
        <span>
          <span className="sim-strategy-badge retake">RETAKE</span> Re-enroll for a full semester (F
          grades, up to 2×)
        </span>
        <span>
          <span className="sim-strategy-badge repeat">REPEAT</span> Special exam, once, within 2
          semesters (below B, no grade cap)
        </span>
      </div>
    </div>
  );
}

export default function CgpaSimulator() {
  const bridge = useCalculatorBridge();
  const inputs = bridge.useInputs();
  const [target, setTarget] = useState('');
  const [remaining, setRemaining] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [ranking, setRanking] = useState<RetakeRanking>('efficiency');
  const [remainingFocused, setRemainingFocused] = useState(false);
  const lastAuto = useRef('');

  // recalc() parity: auto-fill remaining credits from the department
  // requirement minus earned — but never while the field is focused, and never
  // over a manually-typed value (the legacy dataset.auto + activeElement rule).
  const results = computeCalculatorResults(inputs);
  const dept = getDepartment(inputs.currentDept);
  const auto =
    dept && dept.totalCredits > 0
      ? formatCredits(Math.max(0, dept.totalCredits - results.earnedCredits))
      : null;
  useEffect(() => {
    if (auto === null || remainingFocused) return;
    setRemaining((current) => {
      const wasAuto = current === '' || current === lastAuto.current;
      lastAuto.current = auto;
      return wasAuto ? auto : current;
    });
  }, [auto, remainingFocused]);

  const totals = simulatorTotals(inputs);
  const outcome = computeSimulation(totals, target, remaining);
  const summaryOnly = isSummaryOnly(inputs.semesters);
  const candidates =
    outcome.kind === 'prompt' || summaryOnly
      ? []
      : computeRetakeCandidates(inputs, totals, ranking);
  const impact = computeRetakeImpact(candidates, selected, totals, target, remaining);

  // The ladder answers "what can I still reach", which is only a useful lead-in
  // before a target is named. Once one is, the plan below answers it directly.
  const remainingNum = parseFloat(remaining);
  const ladder =
    outcome.kind === 'prompt' && !summaryOnly && totals.cgpa !== null && !Number.isNaN(remainingNum)
      ? computeMilestoneLadder({
          points: totals.points,
          cgpaCredits: totals.cgpaCredits,
          remaining: remainingNum,
        })
      : null;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="simulator-box lg-panel" data-testid="cgpa-simulator">
      <div className="lg-shine"></div>
      <h4>🎯 CGPA Goal Simulator</h4>
      <div className="simulator-row">
        <label>
          Target CGPA:
          <input
            type="number"
            min={0}
            max={4}
            step={0.01}
            placeholder="e.g. 3.50"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label>
          Credits remaining:
          <input
            type="number"
            min={0}
            max={250}
            placeholder="e.g. 97"
            value={remaining}
            onChange={(e) => setRemaining(e.target.value)}
            onFocus={() => setRemainingFocused(true)}
            onBlur={() => setRemainingFocused(false)}
          />
        </label>
      </div>
      <div className="simulator-result">
        <OutcomeCard outcome={outcome} />
        {ladder && <MilestoneLadder ladder={ladder} />}
        {outcome.kind !== 'prompt' &&
          outcome.kind !== 'invalid-target' &&
          outcome.kind !== 'invalid-remaining' &&
          (summaryOnly ? (
            <div className="sim-nudge" data-testid="sim-nudge">
              <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  Unlock full potential
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  You&apos;re using a CGPA summary — great for quick tracking! To unlock{' '}
                  <strong>Smart Retake &amp; Repeat Strategy</strong>, add your past semester
                  courses with grades.
                </div>
                <button
                  type="button"
                  className="sim-nudge-btn"
                  onClick={() => bridge.importTranscript()}
                >
                  📄 Import Transcript
                </button>{' '}
                <button
                  type="button"
                  className="sim-nudge-btn"
                  onClick={() => bridge.addSemester()}
                >
                  + Add Past Semester
                </button>
              </div>
            </div>
          ) : (
            <RetakeSection
              candidates={candidates}
              selected={selected}
              onToggle={toggle}
              impact={impact}
              ranking={ranking}
              onRankingChange={setRanking}
            />
          ))}
      </div>
    </div>
  );
}
