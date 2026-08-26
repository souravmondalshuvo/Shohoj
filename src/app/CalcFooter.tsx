// src/app/CalcFooter.tsx
//
// Legacy's `.calc-footer` (index.html:593, labelled "Footer (global — below
// tabs)"), rendered below the outlet so it is on screen on every route — the
// running credit totals on the left, the calculator's actions on the right.
//
// The shell had it in two route-local halves: `.calc-footer-stats` inside
// CalculatorResults and a `.footer-btn-group` inside CalculatorRoute, both
// confined to /calculator. So a student on /routine or /seats lost their credit
// totals and every one of those buttons, which legacy keeps on screen the whole
// time — and /calculator carried a row legacy's panel does not, which was the
// last 36px of its parity gap (#616, the same shape as #586's missing header).
//
// The classes are legacy's, from css/style.css:700-702 and the .btn-* rules.

import type { SemesterSeason } from '../core/types.ts';
import { useCalculator } from './providers/CalculatorProvider';
import { useTranscriptImport } from './providers/TranscriptImportProvider';
import { useUniversity } from './providers/AuthProvider';
import { useNotifications } from '../state/NotificationProvider';
import { computeCalculatorResults, formatCredits } from '../features/calculator/results.ts';
import { deptSeasonsFor } from '../features/calculator/departments.ts';
import {
  nextCompletedSemesterName,
  nextRunningSemesterName,
} from '../features/calculator/semesterNaming.ts';
import { loadJsPdf } from '../features/calculator/jspdfLoader.ts';
import { buildPdfReport } from '../features/calculator/pdfReport.ts';
import { drawPdfReport } from '../features/calculator/pdfReportDraw.ts';

export function CalcFooter() {
  const { state, dispatch } = useCalculator();
  const university = useUniversity();
  const openTranscriptImport = useTranscriptImport();
  const { notify } = useNotifications();

  if (university === null) return null;

  const results = computeCalculatorResults(
    {
      semesters: state.semesters,
      startSeason: state.startSeason as SemesterSeason | '',
      startYear: state.startYear,
    },
    university,
  );

  return (
    <div className="calc-footer lg-panel" data-testid="calc-footer">
      <div className="calc-footer-stats">
        <div className="footer-stat">
          Credits Attempted: <strong>{formatCredits(results.attemptedCredits)}</strong>
        </div>
        <div className="footer-stat">
          Credits Earned: <strong>{formatCredits(results.earnedCredits)}</strong>
        </div>
        <div className="footer-stat">
          Semesters: <strong>{state.semesters.length}</strong>
        </div>
      </div>
      {/* Legacy also carries 🗑 Clear Data here. Deliberately not ported with
          the rest: handleClearData (js/main.js:207) is a whole-app reset — it
          deletes the CLOUD copy, wipes every browser key, resets the theme and
          the active tab — not a calculator action, and it wants its own change
          rather than riding along with a layout move. */}
      <div className="footer-btn-group">
        <button
          type="button"
          className="btn-add-semester"
          onClick={() =>
            dispatch({
              type: 'addSemester',
              name: nextCompletedSemesterName(state, new Date(), deptSeasonsFor(state.currentDept)),
            })
          }
        >
          + Add Semester
        </button>
        <button
          type="button"
          className="btn-running-sem"
          onClick={() =>
            dispatch({
              type: 'addRunningSemester',
              name: nextRunningSemesterName(state, new Date(), deptSeasonsFor(state.currentDept)),
            })
          }
        >
          🎯 Running Semester
        </button>
        <button type="button" className="btn-import-pdf" onClick={openTranscriptImport}>
          📄 Import Transcript
        </button>
        <button
          type="button"
          className="btn-export-pdf"
          onClick={() => {
            void (async () => {
              try {
                if (!state.semesters.length) {
                  notify({ kind: 'error', message: 'No data to export' });
                  return;
                }
                const { jsPDF } = await loadJsPdf();
                drawPdfReport(
                  new jsPDF({ unit: 'mm', format: 'a4' }),
                  buildPdfReport(state, new Date(), university.grades),
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
  );
}
