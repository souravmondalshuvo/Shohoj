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
// ships).
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
//
// Faculty rating (#319): the semester rate pill opens RateFacultyModal via the
// bridge, guarded like openRateForCourse (non-catalog course → error toast).
// A successful submit writes the normalized initials onto the course so the
// faculty chip renders, and toasts. Submission runs through the window-hook
// boundary, so the standalone shell degrades exactly like signed-out legacy.
//
// Transcript import (#323): the footer button, the empty state and the
// simulator nudge all open one TranscriptImport flow (bridge.importTranscript
// → the imperative handle, the shell's analogue of the legacy hidden
// #transcriptFileInput). A confirmed import replaces the calculator state via
// the pure applyImport mapping and toasts.
//
// PDF export (#325): the footer ⬇ Export PDF button loads the pinned jsPDF on
// demand, builds the pure report from state and draws it (exportPDF parity).
// Failures surface as error toasts instead of the legacy alert().

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { normalizeInitials } from '../../core/faculty';
import type { SemesterEntry, SemesterSeason } from '../../core/types';
import CalculatorResults from '../../features/calculator/CalculatorResults.tsx';
import CalculatorSemesters from '../../features/calculator/CalculatorSemesters';
import { BRACU_COURSE_CATALOG, isKnownCourseCode } from '../../features/calculator/catalog';
import {
  CalculatorBridgeProvider,
  type CalculatorBridge,
} from '../../features/calculator/calculatorBridge';
import CgpaSimulator from '../../features/calculator/CgpaSimulator.tsx';
import RateFacultyModal from '../../features/calculator/RateFacultyModal.tsx';
import { getReviewableCourseCode } from '../../features/calculator/reviewableCourse';
import { submitReview } from '../../features/calculator/reviewSubmit';
import { probeExistingReview } from '../../features/calculator/reviewProbe';
import {
  useFetchReviewById,
  useInvalidateFacultyChipScore,
  useSubmitReview,
} from '../../features/calculator/FacultyReviewsProvider';
import { useAuth } from '../providers/AuthProvider';
import TranscriptImport, {
  type TranscriptImportHandle,
} from '../../features/calculator/TranscriptImport.tsx';
import { loadJsPdf } from '../../features/calculator/jspdfLoader.ts';
import { buildPdfReport } from '../../features/calculator/pdfReport.ts';
import { drawPdfReport } from '../../features/calculator/pdfReportDraw.ts';

import { deptSeasonsFor } from '../../features/calculator/departments.ts';
import { demoCalculatorState } from '../../features/calculator/demoData.ts';
import {
  nextCompletedSemesterName,
  nextRunningSemesterName,
} from '../../features/calculator/semesterNaming.ts';
import { useConfirm } from '../providers/ModalProvider';
import { useNotifications } from '../../state/NotificationProvider';
import { useCalculator } from '../providers/CalculatorProvider';
import { useUniversity } from '../providers/AuthProvider';
import { CampusRequired } from '../routing/CampusRequired';

// Catalogue lookup for the transcript import's post-parse cleanup (the legacy
// COURSE_DB[code] access). Built once at module scope from the typed catalogue.
const COURSE_BY_CODE = new Map(
  BRACU_COURSE_CATALOG.map((c) => [c.code, { full: c.full, credits: c.credits }]),
);
const lookupCourse = (code: string) => COURSE_BY_CODE.get(code) ?? null;

export function Component() {
  // The signed-in student's campus decides the grading scale this whole route
  // renders against. Null only reaches here for an admin with no campus of
  // their own, since RequireFeature turns every other case away.
  const university = useUniversity();
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { notify } = useNotifications();
  const invalidateChipScore = useInvalidateFacultyChipScore();
  const fetchReviewById = useFetchReviewById();
  const submitToProvider = useSubmitReview();
  const auth = useAuth();
  // The existing-review probe env: uid from the shell auth, falling back to the
  // legacy window hook (also the e2e seam); fetch through the resolved repo.
  const probeEnv = useMemo(
    () => ({
      currentUid: () =>
        auth.uid || (typeof window !== 'undefined' ? window._shohoj_currentUid?.() : '') || '',
      fetchById: fetchReviewById,
    }),
    [auth.uid, fetchReviewById],
  );

  const { state, dispatch } = useCalculator();

  // The course the review modal is open for (null = closed).
  const [rateTarget, setRateTarget] = useState<{ semId: number; index: number } | null>(null);

  // The transcript-import flow (hidden picker + dialogs); triggers call open().
  const transcriptImportRef = useRef<TranscriptImportHandle>(null);

  // Reducer-backed bridge. CalculatorSemesters only ever commits a fully-formed
  // semester list (it computes via the immutable mutations), so `commit` maps to
  // a 'replace' that keeps the current start season/year.
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
            commit: (semesters: SemesterEntry[]) =>
              dispatch({ type: 'replace', state: { ...state, semesters } }),
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
                notify({
                  kind: 'success',
                  message: 'Demo mode loaded. Explore CGPA, planner, and degree progress.',
                });
              })();
            },
            rateForCourse: (semId: number, index: number) => {
              // openRateForCourse parity: only a graded catalog course is rateable.
              const sem = state.semesters.find((s) => s.id === semId);
              const course = sem?.courses[index];
              if (!course) return;
              if (!getReviewableCourseCode(course.name, isKnownCourseCode)) {
                notify({
                  kind: 'error',
                  message: 'Select a valid catalog course before submitting a faculty review.',
                });
                return;
              }
              setRateTarget({ semId, index });
            },
            importTranscript: () => transcriptImportRef.current?.open(),
          } satisfies CalculatorBridge),
    [state, confirm, notify, university],
  );

  // The hero's "Try Demo Mode" lives on Home, but loadDemo is bridge-scoped to
  // this route, so Home hands the intent over as router state and it is honoured
  // on arrival — legacy wires the same button straight to startDemoMode
  // (js/main.js:820). Cleared from history immediately so a Back/Forward or a
  // reload does not re-seed; the ref guards against the effect re-running before
  // that replace lands. loadDemo still confirms when data already exists.
  const demoRequested = (location.state as { loadDemo?: boolean } | null)?.loadDemo === true;
  const demoHandled = useRef(false);
  useEffect(() => {
    if (!demoRequested || demoHandled.current || bridge === null) return;
    demoHandled.current = true;
    navigate(location.pathname, { replace: true, state: null });
    bridge.loadDemo();
  }, [demoRequested, bridge, navigate, location.pathname]);

  // Resolve the open modal's course from live state; a stale target (course
  // removed while open) closes silently, like the legacy onSubmitted re-find.
  const rateSem = rateTarget ? state.semesters.find((s) => s.id === rateTarget.semId) : undefined;
  const rateCourse = rateTarget ? rateSem?.courses[rateTarget.index] : undefined;
  const rateCourseCode = rateCourse
    ? getReviewableCourseCode(rateCourse.name, isKnownCourseCode)
    : '';

  const hasSemesters = state.semesters.some((s) => !s.summary);

  // Every hook above has run, so this early return is safe. It is placed here
  // rather than at the top of the component precisely because of that: the
  // alternative is defaulting the scale to BRACU so the hooks have something
  // to chew on, which is the bug this route is being changed to fix.
  if (bridge === null) return <CampusRequired />;

  return (
    // No heading and no setup block: legacy's `#tabCalculator` opens straight
    // onto the semester list, because the "CGPA Calculator" h3 and the
    // department/start pickers live in `.calc-header` ABOVE the tab bar and are
    // shared by every tab (#586). Rendering them here as well showed the setup
    // twice on this one route.
    <section className="shell-page">
      <CalculatorBridgeProvider value={bridge}>
        <div id="semestersContainer">
          <CalculatorSemesters />
        </div>
        <CalculatorResults />
        <CgpaSimulator />
        {hasSemesters && (
          <div className="calc-footer lg-panel">
            <div className="footer-btn-group">
              <button
                type="button"
                className="btn-add-semester"
                onClick={() => bridge.addSemester()}
              >
                + Add Semester
              </button>
              <button
                type="button"
                className="btn-running-sem"
                onClick={() => bridge.addRunningSemester()}
              >
                🎯 Running Semester
              </button>
              <button
                type="button"
                className="btn-import-pdf"
                onClick={() => bridge.importTranscript()}
              >
                📄 Import Transcript
              </button>
              <button
                type="button"
                className="btn-export-pdf"
                onClick={() => {
                  void (async () => {
                    try {
                      // The legacy 'No data to export' alert is unreachable here —
                      // the footer only renders with semesters — but keep the guard.
                      if (!state.semesters.length) return;
                      const { jsPDF } = await loadJsPdf();
                      drawPdfReport(
                        new jsPDF({ unit: 'mm', format: 'a4' }),
                        buildPdfReport(state, new Date(), bridge.university.grades),
                      );
                    } catch (err) {
                      notify({
                        kind: 'error',
                        message: (err instanceof Error && err.message) || 'PDF export failed',
                      });
                    }
                  })();
                }}
              >
                ⬇ Export PDF
              </button>
            </div>
          </div>
        )}
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
      {rateTarget && rateCourse && rateCourseCode && (
        <RateFacultyModal
          courseCode={rateCourseCode}
          semester={rateSem?.name ?? ''}
          prefillInitials={rateCourse.faculty ?? ''}
          probe={() => probeExistingReview(rateCourse.faculty ?? '', rateCourseCode, probeEnv)}
          onSubmit={(payload) =>
            submitReview(payload, {
              isKnownCode: isKnownCourseCode,
              // Transport is the typed provider relay (#353), not the legacy
              // window hook — so the standalone shell submits for real.
              hook: submitToProvider,
              currentUid: () =>
                auth.uid ||
                (typeof window !== 'undefined' ? window._shohoj_currentUid?.() : '') ||
                '',
            })
          }
          onSubmitted={(payload) => {
            const nextFac = normalizeInitials(payload.facultyInitials);
            if (!nextFac) return;
            dispatch({
              type: 'updateCourse',
              semId: rateTarget.semId,
              index: rateTarget.index,
              patch: { faculty: nextFac },
            });
            // Legacy _facultyCourseAggCache.delete: the new review must re-aggregate.
            invalidateChipScore(nextFac, rateCourseCode);
            // The legacy modal's _shohoj_showToast on ok.
            notify({ kind: 'success', message: 'Review submitted — thank you' });
          }}
          onClose={() => setRateTarget(null)}
        />
      )}
    </section>
  );
}
