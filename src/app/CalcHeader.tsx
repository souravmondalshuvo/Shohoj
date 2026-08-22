// src/app/CalcHeader.tsx
//
// Legacy's `.calc-header` (index.html:277), rendered above the tab bar so it is
// on screen on every route — the setup wizard on the left, the live CGPA on the
// right. The shell had none of it: measured on /routine against legacy's
// #calculator/routine, legacy showed an 839x137 header with a live .cgpa-val
// and the shell showed nothing at all (#586).
//
// The classes are legacy's, from css/style.css: .calc-header/.calc-header-left,
// the .setup-wizard step rail (1853-1913), .start-form-select and
// .start-form-confirm (5751-5789), .dept-credits-badge (5790) and .cgpa-display.
// Nothing new is invented here — the previous route-local block used
// `.calc-setup*` names that exist nowhere in that stylesheet.

import { useCalculator } from './providers/CalculatorProvider';
import { useUniversity } from './providers/AuthProvider';
import {
  DEPARTMENT_LIST,
  deptSeasonsFor,
  getDepartment,
} from '../features/calculator/departments.ts';
import { computeCalculatorResults } from '../features/calculator/results.ts';
import {
  countSemesters,
  generateSemesterNames,
  getLastCompletedSemester,
} from '../core/helpers.ts';
import { gpaBadgeColors } from '../features/calculator/colors.ts';
import type { SemesterSeason } from '../core/types.ts';

/** Announced-but-unbuilt programs, carried as disabled options exactly as
 * legacy hardcodes them. The en-spaces around the dash are legacy's. */
const COMING_SOON = [
  {
    code: 'AELS',
    label: 'B.A. in Applied English Language Studies (AELS)\u2002—\u2002Coming Soon',
  },
  { code: 'BDM', label: 'Bachelor of Disaster Management (BDM)\u2002—\u2002Coming Soon' },
] as const;

/** Selectable start years: 2020 (legacy's floor) through next year. */
function startYearOptions(now: Date): string[] {
  const years: string[] = [];
  for (let year = now.getFullYear() + 1; year >= 2020; year--) years.push(String(year));
  return years;
}

export function CalcHeader() {
  const { state, dispatch } = useCalculator();
  const university = useUniversity();

  const dept = getDepartment(state.currentDept);
  const seasons = deptSeasonsFor(state.currentDept);

  // The step rail's three states, ported from updateSetupWizard
  // (js/ui/simulator.js:45). A summary block counts as "has courses" so the
  // wizard completes for someone who imported a transcript rather than typing
  // individual courses in.
  const hasDept = !!state.currentDept;
  const hasSem = hasDept && !!state.startSeason && !!state.startYear;
  const hasCourses =
    hasSem &&
    state.semesters.some(
      (s) => s.summary || (!s.summary && s.courses.some((c) => c.name.trim() !== '')),
    );

  // onDeptSelect parity (js/ui/render.js:1099): a department carries its own
  // semester calendar, so a start season the new one does not run has to go
  // back to the placeholder rather than sit there naming a semester that will
  // never come round.
  const onDeptChange = (code: string) => {
    dispatch({ type: 'setDept', currentDept: code });
    const next = deptSeasonsFor(code) as readonly string[];
    if (state.startSeason && !next.includes(state.startSeason)) {
      dispatch({ type: 'setStart', startSeason: '', startYear: state.startYear });
    }
  };

  // "Let's go →", ported from onStartSemConfirm (js/ui/render.js:1132): work out
  // how many semesters have elapsed between the chosen start and the last
  // completed one, and open that many, named on the department's calendar.
  //
  // Legacy also prefills each one from the department's course presets, and
  // clears whatever was there first. Neither is done here: the presets are not
  // carried on the shell's typed DepartmentInfo yet, and wiping a student's
  // existing semesters behind a button labelled "Let's go" is not a thing to
  // port on a guess. Seeding is therefore skipped when semesters already exist.
  const seedSemesters = () => {
    if (!hasSem || state.semesters.length > 0) return;
    const last = getLastCompletedSemester(seasons);
    const count = countSemesters(
      state.startSeason,
      state.startYear,
      last.season,
      last.year,
      seasons,
    );
    if (count <= 0) return;
    for (const name of generateSemesterNames(state.startSeason, state.startYear, count, seasons)) {
      dispatch({ type: 'addSemester', name });
    }
  };

  const numClass = (done: boolean, active: boolean) =>
    `setup-step-num ${done ? 'done' : active ? 'active' : ''}`.trimEnd();
  const indClass = (done: boolean, active: boolean) =>
    `setup-step-indicator ${done ? 'step-done' : active ? 'step-active' : ''}`.trimEnd();

  const results =
    university === null
      ? null
      : computeCalculatorResults(
          {
            semesters: state.semesters,
            startSeason: state.startSeason as SemesterSeason | '',
            startYear: state.startYear,
          },
          university,
        );

  return (
    <div className="calc-header lg-panel">
      <div className="lg-shine" />
      <div className="calc-header-left">
        <h3>CGPA Calculator</h3>

        {/* Legacy dims the rail once the wizard is complete rather than
            removing it, so the layout below never shifts. */}
        <div className="setup-wizard" style={{ opacity: hasCourses ? 0.4 : 1 }}>
          <div className="setup-step">
            <div className={indClass(hasDept, !hasDept)}>
              <span className={numClass(hasDept, !hasDept)}>1</span>
              <span className="setup-step-label">Department</span>
            </div>
            <div className={indClass(hasSem, hasDept && !hasSem)}>
              <span className={numClass(hasSem, hasDept && !hasSem)}>2</span>
              <span className="setup-step-label">Start Semester</span>
            </div>
            <div className={indClass(hasCourses, hasSem && !hasCourses)}>
              <span className={numClass(hasCourses, hasSem && !hasCourses)}>3</span>
              <span className="setup-step-label">Add Courses</span>
            </div>
          </div>
        </div>

        <div
          data-testid="calculator-setup"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}
        >
          {/* Step 1: department */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* The ids are load bearing, not decoration. css/style.css narrows
                this header for small screens by ID — #deptSelect (970, 996),
                #deptCredits (971, 2467) and #startSemRow (972-974) — so without
                them the dept select keeps its 417px desktop width inside a
                311px mobile column and the whole header stops matching. */}
            <select
              id="deptSelect"
              className="start-form-select start-form-select--dept"
              aria-label="Select your department"
              value={dept?.code ?? ''}
              onChange={(e) => onDeptChange(e.target.value)}
            >
              <option value="" disabled>
                — Select your department —
              </option>
              {DEPARTMENT_LIST.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
              {/* Legacy's two placeholders (index.html:320). They are markup, not
                  data — js/core/departments.js has no entry for either, so the
                  typed DEPARTMENT_LIST correctly has 17 where the legacy select
                  shows 19. Disabled and unselectable, but they are the widest
                  options in the list, and a <select> sized by its content is
                  60px narrower without them. */}
              {COMING_SOON.map((d) => (
                <option key={d.code} value={d.code} disabled>
                  {d.label}
                </option>
              ))}
            </select>
            <div id="deptCredits" className={`dept-credits-badge${dept ? ' is-visible' : ''}`}>
              <svg
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
                style={{ flexShrink: 0, opacity: 0.85 }}
                aria-hidden="true"
              >
                <circle cx="6" cy="6" r="5" stroke="#2ECC71" strokeWidth="1.5" />
                <path
                  d="M6 3.5v3M6 8v.8"
                  stroke="#2ECC71"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="dept-credits-text">{dept?.totalCredits ?? 136} Total Credits</span>
            </div>
          </div>

          {/* Step 2: starting semester — legacy keeps the row in the DOM and
              flips display once a department is chosen. */}
          <div
            id="startSemRow"
            style={{
              display: hasDept ? 'flex' : 'none',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <select
              className="start-form-select"
              aria-label="Starting semester season"
              value={
                (seasons as readonly string[]).includes(state.startSeason) ? state.startSeason : ''
              }
              onChange={(e) =>
                dispatch({
                  type: 'setStart',
                  startSeason: e.target.value,
                  startYear: state.startYear,
                })
              }
            >
              <option value="" disabled>
                — Season —
              </option>
              {seasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
            <select
              className="start-form-select"
              aria-label="Starting semester year"
              value={state.startYear}
              onChange={(e) =>
                dispatch({
                  type: 'setStart',
                  startSeason: state.startSeason,
                  startYear: e.target.value,
                })
              }
            >
              <option value="" disabled>
                — Year —
              </option>
              {startYearOptions(new Date()).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button type="button" className="start-form-confirm" onClick={seedSemesters}>
              Let&apos;s go →
            </button>
          </div>
        </div>
      </div>

      <div className="cgpa-display">
        <div
          className="cgpa-val"
          style={{
            color:
              results === null || results.cgpa === null
                ? 'var(--text3)'
                : gpaBadgeColors(results.cgpa).color,
          }}
        >
          {results !== null && results.cgpa !== null ? results.cgpa.toFixed(2) : '—'}
        </div>
        <div className="cgpa-label">{results?.headlineLabel ?? 'Current CGPA'}</div>
      </div>
    </div>
  );
}
