// src/app/routes/PlannerRoute.tsx
//
// The Semester Planner on the React Router shell (#327), the counterpart of
// the legacy planner tab (js/ui/planner.js) over the same typed engine
// (src/core/planner.ts). Like CalculatorRoute, the route owns the calculator
// state itself — reducer + Phase 4 persistence over the shared storage key —
// so the plan, semesters and department stay consistent across routes.
//
// Legacy parity kept: the setup / add-courses-first empty states, the stats
// strip, plan rows with missing/recommended prereq notes, the credit-total
// colour bands (9–15 target), the uniform-assumed-grade CGPA impact preview
// (over the playground totals port, NOT the export totals), prereq-chain
// trees, search + all/unlocked/locked filters with the 25-row display cap,
// and promote-to-running (validation-gated, confirm before replacing an
// existing running semester, then navigate to /calculator).
//
// The ⭐ faculty-review button opens the read-only course-reviews viewer
// (CourseReviewsModal, #343) over the typed read repo. Deferred (documented):
// the "Browse Reviews" /reviews route (d3c-ii) and the nav plan-count badge
// (shell chrome polish).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { gpaCoreGetRetakenKeys } from '../../core/gpa.ts';
import {
  plannerCoreCheckPrereqs,
  plannerCoreGetAvailableCourses,
  plannerCoreGetCompletedCodes,
  plannerCoreGetPrereqChain,
  plannerCoreProjectCgpa,
  plannerCoreValidatePlan,
  type PlannerFilterMode,
  type PrereqTreeNode,
} from '../../core/planner.ts';
import type { SemesterSeason } from '../../core/types.ts';
import {
  BRACU_COURSE_CATALOG,
  BRACU_COURSE_DB,
  BRACU_PREREQS,
} from '../../features/calculator/catalog.ts';
import { deptSeasonsFor } from '../../features/calculator/departments.ts';
import CourseReviewsModal from '../../features/calculator/CourseReviewsModal.tsx';
import { getPlannerTotals } from '../../features/calculator/plannerTotals.ts';
import { nextRunningSemesterName } from '../../features/calculator/semesterNaming.ts';
import { useConfirm } from '../providers/ModalProvider';
import { useCalculator } from '../providers/CalculatorProvider';
import { useUniversity } from '../providers/AuthProvider';
import { CampusRequired } from '../routing/CampusRequired';

const IMPACT_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D'] as const;
const DISPLAY_CAP = 25;

function TreeNode({ node, depth = 0 }: { readonly node: PrereqTreeNode; readonly depth?: number }) {
  return (
    <>
      <div
        className={`pl-tree-node${node.completed ? ' pl-tree-node--done' : ''}`}
        style={{ marginLeft: depth * 20 }}
      >
        <span className={node.completed ? 'pl-ok' : 'pl-miss'}>{node.completed ? '✓' : '✗'}</span>
        <span className="pl-code">{node.code}</span>
        <span className="pl-tree-name">{node.name}</span>
        {node.isSoft && <span className="pl-tree-soft">(recommended)</span>}
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.code} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function Component() {
  const university = useUniversity();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const { state, dispatch } = useCalculator();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<PlannerFilterMode>('all');
  const [assumedGrade, setAssumedGrade] = useState<(typeof IMPACT_GRADES)[number]>('A');
  const [viewingPrereqs, setViewingPrereqs] = useState('');
  // The course whose reviews modal is open (null = closed).
  const [reviewingCourse, setReviewingCourse] = useState<{ code: string; name: string } | null>(
    null,
  );

  const retakenKeys = useMemo(
    () =>
      gpaCoreGetRetakenKeys(state.semesters, {
        startSeason: state.startSeason as SemesterSeason | '',
        startYear: state.startYear,
      }),
    [state.semesters, state.startSeason, state.startYear],
  );

  const engineInput = useMemo(
    () => ({
      semesters: state.semesters,
      allCourses: BRACU_COURSE_CATALOG,
      courseCatalog: BRACU_COURSE_DB,
      prerequisites: BRACU_PREREQS,
      planCourses: state.planCourses,
      currentDept: state.currentDept || '',
      retakenKeys,
    }),
    [state.semesters, state.planCourses, state.currentDept, retakenKeys],
  );

  const completed = useMemo(
    () => plannerCoreGetCompletedCodes(state.semesters, retakenKeys),
    [state.semesters, retakenKeys],
  );
  const validation = useMemo(() => plannerCoreValidatePlan(engineInput), [engineInput]);
  const available = useMemo(() => plannerCoreGetAvailableCourses(engineInput), [engineInput]);

  // ── Empty states (legacy renderPlanner order) ──────────────────────────
  if (!state.currentDept && !state.semesters.length) {
    return (
      <section className="shell-page" data-testid="planner-page">
        {/* Legacy's setup prompt replaces the panel and carries no heading
            (js/ui/planner.js:270-276) — the shell restated the same icon, title
            and copy under .pl-empty* names and added an <h1> on top, which is
            the rename #600 lists for this route. The heading stays on the
            loaded view below, where the shell's routing needs one. */}
        <div className="planner-coming-soon">
          <div className="planner-coming-soon-icon">📅</div>
          <div className="planner-coming-soon-title">Set up your department first</div>
          <div className="planner-coming-soon-desc">
            Select your department and add your completed courses in the Calculator tab to start
            planning your next semester.
          </div>
        </div>
      </section>
    );
  }

  const hasAnyCourses = state.semesters.some(
    (s) => !s.summary && s.courses.some((c) => c.name.trim()),
  );
  if (!hasAnyCourses) {
    const hasSummary = state.semesters.some((s) => s.summary);
    return (
      <section className="shell-page" data-testid="planner-page">
        <div className="planner-coming-soon">
          <div className="planner-coming-soon-icon">📅</div>
          <div className="planner-coming-soon-title">
            {hasSummary ? 'Add completed courses first' : 'Add your courses first'}
          </div>
          <div className="planner-coming-soon-desc">
            {hasSummary
              ? 'Your CGPA summary helps with totals, but the planner needs actual completed courses to check prerequisites. Import your transcript or add past courses in the Calculator tab first.'
              : 'Import your transcript or add courses in the Calculator tab so the planner can check prerequisites and suggest what you can take next.'}
          </div>
        </div>
      </section>
    );
  }

  // ── Search + filter (legacy UI-side rules, incl. the display cap) ──────
  const query = searchQuery.toLowerCase();
  let filtered = query
    ? available.filter(
        (c) => c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query),
      )
    : available;
  if (filterMode === 'unlocked') filtered = filtered.filter((c) => c.canTake);
  else if (filterMode === 'locked') filtered = filtered.filter((c) => !c.canTake);
  const displayCourses = filtered.slice(0, DISPLAY_CAP);
  const hasMore = filtered.length > DISPLAY_CAP;

  const unlockedCount = available.filter((c) => c.canTake && c.isRelevant).length;
  const lockedCount = available.filter((c) => !c.canTake && c.isRelevant).length;
  const prereqCoverage = Object.keys(BRACU_PREREQS).length;

  // Every hook has run by here — see CalculatorRoute for why the guard is not
  // at the top of the component.
  if (university === null) return <CampusRequired />;

  const totals = getPlannerTotals({
    semesters: state.semesters,
    startSeason: state.startSeason as SemesterSeason | '',
    startYear: state.startYear,
    scale: university.grades,
  });
  const projection = plannerCoreProjectCgpa(
    totals.pts,
    totals.cr,
    validation.totalCredits,
    assumedGrade,
  );

  const hasRunning = state.semesters.some((s) => s.running);
  const canPromote = validation.issues.length === 0;

  const promote = async () => {
    if (state.planCourses.length === 0 || !canPromote) return;
    const prefill = state.planCourses
      .map((code) => {
        const c = BRACU_COURSE_DB[code];
        if (!c) return null;
        return {
          name: `${c.name} (${c.code})`,
          credits: c.credits ?? 0,
          grade: '',
          gradePoint: '',
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (prefill.length === 0) return;

    if (hasRunning) {
      const ok = await confirm({
        title: 'Replace the running semester?',
        message:
          'You already have a running semester in the Calculator. Replace it with this plan? The existing running semester will be removed.',
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }

    dispatch({
      type: 'promotePlan',
      name: nextRunningSemesterName(state, new Date(), deptSeasonsFor(state.currentDept)),
      courses: prefill,
    });
    void navigate('/calculator');
  };

  const creditTone =
    validation.totalCredits > 15 || (validation.totalCredits > 0 && validation.totalCredits < 9)
      ? 'bad'
      : validation.totalCredits > 12
        ? 'warn'
        : 'good';

  const tree = viewingPrereqs
    ? plannerCoreGetPrereqChain(viewingPrereqs, completed, BRACU_COURSE_DB, BRACU_PREREQS)
    : null;

  return (
    <section className="shell-page" data-testid="planner-page">
      <h1>Semester Planner</h1>

      <div className="pl-stats" data-testid="planner-stats">
        <div className="pl-stat pl-stat--green">
          <div className="pl-stat-val">{completed.size}</div>
          <div className="pl-stat-label">Passed</div>
        </div>
        <div className="pl-stat pl-stat--green">
          <div className="pl-stat-val">{unlockedCount}</div>
          <div className="pl-stat-label">Unlocked</div>
        </div>
        <div className="pl-stat pl-stat--red">
          <div className="pl-stat-val">{lockedCount}</div>
          <div className="pl-stat-label">Locked</div>
        </div>
        <div className="pl-stat pl-stat--blue">
          <div className="pl-stat-val">{prereqCoverage}</div>
          <div className="pl-stat-label">Prereqs</div>
        </div>
      </div>

      {state.planCourses.length > 0 && (
        <div className="pl-plan" data-testid="planner-plan">
          <div className="pl-section-head">
            <span className="pl-section-title">
              Your plan ({state.planCourses.length} course
              {state.planCourses.length !== 1 ? 's' : ''})
            </span>
            <button
              type="button"
              className="pl-link-btn"
              onClick={() => dispatch({ type: 'clearPlan' })}
            >
              Clear all
            </button>
          </div>
          {state.planCourses.map((code) => {
            const c = BRACU_COURSE_DB[code];
            if (!c) return null;
            const check = plannerCoreCheckPrereqs(code, completed, BRACU_PREREQS);
            return (
              <div key={code} className="pl-plan-row">
                <span className={check.canTake ? 'pl-ok' : 'pl-miss'}>
                  {check.canTake ? '✓' : '✗'}
                </span>
                <div className="pl-plan-row-main">
                  <div className="pl-plan-row-name">
                    <span className="pl-code">{c.code}</span>
                    <span className="pl-name">{c.name}</span>
                  </div>
                  {!check.canTake ? (
                    <div className="pl-warn-hard">Missing: {check.missingHp.join(', ')}</div>
                  ) : (
                    check.missingSp.length > 0 && (
                      <div className="pl-warn-soft">Recommended: {check.missingSp.join(', ')}</div>
                    )
                  )}
                </div>
                <span className="pl-credits">{c.credits} cr</span>
                <button
                  type="button"
                  className="pl-icon-btn pl-reviews"
                  title="See faculty reviews for this course"
                  onClick={() => setReviewingCourse({ code: c.code, name: c.name })}
                >
                  ⭐
                </button>
                <button
                  type="button"
                  className="pl-icon-btn"
                  title="View prerequisites"
                  onClick={() => setViewingPrereqs(viewingPrereqs === code ? '' : code)}
                >
                  🔗
                </button>
                <button
                  type="button"
                  className="pl-icon-btn pl-remove"
                  title="Remove"
                  onClick={() => dispatch({ type: 'removePlanCourse', code })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div className="pl-credit-total">
            <span className={`pl-credit-total-val pl-credit--${creditTone}`}>
              {validation.totalCredits} credits
            </span>
            <span className="pl-credit-target">Target: 9–15 credits</span>
          </div>

          {validation.totalCredits > 0 && projection.projected !== null && (
            <div className="pl-impact" data-testid="planner-impact">
              <div className="pl-impact-left">
                <span>If all planned courses earn</span>
                <select
                  aria-label="Assumed grade for all planned courses"
                  value={assumedGrade}
                  onChange={(e) =>
                    setAssumedGrade(e.target.value as (typeof IMPACT_GRADES)[number])
                  }
                >
                  {IMPACT_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pl-impact-right">
                <span className="pl-impact-label">CGPA</span>
                <span className="pl-impact-current">
                  {projection.current !== null ? projection.current.toFixed(2) : '—'}
                </span>
                <span className="pl-impact-label">→</span>
                <span className="pl-impact-projected">{projection.projected.toFixed(2)}</span>
                {projection.delta !== null && (
                  <span
                    className={
                      projection.delta > 0.005
                        ? 'pl-delta-up'
                        : projection.delta < -0.005
                          ? 'pl-delta-down'
                          : 'pl-delta-flat'
                    }
                  >
                    {projection.delta >= 0 ? '+' : ''}
                    {projection.delta.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            className="pl-promote"
            disabled={!canPromote}
            title={
              canPromote
                ? 'Move this plan into a running semester in the Calculator'
                : 'Fix plan issues first'
            }
            onClick={() => void promote()}
          >
            📍 {hasRunning ? 'Replace Running Semester' : 'Start Semester →'}
          </button>

          {(validation.issues.length > 0 || validation.warnings.length > 0) && (
            <div className="pl-validation" data-testid="planner-validation">
              {validation.issues.map((issue) => (
                <div key={issue} className="pl-issue">
                  ⛔ {issue}
                </div>
              ))}
              {validation.warnings.map((warn) => (
                <div key={warn} className="pl-warning">
                  ⚠ {warn}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tree && (
        <div className="pl-tree" data-testid="planner-tree">
          <div className="pl-section-head">
            <span className="pl-tree-title">Prerequisite chain for {viewingPrereqs}</span>
            <button type="button" className="pl-icon-btn" onClick={() => setViewingPrereqs('')}>
              ×
            </button>
          </div>
          <div className="pl-tree-course">
            {BRACU_COURSE_DB[viewingPrereqs]?.name ?? viewingPrereqs}
          </div>
          {tree.children.length > 0 ? (
            tree.children.map((child) => <TreeNode key={child.code} node={child} />)
          ) : (
            <div className="pl-tree-none">No prerequisites required.</div>
          )}
        </div>
      )}

      <div className="pl-section-head">
        <span className="pl-section-title">Available courses</span>
        <span className="pl-found">{filtered.length} found</span>
      </div>
      <input
        type="text"
        className="pl-search"
        placeholder="Search by course code or name..."
        aria-label="Search available courses"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div className="pl-filters">
        {(
          [
            ['all', 'All', available.length],
            ['unlocked', 'Unlocked', available.filter((c) => c.canTake).length],
            ['locked', 'Locked', available.filter((c) => !c.canTake).length],
          ] as const
        ).map(([mode, label, count]) => (
          <button
            key={mode}
            type="button"
            className={`pl-filter${filterMode === mode ? ' pl-filter--active' : ''}`}
            onClick={() => setFilterMode(mode)}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <div className="pl-courses" data-testid="planner-courses">
        {displayCourses.length === 0 && <div className="pl-none">No matching courses found.</div>}
        {displayCourses.map((c) => (
          <div
            key={c.code}
            className={`pl-course${!c.canTake ? ' pl-course--locked' : ''}${!c.isRelevant ? ' pl-course--dim' : ''}`}
          >
            {!c.canTake ? (
              <span className="pl-lock" title={`Missing: ${c.missingHp.join(', ')}`}>
                🔒
              </span>
            ) : c.hasPrereqData ? (
              <span className="pl-unlock">🔓</span>
            ) : (
              <span className="pl-lock-spacer" />
            )}
            <span className="pl-code">{c.code}</span>
            <span className="pl-name">
              {c.name}
              {c.missingSp.length > 0 && c.canTake && (
                <span
                  className="pl-warn-soft-inline"
                  title={`Recommended: ${c.missingSp.join(', ')}`}
                >
                  {' '}
                  ⚠
                </span>
              )}
            </span>
            <span className="pl-credits">{c.credits} cr</span>
            <button
              type="button"
              className="pl-icon-btn pl-reviews"
              title="See faculty reviews for this course"
              onClick={() => setReviewingCourse({ code: c.code, name: c.name })}
            >
              ⭐
            </button>
            <button
              type="button"
              className="pl-icon-btn"
              title="View prerequisites"
              onClick={() => setViewingPrereqs(viewingPrereqs === c.code ? '' : c.code)}
            >
              🔗
            </button>
            {c.canTake ? (
              <button
                type="button"
                className="pl-add"
                onClick={() => dispatch({ type: 'addPlanCourse', code: c.code })}
              >
                + Add
              </button>
            ) : (
              <span className="pl-locked-label">Locked</span>
            )}
          </div>
        ))}
        {hasMore && (
          <div className="pl-more">
            {filtered.length - DISPLAY_CAP} more courses — refine your search
          </div>
        )}
      </div>

      <p className="pl-legend">
        🔓 = prerequisites met &nbsp; 🔒 = prerequisites missing &nbsp; 🔗 = view prerequisite chain
        <br />
        Prerequisite data covers {prereqCoverage} courses across CSE, EEE, ECE, MAT, PHY, BBA, ECO,
        and ENG departments.
      </p>

      {reviewingCourse && (
        <CourseReviewsModal
          courseCode={reviewingCourse.code}
          courseName={reviewingCourse.name}
          onClose={() => setReviewingCourse(null)}
        />
      )}
    </section>
  );
}
