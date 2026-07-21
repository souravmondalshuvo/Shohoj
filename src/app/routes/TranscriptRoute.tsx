// src/app/routes/TranscriptRoute.tsx
//
// Academic transcript view on the shell (#445): a read-oriented, semester-by-
// semester grade table over the SAME persisted calculator state the /calculator
// route owns, plus the shared PDF import flow (TranscriptImport) so a student
// can land here, import once, and see both routes populated. Summary rows
// (bulk "current standing" entries) render as summary cards, running semesters
// are badged, and the header shows the cumulative figures from the shared
// results model.

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Link } from 'react-router';

import { gpaCoreCalcSemesterGpa } from '../../core/gpa.ts';
import type { SemesterEntry } from '../../core/types.ts';
import {
  calculatorReducer,
  loadCalculatorState,
  persistCalculatorState,
} from '../../features/calculator/calculatorState.ts';
import { BRACU_COURSE_CATALOG } from '../../features/calculator/catalog.ts';
import { computeCalculatorResults, formatCredits } from '../../features/calculator/results.ts';
import TranscriptImport, {
  type TranscriptImportHandle,
} from '../../features/calculator/TranscriptImport.tsx';
import type { SemesterSeason } from '../../core/types.ts';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';
import { useNotifications } from '../../state/NotificationProvider';

const COURSE_BY_CODE = new Map(
  BRACU_COURSE_CATALOG.map((c) => [c.code, { full: c.full, credits: c.credits }]),
);
const lookupCourse = (code: string) => COURSE_BY_CODE.get(code) ?? null;

function fmtGpa(value: number | null): string {
  return value !== null ? value.toFixed(2) : '—';
}

function SemesterCard({ semester }: { readonly semester: SemesterEntry }) {
  if (semester.summary) {
    return (
      <li className="transcript-sem transcript-sem--summary" data-testid="transcript-summary">
        <div className="transcript-sem-head">
          <span className="transcript-sem-name">Previous standing</span>
          <span className="transcript-sem-gpa">
            CGPA {semester.summaryCGPA != null ? semester.summaryCGPA.toFixed(2) : '—'}
          </span>
        </div>
        <p className="transcript-summary-meta shell-muted">
          {formatCredits(semester.summaryCredits ?? 0)} credits earned
          {semester.summarySemesters ? ` across ${semester.summarySemesters} semesters` : ''}
        </p>
      </li>
    );
  }
  const gpa = semester.running ? null : gpaCoreCalcSemesterGpa(semester);
  const credits = semester.courses.reduce(
    (sum, c) => sum + (c.credits && c.grade !== '' ? c.credits : 0),
    0,
  );
  return (
    <li className="transcript-sem" data-testid={`transcript-sem-${semester.id}`}>
      <div className="transcript-sem-head">
        <span className="transcript-sem-name">{semester.name || 'Semester'}</span>
        {semester.running ? (
          <span className="transcript-running">In progress</span>
        ) : (
          <span className="transcript-sem-gpa">GPA {fmtGpa(gpa)}</span>
        )}
        <span className="transcript-sem-credits shell-muted">{formatCredits(credits)} cr</span>
      </div>
      {semester.courses.length > 0 && (
        <div className="transcript-table-wrap">
          <table className="transcript-table">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Credits</th>
                <th scope="col">Grade</th>
              </tr>
            </thead>
            <tbody>
              {semester.courses.map((course, i) => (
                <tr key={i}>
                  <td>{course.name || '—'}</td>
                  <td>{course.credits || '—'}</td>
                  <td>{course.grade || (semester.running ? 'In progress' : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

export function Component() {
  const { notify } = useNotifications();
  const store = useMemo(() => createBrowserStore(), []);
  const loaded = useMemo(() => loadCalculatorState(store), [store]);
  const [state, dispatch] = useReducer(calculatorReducer, loaded.state);
  const importRef = useRef<TranscriptImportHandle>(null);

  // Persist on mutation only (CalculatorRoute parity — skip the seed write so a
  // corrupt raw value the load path preserved isn't immediately overwritten).
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    persistCalculatorState(store, state, loaded.stored);
  }, [store, state, loaded]);

  const results = useMemo(
    () =>
      computeCalculatorResults({
        semesters: state.semesters,
        startSeason: state.startSeason as SemesterSeason | '',
        startYear: state.startYear,
      }),
    [state],
  );

  const hasData = state.semesters.length > 0;

  return (
    <section className="shell-page transcript-page" data-testid="transcript-page">
      <h1>Transcript</h1>
      <p className="shell-muted">
        Your semesters and grades, transcript-style — imported from a CONNECT grade-sheet PDF or
        built up in the <Link to="/calculator">calculator</Link>.
      </p>

      <div className="transcript-actions">
        <button
          type="button"
          className="shell-btn shell-btn--primary"
          onClick={() => importRef.current?.open()}
          data-testid="transcript-import-btn"
        >
          Import transcript (PDF)
        </button>
      </div>

      {!hasData ? (
        <p className="transcript-empty shell-muted" data-testid="transcript-empty">
          Nothing here yet. Import your CONNECT grade sheet above, or add semesters in the{' '}
          <Link to="/calculator">calculator</Link> — both views share the same data.
        </p>
      ) : (
        <>
          <div className="transcript-stats" data-testid="transcript-stats">
            <div className="transcript-stat">
              <span className="transcript-stat-label">{results.headlineLabel}</span>
              <span className="transcript-stat-value">{fmtGpa(results.cgpa)}</span>
            </div>
            <div className="transcript-stat">
              <span className="transcript-stat-label">Credits earned</span>
              <span className="transcript-stat-value">{formatCredits(results.earnedCredits)}</span>
            </div>
            <div className="transcript-stat">
              <span className="transcript-stat-label">Credits attempted</span>
              <span className="transcript-stat-value">
                {formatCredits(results.attemptedCredits)}
              </span>
            </div>
          </div>
          <ul className="transcript-sems" data-testid="transcript-sems">
            {state.semesters.map((semester) => (
              <SemesterCard key={semester.id} semester={semester} />
            ))}
          </ul>
        </>
      )}

      <TranscriptImport
        ref={importRef}
        lookupCourse={lookupCourse}
        onImport={(imported) => {
          dispatch({ type: 'replace', state: imported });
          notify({
            kind: 'success',
            message: `Imported ${imported.semesters.length} semester${imported.semesters.length !== 1 ? 's' : ''} from your transcript.`,
          });
        }}
      />
    </section>
  );
}
