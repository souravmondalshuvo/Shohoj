// src/features/calculator/calculatorBridge.ts
//
// Phase 5B state bridge. The legacy calculator owns a single mutable `state`
// object (js/core/state.js) shared by every feature, and broadcasts a
// `shohoj:recalc` DOM event after each change (js/main.js). Rather than import
// that singleton — which would be a *different* instance under Vite vs the
// legacy bundle — the React islands read it through the same window bridge the
// existing CGPA islands use. This module turns that bridge into one typed,
// reactive source: a `useSyncExternalStore` hook with stable snapshots so
// reads are tear-free and re-render exactly once per recalc.
//
// Reads only for now; a typed write path (a `_shohoj_setSemesters` legacy
// setter) lands with the first island that mutates semesters.

import { createContext, useContext, useSyncExternalStore } from 'react';

import type { SemesterEntry, SemesterSeason } from '../../core/types';
import type { CourseSuggestion } from './courseSearch';
import { UNIVERSITIES, type UniversityProfile } from '../../core/university.ts';

export interface CalculatorInputs {
  readonly semesters: readonly SemesterEntry[];
  readonly startSeason: SemesterSeason | '';
  readonly startYear: string;
  /** Department code ('' when unset). The legacy window bridge maps this to ''
   * — _shohoj_getCgpaInputs doesn't expose it, and no island renders the
   * dept-dependent dashboard pieces; the shell route supplies the real value. */
  readonly currentDept: string;
}

declare global {
  interface Window {
    _shohoj_getCgpaInputs?: () => {
      semesters: SemesterEntry[];
      startSeason: SemesterSeason | '';
      startYear: string;
    };
    _shohoj_recalc?: () => void;
    _shohoj_setSemesters?: (semesters: SemesterEntry[]) => void;
    _shohoj_isKnownCourse?: (code: string) => boolean;
    _shohoj_courseCatalog?: CourseSuggestion[];
    _shohoj_loadDemoMode?: () => void;
    addSemester?: () => void;
    addRunningSemester?: () => void;
    openRateForCourse?: (semId: number, idx: number) => void;
  }
}

const RECALC_EVENT = 'shohoj:recalc';
const EMPTY: CalculatorInputs = { semesters: [], startSeason: '', startYear: '', currentDept: '' };

// One cached snapshot shared by all subscribers (there is one legacy state).
// Rebuilt only on recalc events and at subscribe time, so getSnapshot returns a
// stable reference between events — required by useSyncExternalStore.
let cached: CalculatorInputs = EMPTY;
let primed = false;

function buildSnapshot(): CalculatorInputs {
  const raw = typeof window !== 'undefined' ? window._shohoj_getCgpaInputs?.() : undefined;
  if (!raw) return EMPTY;
  return {
    semesters: raw.semesters ?? [],
    startSeason: raw.startSeason ?? '',
    startYear: raw.startYear ?? '',
    currentDept: '',
  };
}

/** Current typed calculator inputs. Stable between recalc events. */
export function getCalculatorSnapshot(): CalculatorInputs {
  if (!primed) {
    cached = buildSnapshot();
    primed = true;
  }
  return cached;
}

/** Subscribe to legacy recalc broadcasts; refreshes the snapshot then notifies. */
export function subscribeCalculator(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  // Refresh now in case state changed while no island was mounted.
  cached = buildSnapshot();
  primed = true;
  const handler = () => {
    cached = buildSnapshot();
    onChange();
  };
  window.addEventListener(RECALC_EVENT, handler);
  return () => window.removeEventListener(RECALC_EVENT, handler);
}

function getServerSnapshot(): CalculatorInputs {
  return EMPTY;
}

/** React hook: typed, tear-free read of the shared calculator state. */
export function useCalculatorInputs(): CalculatorInputs {
  return useSyncExternalStore(subscribeCalculator, getCalculatorSnapshot, getServerSnapshot);
}

/** Ask the legacy app to recompute + re-broadcast (after an island mutates state). */
export function requestRecalc(): void {
  if (typeof window !== 'undefined') window._shohoj_recalc?.();
}

// ---------------------------------------------------------------------------
// Injectable bridge (Phase 5B route wiring)
//
// CalculatorSemesters needs more than reads: it commits new semester lists,
// queries the course catalog, adds calendar-aware semesters, loads demo data,
// and opens the rate-course modal. On the legacy/island path all of these are
// window globals. To render the same component against the React-shell reducer
// container (which has no legacy app), the whole surface is funnelled through
// this one typed bridge. The default is `legacyWindowBridge`, so the opt-in
// island path — which renders <CalculatorSemesters /> without a provider — keeps
// its exact current behavior. The shell route supplies a reducer-backed bridge.
// ---------------------------------------------------------------------------

export interface CalculatorBridge {
  /** Reactive, tear-free read of the current calculator inputs. */
  useInputs(): CalculatorInputs;
  /** Replace the semester list (legacy: _shohoj_setSemesters → persist + recalc). */
  commit(semesters: SemesterEntry[]): void;
  /** Whether a course code is in the catalog (legacy: _shohoj_isKnownCourse). */
  isKnownCode(code: string): boolean;
  /** Course catalog backing the autocomplete (legacy: _shohoj_courseCatalog). */
  readonly catalog: readonly CourseSuggestion[];
  /** Calendar-aware add-semester (legacy: window.addSemester). */
  addSemester(): void;
  /** Add the single running semester (legacy: window.addRunningSemester). */
  addRunningSemester(): void;
  /** Load demo data (legacy: _shohoj_loadDemoMode). */
  loadDemo(): void;
  /** Open the rate-course modal for a course (legacy: openRateForCourse). */
  rateForCourse(semId: number, index: number): void;
  /** Open the transcript-import picker (legacy: click #transcriptFileInput). */
  importTranscript(): void;
  /**
   * The campus whose academic rules apply — grading scale, retake policy,
   * repeat eligibility, credit-load limits.
   *
   * Non-nullable on purpose. Every consumer needs a scale to render a grade at
   * all, and an optional one would be reached past with `?? BRACU` at a dozen
   * call sites, which is the exact bug this is here to close. Deciding the
   * campus is the provider's job: the shell supplies the signed-in student's
   * profile and renders nothing until auth settles, while the legacy island
   * path supplies BRACU because legacy admits no other domain.
   */
  readonly university: UniversityProfile;
}

/** Default bridge: delegates the whole surface to the legacy window globals. */
export const legacyWindowBridge: CalculatorBridge = {
  // The legacy page gates sign-in on @g.bracu.ac.bd (js/auth/firebase.js), so
  // this path has exactly one possible campus. It is named here rather than
  // left implicit so that the day legacy learns about other campuses, the
  // compiler points at this line.
  university: UNIVERSITIES.bracu,
  useInputs: useCalculatorInputs,
  commit(semesters) {
    window._shohoj_setSemesters?.(semesters);
  },
  isKnownCode(code) {
    return window._shohoj_isKnownCourse?.(code) ?? false;
  },
  get catalog() {
    return (typeof window !== 'undefined' && window._shohoj_courseCatalog) || [];
  },
  addSemester() {
    window.addSemester?.();
  },
  addRunningSemester() {
    window.addRunningSemester?.();
  },
  loadDemo() {
    window._shohoj_loadDemoMode?.();
  },
  rateForCourse(semId, index) {
    window.openRateForCourse?.(semId, index);
  },
  importTranscript() {
    // The legacy page's one hidden picker; sim:importTranscript does the same.
    document.getElementById('transcriptFileInput')?.click();
  },
};

const CalculatorBridgeContext = createContext<CalculatorBridge>(legacyWindowBridge);

/** Provider for an injected calculator bridge (the shell route uses this). */
export const CalculatorBridgeProvider = CalculatorBridgeContext.Provider;

/** Current calculator bridge — `legacyWindowBridge` unless a provider overrides it. */
export function useCalculatorBridge(): CalculatorBridge {
  return useContext(CalculatorBridgeContext);
}
