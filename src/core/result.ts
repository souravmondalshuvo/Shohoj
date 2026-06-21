// src/core/result.ts
//
// A tiny, dependency-free typed Result for recoverable failures. The migration
// replaces throw-everywhere / silent-catch patterns (e.g. the legacy
// `try { … } catch {}` around storage in js/core/state.js) with an explicit
// success/failure value that callers must inspect. Pure — no React, Firebase,
// DOM, or browser globals — so it is usable from domain logic, services, and
// React alike.

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A value that is either a success (`ok`) carrying `T`, or a failure carrying
 * `E`. `E` defaults to {@link Error} but recoverable domain failures should use
 * the typed classes in `./errors.ts`.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Build a success Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Build a failure Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Narrowing guard: true when the Result is a success. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Narrowing guard: true when the Result is a failure. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Return the success value, or `fallback` when the Result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Map the success value, leaving a failure untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Map the failure value, leaving a success untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chain a Result-producing step, short-circuiting on the first failure. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}
