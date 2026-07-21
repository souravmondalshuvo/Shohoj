// src/state/ThemeProvider.tsx
//
// Phase 4 React layer over the pure theme model in `src/state/theme.ts`. This
// owns the side effects the model excludes: reading/writing `localStorage`
// under the legacy `shohoj_theme` key and reflecting the active theme onto
// `<html data-theme>` (the attribute the existing CSS already keys off). It
// replaces the imperative theme wiring in js/main.js so React-rendered UI and
// the legacy DOM agree on one source of truth during the migration.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DEFAULT_THEME, THEME_STORAGE_KEY, nextTheme, parseStoredTheme } from './theme';
import type { Theme } from './theme';

export interface ThemeApi {
  readonly theme: Theme;
  /** Flip dark↔light. */
  toggle(): void;
  /** Set an explicit theme. */
  setTheme(theme: Theme): void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/** Read the persisted theme, tolerating storage being unavailable. */
function readStoredTheme(): Theme {
  try {
    return parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Apply the theme to the DOM + storage, mirroring legacy js/main.js side effects. */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the in-memory theme still wins.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer so we read storage exactly once, before first paint.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Keep the DOM attribute and storage in sync whenever the theme changes,
  // including the initial value so a React-owned root themes correctly on mount.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(() => setThemeState((current) => nextTheme(current)), []);

  const api = useMemo<ThemeApi>(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

/** Access the theme API. Throws if used outside a ThemeProvider. */
export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext);
  if (api === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return api;
}
