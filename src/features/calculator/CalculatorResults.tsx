// src/features/calculator/CalculatorResults.tsx
//
// Phase 5D: the composed CGPA results section — headline CGPA, incomplete
// warning, credit totals, meter, academic standing — rendered entirely from
// the pure results model over the injected CalculatorBridge, so it works on
// the React shell route (no legacy app, no window globals) and, later, as an
// island. Markup/classes mirror the legacy index.html structure so the visual
// system applies unchanged when the shell integrates the real stylesheet.
// The status/standing wording lives here (single presentation source; the
// CgpaMeter island imports meterStatusMessage from this module).
//
// #315 adds the dashboard pieces in legacy order: the degree tracker after
// the meter, the GPA trend chart after the standing box.
// Out of scope (later Phase 5 increments): simulator/playground, department
// credits-remaining.

import type { ReactNode } from 'react';

import { useCalculatorBridge } from './calculatorBridge.ts';
import DegreeTracker from './DegreeTracker.tsx';
import GpaTrendChart from './GpaTrendChart.tsx';
import { computeCalculatorResults, type MeterStatus, type StandingTier } from './results.ts';

/** The recalc() meter copy for each model status kind. */
export function meterStatusMessage(status: MeterStatus): ReactNode {
  const figure = status.cgpa !== null ? status.cgpa.toFixed(2) : '';
  switch (status.kind) {
    case 'empty':
      return 'Add your courses to get started.';
    case 'no-completed':
      return 'Add completed graded courses to see your academic standing.';
    case 'projected-only':
      return (
        <>
          <strong>Projected only.</strong> CGPA {figure} is based on running courses. Add completed
          semesters to assess your standing.
        </>
      );
    case 'outstanding':
      return (
        <>
          <strong>Outstanding!</strong> CGPA {figure} — Dean&apos;s List territory. Keep it up.
        </>
      );
    case 'excellent':
      return (
        <>
          <strong>Excellent.</strong> CGPA {figure} — You&apos;re on track for a strong degree.
        </>
      );
    case 'good':
      return (
        <>
          <strong>Good standing.</strong> CGPA {figure} — Push for 3.5 and you&apos;ll stand out.
        </>
      );
    case 'push':
      return (
        <>
          <strong>Keep pushing.</strong> CGPA {figure} — Consider retaking weak courses for a boost.
        </>
      );
    case 'recovery':
      return (
        <>
          <strong>Recovery mode.</strong> CGPA {figure} — Focus on retakes and consistent grades
          from here.
        </>
      );
  }
}

/** The recalc() standing-box copy for each model standing tier. */
export const STANDING_COPY: Record<
  StandingTier,
  { title: string; badge: string; className: string; description: string }
> = {
  perfect: {
    title: 'Perfect Standing',
    badge: '🏆',
    className: 'standing-excellent',
    description: 'Exceptional academic performance. You are at the top of your class.',
  },
  'higher-distinction': {
    title: 'Higher Distinction',
    badge: '🌟',
    className: 'standing-excellent',
    description:
      'Outstanding performance. You qualify for graduation with Higher Distinction (CGPA ≥ 3.65).',
  },
  distinction: {
    title: 'Distinction',
    badge: '⭐',
    className: 'standing-excellent',
    description:
      'Excellent academic record. You qualify for graduation with Distinction (CGPA ≥ 3.50).',
  },
  good: {
    title: 'Good Standing',
    badge: '✅',
    className: 'standing-good',
    description: 'You are in good academic standing. Keep it up!',
  },
  satisfactory: {
    title: 'Satisfactory',
    badge: '👍',
    className: 'standing-good',
    description: 'Acceptable academic performance. There is room to improve.',
  },
  'needs-improvement': {
    title: 'Needs Improvement',
    badge: '⚠️',
    className: 'standing-warning',
    description:
      'Your CGPA is below 2.50. Consistent improvement is needed to stay in good standing.',
  },
  probation: {
    title: 'Academic Probation',
    badge: '❌',
    className: 'standing-danger',
    description:
      'CGPA below 2.00 — you are on academic probation as per BRACU policy (Summer 2022+). Seek academic counselling immediately.',
  },
};

export default function CalculatorResults() {
  const bridge = useCalculatorBridge();
  const inputs = bridge.useInputs();
  const results = computeCalculatorResults(inputs, bridge.university);
  const standing = results.standing !== null ? STANDING_COPY[results.standing] : null;

  return (
    <div data-testid="calculator-results">
      {/* The CGPA readout moved to `.calc-header` (#586), where legacy keeps it:
          above the tabs, visible on every route rather than only this one. */}

      {results.incompleteSemesters > 0 && (
        <div className="incomplete-warning" role="status">
          ⚠ {results.incompleteSemesters} semester
          {results.incompleteSemesters > 1 ? 's have' : ' has'} missing grades — CGPA may be
          inaccurate
        </div>
      )}

      <div className="cgpa-meter lg-panel">
        <div className="lg-shine"></div>
        <div className="lg-bloom"></div>
        <div className="meter-header">
          <span>CGPA Score</span>
          <span>{results.meterPercentLabel}</span>
        </div>
        <div className="meter-bar-bg">
          <div className="meter-bar-fill" style={{ width: `${results.meterPercent}%` }}></div>
        </div>
        <div className="meter-labels">
          <span>0.0</span>
          <span>1.0</span>
          <span>2.0</span>
          <span>3.0</span>
          <span>4.0</span>
        </div>
        <div className="meter-status">{meterStatusMessage(results.meterStatus)}</div>
      </div>

      <DegreeTracker />

      {standing && (
        <div className={`standing-box lg-panel ${standing.className}`}>
          <div className="lg-shine"></div>
          <div className="standing-inner">
            <div className="standing-left">
              <div className="standing-label">Academic Standing</div>
              <div className="standing-title">{standing.title}</div>
              <div className="standing-desc">{standing.description}</div>
            </div>
            <div className="standing-badge">{standing.badge}</div>
          </div>
        </div>
      )}

      <GpaTrendChart />

      {/* The credit totals moved to the shell's global footer (#616), where
          legacy keeps them — below the tab bar, on screen on every route,
          rather than only on this one. */}
    </div>
  );
}
