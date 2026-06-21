// src/core/errors.ts
//
// Typed error hierarchy for recoverable failures across Shohoj. Two design
// goals carried over from the security/privacy constraints:
//
//   1. Every error carries a machine-readable `code` so call sites and the
//      notification layer can branch without string-matching messages.
//   2. Every error carries a `userMessage` that is always safe to display.
//      Raw SDK / network errors must never reach ordinary users (see
//      docs/SECURITY.md and Phase 6 of the migration); the technical `message`
//      stays for logs, the `userMessage` is what the UI shows.
//
// Pure — no React, Firebase, DOM, or browser globals.

export type ShohojErrorCode =
  | 'storage'
  | 'validation'
  | 'config'
  | 'firebase_unavailable'
  | 'worker'
  | 'not_found'
  | 'permission'
  | 'unknown';

export interface ShohojErrorOptions {
  /** Message safe to show end users. Falls back to a generic line. */
  readonly userMessage?: string;
  /** Underlying cause (e.g. a raw SDK error) — kept for logs, never shown. */
  readonly cause?: unknown;
}

const GENERIC_USER_MESSAGE = 'Something went wrong. Please try again.';

/** Base class for all recoverable Shohoj failures. */
export class ShohojError extends Error {
  readonly code: ShohojErrorCode;
  readonly userMessage: string;

  constructor(code: ShohojErrorCode, message: string, options: ShohojErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.userMessage = options.userMessage ?? GENERIC_USER_MESSAGE;
    // `name` mirrors the concrete subclass for readable stacks/logs.
    this.name = new.target.name;
  }
}

/** localStorage / IndexedDB / persistence failures. */
export class StorageError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('storage', message, {
      userMessage: "Couldn't save your data locally. Your changes may not persist.",
      ...options,
    });
  }
}

/** Invalid or malformed input / restored state. */
export class ValidationError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('validation', message, {
      userMessage: 'Some of the data could not be read and was skipped.',
      ...options,
    });
  }
}

/** Missing or invalid runtime configuration. */
export class ConfigError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('config', message, {
      userMessage: 'This feature is unavailable due to a configuration problem.',
      ...options,
    });
  }
}

/**
 * Firebase/auth/cloud is unreachable or failed to initialise. Offline academic
 * tools must keep working when this is raised (see firebase-isolation tests).
 */
export class FirebaseUnavailableError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('firebase_unavailable', message, {
      userMessage: 'Cloud features are offline right now. Your local tools still work.',
      ...options,
    });
  }
}

/** Cloudflare Worker (papers/reviews relay) request failed. */
export class WorkerError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('worker', message, {
      userMessage: "Couldn't reach the server. Please try again in a moment.",
      ...options,
    });
  }
}

/** Requested resource does not exist. */
export class NotFoundError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('not_found', message, {
      userMessage: "That item couldn't be found.",
      ...options,
    });
  }
}

/** Caller is not authorised for the action (e.g. non-admin). */
export class PermissionError extends ShohojError {
  constructor(message: string, options: ShohojErrorOptions = {}) {
    super('permission', message, {
      userMessage: "You don't have permission to do that.",
      ...options,
    });
  }
}

/** True when `value` is any Shohoj error (works across the subclasses). */
export function isShohojError(value: unknown): value is ShohojError {
  return value instanceof ShohojError;
}

/**
 * Normalise an unknown thrown value into a ShohojError so the notification and
 * logging layers always have a `code` + safe `userMessage`. Unknown causes are
 * preserved for logs but never surfaced to users.
 */
export function toShohojError(value: unknown): ShohojError {
  if (value instanceof ShohojError) return value;
  if (value instanceof Error) {
    return new ShohojError('unknown', value.message, { cause: value });
  }
  return new ShohojError('unknown', String(value), { cause: value });
}
