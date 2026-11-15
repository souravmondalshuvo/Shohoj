// src/features/quest/grader/hero.ts
//
// Replays a hero run (#981). The student's Java drives a `Hero` object that
// records what it did (harness.ts); after the run, this turns that record into
// one frame per action, which the game plays back as animation, and decides
// whether the level's goal was met.
//
// The Java side is the only simulator. It has to be, because the student's code
// asks it questions (`frontIsClear()`) while it runs. This side does not judge
// whether a step was possible; it follows the record, so the two cannot
// disagree about what happened.

import type { HeroLevel, HeroQuest } from '../content/schema.ts';

export type Facing = 'N' | 'E' | 'S' | 'W';

/** What the hero did in one frame. */
export type HeroEvent =
  /** Walked one square forward. */
  | 'step'
  /** Tried to walk into something impassable. The run ends here. */
  | 'blocked'
  | 'turnLeft'
  | 'turnRight'
  /** Picked up an item. */
  | 'pick'
  /** Tried to pick where there was nothing. */
  | 'pickNothing'
  /** Ran out of actions. The run ends here. */
  | 'tired';

export interface HeroFrame {
  readonly event: HeroEvent;
  /** Where the hero is after the event. */
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  /** Items held after the event. */
  readonly picked: number;
}

/** Why a run ended before the student's code finished, if it did. */
export type HeroStop = 'blocked' | 'tired' | 'dizzy' | null;

export interface HeroRun {
  readonly start: { readonly x: number; readonly y: number; readonly facing: Facing };
  readonly frames: readonly HeroFrame[];
  readonly stop: HeroStop;
  readonly reachedGoal: boolean;
  readonly picked: number;
  readonly totalItems: number;
}

const FACINGS: readonly Facing[] = ['N', 'E', 'S', 'W'];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const EVENTS: Readonly<Record<string, HeroEvent>> = {
  S: 'step',
  B: 'blocked',
  L: 'turnLeft',
  R: 'turnRight',
  P: 'pick',
  p: 'pickNothing',
  X: 'tired',
};

/** Where the level's `S` is. The schema guarantees there is exactly one. */
export function heroStart(level: HeroLevel): { x: number; y: number; facing: Facing } {
  for (let y = 0; y < level.grid.length; y += 1) {
    const x = (level.grid[y] ?? '').indexOf('S');
    if (x >= 0) return { x, y, facing: level.facing };
  }
  return { x: 0, y: 0, facing: level.facing };
}

/**
 * Turn the report the generated `Hero` class makes, `trace|x|y|dir|picked|stop`,
 * into frames. Returns `null` when the report is not one this version wrote,
 * which the caller treats as a run that produced nothing to show.
 */
export function replayHero(level: HeroLevel, report: string): HeroRun | null {
  const parts = report.split('|');
  if (parts.length !== 6) return null;
  const trace = parts[0] ?? '';
  const stopText = parts[5] ?? '';

  const start = heroStart(level);
  let { x, y } = start;
  let dir = FACINGS.indexOf(start.facing);
  let picked = 0;
  const frames: HeroFrame[] = [];
  for (const symbol of trace) {
    const event = EVENTS[symbol];
    if (!event) return null;
    if (event === 'step') {
      x += DX[dir] ?? 0;
      y += DY[dir] ?? 0;
    } else if (event === 'turnLeft') {
      dir = (dir + 3) % 4;
    } else if (event === 'turnRight') {
      dir = (dir + 1) % 4;
    } else if (event === 'pick') {
      picked += 1;
    }
    frames.push({ event, x, y, facing: FACINGS[dir] ?? 'N', picked });
  }

  const stop: HeroStop =
    stopText === 'blocked' || stopText === 'tired' || stopText === 'dizzy' ? stopText : null;
  const totalItems = level.grid.join('').split('*').length - 1;
  return {
    start,
    frames,
    stop,
    reachedGoal: (level.grid[y] ?? '').charAt(x) === 'G',
    picked,
    totalItems,
  };
}

export interface HeroOutcome {
  readonly passed: boolean;
  /** One sentence for the student: what happened, and what is still missing. */
  readonly message: string;
}

/** Judge a replayed run against the quest's goal. */
export function judgeHero(quest: HeroQuest, run: HeroRun): HeroOutcome {
  if (run.stop === 'blocked') {
    return { passed: false, message: 'The hero walked into something that cannot be crossed.' };
  }
  if (run.stop === 'tired') {
    return {
      passed: false,
      message: `The hero is worn out after ${quest.maxActions} actions. A loop may be running longer than it should.`,
    };
  }
  if (run.stop === 'dizzy') {
    return {
      passed: false,
      message:
        'The hero kept looking around and never moved. Something inside the loop has to change what the loop is checking.',
    };
  }
  if (quest.goal.reach && !run.reachedGoal) {
    return { passed: false, message: 'The code finished, but the hero is not at the goal yet.' };
  }
  if (quest.goal.collectAll && run.picked < run.totalItems) {
    const left = run.totalItems - run.picked;
    return {
      passed: false,
      message: `The hero reached the end but left ${left} item${left === 1 ? '' : 's'} behind.`,
    };
  }
  return { passed: true, message: 'The hero made it.' };
}
