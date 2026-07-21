// src/platform/observability/logger.ts
//
// Provider-agnostic structured logging (Phase 2). Emits typed LogRecords to a
// swappable sink rather than scattering `console.log` calls, so the app can
// later route logs to any backend (Worker tail, an external service chosen by a
// future ADR) without touching call sites. Carries the observability fields the
// target architecture needs — request/correlation IDs, machine error codes —
// and keeps user-facing messages out of log payloads by default.
//
// No React/Firebase/DOM. `console` is the only ambient default sink (allowed
// outside the domain layer); inject a sink to make logging fully testable.

import { isShohojError } from '../../core/errors.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  /** ISO-8601 timestamp. */
  readonly time: string;
  /** Bound + per-call structured fields (request/correlation IDs, error codes…). */
  readonly fields: Record<string, unknown>;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** Derive a logger that always includes `fields` (e.g. a request id). */
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** Where records go. Defaults to {@link consoleSink}. */
  readonly sink?: LogSink;
  /** Records below this level are dropped. Defaults to `'info'`. */
  readonly minLevel?: LogLevel;
  /** Fields merged into every record from this logger. */
  readonly base?: Record<string, unknown>;
  /** Clock injection for tests. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/**
 * Structured fields extracted from a thrown value, safe to log. For ShohojErrors
 * this captures the machine `code`, class `name` and technical `message`; the
 * user-facing `userMessage` is intentionally NOT promoted to the log message.
 */
export function fieldsFromError(value: unknown): Record<string, unknown> {
  if (isShohojError(value)) {
    return { errorCode: value.code, errorName: value.name, errorMessage: value.message };
  }
  if (value instanceof Error) {
    return { errorName: value.name, errorMessage: value.message };
  }
  return { errorMessage: String(value) };
}

/** Default sink: one structured record per call, routed to the matching console method. */
export const consoleSink: LogSink = (record) => {
  const line = {
    level: record.level,
    time: record.time,
    message: record.message,
    ...record.fields,
  };
  const method = record.level === 'debug' ? 'log' : record.level;
  (console[method] ?? console.log)(JSON.stringify(line));
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? consoleSink;
  const minLevel = options.minLevel ?? 'info';
  const base = options.base ?? {};
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_ORDER[minLevel];

  function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < threshold) return;
    sink({
      level,
      message,
      time: now().toISOString(),
      fields: { ...base, ...fields },
    });
  }

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ sink, minLevel, base: { ...base, ...fields }, now }),
  };
}
