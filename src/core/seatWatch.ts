/**
 * Seat-watch core — pure helpers behind "alert me when a full section opens".
 * The Seats tab lets a student watch sections; this module owns the watchlist
 * shape, its localStorage (de)serialization, and — the important bit — the
 * *edge-triggered transition detector* that decides when a watched section has
 * just gone from "no seat" to "has a seat".
 *
 * I/O-free on purpose: polling, the Notification API, and storage access live
 * in the runtime (`js/ui/seatsTab.js`). Everything here is deterministic so it
 * can be unit-tested against fixtures. Seat math is delegated to `seatStatus`
 * so the watcher and the Seats tab always agree on what "open" means.
 */

import type { NormalizedSection } from './connectFeed';
import { seatInfo } from './seatStatus';

/** Hard cap on watched sections — keeps the panel and the poll cost bounded. */
export const MAX_WATCHES = 50;

/**
 * localStorage key for the persisted watchlist. Prefixed (not a bare
 * `STORAGE_KEY`) because build3.py flattens every module into one scope, where
 * a second top-level `STORAGE_KEY` would collide with state.js and kill the
 * whole bundle.
 */
export const SEAT_WATCH_STORAGE_KEY = 'shohoj_seat_watch_v1';

export interface WatchEntry {
  sectionId: number;
  /** Denormalized so the panel renders before/without the live feed. */
  courseCode: string;
  sectionName: string;
  /** Epoch ms when the watch was added. Cosmetic ("watching since…"). */
  addedAt: number;
  /**
   * Whether the section had a seat at the last evaluation. Drives
   * edge-triggering: we alert only on a false→true transition, and the flag
   * resets to false when the section goes full again so a later re-open
   * alerts afresh. Persisted so a reload resumes from the last known state.
   */
  hadSeat: boolean;
}

/** True when a section currently has at least one seat left. */
export function hasSeat(section: NormalizedSection): boolean {
  return seatInfo(section).left > 0;
}

/**
 * Build a watch entry for `section`. `hadSeat` is seeded from the section's
 * *current* state so watching an already-open section doesn't immediately
 * alert — only a later full→open transition does.
 */
export function makeWatch(section: NormalizedSection, now: number = Date.now()): WatchEntry {
  return {
    sectionId: section.sectionId,
    courseCode: section.courseCode,
    sectionName: section.sectionName,
    addedAt: now,
    hadSeat: hasSeat(section),
  };
}

export function isWatched(list: readonly WatchEntry[], sectionId: number): boolean {
  return list.some((w) => w.sectionId === sectionId);
}

/**
 * A new list with `section` watched. No-op (returns the same array) if it's
 * already watched or the list is at `MAX_WATCHES`; the caller decides how to
 * surface "full". Never mutates the input.
 */
export function addWatch(
  list: readonly WatchEntry[],
  section: NormalizedSection,
  now: number = Date.now(),
): WatchEntry[] {
  if (isWatched(list, section.sectionId)) return list.slice();
  if (list.length >= MAX_WATCHES) return list.slice();
  return [...list, makeWatch(section, now)];
}

/** A new list with `sectionId` removed. Never mutates the input. */
export function removeWatch(list: readonly WatchEntry[], sectionId: number): WatchEntry[] {
  return list.filter((w) => w.sectionId !== sectionId);
}

/** Index sections by `sectionId` for O(1) lookup during evaluation. */
export function indexBySectionId(
  sections: readonly NormalizedSection[],
): Map<number, NormalizedSection> {
  const out = new Map<number, NormalizedSection>();
  for (const s of sections) out.set(s.sectionId, s);
  return out;
}

export interface SeatDrop {
  entry: WatchEntry;
  section: NormalizedSection;
  seatsLeft: number;
}

export interface EvaluateResult {
  /** Watchlist with each entry's `hadSeat` refreshed; input order preserved. */
  watches: WatchEntry[];
  /** Watched sections that transitioned no-seat → seat in this evaluation. */
  drops: SeatDrop[];
}

/**
 * Evaluate every watch against the current feed (a `sectionId → section` map,
 * see {@link indexBySectionId}). Returns an updated watchlist plus the set of
 * sections that just opened up.
 *
 * Edge-triggered: a drop is reported only when a section's seat state flips
 * from false (it had no seat at the previous evaluation) to true. A watched
 * section missing from the feed is left untouched (state preserved) — it may be
 * a transient gap, not a true close.
 */
export function evaluateWatches(
  list: readonly WatchEntry[],
  sectionById: ReadonlyMap<number, NormalizedSection>,
): EvaluateResult {
  const watches: WatchEntry[] = [];
  const drops: SeatDrop[] = [];
  for (const entry of list) {
    const section = sectionById.get(entry.sectionId);
    if (!section) {
      watches.push(entry);
      continue;
    }
    const open = hasSeat(section);
    if (open && !entry.hadSeat) {
      drops.push({ entry, section, seatsLeft: seatInfo(section).left });
    }
    watches.push(open === entry.hadSeat ? entry : { ...entry, hadSeat: open });
  }
  return { watches, drops };
}

// ---------------------------------------------------------------------------
// Persistence (tolerant round-trip — the runtime owns the actual storage)
// ---------------------------------------------------------------------------

export function serializeWatches(list: readonly WatchEntry[]): string {
  return JSON.stringify(list);
}

function normalizeEntry(value: unknown): WatchEntry | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.sectionId !== 'number' || !Number.isFinite(o.sectionId)) return null;
  if (typeof o.courseCode !== 'string' || o.courseCode === '') return null;
  return {
    sectionId: o.sectionId,
    courseCode: o.courseCode,
    sectionName: typeof o.sectionName === 'string' ? o.sectionName : '',
    addedAt: typeof o.addedAt === 'number' && Number.isFinite(o.addedAt) ? o.addedAt : 0,
    hadSeat: o.hadSeat === true,
  };
}

/**
 * Parse a persisted watchlist, dropping anything malformed and de-duping by
 * `sectionId` (first wins). Returns [] for null/garbage. Caps at `MAX_WATCHES`.
 */
export function parseWatches(raw: string | null | undefined): WatchEntry[] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: WatchEntry[] = [];
  const seen = new Set<number>();
  for (const item of parsed) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.sectionId)) continue;
    seen.add(entry.sectionId);
    out.push(entry);
    if (out.length >= MAX_WATCHES) break;
  }
  return out;
}
