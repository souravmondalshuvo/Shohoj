// src/platform/firebase/seatAlertRepo.ts
//
// Typed boundary for the seat-drop email-alert sync (#397 follow-up). Mirrors
// the watched-section set + the on/off preference to Firestore so the cron
// Worker can email on a drop even with Shohoj closed — the shell counterpart of
// the legacy `window._shohoj_syncSeatAlerts`. Same doc shape the Worker reads:
// `seatAlertWatches/{uid}` = { email, enabled, sections:[{id,code,name}], updatedAt }.
//
// Follows userDocRepo / reviewsRepo: an injected FirestoreBackend (defaulting to
// the lazy npm SDK over the shared client) so tests never touch Firebase, and a
// fire-and-forget `sync` that guards empty/signed-out inputs.

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';

/** Lightweight watched-section descriptor — just what the Worker needs to email. */
export interface SeatAlertSection {
  id: number;
  code: string;
  name: string;
}

export interface SeatAlertBackend {
  /** Write (merge) the user's seat-alert document. */
  writeWatches(
    uid: string,
    email: string,
    enabled: boolean,
    sections: readonly SeatAlertSection[],
  ): Promise<void>;
}

export interface SeatAlertRepo {
  /**
   * Push the current watchlist + enabled flag. No-op (resolves) when signed out
   * (no uid/email). Caps at 50 sections and drops non-numeric ids, matching the
   * legacy sync. Fire-and-forget at the call site: failures reject but the local
   * watchlist still works.
   */
  sync(
    uid: string | null,
    email: string | null,
    enabled: boolean,
    sections: readonly SeatAlertSection[],
  ): Promise<void>;
}

/** Cap mirrors seatWatch.MAX_WATCHES and the legacy `.slice(0, 50)`. */
const MAX_SYNCED = 50;

function normalizeSections(sections: readonly SeatAlertSection[]): SeatAlertSection[] {
  return sections
    .slice(0, MAX_SYNCED)
    .map((s) => ({ id: Number(s.id), code: String(s.code ?? ''), name: String(s.name ?? '') }))
    .filter((s) => Number.isFinite(s.id));
}

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<SeatAlertBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore(app);
  return {
    async writeWatches(uid, email, enabled, sections) {
      await setDoc(doc(db, 'seatAlertWatches', uid), {
        email,
        enabled,
        sections,
        updatedAt: serverTimestamp(),
      });
    },
  };
}

export interface SeatAlertRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Test seam: skip the SDK and inject a backend directly. */
  readonly loadBackend?: () => Promise<SeatAlertBackend>;
}

export function createSeatAlertRepo(options: SeatAlertRepoOptions): SeatAlertRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<SeatAlertBackend> | null = null;
  return {
    async sync(uid, email, enabled, sections) {
      // Guard here so the SDK never loads for a signed-out no-op.
      if (!uid || !email) return;
      if (!backend) backend = loadBackend();
      await (await backend).writeWatches(uid, email, enabled, normalizeSections(sections));
    },
  };
}
