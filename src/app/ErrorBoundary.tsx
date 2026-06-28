// src/app/ErrorBoundary.tsx
//
// Typed React error boundary used to wrap major feature areas (Phase 4/5) so a
// crash in one feature cannot take the whole app — and especially the offline
// calculator — down. It renders the error's *safe* `userMessage`, never the raw
// technical message, matching the "never expose raw SDK errors to users" rule.

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { type ShohojError, toShohojError } from '../core/errors';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Custom fallback. Either a static node, or a render function receiving the
   * normalised error and a `reset` callback to retry mounting `children`.
   */
  readonly fallback?: ReactNode | ((error: ShohojError, reset: () => void) => ReactNode);
  /** Optional hook for logging/telemetry. Receives the normalised error. */
  readonly onError?: (error: ShohojError, info: ErrorInfo) => void;
  /** Short label naming the area, used in the default fallback heading. */
  readonly label?: string;
}

interface ErrorBoundaryState {
  readonly error: ShohojError | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toShohojError(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(toShohojError(error), info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const { fallback, label } = this.props;
    if (typeof fallback === 'function') return fallback(error, this.reset);
    if (fallback !== undefined) return fallback;

    return (
      <div role="alert" className="shohoj-error-boundary">
        <h2>{label ? `${label} ran into a problem` : 'Something went wrong'}</h2>
        <p>{error.userMessage}</p>
        <button type="button" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
