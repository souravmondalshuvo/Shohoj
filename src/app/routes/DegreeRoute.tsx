// src/app/routes/DegreeRoute.tsx
//
// Degree Progress on the shell (#450) — the LAST placeholder swap before
// cutover. Renders the existing DegreeTracker (calculator slice, #315)
// standalone over the shared persisted calculator state, through a read-only
// CalculatorBridge: useInputs is live, every mutating hook is a no-op because
// nothing here mutates (editing happens on /calculator, which shares the same
// storage key).

import { useMemo } from 'react';
import { Link } from 'react-router';

import type { SemesterSeason } from '../../core/types.ts';
import {
  CalculatorBridgeProvider,
  type CalculatorBridge,
} from '../../features/calculator/calculatorBridge.ts';
import {
  loadCalculatorState,
} from '../../features/calculator/calculatorState.ts';
import {
  BRACU_COURSE_CATALOG,
  isKnownCourseCode,
} from '../../features/calculator/catalog.ts';
import { getDepartment } from '../../features/calculator/departments.ts';
import DegreeTracker from '../../features/calculator/DegreeTracker.tsx';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';

export function Component() {
  const store = useMemo(() => createBrowserStore(), []);
  const state = useMemo(() => loadCalculatorState(store).state, [store]);

  const bridge = useMemo<CalculatorBridge>(
    () => ({
      useInputs: () => ({
        semesters: state.semesters,
        startSeason: state.startSeason as SemesterSeason | '',
        startYear: state.startYear,
        currentDept: state.currentDept,
      }),
      // Read-only view: the tracker never calls these, and nothing here should.
      commit: () => {},
      isKnownCode: isKnownCourseCode,
      catalog: BRACU_COURSE_CATALOG,
      addSemester: () => {},
      addRunningSemester: () => {},
      loadDemo: () => {},
      rateForCourse: () => {},
      importTranscript: () => {},
    }),
    [state],
  );

  // The tracker renders null until a department is picked — mirror that here
  // so the empty state can explain where to set things up.
  const hasTracker = getDepartment(state.currentDept) !== null;

  return (
    <section className="shell-page degree-page" data-testid="degree-page">
      <h1>Degree Progress</h1>
      <p className="shell-muted">
        Credits earned vs required, your pace, and an estimated graduation date —
        drawn from the same data as the <Link to="/calculator">calculator</Link>.
      </p>

      {!hasTracker ? (
        <p className="degree-empty shell-muted" data-testid="degree-empty">
          Pick your department and add semesters in the{' '}
          <Link to="/calculator">calculator</Link> (or import your transcript on
          the <Link to="/transcript">Transcript</Link> page) and your degree
          timeline will appear here.
        </p>
      ) : (
        <CalculatorBridgeProvider value={bridge}>
          <DegreeTracker />
        </CalculatorBridgeProvider>
      )}
    </section>
  );
}
