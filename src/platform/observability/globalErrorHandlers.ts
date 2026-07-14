// src/platform/observability/globalErrorHandlers.ts
//
// Frontend last-resort error capture. Routes otherwise-unhandled exceptions and
// promise rejections through the structured logger (logger.ts) so they surface
// as machine-readable records instead of vanishing into the browser console.
//
// SAFETY: only the error's name/message/code are logged (via fieldsFromError).
// We deliberately do NOT log DOM contents, form values, tokens, or any other
// potentially sensitive data — see docs/OBSERVABILITY.md for the redaction rule.

import { fieldsFromError, type Logger } from './logger.ts';

/** Minimal event-target surface so this is testable without a DOM. */
export interface ErrorEventTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener?(type: string, listener: (event: unknown) => void): void;
}

function extractError(event: unknown): unknown {
  const e = event as { error?: unknown; message?: unknown; reason?: unknown } | null;
  if (!e) return undefined;
  // window 'error' events carry .error (an Error) or fall back to .message;
  // 'unhandledrejection' events carry .reason.
  return e.error ?? e.reason ?? e.message;
}

/**
 * Install `error` and `unhandledrejection` handlers on `target` (default:
 * `globalThis`, i.e. the window in the browser). Returns a disposer that removes
 * them again — handy for tests and hot-reload.
 */
export function installGlobalErrorHandlers(
  logger: Logger,
  target: ErrorEventTarget = globalThis as unknown as ErrorEventTarget,
): () => void {
  if (typeof target?.addEventListener !== 'function') {
    // No event target (e.g. SSR / a non-DOM runtime) — nothing to install.
    return () => {};
  }

  const onError = (event: unknown): void => {
    logger.error('uncaught frontend error', {
      event: 'window_error',
      ...fieldsFromError(extractError(event)),
    });
  };

  const onRejection = (event: unknown): void => {
    logger.error('unhandled promise rejection', {
      event: 'unhandled_rejection',
      ...fieldsFromError(extractError(event)),
    });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);

  return () => {
    target.removeEventListener?.('error', onError);
    target.removeEventListener?.('unhandledrejection', onRejection);
  };
}
