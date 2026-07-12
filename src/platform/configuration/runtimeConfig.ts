// src/platform/configuration/runtimeConfig.ts
//
// Typed runtime-configuration boundary (Phase 2). The legacy app reads loose
// `window._shohoj_*` config globals injected by build3.py from env/secrets. In
// forks and external PRs those values stay as unreplaced `__PLACEHOLDER__`
// tokens (no secrets) and the app must degrade gracefully — cloud features off,
// offline tools still working (see the bundle smoke test's expected
// "Firebase config missing or incomplete").
//
// This validates the raw config once, rejecting placeholders/blanks as "missing"
// and returning a typed Result so callers branch on a ConfigError instead of
// trusting unchecked globals. Pure — the raw object is passed in; a thin
// window adapter lives at the call site.

import { type Result, mapErr } from '../../core/result.ts';
import { ConfigError } from '../../core/errors.ts';
import { z, validate } from '../../shared/validation/schema.ts';

/** Unreplaced build placeholders look like `__FIREBASE_API_KEY__`. */
const PLACEHOLDER_RE = /^__[A-Z0-9_]+__$/;

/** A required secret/string: present, non-blank, and not a build placeholder. */
const secret = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !PLACEHOLDER_RE.test(v), { message: 'value is an unreplaced build placeholder' });

export const FirebaseConfigSchema = z.object({
  apiKey: secret,
  authDomain: secret,
  projectId: secret,
  storageBucket: secret,
  messagingSenderId: secret,
  appId: secret,
  // Analytics id is optional; a placeholder/blank simply disables analytics.
  measurementId: z.string().trim().optional(),
});

export const RuntimeConfigSchema = z.object({
  firebase: FirebaseConfigSchema,
  papersWorkerUrl: secret.refine((v) => /^https?:\/\//.test(v), {
    message: 'must be an absolute http(s) URL',
  }),
  recaptchaV3SiteKey: secret,
  // Google OAuth client id is an OPTIONAL secret: cd.yml blanks it when the
  // repo secret is unset so the app can feature-detect and disable just that
  // feature. Requiring it here took every cloud page offline in production
  // (found live on /lost-found/, #390) — same policy as measurementId above.
  googleClientId: z.string().trim().optional(),
});

export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * Validate raw runtime config. On success the typed config is guaranteed free of
 * placeholders/blanks. On failure (missing keys, blanks, or unreplaced
 * placeholders — the normal fork/PR case) returns a ConfigError whose
 * user-facing message is safe; callers should treat it as "cloud features
 * unavailable", not a crash.
 */
export function readRuntimeConfig(raw: unknown): Result<RuntimeConfig, ConfigError> {
  const parsed = validate(RuntimeConfigSchema, raw, 'runtime config');
  return mapErr(parsed, (e) => new ConfigError(e.message, { cause: e }));
}

/** True when raw config fully validates (handy for a quick capability check). */
export function hasCompleteConfig(raw: unknown): boolean {
  return readRuntimeConfig(raw).ok;
}

/** Shape of the loose globals build3.py injects, for the window adapter below. */
interface ShohojConfigGlobals {
  _shohoj_firebase_config?: unknown;
  _shohoj_papers_worker_url?: unknown;
  _shohoj_recaptcha_v3_site_key?: unknown;
  _shohoj_google_client_id?: unknown;
}

/**
 * Assemble the raw config object from `window._shohoj_*` globals. Kept separate
 * from validation so the pure path stays testable; pass a stub here in tests.
 * Accepts any object (typically `window`, whose type declares none of these
 * keys — TS's weak-type check would otherwise reject it) and reads the globals
 * structurally.
 */
export function runtimeConfigFromGlobals(source: object): unknown {
  const globals = source as ShohojConfigGlobals;
  return {
    firebase: globals._shohoj_firebase_config,
    papersWorkerUrl: globals._shohoj_papers_worker_url,
    recaptchaV3SiteKey: globals._shohoj_recaptcha_v3_site_key,
    googleClientId: globals._shohoj_google_client_id,
  };
}
