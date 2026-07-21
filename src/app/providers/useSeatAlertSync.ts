// src/app/providers/useSeatAlertSync.ts
//
// Resolves the seat-alert repo (e2e window seam → config-built → null offline)
// and returns a fire-and-forget sync callback the Seats and Profile routes call
// when the watchlist or the on/off preference changes. Signed-out or offline →
// the callback is a no-op, so the local watchlist keeps working regardless.

import { useCallback, useMemo } from 'react';

import { useAuth } from './AuthProvider';
import { useRuntimeConfig } from './RuntimeConfigProvider';
import { createSeatAlertRepo, type SeatAlertRepo } from '../../platform/firebase/seatAlertRepo';
import type { WatchEntry } from '../../core/seatWatch';

declare global {
  interface Window {
    /** e2e seam: a stub seat-alert repo capturing sync() calls. */
    __shohojSeatAlertRepo?: SeatAlertRepo;
  }
}

export type SyncSeatAlerts = (watches: readonly WatchEntry[], enabled: boolean) => void;

export function useSeatAlertSync(): SyncSeatAlerts {
  const config = useRuntimeConfig();
  const auth = useAuth();

  const repo = useMemo<SeatAlertRepo | null>(() => {
    if (typeof window !== 'undefined' && window.__shohojSeatAlertRepo)
      return window.__shohojSeatAlertRepo;
    if (config)
      return createSeatAlertRepo({
        config: config.firebase,
        recaptchaV3SiteKey: config.recaptchaV3SiteKey,
      });
    return null;
  }, [config]);

  return useCallback(
    (watches, enabled) => {
      if (!repo) return;
      const sections = watches.map((w) => ({
        id: w.sectionId,
        code: w.courseCode,
        name: w.sectionName,
      }));
      void repo.sync(auth.uid, auth.email, enabled, sections).catch(() => {
        // Sync is best-effort; the local watchlist still works if it fails.
      });
    },
    [repo, auth.uid, auth.email],
  );
}
