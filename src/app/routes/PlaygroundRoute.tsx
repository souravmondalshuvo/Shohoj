// src/app/routes/PlaygroundRoute.tsx
//
// Legacy's Playground tab (#tabPlayground, index.html:509): the playground box
// with its two sub-tabs, and the CGPA Goal Simulator beneath it. The simulator
// migrated early and has been sitting on /calculator ever since, which is part
// of why that route measured 937px against legacy's 629 (#582). It comes back
// here, where legacy keeps it.
//
// Every class is legacy's — css/style.css already carries all 73 .playground-box
// and .pg-* rules — so this is a behaviour port with no new CSS. The arithmetic
// lives in src/features/calculator/playground.ts and is unit-tested; what is
// left here is selection state, which legacy keeps in a module-level mutable
// object and React keeps in the component.

import { useMemo, useRef, useState } from 'react';

import { useCalculator } from '../providers/CalculatorProvider';
import { useUniversity } from '../providers/AuthProvider';
import CampusRequired from '../routing/CampusRequired';
import CgpaSimulator from '../../features/calculator/CgpaSimulator.tsx';
import {
  CalculatorBridgeProvider,
  type CalculatorBridge,
} from '../../features/calculator/calculatorBridge.ts';
import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../../features/calculator/catalog.ts';
import { deptSeasonsFor } from '../../features/calculator/departments.ts';
import { nextCompletedSemesterName } from '../../features/calculator/semesterNaming.ts';
import TranscriptImport, {
  type TranscriptImportHandle,
} from '../../features/calculator/TranscriptImport.tsx';
import { useNotifications } from '../../state/NotificationProvider';
import { getPlannerTotals } from '../../features/calculator/plannerTotals.ts';
import {
  courseSignature,
  gradeOptions,
  gradedCourses,
  solveForCourse,
  whatIfTotals,
} from '../../features/calculator/playground.ts';
import type { PlaygroundCourse } from '../../features/calculator/playground.ts';
import type { SemesterSeason } from '../../core/types.ts';

/** Legacy's course label: the code in trailing parens, else a clipped name. */
function courseLabel(name: string): string {
  const match = name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
  if (match) return match[1];
  return name.length > 30 ? `${name.slice(0, 27)}...` : name;
}

/** Legacy's grade colour ramp (js/ui/playground.js:31). */
function gradeColor(grade: string): string {
  if (!grade) return 'var(--text3)';
  if (grade.startsWith('A')) return '#2ECC71';
  if (grade.startsWith('B')) return '#27ae60';
  if (grade.startsWith('C')) return '#F0A500';
  if (grade.startsWith('D')) return '#e67e22';
  if (grade === 'F') return '#e74c3c';
  return 'var(--text3)';
}

const COURSE_BY_CODE = new Map(
  BRACU_COURSE_CATALOG.map((c) => [c.code, { full: c.full, credits: c.credits }]),
);
const lookupCourse = (code: string) => COURSE_BY_CODE.get(code) ?? null;

const TABS = [
  { id: 'changer', label: '✏️ Grade Changer', desc: 'Change any grade, see impact' },
  { id: 'solver', label: '🎯 Reverse Solver', desc: 'What grade do I need?' },
] as const;

export function Component() {
  const { state, dispatch } = useCalculator();
  const university = useUniversity();
  const { notify } = useNotifications();
  // The simulator's empty-state nudge opens this, exactly as it does on the
  // calculator: legacy is one page, so the nudge has always opened the picker
  // where it stands rather than sending the student somewhere else.
  const transcriptImportRef = useRef<TranscriptImportHandle>(null);
  const [activeTab, setActiveTab] = useState<'changer' | 'solver'>('changer');
  // key → the pretend grade, plus the identity of the course it was chosen
  // against. Legacy keeps the same pair (pg.changes / pg.changeSources).
  const [changes, setChanges] = useState<Record<string, { grade: string; sig: string }>>({});
  const [pickCourse, setPickCourse] = useState('');
  const [pickGrade, setPickGrade] = useState('');
  const [solverKey, setSolverKey] = useState('');
  const [solverTarget, setSolverTarget] = useState('');

  const scale = university?.grades;
  const inputs = useMemo(
    () => ({
      semesters: state.semesters,
      startSeason: state.startSeason as SemesterSeason | '',
      startYear: state.startYear,
      scale,
    }),
    [state.semesters, state.startSeason, state.startYear, scale],
  );

  const courses = useMemo(() => (scale ? gradedCourses(inputs) : []), [inputs, scale]);
  const totals = useMemo(() => getPlannerTotals(inputs), [inputs]);

  // Drop a pending change once the course it named has been edited underneath
  // it (legacy's syncPlaygroundState). Derived rather than stored: recomputing
  // from the current courses cannot go stale, where an effect that prunes state
  // races the render that already used it.
  const liveChanges = useMemo(() => {
    const byKey = new Map(courses.map((c) => [c.key, c]));
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(changes)) {
      const course = byKey.get(key);
      // Both halves matter. The key going missing covers a deleted row; the
      // signature covers the row still being there with a different course in
      // it, which is the case that would otherwise re-point a pretend grade at
      // whatever now occupies that slot.
      if (course && courseSignature(course) === entry.sig) out[key] = entry.grade;
    }
    return out;
  }, [changes, courses]);

  // The simulator reads its inputs through the CalculatorBridge, which until now
  // only CalculatorRoute provided. Inputs are live off the shared provider, and
  // the two mutators its empty state actually calls are wired rather than
  // stubbed: a no-op bridge would leave "+ Add Past Semester" and "Import
  // Transcript" looking clickable and doing nothing. Transcript import lives on
  // its own route in the shell, so that button goes there.
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
            commit: () => {},
            isKnownCode: isKnownCourseCode,
            catalog: BRACU_COURSE_CATALOG,
            addSemester: () =>
              dispatch({
                type: 'addSemester',
                name: nextCompletedSemesterName(
                  state,
                  new Date(),
                  deptSeasonsFor(state.currentDept),
                ),
              }),
            addRunningSemester: () => {},
            loadDemo: () => {},
            rateForCourse: () => {},
            importTranscript: () => transcriptImportRef.current?.open(),
          } satisfies CalculatorBridge),
    [university, state, dispatch],
  );

  if (university === null || bridge === null) return <CampusRequired />;

  const whatIf = whatIfTotals(totals, courses, liveChanges, university.grades);
  const options = gradeOptions(university.grades);
  const available = courses.filter((c) => !liveChanges[c.key]);
  const hasSummaryOnly = state.semesters.some((s) => s.summary) && courses.length === 0;

  // Legacy hides the whole box until there is a CGPA to reason about
  // (js/ui/playground.js:406). The simulator stays either way — it asks about
  // credits still to come, which needs no history.
  const showBox = state.semesters.length > 0 && totals.cgpa !== null;

  const addChange = () => {
    const course = courses.find((c) => c.key === pickCourse);
    if (!course || !pickGrade) return;
    setChanges((prev) => ({
      ...prev,
      [pickCourse]: { grade: pickGrade, sig: courseSignature(course) },
    }));
    setPickCourse('');
    setPickGrade('');
  };

  const removeChange = (key: string) =>
    setChanges((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const solverCourse: PlaygroundCourse | undefined = courses.find((c) => c.key === solverKey);
  const solution = solveForCourse(
    totals,
    solverCourse,
    Number.parseFloat(solverTarget),
    university.grades,
  );

  return (
    <section className="shell-page">
      {showBox && (
        <div className="playground-box lg-panel" data-testid="playground-box">
          <div className="lg-shine" />
          <h4>🔮 CGPA Playground</h4>
          <div>
            <div className="pg-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`pg-tab${activeTab === tab.id ? ' pg-tab-active' : ''}`}
                  aria-pressed={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="pg-tab-label">{tab.label}</span>
                  <span className="pg-tab-desc">{tab.desc}</span>
                </button>
              ))}
            </div>

            <div className="pg-body">
              {hasSummaryOnly ? (
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: 'rgba(86,180,233,0.07)',
                    border: '1px solid rgba(86,180,233,0.22)',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">
                    💡
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: 5,
                      }}
                    >
                      Detailed courses needed
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                      Your current CGPA summary is being used as the baseline, but{' '}
                      <strong>Grade Changer</strong> and <strong>Reverse Solver</strong> need actual
                      past courses with grades. Import your transcript or add past semesters first.
                    </div>
                  </div>
                </div>
              ) : activeTab === 'changer' ? (
                <>
                  {whatIf.changes.length > 0 && totals.cgpa !== null && whatIf.cgpa !== null && (
                    <div className="pg-hero">
                      <div className="pg-hero-block">
                        <div className="pg-hero-label">Current</div>
                        <div className="pg-hero-val">{totals.cgpa.toFixed(2)}</div>
                      </div>
                      <div className="pg-hero-arrow">→</div>
                      <div className="pg-hero-block">
                        <div className="pg-hero-label">What-if</div>
                        <div className="pg-hero-val" style={{ color: '#F0A500' }}>
                          {whatIf.cgpa.toFixed(2)}
                        </div>
                      </div>
                      <div
                        className="pg-hero-delta"
                        style={{
                          background:
                            whatIf.delta >= 0 ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
                          color: whatIf.delta >= 0 ? '#2ECC71' : '#e74c3c',
                        }}
                      >
                        {whatIf.delta >= 0 ? '+' : ''}
                        {whatIf.delta.toFixed(2)}
                      </div>
                    </div>
                  )}

                  {whatIf.changes.length > 0 && (
                    <>
                      <div className="pg-changes-header">
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: 'var(--text3)',
                          }}
                        >
                          Changes ({whatIf.changes.length})
                        </span>
                        <button
                          type="button"
                          className="pg-clear-btn"
                          onClick={() => setChanges({})}
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="pg-changes-list">
                        {whatIf.changes.map((ch) => (
                          <div className="pg-change-row" key={ch.key}>
                            <div className="pg-change-course">
                              <strong>{courseLabel(ch.name)}</strong>
                              <span className="pg-change-meta">
                                {ch.sem} · {ch.credits} cr
                              </span>
                            </div>
                            <div className="pg-change-grades">
                              <span style={{ color: gradeColor(ch.grade) }}>{ch.grade}</span>
                              <span style={{ color: 'var(--text3)' }}>→</span>
                              <span style={{ color: gradeColor(ch.newGrade), fontWeight: 700 }}>
                                {ch.newGrade}
                              </span>
                            </div>
                            <div
                              className="pg-change-impact"
                              style={{ color: ch.impact >= 0 ? '#2ECC71' : '#e74c3c' }}
                            >
                              {ch.impact >= 0 ? '+' : ''}
                              {ch.impact.toFixed(3)}
                            </div>
                            <button
                              type="button"
                              className="pg-change-remove"
                              title="Remove"
                              aria-label={`Remove the change to ${courseLabel(ch.name)}`}
                              onClick={() => removeChange(ch.key)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {available.length > 0 ? (
                    <div className="pg-add-row">
                      <select
                        className="pg-course-select"
                        aria-label="Pick a course to change"
                        value={pickCourse}
                        onChange={(e) => setPickCourse(e.target.value)}
                      >
                        <option value="" disabled>
                          + Pick a course to change
                        </option>
                        {available.map((c) => (
                          <option key={c.key} value={c.key}>
                            {courseLabel(c.name)} ({c.grade}) — {c.sem}
                          </option>
                        ))}
                      </select>
                      <select
                        className="pg-grade-select"
                        aria-label="New grade"
                        value={pickGrade}
                        onChange={(e) => setPickGrade(e.target.value)}
                      >
                        <option value="" disabled>
                          New grade
                        </option>
                        {options.map((o) => (
                          <option key={o.grade} value={o.grade}>
                            {o.grade}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="pg-add-btn" onClick={addChange}>
                        Add
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text3)',
                        textAlign: 'center',
                        padding: 8,
                      }}
                    >
                      All courses have been modified
                    </div>
                  )}
                </>
              ) : courses.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text3)',
                    textAlign: 'center',
                    padding: 20,
                    lineHeight: 1.7,
                  }}
                >
                  Add your past semester courses with grades, or import your transcript, to use the
                  Reverse Solver.
                </div>
              ) : (
                <>
                  <div className="pg-solver-inputs">
                    <div className="pg-solver-input-group" style={{ flex: '1 1 0', minWidth: 0 }}>
                      <label className="pg-solver-label" htmlFor="pgSolverTarget">
                        Target CGPA
                      </label>
                      <input
                        id="pgSolverTarget"
                        type="number"
                        className="pg-solver-target"
                        min="0"
                        max={university.grades.max}
                        step="0.01"
                        placeholder="e.g. 3.00"
                        value={solverTarget}
                        onChange={(e) => setSolverTarget(e.target.value)}
                      />
                    </div>
                    <div className="pg-solver-input-group" style={{ flex: '1 1 0', minWidth: 0 }}>
                      <label className="pg-solver-label" htmlFor="pgSolverCourse">
                        Course
                      </label>
                      <select
                        id="pgSolverCourse"
                        className="pg-solver-course-select"
                        value={solverKey}
                        onChange={(e) => setSolverKey(e.target.value)}
                      >
                        <option value="" disabled>
                          Pick a course
                        </option>
                        {courses.map((c) => (
                          <option key={c.key} value={c.key}>
                            {courseLabel(c.name)}
                            {c.running ? ' 🟡' : ''} ({c.grade}) — {c.sem}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div data-testid="pg-solver-result">
                    {solution?.kind === 'impossible' && (
                      <div className="pg-solver-result pg-solver-impossible">
                        <div className="pg-solver-icon">⛔</div>
                        <div>
                          <div className="pg-solver-msg">
                            Not possible with{' '}
                            <strong>{courseLabel(solverCourse?.name ?? '')}</strong> alone
                          </div>
                          <div className="pg-solver-detail">
                            Even with an A ({university.grades.max.toFixed(1)}), your CGPA would be{' '}
                            <strong>{solution.bestPossible.toFixed(2)}</strong> — below your target
                            of <strong>{solution.target.toFixed(2)}</strong>. Consider retaking
                            multiple courses.
                          </div>
                        </div>
                      </div>
                    )}
                    {solution?.kind === 'reached' && (
                      <div className="pg-solver-result pg-solver-easy">
                        <div className="pg-solver-icon">🎉</div>
                        <div>
                          <div className="pg-solver-msg">
                            You&apos;ve already reached {solution.target.toFixed(2)} CGPA!
                          </div>
                          <div className="pg-solver-detail">
                            Any grade in <strong>{courseLabel(solverCourse?.name ?? '')}</strong>{' '}
                            will keep you above your target.
                          </div>
                        </div>
                      </div>
                    )}
                    {solution?.kind === 'found' && totals.cgpa !== null && (
                      <div className="pg-solver-result pg-solver-found">
                        <div className="pg-solver-answer">
                          <div className="pg-solver-answer-label">You need at least</div>
                          <div
                            className="pg-solver-answer-grade"
                            style={{ color: gradeColor(solution.grade) }}
                          >
                            {solution.grade}
                          </div>
                          <div className="pg-solver-answer-gp">({solution.gp.toFixed(1)} GP)</div>
                        </div>
                        <div className="pg-solver-explain">
                          <div>
                            in <strong>{courseLabel(solverCourse?.name ?? '')}</strong> (
                            {solverCourse?.credits} cr, currently {solverCourse?.grade})
                          </div>
                          <div style={{ marginTop: 4 }}>
                            CGPA:{' '}
                            <span style={{ color: 'var(--text3)' }}>{totals.cgpa.toFixed(2)}</span>{' '}
                            →{' '}
                            <strong style={{ color: '#2ECC71' }}>
                              {solution.newCgpa.toFixed(2)}
                            </strong>
                            <span style={{ color: '#2ECC71', fontSize: 11, marginLeft: 4 }}>
                              +{solution.delta.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <CalculatorBridgeProvider value={bridge}>
        <CgpaSimulator />
      </CalculatorBridgeProvider>
      <TranscriptImport
        ref={transcriptImportRef}
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
