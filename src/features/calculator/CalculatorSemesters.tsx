// src/features/calculator/CalculatorSemesters.tsx
//
// Phase 5B container island (React-owned path). Reads the shared semester list
// from the bridge and renders the whole #semestersContainer: summary form,
// summary block, semester blocks, the inline add-semester button, and the empty
// state. All editing flows through the pure `mutations` helpers + the typed
// `_shohoj_setSemesters` write path (which persists + rebroadcasts, re-rendering
// this island). Summary create/edit is React-owned via the same path; calendar-
// aware semester creation and demo data delegate to the legacy globals because
// that data stays in JS.
//
// Interim: the course-name autocomplete dropdown and grade-point auto-detection
// are the next increment, so name/grade-point edits here are plain field writes.
// Not the default UI yet — mounted only behind the opt-in flag.

import { useMemo, useState } from 'react';

import {
  gpaCoreGetRetakenKeys as getRetakenKeys,
  gpaCoreNormalizeGradePoint as normalizeGradePoint,
} from '../../core/gpa';
import { detectGrade, type GradeLetter } from '../../core/grades';
import type { SemesterEntry, SemesterSeason } from '../../core/types';
import SemesterBlock from './SemesterBlock';
import SummaryBlock from './SummaryBlock';
import SummaryForm from './SummaryForm';
import type { SummaryValues } from './SummaryForm';
import type { CourseSuggestion } from './courseSearch';
import { coursePickPatch, courseResolvePatch } from './courseSelection';
import {
  addCourse,
  removeCourse,
  removeSemester,
  reorderSemesters,
  setCourseMarks,
  updateCourse,
} from './mutations';
import {
  getCurrentSemesterForDeptSeasons,
  parseSemesterSeasonYear,
  isFutureSemester,
} from './semesterCalendar';
import { useCalculatorBridge } from './calculatorBridge';

const DEFAULT_SEASONS: readonly SemesterSeason[] = ['Spring', 'Summer', 'Fall'];

export default function CalculatorSemesters() {
  const bridge = useCalculatorBridge();
  // The campus the bridge was built for — BRACU on the legacy island, the
  // signed-in student's profile on the shell route.
  const scale = bridge.university.grades;
  const { semesters, currentDept, startSeason, startYear } = bridge.useInputs();
  // The two facts legacy's empty state keys off (js/ui/render.js:765).
  const deptDone = !!currentDept;
  const semDone = deptDone && !!startSeason && !!startYear;
  const [summaryFormVisible, setSummaryFormVisible] = useState(false);
  const [summaryEditId, setSummaryEditId] = useState<number | null>(null);
  const [dragSrcId, setDragSrcId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const commit = (next: SemesterEntry[]) => bridge.commit(next);
  const isKnownCode = (code: string) => bridge.isKnownCode(code);
  const [catalog] = useState<CourseSuggestion[]>(() => [...bridge.catalog]);

  const retakenKeys = useMemo(() => getRetakenKeys(semesters), [semesters]);
  const now = useMemo(() => new Date(), []);

  const hasSummary = semesters.some((s) => s.summary);
  const nonSummary = semesters.filter((s) => !s.summary);

  // The real-world "current" semester id, only meaningful in summary view.
  const currentSemId = useMemo(() => {
    if (!hasSummary) return null;
    const cur = getCurrentSemesterForDeptSeasons(now, DEFAULT_SEASONS);
    const match = semesters.find((sem) => {
      if (sem.summary || sem.running) return false;
      const parsed = parseSemesterSeasonYear(sem.name);
      return parsed && parsed.season === cur.season && parsed.year === cur.year;
    });
    return match ? match.id : null;
  }, [semesters, hasSummary, now]);

  const closeSummaryForm = () => {
    setSummaryFormVisible(false);
    setSummaryEditId(null);
  };

  const submitSummary = (values: SummaryValues) => {
    if (summaryEditId !== null) {
      commit(
        semesters.map((s) =>
          s.id === summaryEditId
            ? {
                ...s,
                summaryCGPA: values.cgpa,
                summaryAttempted: values.attempted,
                summaryCredits: values.credits,
              }
            : s,
        ),
      );
    } else {
      const nextId = semesters.reduce((max, s) => Math.max(max, s.id), -1) + 1;
      commit([
        {
          id: nextId,
          name: 'Past Semesters',
          summary: true,
          summaryCGPA: values.cgpa,
          summaryAttempted: values.attempted,
          summaryCredits: values.credits,
          courses: [],
          running: false,
        },
        ...semesters,
      ]);
    }
    closeSummaryForm();
  };

  const editingSummary =
    summaryEditId !== null ? semesters.find((s) => s.id === summaryEditId && s.summary) : null;

  return (
    <>
      {summaryFormVisible && (
        <SummaryForm
          initial={
            editingSummary
              ? {
                  cgpa: editingSummary.summaryCGPA ?? 0,
                  attempted: editingSummary.summaryAttempted ?? 0,
                  credits: editingSummary.summaryCredits ?? 0,
                }
              : null
          }
          onSubmit={submitSummary}
          onCancel={closeSummaryForm}
        />
      )}

      {semesters.map((sem) =>
        sem.summary ? (
          <SummaryBlock
            key={sem.id}
            cgpa={sem.summaryCGPA ?? 0}
            attempted={sem.summaryAttempted ?? 0}
            credits={sem.summaryCredits ?? 0}
            onEdit={() => {
              setSummaryEditId(sem.id);
              setSummaryFormVisible(true);
            }}
            onRemove={() => commit(removeSemester(semesters, sem.id))}
          />
        ) : (
          <SemesterBlock
            key={sem.id}
            sem={sem}
            isCurrentSem={sem.id === currentSemId}
            isFuture={isFutureSemester(sem.name, now)}
            retakenKeys={retakenKeys}
            isKnownCode={isKnownCode}
            catalog={catalog}
            onAddCourse={() => commit(addCourse(semesters, sem.id))}
            onRemoveSemester={() => commit(removeSemester(semesters, sem.id))}
            onCourseNamePick={(idx, course) =>
              commit(updateCourse(semesters, sem.id, idx, coursePickPatch(course)))
            }
            onCourseNameResolve={(idx, course, text) =>
              commit(
                updateCourse(
                  semesters,
                  sem.id,
                  idx,
                  courseResolvePatch(sem.courses[idx]?.name ?? '', course, text),
                ),
              )
            }
            onCourseGradePointChange={(idx, value) =>
              commit(
                updateCourse(semesters, sem.id, idx, {
                  gradePoint: value,
                  grade: detectGrade(value, scale.pointsToGrade),
                }),
              )
            }
            onCourseGradePointBlur={(idx, e) => {
              const norm = normalizeGradePoint(e.target.value, 'blur');
              commit(
                updateCourse(semesters, sem.id, idx, {
                  gradePoint: norm,
                  grade: detectGrade(norm, scale.pointsToGrade),
                }),
              );
            }}
            onCoursePassFailChange={(idx, value) =>
              commit(updateCourse(semesters, sem.id, idx, { grade: value }))
            }
            onRateCourse={(idx) => bridge.rateForCourse(sem.id, idx)}
            onRemoveCourse={(idx) => commit(removeCourse(semesters, sem.id, idx))}
            onCourseMarksChange={(idx, marks) =>
              commit(setCourseMarks(semesters, sem.id, idx, marks))
            }
            // Applying writes the letter and its points onto the course, so the
            // running-semester projection picks it up through exactly the path a
            // typed grade already takes — no second route into the CGPA.
            onApplyProjectedLetter={(idx, letter) =>
              commit(
                updateCourse(semesters, sem.id, idx, {
                  grade: letter,
                  gradePoint: scale.points[letter as GradeLetter] ?? '',
                }),
              )
            }
            isDragOver={dragOverId === sem.id && dragSrcId !== null && dragSrcId !== sem.id}
            onDragStartBlock={() => setDragSrcId(sem.id)}
            onDragOverBlock={() => {
              if (sem.id !== dragSrcId) setDragOverId(sem.id);
            }}
            onDropBlock={() => {
              if (dragSrcId !== null && dragSrcId !== sem.id) {
                commit(reorderSemesters(semesters, dragSrcId, sem.id));
              }
              setDragSrcId(null);
              setDragOverId(null);
            }}
            onDragEndBlock={() => {
              setDragSrcId(null);
              setDragOverId(null);
            }}
          />
        ),
      )}

      {hasSummary && nonSummary.length > 0 && (
        <button
          type="button"
          className="btn-add-course"
          style={{
            width: '100%',
            marginTop: 4,
            padding: 10,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 10,
          }}
          onClick={() => bridge.addSemester()}
        >
          + Add Semester
        </button>
      )}

      {nonSummary.length === 0 && !summaryFormVisible && (
        <div className="empty-state">
          <div className="empty-state-icon">{!deptDone ? '👋' : !semDone ? '📅' : '🎓'}</div>
          <div className="empty-state-title">
            {!deptDone ? "Let's get you set up" : !semDone ? 'Almost ready...' : 'Ready to go!'}
          </div>
          <div className="empty-state-sub">
            {!deptDone
              ? 'Complete the 3 quick steps below to start tracking your CGPA.'
              : !semDone
                ? 'One more step before you can add semesters.'
                : 'Add your first semester, import your transcript, or start from your current CGPA.'}
          </div>
          {/* Legacy's onboarding checklist (js/ui/render.js:768), which the shell
              had dropped entirely — it showed stage three's "Ready to go!" to
              everyone, so a student who had picked no department was told they
              were ready and left to work out that the picker is in the header.
              The three stages key off the same two facts legacy uses. */}
          {!deptDone ? (
            <div className="empty-state-steps">
              <div className="empty-state-step">
                <span className="empty-state-step-num">1</span>
                <span>
                  Pick your <strong>department</strong> in the header above
                </span>
              </div>
              <div className="empty-state-step">
                <span className="empty-state-step-num">2</span>
                <span>
                  Set your <strong>starting semester</strong> (e.g. Fall 2022)
                </span>
              </div>
              <div className="empty-state-step">
                <span className="empty-state-step-num">3</span>
                <span>Add your first semester and enter grades</span>
              </div>
            </div>
          ) : !semDone ? (
            <div className="empty-state-steps">
              <div className="empty-state-step" style={{ opacity: 0.45 }}>
                <span className="empty-state-step-num done">✓</span>
                <span>Department selected</span>
              </div>
              <div className="empty-state-step">
                <span
                  className="empty-state-step-num active"
                  style={{ background: 'var(--green)', color: '#0b0f0d' }}
                >
                  2
                </span>
                <span>
                  Set your <strong>starting semester</strong> above and click{' '}
                  <strong>Let&apos;s go →</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="empty-state-steps">
              <div className="empty-state-step" style={{ opacity: 0.45 }}>
                <span className="empty-state-step-num done">✓</span>
                <span>Department &amp; semester set</span>
              </div>
              <div className="empty-state-step">
                <span
                  className="empty-state-step-num active"
                  style={{ background: 'var(--green)', color: '#0b0f0d' }}
                >
                  3
                </span>
                <span>
                  Click <strong>+ Add Semester</strong> below, or <strong>Import Transcript</strong>{' '}
                  to auto-fill
                </span>
              </div>
            </div>
          )}
          <div className="empty-state-actions">
            <button type="button" className="btn-sample" onClick={() => bridge.loadDemo()}>
              Try Demo Mode
            </button>
            {/* Legacy holds this back until a start semester exists
                (js/ui/render.js:786). The shell does not, deliberately: it lets
                a student add a semester straight away and names it "Semester 1"
                until a calendar is chosen, which 21 specs pin as the empty
                state's behaviour. Gating it here would be a product change
                wearing a parity fix's clothes, so it stays. */}
            <button type="button" className="btn-sample-ghost" onClick={() => bridge.addSemester()}>
              + Add semester
            </button>
            {/* Legacy's empty state carries no Import button — it does not need
                one, because its footer is static markup that sits outside the
                panel and is on screen even with no semesters. The shell renders
                its footer only once semesters exist, so this is a new student's
                ONLY route into transcript import. Kept deliberately: matching
                legacy exactly here would strand them. */}
            <button
              type="button"
              className="btn-sample-ghost"
              onClick={() => bridge.importTranscript()}
            >
              📄 Import Transcript
            </button>
            {/* Legacy also holds this back until a start semester exists
                (its cgpaBtn is `_semDone && !hasSummaryBlock`). Same reasoning
                as the add button above: starting from a CGPA needs no calendar,
                and the specs pin it as reachable from an untouched calculator. */}
            {!hasSummary && (
              <button
                type="button"
                className="btn-sample-ghost"
                style={{ borderColor: 'rgba(46,204,113,0.4)', color: 'var(--green)' }}
                onClick={() => {
                  setSummaryEditId(null);
                  setSummaryFormVisible(true);
                }}
              >
                📊 Start from CGPA
              </button>
            )}
          </div>
          {/* legacy's nudge toward the header and footer controls once the
              student is past setup (js/ui/render.js:789) */}
          {semDone && <div className="empty-arrow">← use the buttons above too &nbsp;↑</div>}
        </div>
      )}
    </>
  );
}
