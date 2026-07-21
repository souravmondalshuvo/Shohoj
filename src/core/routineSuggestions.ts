/**
 * Routine Builder — auto-suggest engine.
 *
 * Given a set of picked courses, enumerate every combination of
 * "one section per course", drop class-clashing combos entirely, rank
 * the survivors by an explainable score (faculty rating + seat slack +
 * exam-clash penalty), and return the top K.
 *
 * Pure on purpose: feed it `(courseCodes, sectionIndex, ratingMap, options)`
 * and you get a ranked list back. The runtime UI handles persistence and
 * "Apply this combo" wiring.
 */

import {
  hasClassClash,
  hasExamClash,
  type NormalizedSection,
  type SectionIndex,
} from './connectFeed';
import type { FacultyRating } from './routineFaculty';
import { ratingTier } from './routineFaculty';

export interface SuggestionOptions {
  /** Max combinations to enumerate before bailing. Default 5_000. */
  maxCombinations?: number;
  /** How many top suggestions to return. Default 5. */
  topK?: number;
  /** Skip sections at >= this seat-fill ratio. Default 1.0 (only full skipped). */
  skipAboveFillRatio?: number;
  /** Heavy penalty on score when a combo has any exam clash. Default 25. */
  examClashPenalty?: number;
  /** Bonus per "excellent" rating tier section. Default 4. */
  excellentBonus?: number;
  /** Bonus per "good" tier section. Default 2. */
  goodBonus?: number;
  /** Penalty per "bad" tier section. Default 4. */
  badPenalty?: number;
  /** Penalty per "warn" tier section. Default 2. */
  warnPenalty?: number;
  /** Reward for seat slack (consumedSeat / capacity); multiplied by per-section weight. Default 2. */
  seatSlackWeight?: number;
  /**
   * Penalty per idle hour between consecutive same-day classes — rewards
   * compact weeks. Default 0 (off), so callers opt in explicitly and existing
   * behavior is unchanged.
   */
  gapWeight?: number;
  /** Predicate to drop sections before enumeration (e.g. time-of-day filters). Default: keep all. */
  sectionFilter?: (section: NormalizedSection) => boolean;
}

export interface SuggestionBreakdown {
  ratingScore: number;
  seatScore: number;
  examClashPenalty: number;
  /** Total idle minutes between consecutive same-day classes (informational). */
  gapMinutes: number;
  /** Score penalty applied for those gaps; 0 when `gapWeight` is 0. */
  gapPenalty: number;
  avgRating: number | null;
  excellentCount: number;
  goodCount: number;
  midCount: number;
  warnCount: number;
  badCount: number;
  unratedCount: number;
  fullCount: number;
  tightCount: number;
  examClashPairs: number;
}

export interface Suggestion {
  sections: NormalizedSection[];
  score: number;
  breakdown: SuggestionBreakdown;
}

export interface SuggestionsResult {
  suggestions: Suggestion[];
  /** Courses that had no usable sections after filtering. */
  skippedCourses: string[];
  /** True if we hit the maxCombinations cap before exhausting. */
  truncated: boolean;
  /** Combinations actually enumerated (after section filter). */
  enumerated: number;
  /** Combinations that survived class-clash filtering. */
  feasible: number;
}

const DEFAULTS: Required<SuggestionOptions> = {
  maxCombinations: 5_000,
  topK: 5,
  skipAboveFillRatio: 1.0,
  examClashPenalty: 25,
  excellentBonus: 4,
  goodBonus: 2,
  badPenalty: 4,
  warnPenalty: 2,
  seatSlackWeight: 2,
  gapWeight: 0,
  sectionFilter: () => true,
};

function fillRatio(s: NormalizedSection): number {
  if (s.capacity <= 0) return 0;
  return s.consumedSeat / s.capacity;
}

/**
 * Total idle minutes between consecutive classes on the same day, summed over
 * the week. Slots are grouped per day and sorted; only positive gaps count, so
 * overlaps (which clash-filtering removes anyway) never produce negative time.
 */
function totalGapMinutes(row: readonly NormalizedSection[]): number {
  const byDay = new Map<string, Array<{ startMin: number; endMin: number }>>();
  for (const s of row) {
    for (const slot of s.classSlots) {
      const arr = byDay.get(slot.day);
      if (arr) arr.push(slot);
      else byDay.set(slot.day, [slot]);
    }
  }
  let total = 0;
  for (const slots of byDay.values()) {
    slots.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i].startMin - slots[i - 1].endMin;
      if (gap > 0) total += gap;
    }
  }
  return total;
}

function filterUsableSections(
  sections: readonly NormalizedSection[],
  maxFill: number,
  sectionFilter: (section: NormalizedSection) => boolean,
): NormalizedSection[] {
  return sections.filter((s) => fillRatio(s) < maxFill && sectionFilter(s));
}

/**
 * Cartesian product over per-course section lists. Generator-style would be
 * nicer but JS gens are slow; we materialize but bail when we exceed cap.
 */
function enumerate(
  perCourse: NormalizedSection[][],
  cap: number,
): { combos: NormalizedSection[][]; truncated: boolean } {
  if (perCourse.length === 0) return { combos: [], truncated: false };
  if (perCourse.some((list) => list.length === 0)) return { combos: [], truncated: false };
  const combos: NormalizedSection[][] = [];
  const idx = new Array(perCourse.length).fill(0);
  let truncated = false;
  while (true) {
    const row: NormalizedSection[] = perCourse.map((list, i) => list[idx[i]]);
    combos.push(row);
    if (combos.length >= cap) {
      truncated = true;
      break;
    }
    let i = perCourse.length - 1;
    while (i >= 0) {
      idx[i] += 1;
      if (idx[i] < perCourse[i].length) break;
      idx[i] = 0;
      i -= 1;
    }
    if (i < 0) break;
  }
  return { combos, truncated };
}

function anyClassClash(row: NormalizedSection[]): boolean {
  for (let i = 0; i < row.length; i++) {
    for (let j = i + 1; j < row.length; j++) {
      if (hasClassClash(row[i], row[j])) return true;
    }
  }
  return false;
}

function countExamClashPairs(row: NormalizedSection[]): number {
  let n = 0;
  for (let i = 0; i < row.length; i++) {
    for (let j = i + 1; j < row.length; j++) {
      if (hasExamClash(row[i], row[j])) n += 1;
    }
  }
  return n;
}

function ratingFor(
  section: NormalizedSection,
  ratingMap: Map<string, FacultyRating>,
): FacultyRating | null {
  const key = (section.facultyInitials || '').toUpperCase();
  if (!key) return null;
  return ratingMap.get(key) ?? null;
}

export function scoreCombination(
  row: readonly NormalizedSection[],
  ratingMap: Map<string, FacultyRating>,
  options: SuggestionOptions = {},
): Suggestion {
  const opts: Required<SuggestionOptions> = { ...DEFAULTS, ...options };

  let ratingSum = 0;
  let ratingDenom = 0;
  let excellentCount = 0,
    goodCount = 0,
    midCount = 0;
  let warnCount = 0,
    badCount = 0,
    unratedCount = 0;

  let ratingScore = 0;
  for (const s of row) {
    const r = ratingFor(s, ratingMap);
    if (!r || r.overall === null) {
      unratedCount += 1;
      continue;
    }
    ratingSum += r.overall;
    ratingDenom += 1;
    const tier = r.tier === 'low-sample' ? ratingTier(r.overall, 99) : r.tier;
    if (tier === 'excellent') {
      excellentCount += 1;
      ratingScore += opts.excellentBonus;
    } else if (tier === 'good') {
      goodCount += 1;
      ratingScore += opts.goodBonus;
    } else if (tier === 'mid') {
      midCount += 1;
    } else if (tier === 'warn') {
      warnCount += 1;
      ratingScore -= opts.warnPenalty;
    } else if (tier === 'bad') {
      badCount += 1;
      ratingScore -= opts.badPenalty;
    }
  }

  let seatScore = 0;
  let fullCount = 0,
    tightCount = 0;
  for (const s of row) {
    const fr = fillRatio(s);
    if (fr >= 1.0) fullCount += 1;
    else if (fr > 0.85) tightCount += 1;
    // Reward seat slack: 0 fill = +weight, 1.0 = 0.
    seatScore += (1 - Math.min(1, fr)) * opts.seatSlackWeight;
  }

  const examPairs = countExamClashPairs(row as NormalizedSection[]);
  const examClashPenalty = examPairs * opts.examClashPenalty;

  const gapMinutes = totalGapMinutes(row);
  const gapPenalty = (gapMinutes / 60) * opts.gapWeight;

  const score = ratingScore + seatScore - examClashPenalty - gapPenalty;

  return {
    sections: row as NormalizedSection[],
    score,
    breakdown: {
      ratingScore,
      seatScore,
      examClashPenalty,
      gapMinutes,
      gapPenalty,
      avgRating: ratingDenom > 0 ? ratingSum / ratingDenom : null,
      excellentCount,
      goodCount,
      midCount,
      warnCount,
      badCount,
      unratedCount,
      fullCount,
      tightCount,
      examClashPairs: examPairs,
    },
  };
}

export function suggestCombinations(
  courseCodes: readonly string[],
  index: SectionIndex,
  ratingMap: Map<string, FacultyRating> = new Map(),
  options: SuggestionOptions = {},
): SuggestionsResult {
  const opts: Required<SuggestionOptions> = { ...DEFAULTS, ...options };

  const skippedCourses: string[] = [];
  const perCourse: NormalizedSection[][] = [];
  for (const code of courseCodes) {
    const list = index.get(code) ?? [];
    const usable = filterUsableSections(list, opts.skipAboveFillRatio, opts.sectionFilter);
    if (usable.length === 0) skippedCourses.push(code);
    else perCourse.push(usable);
  }
  if (perCourse.length === 0) {
    return { suggestions: [], skippedCourses, truncated: false, enumerated: 0, feasible: 0 };
  }

  const { combos, truncated } = enumerate(perCourse, opts.maxCombinations);
  let feasible = 0;
  const scored: Suggestion[] = [];
  for (const row of combos) {
    if (anyClassClash(row)) continue;
    feasible += 1;
    scored.push(scoreCombination(row, ratingMap, opts));
  }
  scored.sort((a, b) => b.score - a.score);

  return {
    suggestions: scored.slice(0, opts.topK),
    skippedCourses,
    truncated,
    enumerated: combos.length,
    feasible,
  };
}
