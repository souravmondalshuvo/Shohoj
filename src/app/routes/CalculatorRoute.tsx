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
// Phase 5C: the course catalog + isKnownCode now use the real typed BRACU
// catalogue (src/features/calculator/catalog.ts → the same data the legacy page
// ships). Demo data and the rate-course modal stay inert here (no-op) — they
// depend on legacy-only data/flows and port in a later Phase 5 increment.
//
// Phase 5D: the CGPA results section (headline, meter, standing, credit totals)
// renders below the entry UI from the same injected bridge — the shell shows
// live results with no window globals.

import { useEffect, useMemo, useReducer, useRef } from 'react';

import type { SemesterEntry, SemesterSeason } from '../../core/types';
import CalculatorResults from '../../features/calculator/CalculatorResults.tsx';
import CalculatorSemesters from '../../features/calculator/CalculatorSemesters';
import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../../features/calculator/catalog';
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
      isKnownCode: isKnownCourseCode,
      catalog: BRACU_COURSE_CATALOG,
      addSemester: () => dispatch({ type: 'addSemester' }),
      loadDemo: () => {},
      rateForCourse: () => {},
    }),
    [state],
  );

  return (
    <section className="shell-page">
      <h1>CGPA Calculator</h1>
      <CalculatorBridgeProvider value={bridge}>
        <div id="semestersContainer">
          <CalculatorSemesters />
        </div>
        <CalculatorResults />
      </CalculatorBridgeProvider>
    </section>
  );
}
