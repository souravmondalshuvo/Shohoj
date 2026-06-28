// src/platform/configuration/flags.ts
//
// Typed feature-flag registry (Phase 2). Today the React islands are gated by
// ad-hoc booleans scattered across src/react/*-entry.tsx (e.g.
// `window.__SHOHOJ_REACT_SEMESTERS_OPTIN__`, a raw `?react=` query param). This
// centralizes flag definitions and resolves them from ordered sources with a
// typed default, so opt-in plumbing has one home as features migrate.
//
// The registry + resolution are PURE (no window/document); browser inputs are
// passed in via source factories. A thin browser adapter that reads
// window/location lives at the call site (platform may touch the DOM; the domain
// layer must not).

export interface FlagDefinition {
  /** Value used when no source provides one. */
  readonly default: boolean;
  /** Human note for docs / the (future) admin flag panel. */
  readonly description?: string;
}

export type FlagRegistry = Record<string, FlagDefinition>;

/** A resolver consulted for a flag; returns undefined to defer to the next source. */
export interface FlagSource {
  get(name: string): boolean | undefined;
}

/** Source backed by an in-memory record (tests, server-provided config). */
export function recordSource(values: Record<string, boolean | undefined>): FlagSource {
  return { get: (name) => values[name] };
}

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);
const FALSY = new Set(['0', 'false', 'off', 'no']);

/**
 * Source backed by a URL query string, e.g. `?calculatorReact=1&legacyX=off`.
 * Unparseable / unrelated params return undefined so the next source is tried.
 */
export function searchParamSource(search: string): FlagSource {
  const params = new URLSearchParams(search);
  return {
    get(name) {
      if (!params.has(name)) return undefined;
      const raw = (params.get(name) ?? '').toLowerCase();
      if (raw === '' || TRUTHY.has(raw)) return true;
      if (FALSY.has(raw)) return false;
      return undefined;
    },
  };
}

/** Resolve one flag: first source that defines it wins, else the registry default. */
export function resolveFlag(
  name: string,
  registry: FlagRegistry,
  sources: readonly FlagSource[],
): boolean {
  const def = registry[name];
  if (def === undefined) {
    throw new Error(`Unknown feature flag: ${name}`);
  }
  for (const source of sources) {
    const value = source.get(name);
    if (value !== undefined) return value;
  }
  return def.default;
}

export interface FlagSet<K extends string> {
  isEnabled(name: K): boolean;
  all(): Record<K, boolean>;
}

/**
 * Bind a registry to ordered sources. Sources are consulted highest-precedence
 * first. Resolution is eager-safe and side-effect free.
 */
export function createFlagSet<R extends FlagRegistry>(
  registry: R,
  sources: readonly FlagSource[] = [],
): FlagSet<Extract<keyof R, string>> {
  type K = Extract<keyof R, string>;
  return {
    isEnabled: (name) => resolveFlag(name, registry, sources),
    all: () => {
      const out = {} as Record<K, boolean>;
      for (const name of Object.keys(registry) as K[]) {
        out[name] = resolveFlag(name, registry, sources);
      }
      return out;
    },
  };
}
