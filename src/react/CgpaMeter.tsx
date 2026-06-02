// src/react/CgpaMeter.tsx
//
// Vite-only React island for the CGPA meter panel. It mirrors the meter writes
// in recalc() using the shared state bridge and typed GPA core.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { calculateCgpaTotals } from '../core/gpa';
import type { SemesterEntry, SemesterSeason } from '../core/types';

interface CgpaInputs {
  semesters: SemesterEntry[];
  startSeason: SemesterSeason | '';
  startYear: string;
}

interface MeterView {
  percent: number;
  percentLabel: string;
  status: ReactNode;
}

declare global {
  interface Window {
    _shohoj_getCgpaInputs?: () => CgpaInputs;
    __SHOHOJ_REACT_METER__?: boolean;
  }
}

function computeMeter(): MeterView {
  const inputs = window._shohoj_getCgpaInputs?.();
  if (!inputs) {
    return {
      percent: 0,
      percentLabel: '0%',
      status: 'Add your courses to get started.',
    };
  }

  const options = {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
  };
  const projectedTotals = calculateCgpaTotals(inputs.semesters, {
    ...options,
    includeRunning: true,
    includeSummary: true,
  });
  const completedTotals = calculateCgpaTotals(inputs.semesters, {
    ...options,
    includeRunning: false,
    includeSummary: true,
  });

  const cgpa = projectedTotals.cgpa;
  const completedCgpa = completedTotals.cgpa;
  const hasRunning = inputs.semesters.some(semester => semester.running);
  const percent = completedCgpa !== null ? Math.min((completedCgpa / 4) * 100, 100) : 0;

  let status: ReactNode;
  if (cgpa === null) {
    status = 'Add your courses to get started.';
  } else if (completedCgpa === null) {
    status = hasRunning ? (
      <>
        <strong>Projected only.</strong> CGPA {cgpa.toFixed(2)} is based on running courses. Add completed semesters to assess your standing.
      </>
    ) : 'Add completed graded courses to see your academic standing.';
  } else if (completedCgpa >= 3.75) {
    status = (
      <>
        <strong>Outstanding!</strong> CGPA {completedCgpa.toFixed(2)} — Dean&apos;s List territory. Keep it up.
      </>
    );
  } else if (completedCgpa >= 3.5) {
    status = (
      <>
        <strong>Excellent.</strong> CGPA {completedCgpa.toFixed(2)} — You&apos;re on track for a strong degree.
      </>
    );
  } else if (completedCgpa >= 3.0) {
    status = (
      <>
        <strong>Good standing.</strong> CGPA {completedCgpa.toFixed(2)} — Push for 3.5 and you&apos;ll stand out.
      </>
    );
  } else if (completedCgpa >= 2.5) {
    status = (
      <>
        <strong>Keep pushing.</strong> CGPA {completedCgpa.toFixed(2)} — Consider retaking weak courses for a boost.
      </>
    );
  } else {
    status = (
      <>
        <strong>Recovery mode.</strong> CGPA {cgpa.toFixed(2)} — Focus on retakes and consistent grades from here.
      </>
    );
  }

  return {
    percent,
    percentLabel: completedCgpa !== null ? `${percent.toFixed(1)}%` : '0%',
    status,
  };
}

export default function CgpaMeter() {
  const [view, setView] = useState<MeterView>(computeMeter);

  const refresh = useCallback(() => setView(computeMeter()), []);

  useEffect(() => {
    refresh();
    window.addEventListener('shohoj:recalc', refresh);
    return () => window.removeEventListener('shohoj:recalc', refresh);
  }, [refresh]);

  return (
    <>
      <div className="lg-shine"></div>
      <div className="lg-bloom"></div>
      <div className="meter-header">
        <span>CGPA Score</span>
        <span id="meterPct">{view.percentLabel}</span>
      </div>
      <div className="meter-bar-bg">
        <div className="meter-bar-fill" id="meterFill" style={{ width: `${view.percent}%` }}></div>
      </div>
      <div className="meter-labels">
        <span>0.0</span><span>1.0</span><span>2.0</span><span>3.0</span><span>4.0</span>
      </div>
      <div className="meter-status" id="meterStatus">{view.status}</div>
    </>
  );
}
