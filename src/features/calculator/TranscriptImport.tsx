// src/features/calculator/TranscriptImport.tsx
//
// The transcript-import flow on the shell /calculator route (#323): the React
// counterpart of importTranscriptPDF's UI half. Owns the hidden .pdf input and
// the dialog states — reading, the parsed-summary confirm (semesters/courses/
// graded table + detected department, Import Now / Cancel), could-not-parse,
// and import-failed — behind the shell dialog conventions. Triggers (the calc
// footer button and the simulator nudge) call `open()` through the imperative
// handle, mirroring how legacy buttons click the one hidden #transcriptFileInput.
// The heavy lifting is elsewhere: pdf.js arrives via the pinned on-demand
// loader, text via the typed flattener, parsing/mapping via the pure model.

import { useImperativeHandle, useRef, useState, type Ref } from 'react';

import { Button } from '../../shared/ui/Button';
import { loadPdfJs } from './pdfjsLoader';
import {
  parseTranscriptForImport,
  importedCalculatorState,
  type CourseLookup,
  type ParsedTranscript,
} from './transcriptImport';
import { extractPdfText } from './transcriptPdfText';
import type { CalculatorState } from './calculatorState';

export interface TranscriptImportHandle {
  /** Open the file picker (the legacy hidden-input click). */
  open(): void;
}

export interface TranscriptImportProps {
  readonly lookupCourse: CourseLookup;
  /** A confirmed import — the parsed transcript mapped to calculator state. */
  readonly onImport: (state: CalculatorState) => void;
  readonly ref?: Ref<TranscriptImportHandle>;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'confirm'; parsed: ParsedTranscript }
  | { kind: 'no-semesters' }
  | { kind: 'error'; message: string };

function Dialog({
  label,
  onClose,
  children,
}: {
  readonly label: string;
  readonly onClose?: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="shell-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose?.();
      }}
    >
      <div
        className="shell-modal ti-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid="transcript-import-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function TranscriptImport({ lookupCourse, onImport, ref }: TranscriptImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useImperativeHandle(ref, () => ({
    open() {
      inputRef.current?.click();
    },
  }));

  const onFileChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setPhase({ kind: 'reading' });
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      // isEvalSupported:false closes CVE-2024-4367 (arbitrary JS execution via
      // a crafted PDF) on this pinned pdf.js 3.11.174 (legacy parity).
      const pdf = await pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
      const fullText = await extractPdfText(pdf);
      const parsed = parseTranscriptForImport(fullText, lookupCourse);
      setPhase(parsed.semesters.length ? { kind: 'confirm', parsed } : { kind: 'no-semesters' });
    } catch (err) {
      setPhase({
        kind: 'error',
        message: (err instanceof Error && err.message) || 'Import failed',
      });
    } finally {
      input.value = '';
    }
  };

  const close = () => setPhase({ kind: 'idle' });

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        data-testid="transcript-file-input"
        onChange={(e) => void onFileChosen(e.currentTarget)}
      />

      {phase.kind === 'reading' && (
        <Dialog label="Reading transcript">
          <p className="shell-modal-message" role="status">
            ⏳ Reading transcript…
          </p>
        </Dialog>
      )}

      {phase.kind === 'confirm' && (
        <Dialog label="Transcript parsed" onClose={close}>
          <h2 className="shell-modal-title">📄 Transcript Parsed</h2>
          <p className="shell-modal-message">
            Found <strong>{phase.parsed.summary.semesterCount} semesters</strong> and{' '}
            <strong>{phase.parsed.summary.courseCount} courses</strong>
          </p>
          <table className="ti-table">
            <thead>
              <tr>
                <th>Semester</th>
                <th>Courses</th>
                <th>Graded</th>
              </tr>
            </thead>
            <tbody>
              {phase.parsed.semesters.map((sem, i) => (
                <tr key={i}>
                  <td>{sem.name}</td>
                  <td>{sem.courses.length} courses</td>
                  <td>{phase.parsed.summary.gradedPerSemester[i]} graded</td>
                </tr>
              ))}
            </tbody>
          </table>
          {phase.parsed.detectedDept && (
            <p className="ti-dept">
              🎓 Department detected: <strong>{phase.parsed.detectedDept}</strong>
            </p>
          )}
          <div className="shell-modal-actions">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onImport(importedCalculatorState(phase.parsed));
                close();
              }}
            >
              ✅ Import Now
            </Button>
          </div>
        </Dialog>
      )}

      {phase.kind === 'no-semesters' && (
        <Dialog label="Could not parse transcript" onClose={close}>
          <h2 className="shell-modal-title">⚠️ Could not parse transcript</h2>
          <p className="shell-modal-message">
            No semesters were detected. Make sure this is a BRACU official grade sheet PDF.
          </p>
          <div className="shell-modal-actions">
            <Button variant="primary" onClick={close}>
              Close
            </Button>
          </div>
        </Dialog>
      )}

      {phase.kind === 'error' && (
        <Dialog label="Import failed" onClose={close}>
          <h2 className="shell-modal-title">❌ Import failed</h2>
          <p className="shell-modal-message" role="alert">
            {phase.message}
          </p>
          <div className="shell-modal-actions">
            <Button variant="primary" onClick={close}>
              Close
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
