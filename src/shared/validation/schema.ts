// src/shared/validation/schema.ts
//
// Runtime-validation boundary (Phase 2). The target architecture treats ALL
// external data as `unknown` until a schema validates it — Firestore documents,
// route/search params, form input, Worker requests, queue messages, env
// bindings, the CONNECT feed, localStorage, imported transcripts, file metadata.
// No `data as T` casts without first passing through here.
//
// This wraps Zod's `safeParse` into the codebase's typed `Result` + the existing
// `ValidationError` hierarchy, so validation failures are values callers must
// inspect (never thrown SDK noise) and always carry a user-safe message.
//
// Pure — no React, Firebase, DOM, or browser globals — usable from domain,
// application, infrastructure and React alike.

import { z } from 'zod';

import { type Result, ok, err } from '../../core/result.ts';
import { ValidationError } from '../../core/errors.ts';

/** One human-readable field problem, ready for form highlighting. */
export interface FieldIssue {
  /** Dotted path to the offending field, e.g. `ratings.teaching`. Empty for the root. */
  readonly path: string;
  /** Validator message, e.g. "Expected number, received string". */
  readonly message: string;
}

/**
 * A {@link ValidationError} that also carries the structured per-field issues, so
 * UIs can map failures to inputs while the generic `userMessage` stays safe to
 * display. The raw {@link z.ZodError} is preserved as `cause` for logs only.
 */
export class SchemaValidationError extends ValidationError {
  readonly issues: readonly FieldIssue[];

  constructor(message: string, issues: readonly FieldIssue[], cause?: unknown) {
    super(message, cause === undefined ? {} : { cause });
    this.issues = issues;
  }
}

/** Flatten a Zod error into ordered, display-ready field issues. */
export function formatIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Validate `data` against `schema`, returning a typed Result instead of throwing.
 *
 * @param context optional label prefixed to the technical message (for logs),
 *                e.g. `'review submission'`. Never shown to users.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string,
): Result<T, SchemaValidationError> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return ok(parsed.data);

  const issues = formatIssues(parsed.error);
  const detail = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  const message = context ? `${context}: ${detail}` : detail;
  return err(new SchemaValidationError(message, issues, parsed.error));
}

// Re-export Zod so feature schemas have a single import surface and the chosen
// validation library stays swappable behind this module.
export { z };
