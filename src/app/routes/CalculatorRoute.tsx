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
//
// Add-semester controls (#307): footer buttons add completed/running semesters
// with calendar-aware names computed at dispatch time by the pure naming module
// (the reducer stays clock-free; the clock enters only here).
//
// Demo mode (#309): Try Demo Mode replaces the state with the typed demo
// dataset, asking first through the shell confirm modal when data exists
// (parity with loadSampleData()'s confirm() guard).

import { useEffect, useMemo, useReducer, useRef } from 'react';

import type { SemesterEntry, SemesterSeason } from '../../core/types';
import CalculatorResults from '../../features/calculator/CalculatorResults.tsx';
import CalculatorSemesters from '../../features/calculator/CalculatorSemesters';
import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../../features/calculator/catalog';
import { CalculatorBridgeProvider, type CalculatorBridge } from '../../features/calculator/calculatorBridge';
import CalculatorSetup from '../../features/calculator/CalculatorSetup.tsx';
import CgpaSimulator from '../../features/calculator/CgpaSimulator.tsx';
import {
  calculatorReducer,
  loadCalculatorState,
  persistCalculatorState,
} from '../../features/calculator/calculatorState';
import { deptSeasonsFor } from '../../features/calculator/departments.ts';
import { demoCalculatorState } from '../../features/calculator/demoData.ts';
import {
  nextCompletedSemesterName,
  nextRunningSemesterName,
} from '../../features/calculator/semesterNaming.ts';
import { useConfirm } from '../providers/ModalProvider';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';
import { useNotifications } from '../../state/NotificationProvider';

export function Component() {
  // One store instance for the route's lifetime (load seed + every persist).
  const store = useMemo(() => createBrowserStore(), []);
  const confirm = useConfirm();
  const { notify } = useNotifications();

  const loaded = useMemo(() => loadCalculatorState(store), [store]);
  const [state, dispatch] = useReducer(calculatorReducer, loaded.state);

  // Persist on mutation only — skip the seed write so a corrupt raw value (which
  // the load path preserves for recovery) isn't immediately overwritten. The
  // loaded snapshot rides along so stored fields this route does not own
  // (planCourses, semesterCounter, forward-compat keys) survive each save.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    persistCalculatorState(store, state, loaded.stored);
  }, [store, state, loaded]);

  // Reducer-backed bridge. CalculatorSemesters only ever commits a fully-formed
  // semester list (it computes via the immutable mutations), so `commit` maps to
  // a 'replace' that keeps the current start season/year.
  const bridge = useMemo<CalculatorBridge>(
    () => ({
      useInputs: () => ({
        semesters: state.semesters,
        startSeason: state.startSeason as SemesterSeason | '',
        startYear: state.startYear,
        currentDept: state.currentDept,
      }),
      commit: (semesters: SemesterEntry[]) => dispatch({ type: 'replace', state: { ...state, semesters } }),
      isKnownCode: isKnownCourseCode,
      catalog: BRACU_COURSE_CATALOG,
      addSemester: () =>
        dispatch({
          type: 'addSemester',
          name: nextCompletedSemesterName(state, new Date(), deptSeasonsFor(state.currentDept)),
        }),
      addRunningSemester: () =>
        dispatch({
          type: 'addRunningSemester',
          name: nextRunningSemesterName(state, new Date(), deptSeasonsFor(state.currentDept)),
        }),
      loadDemo: () => {
        void (async () => {
          if (state.semesters.length > 0) {
            const ok = await confirm({
              title: 'Load demo data?',
              message: 'This will replace your current data with demo data.',
              confirmLabel: 'Load demo',
              danger: true,
            });
            if (!ok) return;
          }
          dispatch({ type: 'replace', state: demoCalculatorState() });
          // Same copy loadSampleData() shows via _shohoj_showToast.
          notify({ kind: 'success', message: 'Demo mode loaded. Explore CGPA, planner, and degree progress.' });
        })();
      },
      rateForCourse: () => {},
    }),
    [state, confirm, notify],
  );

  const hasSemesters = state.semesters.some(s => !s.summary);

  // Legacy onDeptSelect parity: keep the start season if the new department's
  // calendar offers it, otherwise clear it back to the placeholder.
  const onDeptChange = (code: string) => {
    dispatch({ type: 'setDept', currentDept: code });
    const seasons = deptSeasonsFor(code) as readonly string[];
    if (state.startSeason && !seasons.includes(state.startSeason)) {
      dispatch({ type: 'setStart', startSeason: '', startYear: state.startYear });
    }
  };

  return (
    <section className="shell-page">
      <h1>CGPA Calculator</h1>
      <CalculatorSetup
        currentDept={state.currentDept}
        startSeason={state.startSeason}
        startYear={state.startYear}
        onDeptChange={onDeptChange}
        onStartChange={(season, year) => dispatch({ type: 'setStart', startSeason: season, startYear: year })}
      />
      <CalculatorBridgeProvider value={bridge}>
        <div id="semestersContainer">
          <CalculatorSemesters />
        </div>
        <CalculatorResults />
        <CgpaSimulator />
        {hasSemesters && (
          <div className="calc-footer lg-panel">
            <div className="footer-btn-group">
              <button type="button" className="btn-add-semester" onClick={() => bridge.addSemester()}>
                + Add Semester
              </button>
              <button type="button" className="btn-running-sem" onClick={() => bridge.addRunningSemester()}>
                🎯 Running Semester
              </button>
            </div>
          </div>
        )}
      </CalculatorBridgeProvider>
    </section>
  );
}
