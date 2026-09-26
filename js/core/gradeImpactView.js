// Twin of src/features/tasks/gradeImpactView.ts — hand-maintained, not generated.
// src/features/tasks/gradeImpactView.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// The grade picture, in words (#723), for the legacy Tasks tab (#767). Never
// imply certainty the model does not have; never editorialise about the student.

import { gradeImpactFor } from './gradeImpact.js';

/** Up to `limit` target lines around the best still-reachable letter. */
export function targetLines(impact, limit = 3) {
  const reachable = impact.targets.filter((target) => target.state === 'reachable');
  const best = reachable[0];

  const chosen =
    best === undefined
      ? impact.targets.filter((target) => target.state === 'secured').slice(0, 1)
      : impact.targets.slice(
          Math.max(0, impact.targets.indexOf(best) - 1),
          Math.max(0, impact.targets.indexOf(best) - 1) + limit,
        );

  return chosen.map((target) => {
    if (target.state === 'secured') {
      return {
        letter: target.letter,
        state: 'secured',
        neededPercent: null,
        text: `${target.letter} is already secured`,
      };
    }
    if (target.state === 'unreachable') {
      return {
        letter: target.letter,
        state: 'unreachable',
        neededPercent: null,
        text: `${target.letter} is no longer reachable`,
      };
    }
    const needed = Math.ceil(target.neededOnRemaining ?? 0);
    return {
      letter: target.letter,
      state: 'reachable',
      neededPercent: target.neededOnRemaining,
      text: `${target.letter} needs ${needed}% on what is left`,
    };
  });
}

export function gradeImpactView(assessed, limit) {
  const impact = gradeImpactFor(assessed);
  if (impact === null) return null;

  return {
    inHandPercent: impact.inHandPercent,
    remainingWeight: impact.remainingWeight,
    bestLetter: impact.bestLetter,
    worstLetter: impact.worstLetter,
    projectedLetter: impact.projectedLetter,
    targets: targetLines(impact, limit),
    partial: !impact.weightsComplete,
    floorText:
      impact.remainingWeight <= 0
        ? `Final result: ${impact.worstLetter}`
        : `Even with nothing more, this course lands on ${impact.worstLetter}`,
  };
}

/** "On pace for B+" — only when there is marked work and something left. */
export function paceText(view) {
  if (view.projectedLetter === null) return null;
  if (view.remainingWeight <= 0) return null;
  return `On pace for ${view.projectedLetter}, if the rest goes like the marked work`;
}
