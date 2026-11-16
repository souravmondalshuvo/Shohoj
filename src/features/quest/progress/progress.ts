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
// is self-study data: it must never decide anything of value. That is also why
// a saved copy is read defensively. It may have been written by an older build,
// by a newer one, or by hand in the browser's console; whatever in it is not
// understood is dropped, and nothing in it can do harm.
//
// Pure: no React, Firebase or DOM. Where progress is kept is a separate
// concern: the device (localProgress.ts), the cloud (cloudProgress.ts), and
// the store that keeps the two in step (syncedProgress.ts).

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

/** The same progress, standing at the start of `zone`. Solved quests are kept. */
export function inZone(progress: Progress, zone: string): Progress {
  return progress.zone === zone ? progress : { ...progress, zone, at: null };
}

// ── Saved form ──────────────────────────────────────────────────────────────

/** The version written into every saved copy. A copy with another is not read. */
export const PROGRESS_VERSION = 1;

/**
 * The most solved quests a saved copy holds. firestore.rules refuses a larger
 * map, so the cap is applied before writing rather than discovered as an error.
 */
export const MAX_COMPLETED = 500;

/** A map square further out than this is not a place any zone has. */
const MAX_COORDINATE = 1023;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 48 && ID.test(value);

/** Progress as it is written to the device and to Firestore. */
export interface StoredProgress {
  readonly v: typeof PROGRESS_VERSION;
  readonly completed: Record<string, number>;
  readonly zone: string;
  readonly at: { readonly x: number; readonly y: number } | null;
}

export function toStored(progress: Progress): StoredProgress {
  // Oldest first, so a copy over the cap loses its newest entries and never the
  // work a student has had longest.
  const kept = Object.entries(progress.completed)
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_COMPLETED);
  return {
    v: PROGRESS_VERSION,
    completed: Object.fromEntries(kept),
    zone: progress.zone,
    at: progress.at ? { x: progress.at.x, y: progress.at.y } : null,
  };
}

/**
 * Read a saved copy. `null` means it cannot be read at all: not an object, a
 * version this build does not know, or no usable zone. Inside a readable copy,
 * an entry that makes no sense is dropped and the rest is kept.
 */
export function parseProgress(input: unknown): Progress | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (raw['v'] !== PROGRESS_VERSION || !isId(raw['zone'])) return null;

  const completed: Record<string, number> = {};
  const solved = raw['completed'];
  if (typeof solved === 'object' && solved !== null && !Array.isArray(solved)) {
    for (const [id, when] of Object.entries(solved)) {
      if (!isId(id) || typeof when !== 'number' || !Number.isFinite(when) || when < 0) continue;
      if (Object.keys(completed).length >= MAX_COMPLETED) break;
      // An id is lowercase words and hyphens, so it cannot be `__proto__`, the
      // one key a plain assignment would not store.
      completed[id] = Math.floor(when);
    }
  }

  let at: Cell | null = null;
  const where = raw['at'];
  if (typeof where === 'object' && where !== null) {
    const { x, y } = where as Record<string, unknown>;
    const onMap = (n: unknown): n is number =>
      typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COORDINATE;
    if (onMap(x) && onMap(y)) at = { x, y };
  }

  return { completed, zone: raw['zone'], at };
}

// ── Two copies of the same student's progress ───────────────────────────────

/** Whether two copies say the same thing. */
export function sameProgress(a: Progress | null, b: Progress | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.zone !== b.zone) return false;
  if ((a.at === null) !== (b.at === null)) return false;
  if (a.at && b.at && (a.at.x !== b.at.x || a.at.y !== b.at.y)) return false;
  const ids = Object.keys(a.completed);
  if (ids.length !== Object.keys(b.completed).length) return false;
  return ids.every((id) => a.completed[id] === b.completed[id]);
}

/** Whether two copies have the same quests solved, whatever else differs. */
export function sameSolved(a: Progress | null, b: Progress | null): boolean {
  const mine = Object.keys(a?.completed ?? {});
  const theirs = b?.completed ?? {};
  return (
    mine.length === Object.keys(theirs).length &&
    mine.every((id) => Object.prototype.hasOwnProperty.call(theirs, id))
  );
}

/**
 * Put this device's copy together with another one, usually the cloud's.
 *
 * A solved quest is never lost: the result has every quest either copy has,
 * each with the earlier of its two times. Where the hero stands is this
 * device's business, so `mine` decides it. Merging is safe to repeat and gives
 * the same answer whichever copy arrives first, which is what lets a phone and
 * a laptop both play offline and agree afterwards.
 *
 * Returns `mine` itself when the other copy adds nothing.
 */
export function mergeProgress(mine: Progress, other: Progress): Progress {
  let completed: Record<string, number> | null = null;
  for (const [id, when] of Object.entries(other.completed)) {
    const have = Object.prototype.hasOwnProperty.call(mine.completed, id)
      ? mine.completed[id]
      : undefined;
    if (have !== undefined && have <= when) continue;
    completed ??= { ...mine.completed };
    completed[id] = when;
  }
  return completed ? { ...mine, completed } : mine;
}

/**
 * Whether the cloud's copy should be replaced by `merged`.
 *
 * A new solve is always worth a write. A new position alone is worth one only
 * for a student who has solved something: a visitor who walks about and leaves
 * creates no document.
 */
export function cloudNeedsWrite(cloud: Progress | null, merged: Progress): boolean {
  if (Object.keys(merged.completed).length === 0) return false;
  return !sameProgress(cloud, merged);
}

// ── Where progress is kept ──────────────────────────────────────────────────

/** Where progress is kept between visits. */
export interface ProgressStore {
  /** What this device has, without waiting for the network. */
  load(): Promise<Progress | null>;
  save(progress: Progress): void;
  /**
   * Be told when another copy arrives after `load`: the cloud's, with quests
   * solved on another device. Returns the unsubscribe function.
   */
  onRemote?(listener: (progress: Progress) => void): () => void;
  /** Write anything still waiting, now: the page is about to go away. */
  flush?(): void;
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
