// src/react/CgpaCreditTotals.tsx
//
// Vite-only React island for the calculator footer credit totals. It shares the
// same vanilla state bridge and typed GPA core as CgpaSummary, while build3.py
// keeps using the existing recalc() DOM writes.

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
    __SHOHOJ_REACT_CREDIT_TOTALS__?: boolean;
  }
}

type CreditMetric = 'attempted' | 'earned';

function formatCredits(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function computeCreditTotals(): Record<CreditMetric, string> {
  const inputs = window._shohoj_getCgpaInputs?.();
  if (!inputs) return { attempted: '0', earned: '0' };

  const totals = calculateCgpaTotals(inputs.semesters, {
    startSeason: inputs.startSeason,
    startYear: inputs.startYear,
    includeRunning: true,
    includeSummary: true,
  });

  return {
    attempted: formatCredits(totals.attemptedCredits),
    earned: formatCredits(totals.earnedCredits),
  };
}

interface CgpaCreditTotalProps {
  metric: CreditMetric;
}

export default function CgpaCreditTotal({ metric }: CgpaCreditTotalProps) {
  const [totals, setTotals] = useState(computeCreditTotals);

  const refresh = useCallback(() => setTotals(computeCreditTotals()), []);

  useEffect(() => {
    refresh();
    window.addEventListener('shohoj:recalc', refresh);
    return () => window.removeEventListener('shohoj:recalc', refresh);
  }, [refresh]);

  return totals[metric];
}
