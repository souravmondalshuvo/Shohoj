// src/features/quest/progress/progress.ts
//
// What a student has done in Shohoj Quest (#981), as a value.
//
// Only facts are kept: which quests were solved and when, and where the hero
// was standing. XP and "which quests are open" are worked out from the content
// every time (content/world.ts), so re-balancing a quest's reward or its
// requirements never leaves a saved number out of date.
//
// Nothing here is trusted. Grading runs in the student's browser, so progress
// is self-study data: it must never decide anything of value.
//
// Pure: no React, Firebase or DOM. Where progress is kept is a separate
// concern, behind `ProgressStore`.

import type { Cell } from '../world/zoneMap.ts';

export interface Progress {
  /** Quest id to when it was first solved, in milliseconds since the epoch. */
  readonly completed: Readonly<Record<string, number>>;
  /** The zone the student was last in. */
  readonly zone: string;
  /** Where the hero stood in that zone, or `null` to start at its spawn point. */
  readonly at: Cell | null;
}

export function emptyProgress(zone: string): Progress {
  return { completed: {}, zone, at: null };
}

export function completedSet(progress: Progress): ReadonlySet<string> {
  return new Set(Object.keys(progress.completed));
}

/** Record a solved quest. Solving it again changes nothing: the first time stands. */
export function withSolved(progress: Progress, questId: string, now: number): Progress {
  if (Object.prototype.hasOwnProperty.call(progress.completed, questId)) return progress;
  return { ...progress, completed: { ...progress.completed, [questId]: now } };
}

export function withPosition(progress: Progress, at: Cell): Progress {
  if (progress.at && progress.at.x === at.x && progress.at.y === at.y) return progress;
  return { ...progress, at: { x: at.x, y: at.y } };
}

/** Where progress is kept between visits. */
export interface ProgressStore {
  load(): Promise<Progress | null>;
  save(progress: Progress): void;
}

/** Keeps progress for as long as the page is open. */
export function memoryProgressStore(): ProgressStore {
  let held: Progress | null = null;
  return {
    load: () => Promise.resolve(held),
    save: (progress) => {
      held = progress;
    },
  };
}
