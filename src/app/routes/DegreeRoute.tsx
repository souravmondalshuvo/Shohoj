// src/app/routes/DegreeRoute.tsx
//
// Degree Progress on the shell (#450) — the LAST placeholder swap before
// cutover. Renders the existing DegreeTracker (calculator slice, #315)
// standalone over the shared calculator state, through a read-only
// CalculatorBridge: useInputs is live, every mutating hook is a no-op because
// the tracker itself mutates nothing.
//
// #731 adds the minor tracker below it, and with it this route's first write —
// picking a minor. That is why the state now comes from the shared
// CalculatorProvider rather than a private loadCalculatorState: a second
// reducer seeded at its own time, persisting to the same storage key, is the
// last-writer-wins bug CalculatorProvider was created to end (#586). The
// tracker's own view of the state is unchanged; it simply reads the one copy.

import { useMemo } from 'react';
import { Link } from 'react-router';

import type { SemesterSeason } from '../../core/types.ts';
import {
  CalculatorBridgeProvider,
  type CalculatorBridge,
} from '../../features/calculator/calculatorBridge.ts';
import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../../features/calculator/catalog.ts';
import { getDepartment } from '../../features/calculator/departments.ts';
import DegreeTracker from '../../features/calculator/DegreeTracker.tsx';
import MinorTracker from '../../features/calculator/MinorTracker.tsx';
import { useCalculator } from '../providers/CalculatorProvider';
import { useUniversity } from '../providers/AuthProvider';
import { CampusRequired } from '../routing/CampusRequired';

export function Component() {
  const university = useUniversity();
  const { state, dispatch } = useCalculator();

  const bridge = useMemo<CalculatorBridge | null>(
    () =>
      university === null
        ? null
        : ({
            university,
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
          } satisfies CalculatorBridge),
    [state, university],
  );

  // The tracker renders null until a department is picked — mirror that here
  // so the empty state can explain where to set things up.
  const hasTracker = getDepartment(state.currentDept) !== null;

  // Both conditions are the same one — the bridge is null exactly when the
  // campus is unknown — but naming `university` here is what lets the minor
  // tracker below read its grading scale without a non-null assertion.
  if (university === null || bridge === null) return <CampusRequired />;

  return (
    <section className="shell-page degree-page" data-testid="degree-page">
      <h1>Degree Progress</h1>
      <p className="shell-muted">
        Credits earned vs required, your pace, and an estimated graduation date — drawn from the
        same data as the <Link to="/calculator">calculator</Link>.
      </p>

      {!hasTracker ? (
        <p className="degree-empty shell-muted" data-testid="degree-empty">
          Pick your department and add semesters in the <Link to="/calculator">calculator</Link> (or
          import your transcript on the <Link to="/transcript">Transcript</Link> page) and your
          degree timeline will appear here.
        </p>
      ) : (
        <CalculatorBridgeProvider value={bridge}>
          <DegreeTracker />
        </CalculatorBridgeProvider>
      )}

      {/* The minor stands on its own: it is measured against named courses, not
          against the department's credit total, so it renders (as a picker)
          even for a student who has not set a department yet. */}
      <MinorTracker
        semesters={state.semesters}
        selected={state.currentMinor}
        onSelect={(currentMinor) => dispatch({ type: 'setMinor', currentMinor })}
        scale={university.grades}
      />
    </section>
  );
}
