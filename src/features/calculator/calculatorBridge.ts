// src/features/calculator/calculatorBridge.ts
//
// Phase 5B state bridge. The legacy calculator owns a single mutable `state`
// object (js/core/state.js) shared by every feature, and broadcasts a
// `shohoj:recalc` DOM event after each change (js/main.js). Rather than import
// that singleton — which would be a *different* instance under Vite vs the
// legacy bundle — the React islands read it through the same window bridge the
// existing CGPA islands use. This module turns that bridge into one typed,
// reactive source: a `useSyncExternalStore` hook with stable snapshots so
// reads are tear-free and re-render exactly once per recalc.
//
// Reads only for now; a typed write path (a `_shohoj_setSemesters` legacy
// setter) lands with the first island that mutates semesters.

import { useSyncExternalStore } from 'react';

import type { SemesterEntry, SemesterSeason } from '../../core/types';

export interface CalculatorInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: SemesterSeason | '';
  readonly startYear: string;
}

declare global {
  interface Window {
    _shohoj_getCgpaInputs?: () => {
      semesters: SemesterEntry[];
      startSeason: SemesterSeason | '';
      startYear: string;
    };
    _shohoj_recalc?: () => void;
  }
}

const RECALC_EVENT = 'shohoj:recalc';
const EMPTY: CalculatorInputs = { semesters: [], startSeason: '', startYear: '' };

// One cached snapshot shared by all subscribers (there is one legacy state).
// Rebuilt only on recalc events and at subscribe time, so getSnapshot returns a
// stable reference between events — required by useSyncExternalStore.
let cached: CalculatorInputs = EMPTY;
let primed = false;

function buildSnapshot(): CalculatorInputs {
  const raw = typeof window !== 'undefined' ? window._shohoj_getCgpaInputs?.() : undefined;
  if (!raw) return EMPTY;
  return {
    semesters: raw.semesters ?? [],
    startSeason: raw.startSeason ?? '',
    startYear: raw.startYear ?? '',
  };
}

/** Current typed calculator inputs. Stable between recalc events. */
export function getCalculatorSnapshot(): CalculatorInputs {
  if (!primed) {
    cached = buildSnapshot();
    primed = true;
  }
  return cached;
}

/** Subscribe to legacy recalc broadcasts; refreshes the snapshot then notifies. */
export function subscribeCalculator(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  // Refresh now in case state changed while no island was mounted.
  cached = buildSnapshot();
  primed = true;
  const handler = () => {
    cached = buildSnapshot();
    onChange();
  };
  window.addEventListener(RECALC_EVENT, handler);
  return () => window.removeEventListener(RECALC_EVENT, handler);
}

function getServerSnapshot(): CalculatorInputs {
  return EMPTY;
}

/** React hook: typed, tear-free read of the shared calculator state. */
export function useCalculatorInputs(): CalculatorInputs {
  return useSyncExternalStore(subscribeCalculator, getCalculatorSnapshot, getServerSnapshot);
}

/** Ask the legacy app to recompute + re-broadcast (after an island mutates state). */
export function requestRecalc(): void {
  if (typeof window !== 'undefined') window._shohoj_recalc?.();
}
