// Twin of src/features/tasks/gradeImpact.ts — hand-maintained, not generated.
// src/features/tasks/gradeImpact.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// What a task is worth to a grade (#721), for the legacy Tasks tab (#767).
// A BRIDGE, not an implementation: task assessments become the MarkComponent[]
// that computeCourseMarks (js/core/courseMarks.js) already evaluates, so there
// is still exactly one definition of the grade arithmetic.

import { computeCourseMarks } from './courseMarks.js';

export function toMarkComponents(assessed) {
  return assessed.map(({ task, assessment }) => ({
    name: task.title,
    weight: assessment.weightPercent,
    score: assessment.earnedMarks,
    outOf: assessment.totalMarks,
  }));
}

export function gradeImpactFor(assessed, marks) {
  const components = toMarkComponents(assessed);
  return marks === undefined
    ? computeCourseMarks(components)
    : computeCourseMarks(components, marks);
}

/** Percent needed on one unmarked task for a target letter, or null. */
export function neededOnTask(assessed, taskId, target, marks) {
  const impact = gradeImpactFor(assessed, marks);
  if (impact === null) return null;

  const entry = assessed.find(({ task }) => task.id === taskId);
  if (entry === undefined) return null;
  if (entry.assessment.earnedMarks !== null) return null;

  const tier = impact.targets.find((t) => t.letter === target);
  if (tier === undefined || tier.state !== 'reachable') return null;
  return tier.neededOnRemaining;
}

export function gradeWindow(assessed, marks) {
  const impact = gradeImpactFor(assessed, marks);
  if (impact === null) return null;
  return {
    best: impact.bestLetter,
    worst: impact.worstLetter,
    projected: impact.projectedLetter,
    weightsComplete: impact.weightsComplete,
  };
}
