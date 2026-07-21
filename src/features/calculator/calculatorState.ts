// src/features/calculator/calculatorState.ts
//
// Calculator feature/domain state for the React shell (Phase 5). The legacy
// island reads the calculator through window._shohoj_* globals; the shell has no
// legacy app, so the calculator owns its own semester state here instead — a
// pure reducer over the existing immutable mutations, loaded from and persisted
// through the Phase 4 safe persistence engine. No React/DOM/window: the reducer
// and load/persist helpers are unit-testable in isolation.

import type { CourseEntry, SemesterEntry } from '../../core/types';
import { STORAGE_KEY, type StoredShohojStateV1 } from '../../core/types/storage.ts';
import type { Result } from '../../core/result.ts';
import type { StorageError } from '../../core/errors.ts';
import type { KeyValueStore } from '../../services/storage/keyValueStore.ts';
import { announceLocalSave } from '../../services/cloudSync/saveAnnouncer.ts';
import {
  loadAcademicState,
  saveAcademicState,
  type LoadStatus,
} from '../../services/storage/academicStateStore.ts';
import {
  addCourse,
  blankCourse,
  removeCourse,
  removeSemester,
  reorderSemesters,
  updateCourse,
} from './mutations.ts';

export interface CalculatorState {
  readonly semesters: SemesterEntry[];
  readonly startSeason: string;
  readonly startYear: string;
  /** Department code (e.g. "CSE"); '' until the user picks one. */
  readonly currentDept: string;
  /** Planned course codes (#327) — the legacy planner's plan.courses. */
  readonly planCourses: readonly string[];
}

export const EMPTY_CALCULATOR_STATE: CalculatorState = {
  semesters: [],
  startSeason: '',
  startYear: '',
  currentDept: '',
  planCourses: [],
};

export type CalculatorAction =
  | { type: 'addSemester'; name?: string }
  | { type: 'addRunningSemester'; name: string }
  | { type: 'removeSemester'; id: number }
  | { type: 'addCourse'; semId: number }
  | { type: 'removeCourse'; semId: number; index: number }
  | { type: 'updateCourse'; semId: number; index: number; patch: Partial<CourseEntry> }
  | { type: 'reorderSemesters'; srcId: number; tgtId: number }
  | { type: 'setStart'; startSeason: string; startYear: string }
  | { type: 'setDept'; currentDept: string }
  | { type: 'addPlanCourse'; code: string }
  | { type: 'removePlanCourse'; code: string }
  | { type: 'clearPlan' }
  | { type: 'promotePlan'; name: string; courses: CourseEntry[] }
  | { type: 'replace'; state: CalculatorState };

function nextSemesterId(semesters: readonly SemesterEntry[]): number {
  return semesters.reduce((max, s) => Math.max(max, s.id), 0) + 1;
}

/** Pure reducer over the calculator state, built on the immutable mutations. */
export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'addSemester':
      return {
        ...state,
        semesters: [
          ...state.semesters,
          { id: nextSemesterId(state.semesters), name: action.name, courses: [blankCourse()] },
        ],
      };
    case 'addRunningSemester':
      // Legacy parity (addRunningSemester in js/ui/render.js): at most one
      // running semester; a second request is a no-op.
      if (state.semesters.some((s) => s.running)) return state;
      return {
        ...state,
        semesters: [
          ...state.semesters,
          {
            id: nextSemesterId(state.semesters),
            name: action.name,
            running: true,
            courses: [blankCourse()],
          },
        ],
      };
    case 'removeSemester':
      return { ...state, semesters: removeSemester(state.semesters, action.id) };
    case 'addCourse':
      return { ...state, semesters: addCourse(state.semesters, action.semId) };
    case 'removeCourse':
      return { ...state, semesters: removeCourse(state.semesters, action.semId, action.index) };
    case 'updateCourse':
      return {
        ...state,
        semesters: updateCourse(state.semesters, action.semId, action.index, action.patch),
      };
    case 'reorderSemesters':
      return { ...state, semesters: reorderSemesters(state.semesters, action.srcId, action.tgtId) };
    case 'setStart':
      return { ...state, startSeason: action.startSeason, startYear: action.startYear };
    case 'setDept':
      // Legacy onDeptSelect: picking a department resets the planner (its
      // relevance/suggestions are dept-scoped); clearing to '' bails first.
      return {
        ...state,
        currentDept: action.currentDept,
        planCourses: action.currentDept ? [] : state.planCourses,
      };
    case 'addPlanCourse':
      // Legacy addToPlan: adding an already-planned code is a no-op.
      if (!action.code || state.planCourses.includes(action.code)) return state;
      return { ...state, planCourses: [...state.planCourses, action.code] };
    case 'removePlanCourse':
      return { ...state, planCourses: state.planCourses.filter((c) => c !== action.code) };
    case 'clearPlan':
      return { ...state, planCourses: [] };
    case 'promotePlan':
      // Legacy promoteToRunning, atomically: any existing running semester is
      // replaced (the UI confirms first), the plan becomes the one running
      // semester's prefilled courses, and the plan empties.
      if (action.courses.length === 0) return state;
      return {
        ...state,
        semesters: [
          ...state.semesters.filter((s) => !s.running),
          {
            id: nextSemesterId(state.semesters),
            name: action.name,
            running: true,
            courses: action.courses,
          },
        ],
        planCourses: [],
      };
    case 'replace':
      return action.state;
    default:
      return state;
  }
}

export interface LoadedCalculatorState {
  readonly state: CalculatorState;
  /** From the persistence engine: 'loaded' | 'empty' | 'corrupt'. */
  readonly status: LoadStatus;
  /** The full stored snapshot (when loaded), so fields this feature does not
   * own — semesterCounter, forward-compat keys — survive a persist instead of
   * being silently dropped. (planCourses became reducer-owned in #327.) */
  readonly stored: StoredShohojStateV1 | null;
}

/**
 * Load the calculator's initial state through the Phase 4 engine (which backs up
 * + migrates + never overwrites). On empty/corrupt, returns empty state so the
 * calculator opens cleanly while the stored raw is preserved for recovery.
 */
export function loadCalculatorState(store: KeyValueStore): LoadedCalculatorState {
  const result = loadAcademicState(store);
  if (result.status === 'loaded' && result.state !== null) {
    return {
      state: {
        semesters: result.state.semesters ?? [],
        startSeason: result.state.startSeason ?? '',
        startYear: result.state.startYear ?? '',
        currentDept: result.state.currentDept ?? '',
        planCourses: (result.state.planCourses ?? []).filter(
          (c): c is string => typeof c === 'string' && c !== '',
        ),
      },
      status: 'loaded',
      stored: result.state,
    };
  }
  return { state: EMPTY_CALCULATOR_STATE, status: result.status, stored: null };
}

/**
 * Persist the calculator state through the Phase 4 engine (stamps schema
 * version). `base` is the snapshot returned by loadCalculatorState — spreading
 * it first preserves stored fields this feature does not own (semesterCounter,
 * unknown forward-compat keys) instead of dropping them. On a successful write
 * the persisted snapshot is announced (#333) so a signed-in cloud shell can
 * queue the debounced cloud save; offline shells have no subscriber.
 */
export function persistCalculatorState(
  store: KeyValueStore,
  state: CalculatorState,
  base?: StoredShohojStateV1 | null,
): Result<void, StorageError> {
  const result = saveAcademicState(store, {
    ...(base ?? {}),
    semesters: state.semesters,
    startSeason: state.startSeason,
    startYear: state.startYear,
    currentDept: state.currentDept,
    planCourses: [...state.planCourses],
  });
  // Announce the exact bytes now in the store, so the cloud copy matches local
  // (the echo-skip fingerprint compare depends on byte parity).
  if (result.ok) {
    const written = store.getItem(STORAGE_KEY);
    if (written !== null) announceLocalSave(written);
  }
  return result;
}
