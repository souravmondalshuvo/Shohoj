// src/features/calculator/SummaryBlock.tsx
//
// Phase 5B presentational island building block: the "Past Semesters" summary
// block (academic history entered as a CGPA + credits snapshot), ported from
// renderSummaryBlock in js/ui/render.js. Classes/structure kept verbatim for
// e2e parity. Presentational — edit/remove are callback props. Not yet mounted.

import { gpaBadgeColors } from './colors';

export interface SummaryBlockProps {
  readonly cgpa: number;
  readonly attempted: number;
  readonly credits: number;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}

/** Whole numbers render bare; fractions to one decimal — matches render.js. */
function formatCredits(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function SummaryBlock({
  cgpa,
  attempted,
  credits,
  onEdit,
  onRemove,
}: SummaryBlockProps) {
  const cgpaColor = gpaBadgeColors(cgpa).color;

  return (
    <div className="semester-block summary-block lg-surface">
      <div className="lg-shine" />
      <div
        className="semester-head"
        style={{ background: 'rgba(46,204,113,0.06)', borderBottomColor: 'rgba(46,204,113,0.2)' }}
      >
        <div className="semester-head-left">
          <span style={{ fontSize: 16, marginRight: 4 }}>📊</span>
          <span className="semester-label" style={{ color: 'var(--green)' }}>
            Past Semesters
          </span>
          <span
            className="semester-gpa-badge"
            style={{
              color: cgpaColor,
              background: 'rgba(46,204,113,0.10)',
              border: '1px solid rgba(46,204,113,0.22)',
            }}
          >
            CGPA {cgpa.toFixed(2)}
          </span>
          <span
            className="semester-gpa-badge"
            style={{
              color: 'var(--text2)',
              background: 'var(--glass2)',
              border: '1px solid var(--border)',
            }}
          >
            {attempted ? `${formatCredits(attempted)} attempted · ` : ''}
            {formatCredits(credits)} cr earned
          </span>
        </div>
        <div className="semester-actions">
          <button type="button" className="btn-icon" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn-icon danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
      <div
        style={{ padding: '10px 1.2rem', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}
      >
        This block represents your academic history before using Shohoj. Add new semesters below to
        continue tracking.
      </div>
    </div>
  );
}
