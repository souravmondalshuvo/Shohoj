// src/features/tasks/GradeImpactPanel.tsx
//
// What a course still needs (#723).
//
// Shown when the student has filtered to one course, because that is when the
// question makes sense — "what do I need" is not a question about a mixed list.
// The wording comes from gradeImpactView; nothing here computes anything.

import type { GradeImpactView } from './gradeImpactView.ts';
import { paceText } from './gradeImpactView.ts';

export interface GradeImpactPanelProps {
  readonly view: GradeImpactView | null;
  readonly courseLabel: string;
}

export function GradeImpactPanel({ view, courseLabel }: GradeImpactPanelProps) {
  // Nothing to say is said by saying nothing — the same rule the dashboard
  // digest follows. A student who has not recorded any weights should not get
  // an empty panel explaining that they have not.
  if (view === null) return null;

  const pace = paceText(view);

  return (
    <section
      className="tasks-grade lg-panel"
      data-testid="tasks-grade"
      aria-label={`${courseLabel} grade impact`}
    >
      <div className="lg-shine" />
      <header className="tasks-grade-head">
        <h3 className="tasks-grade-title">{courseLabel}</h3>
        {view.inHandPercent !== null && (
          <span className="tasks-grade-inhand" data-testid="tasks-grade-inhand">
            {view.inHandPercent.toFixed(0)}% in hand
          </span>
        )}
      </header>

      {view.partial && (
        <p className="tasks-grade-partial shell-muted" data-testid="tasks-grade-partial">
          Based on the components you have entered, which do not add up to 100% of the course yet.
        </p>
      )}

      <p className="tasks-grade-floor" data-testid="tasks-grade-floor">
        {view.floorText}
      </p>

      {pace !== null && <p className="tasks-grade-pace shell-muted">{pace}</p>}

      {view.targets.length > 0 && (
        <ul className="tasks-grade-targets" data-testid="tasks-grade-targets">
          {view.targets.map((target) => (
            <li key={target.letter} className={`tasks-grade-target tasks-grade-${target.state}`}>
              {target.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
