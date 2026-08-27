// src/app/providers/CalculatorProvider.tsx
//
// One calculator state for the whole shell.
//
// Legacy keeps a single academic state and renders `.calc-header` — the setup
// wizard and the live `.cgpa-val` — above the tab bar, so the CGPA is on screen
// on every tab. The shell could not do that while three routes each owned their
// own reducer (CalculatorRoute, PlannerRoute and TranscriptRoute all ran the
// same load/useReducer/persist block): nothing above the router had a state to
// read, and whichever route happened to be mounted owned the only copy.
//
// The duplication was also a correctness bug on its own. All three persisted to
// the same storage key from separate reducers seeded at separate times, so
// visiting two of them in one session made the last writer win — an edit made
// on /planner could be overwritten by a stale snapshot /transcript had loaded
// minutes earlier.
//
// The load/persist semantics are unchanged, and deliberately so: the seed write
// is still skipped (a corrupt raw value that the load path preserves for
// recovery must not be immediately overwritten), and `loaded.stored` still
// rides along on every persist so stored fields this feature does not own —
// semesterCounter, forward-compat keys — survive instead of being dropped.

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Dispatch, ReactNode } from 'react';

import {
  calculatorReducer,
  loadCalculatorState,
  persistCalculatorState,
} from '../../features/calculator/calculatorState';
import type {
  CalculatorAction,
  CalculatorState,
  LoadedCalculatorState,
} from '../../features/calculator/calculatorState';
import { createBrowserStore } from '../../services/storage/browserKeyValueStore';
import type { KeyValueStore } from '../../services/storage/keyValueStore';
import { useAuth } from './AuthProvider';

export interface CalculatorContextValue {
  readonly state: CalculatorState;
  readonly dispatch: Dispatch<CalculatorAction>;
  /** The snapshot the state was seeded from; routes pass it back on persist. */
  readonly loaded: LoadedCalculatorState;
  /** The same store instance the provider loads and persists through. */
  readonly store: KeyValueStore;
}

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

export function CalculatorProvider({ children }: { readonly children: ReactNode }) {
  // One store instance for the provider's lifetime (load seed + every persist).
  const store = useMemo(() => createBrowserStore(), []);
  // The persisted snapshot carries the signed-in student's review receipt, and
  // that map is keyed by uid because a browser can be shared (#627).
  const { uid } = useAuth();
  const loaded = useMemo(() => loadCalculatorState(store), [store]);
  const [state, dispatch] = useReducer(calculatorReducer, loaded.state);

  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    persistCalculatorState(store, state, loaded.stored, uid);
  }, [store, state, loaded, uid]);

  const value = useMemo<CalculatorContextValue>(
    () => ({ state, dispatch, loaded, store }),
    [state, loaded, store],
  );

  return <CalculatorContext.Provider value={value}>{children}</CalculatorContext.Provider>;
}

/**
 * The shell's calculator state.
 *
 * Throws rather than returning a fallback: a route that renders its own empty
 * state outside the provider looks like a student with no courses, which is the
 * kind of failure that reads as data loss instead of as a wiring mistake.
 */
export function useCalculator(): CalculatorContextValue {
  const value = useContext(CalculatorContext);
  if (value === null) {
    throw new Error('useCalculator must be used inside <CalculatorProvider>');
  }
  return value;
}
