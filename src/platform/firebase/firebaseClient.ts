// src/platform/firebase/firebaseClient.ts
//
// Lazy Firebase client for the shell's typed boundary (#331). The SDK is the
// npm package, dynamic-imported so Vite splits it into its own chunk — the
// same isolation the legacy page gets from its separate firebase module: an
// SDK/network failure can never break the offline calculator, and offline
// shells (no validated config → no caller) never download it at all.
//
// Init mirrors js/auth/firebase-init.js: initializeApp from the VALIDATED
// runtime config (never raw globals), best-effort App Check with ReCaptchaV3
// when a site key is configured (a failure logs and continues — parity), and
// one app/auth pair per page shared by every caller.

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';

import { createLogger } from '../observability/logger.ts';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';

const logger = createLogger({ base: { module: 'platform.firebase' } });

export interface FirebaseClient {
  readonly app: FirebaseApp;
  readonly auth: Auth;
}

let pending: Promise<FirebaseClient> | null = null;

/**
 * Initialise (once) and return the shared Firebase app + auth. Callers pass
 * the validated config; the optional reCAPTCHA key enables App Check.
 * Concurrent callers share one in-flight load; a failed load clears the slot
 * so a later attempt can retry.
 */
export function loadFirebaseClient(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<FirebaseClient> {
  if (pending) return pending;

  pending = (async () => {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');

    // Reuse an app if something already initialised one on this page.
    const existing = getApps()[0];
    const app = existing ?? initializeApp(config);

    if (!existing && recaptchaV3SiteKey) {
      try {
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(recaptchaV3SiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (err) {
        // Legacy parity: App Check is best-effort; auth still works without it.
        logger.warn('platform.firebase.app_check_init_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { app, auth: getAuth(app) };
  })();

  pending.catch(() => {
    pending = null; // allow a retry after a failed SDK load
  });
  return pending;
}
