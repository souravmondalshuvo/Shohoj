// src/react/CgpaSummary.tsx
//
// Migration Step 4: the first React island. It owns the headline CGPA display
// (#cgpaVal value + color, .cgpa-label) inside the calculator, computing live
// from the shared vanilla state via the typed academic core
// (calculateCgpaTotals in src/core/gpa.ts) — the same call recalc() makes.
//
// Data flows in through a tiny bridge the vanilla app exposes
// (window._shohoj_getCgpaInputs); the island re-renders whenever recalc()
// dispatches the `shohoj:recalc` event. Ships only via the Vite build — the
// live build3.py bundle never sees React.

import { useCallback, useEffect, useState } from 'react';

import { calculateCgpaTotals } from '../core/gpa';
import type { SemesterEntry, SemesterSeason } from '../core/types';

interface CgpaInputs {
  semesters: SemesterEntry[];
  startSeason: SemesterSeason | '';
  startYear: string;
}

declare global {
  interface Window {
    _shohoj_getCgpaInputs?: () => CgpaInputs;
    __SHOHOJ_REACT_SUMMARY__?: boolean;
  }
}

// Mirrors the color thresholds in recalc() (js/main.js).
function cgpaColor(cgpa: number | null): string {
  if (cgpa === null) return 'var(--text3)';
  if (cgpa >= 3.5) return '#2ECC71';
  if (cgpa >= 3.0) return '#27ae60';
  if (cgpa >= 2.5) return '#F0A500';
  return '#e74c3c';
}

interface SummaryView {
  cgpa: number | null;
  label: string;
}

function computeSummary(): SummaryView {
  const inputs = window._shohoj_getCgpaInputs?.();
  if (!inputs) return { cgpa: null, label: 'Current CGPA' };

  const totals = calculateCgpaTotals(inputs.semesters, {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
    includeRunning: true,
    includeSummary: true,
  });

  const hasRunning = inputs.semesters.some(semester => semester.running);
  return {
    cgpa: totals.cgpa,
    label: hasRunning ? 'Projected CGPA' : 'Current CGPA',
  };
}

export default function CgpaSummary() {
  const [view, setView] = useState<SummaryView>(computeSummary);

  const refresh = useCallback(() => setView(computeSummary()), []);

  useEffect(() => {
    // Recompute on every vanilla recalc, and once on mount in case the app
    // finished its initial render before this island hydrated.
    refresh();
    window.addEventListener('shohoj:recalc', refresh);
    return () => window.removeEventListener('shohoj:recalc', refresh);
  }, [refresh]);

  return (
    <div data-react-cgpa>
      <div className="cgpa-val" id="cgpaVal" style={{ color: cgpaColor(view.cgpa) }}>
        {view.cgpa !== null ? view.cgpa.toFixed(2) : '—'}
      </div>
      <div className="cgpa-label">{view.label}</div>
    </div>
  );
}
