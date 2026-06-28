// src/react/calculator-semesters-entry.tsx
//
// Phase 5B opt-in entry (Vite only). Mounts the React CalculatorSemesters island
// onto #semestersContainer, but ONLY when explicitly opted in (?reactSemesters=1
// or window.__SHOHOJ_REACT_SEMESTERS_OPTIN__). Default behavior stays 100%
// legacy, so the existing 51-spec e2e and every user are unaffected while the
// React path matures. When opted in it sets __SHOHOJ_REACT_SEMESTERS__ so the
// legacy renderSemesters() stands down, then mounts and triggers a recalc so the
// bridge snapshot (and the other CGPA islands) refresh.

import { createRoot } from 'react-dom/client';

import { AppProviders } from '../app/AppProviders';
import CalculatorSemesters from '../features/calculator/CalculatorSemesters';
import { createFlagSet, searchParamSource, recordSource } from '../platform/configuration/flags';

declare global {
  interface Window {
    __SHOHOJ_REACT_SEMESTERS__?: boolean;
    __SHOHOJ_REACT_SEMESTERS_OPTIN__?: boolean;
  }
}

// Opt-in for the React semesters island, resolved through the typed flag
// registry instead of ad-hoc global reads: `?reactSemesters=1` (query) or
// window.__SHOHOJ_REACT_SEMESTERS_OPTIN__ === true (programmatic). Default stays
// false so the legacy path is untouched for every user.
const ISLAND_FLAGS = {
  reactSemesters: {
    default: false,
    description: 'Opt into the React CalculatorSemesters island (Phase 5B).',
  },
} as const;

function optedIn(): boolean {
  let search = '';
  try {
    search = window.location.search;
  } catch {
    /* location unavailable */
  }
  return createFlagSet(ISLAND_FLAGS, [
    searchParamSource(search),
    recordSource({
      reactSemesters: window.__SHOHOJ_REACT_SEMESTERS_OPTIN__ === true ? true : undefined,
    }),
  ]).isEnabled('reactSemesters');
}

function mount() {
  if (!optedIn()) return;
  const host = document.getElementById('semestersContainer');
  if (!host) return;

  // Gate the legacy renderer before mounting so the two never both write here.
  window.__SHOHOJ_REACT_SEMESTERS__ = true;
  createRoot(host).render(
    <AppProviders label="CGPA calculator">
      <CalculatorSemesters />
    </AppProviders>,
  );

  // Nudge the legacy app to recompute so the bridge + sibling islands sync.
  window._shohoj_recalc?.();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
