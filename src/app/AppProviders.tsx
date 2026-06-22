// src/app/AppProviders.tsx
//
// Islands-first composition root. Each React island (see src/react/*-entry.tsx)
// wraps its tree in <AppProviders> so every island gets the same context stack
// in the same order, instead of each entry re-nesting providers by hand. We
// stay islands-first deliberately (no single React root / tab shell yet —
// docs/FULL_REACT_TYPESCRIPT_MIGRATION.md defers that to Phase 13 cutover), so
// the live legacy DOM keeps owning the page during migration.
//
// Order matters: ErrorBoundary is outermost so a crash in any provider or child
// renders the safe fallback rather than a blank island; ThemeProvider sits
// above NotificationProvider so toasts can read theme if needed.
//
// Note: with multiple independent roots, each <AppProviders> holds its own
// provider state. Theme already reflects to <html data-theme> + localStorage so
// the *visual* theme is global; cross-root reactivity of `useTheme()` (so a
// toggle in one root updates another) is deferred until the first React theme
// toggle ships — there is no React theme consumer yet.

import type { ErrorInfo, ReactNode } from 'react';

import { type ShohojError } from '../core/errors';
import { NotificationProvider } from '../state/NotificationProvider';
import { ThemeProvider } from '../state/ThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';

export interface AppProvidersProps {
  readonly children: ReactNode;
  /** Short label naming the island, used in the default error fallback. */
  readonly label?: string;
  /** Optional logging/telemetry hook forwarded to the error boundary. */
  readonly onError?: (error: ShohojError, info: ErrorInfo) => void;
}

export function AppProviders({ children, label, onError }: AppProvidersProps) {
  return (
    <ErrorBoundary label={label} onError={onError}>
      <ThemeProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
