// src/state/theme.ts
//
// Pure theme model. Mirrors the legacy theme behavior in js/main.js exactly:
// two themes, persisted under `shohoj_theme`, defaulting to dark (the legacy
// code deliberately does NOT consult `prefers-color-scheme`). Kept free of
// React, DOM, and storage so it is trivially testable; the React provider and
// the `data-theme` / localStorage side effects layer on top in
// `src/state/ThemeProvider.tsx`. See docs/FULL_REACT_TYPESCRIPT_MIGRATION.md §6.

export type Theme = 'dark' | 'light';

/** localStorage key the legacy app already uses; preserved for parity. */
export const THEME_STORAGE_KEY = 'shohoj_theme';

/** Legacy default when nothing is stored (js/main.js line 243). */
export const DEFAULT_THEME: Theme = 'dark';

/** A raw stored value is honored only if it is one of the known themes. */
export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** Resolve a possibly-missing/invalid stored value to a concrete theme. */
export function parseStoredTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME;
}

/** The theme produced by toggling the current one. */
export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
