// src/features/calculator/SummaryForm.tsx
//
// Phase 5B presentational island building block: the "Start from Current CGPA"
// / "Edit Past Semesters" form, ported from renderSummaryForm +
// confirmSummaryForm in js/ui/render.js. Self-contained controlled form that
// owns its inputs and validation (CGPA 0–4, non-negative credits, earned ≤
// attempted), reporting the invalid field with a red border + focus exactly as
// the legacy form did. On valid submit it hands parsed numbers to the parent,
// which mutates state. Not yet mounted.

import { useEffect, useRef, useState } from 'react';

export interface SummaryValues {
  readonly cgpa: number;
  readonly attempted: number;
  readonly credits: number;
}

export interface SummaryFormProps {
  /** Existing values when editing; null when creating. */
  readonly initial?: SummaryValues | null;
  readonly onSubmit: (values: SummaryValues) => void;
  readonly onCancel: () => void;
}

type Field = 'cgpa' | 'attempted' | 'credits';

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 15,
  fontWeight: 700,
  padding: '9px 12px',
  outline: 'none',
  width: '100%',
  MozAppearance: 'textfield',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: 'var(--text3)',
};

const fieldWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  flex: 1,
  minWidth: 100,
};

export default function SummaryForm({ initial = null, onSubmit, onCancel }: SummaryFormProps) {
  const [cgpa, setCgpa] = useState(initial ? initial.cgpa.toFixed(2) : '');
  const [attempted, setAttempted] = useState(initial ? String(initial.attempted) : '');
  const [credits, setCredits] = useState(initial ? String(initial.credits) : '');
  const [errorField, setErrorField] = useState<Field | null>(null);

  const cgpaRef = useRef<HTMLInputElement>(null);
  const attemptedRef = useRef<HTMLInputElement>(null);
  const creditsRef = useRef<HTMLInputElement>(null);

  // Focus CGPA on open, mirroring the legacy 30ms focus.
  useEffect(() => {
    cgpaRef.current?.focus();
  }, []);

  function fail(field: Field) {
    setErrorField(field);
    ({ cgpa: cgpaRef, attempted: attemptedRef, credits: creditsRef })[field].current?.focus();
  }

  function confirm() {
    const cgpaNum = parseFloat(cgpa);
    const attemptedNum = parseFloat(attempted);
    const creditsNum = parseFloat(credits);

    if (Number.isNaN(cgpaNum) || cgpaNum < 0 || cgpaNum > 4.0) return fail('cgpa');
    if (Number.isNaN(attemptedNum) || attemptedNum < 0) return fail('attempted');
    if (Number.isNaN(creditsNum) || creditsNum < 0) return fail('credits');
    if (creditsNum > attemptedNum) return fail('credits');

    onSubmit({ cgpa: cgpaNum, attempted: attemptedNum, credits: creditsNum });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') confirm();
  }

  function borderFor(field: Field): React.CSSProperties {
    return errorField === field ? { ...inputStyle, borderColor: '#e74c3c' } : inputStyle;
  }

  const title = initial ? 'Edit Past Semesters' : 'Start from Current CGPA';

  return (
    <div
      className="semester-block lg-surface"
      style={{ borderColor: 'rgba(46,204,113,0.35)' }}
      id="summaryFormBlock"
    >
      <div className="lg-shine" />
      <div
        className="semester-head"
        style={{ background: 'rgba(46,204,113,0.06)', borderBottomColor: 'rgba(46,204,113,0.2)' }}
      >
        <div className="semester-head-left">
          <span style={{ fontSize: 16, marginRight: 4 }}>📊</span>
          <span className="semester-label" style={{ color: 'var(--green)' }}>
            {title}
          </span>
        </div>
        <div className="semester-actions">
          <button type="button" className="btn-icon danger" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <div style={{ padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Enter your current academic standing. Shohoj will use this as the foundation for all
          calculations — simulator, playground, degree tracker, and more.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Current CGPA</label>
            <input
              ref={cgpaRef}
              id="summaryCgpaInput"
              type="number"
              min="0"
              max="4"
              step="0.01"
              placeholder="e.g. 3.30"
              value={cgpa}
              style={borderFor('cgpa')}
              onChange={(e) => {
                setCgpa(e.target.value);
                if (errorField === 'cgpa') setErrorField(null);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Credits Attempted</label>
            <input
              ref={attemptedRef}
              id="summaryAttemptedInput"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 45"
              value={attempted}
              style={borderFor('attempted')}
              onChange={(e) => {
                setAttempted(e.target.value);
                if (errorField === 'attempted') setErrorField(null);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Credits Earned</label>
            <input
              ref={creditsRef}
              id="summaryCreditsInput"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 42"
              value={credits}
              style={borderFor('credits')}
              onChange={(e) => {
                setCredits(e.target.value);
                if (errorField === 'credits') setErrorField(null);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <button
            type="button"
            onClick={confirm}
            style={{
              background: 'var(--green)',
              color: '#0b0f0d',
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 13,
              fontWeight: 700,
              padding: '9px 20px',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              height: 40,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Confirm →
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
          💡 Find your CGPA and credits earned on CONNECT → Grade Sheet, or from your official
          transcript.
        </p>
      </div>
    </div>
  );
}
