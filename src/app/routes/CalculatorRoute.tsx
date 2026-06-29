// src/app/routes/CalculatorRoute.tsx
//
// Calculator route for the React Router shell (Phase 5B). The shell has no legacy
// app, so this route owns the calculator's state itself: a useReducer over the
// pure calculatorReducer, seeded from the Phase 4 safe-persistence engine and
// written back through it on each mutation. The existing CalculatorSemesters
// component renders against that state via an injected CalculatorBridge — the
// same component the opt-in island mounts, only here the bridge is reducer-backed
// instead of window-backed.
//
// Interim: the course catalog, demo data, and rate-course modal stay on the
// legacy page for now, so the shell bridge leaves those inert (empty catalog,
// no-op demo/rate). They port in a later Phase 5 increment.

import { useEffect, useMemo, useReducer, useRef } from 'react';

import type { SemesterEntry, SemesterSeason } from '../../core/types';
import CalculatorSemesters from '../../features/calculator/CalculatorSemesters';
import { CalculatorBridgeProvider, type CalculatorBridge } from '../../features/calculator/calculatorBridge';
import {
  calculatorReducer,
  loadCalculatorState,
  persistCalculatorState,
} from '../../features/calculator/calculatorState';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';

export function Component() {
  // One store instance for the route's lifetime (load seed + every persist).
  const store = useMemo(() => createBrowserStore(), []);

  const [state, dispatch] = useReducer(calculatorReducer, undefined, () => loadCalculatorState(store).state);

  // Persist on mutation only — skip the seed write so a corrupt raw value (which
  // the load path preserves for recovery) isn't immediately overwritten.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    persistCalculatorState(store, state);
  }, [store, state]);

  // Reducer-backed bridge. CalculatorSemesters only ever commits a fully-formed
  // semester list (it computes via the immutable mutations), so `commit` maps to
  // a 'replace' that keeps the current start season/year.
  const bridge = useMemo<CalculatorBridge>(
    () => ({
      useInputs: () => ({
        semesters: state.semesters,
        startSeason: state.startSeason as SemesterSeason | '',
        startYear: state.startYear,
      }),
      commit: (semesters: SemesterEntry[]) => dispatch({ type: 'replace', state: { ...state, semesters } }),
      isKnownCode: () => false,
      catalog: [],
      addSemester: () => dispatch({ type: 'addSemester' }),
      loadDemo: () => {},
      rateForCourse: () => {},
    }),
    [state],
  );

  return (
    <section className="shell-page">
      <h1>CGPA Calculator</h1>
      <div id="semestersContainer">
        <CalculatorBridgeProvider value={bridge}>
          <CalculatorSemesters />
        </CalculatorBridgeProvider>
      </div>
    </section>
  );
}
