// src/app/providers/CloudSyncProvider.tsx
//
// Runs the cloud-sync engine for a signed-in cloud shell (#333). Mounted
// inside ShellChrome only when the runtime config is valid; it builds the
// user-doc repo + engine once, starts the sign-in sync flow when a uid
// appears, stops on sign-out, and forwards local saves (announced by the
// persist path) to the engine's debounced cloud write. The forced-choice
// migration dialog (no dismiss — legacy parity) is rendered here and bridges
// the engine's promptMigration port to React. Applying cloud data reloads the
// page (the legacy pre-boot fallback; the shell rebuilds state from storage on
// boot) — the in-place apply is deferred, documented.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '../../shared/ui/Button';
import type { RuntimeConfig } from '../../platform/configuration/runtimeConfig';
import { createUserDocRepo } from '../../platform/firebase/userDocRepo';
import {
  createBrowserStore,
  createSessionStore,
} from '../../services/storage/browserKeyValueStore';
import {
  createCloudSyncEngine,
  type CloudSyncEngine,
} from '../../services/cloudSync/cloudSyncEngine';
import { onLocalSave } from '../../services/cloudSync/saveAnnouncer';
import type { MigrationChoice } from '../../services/storage/syncDecision';
import { useAuth } from './AuthProvider';
import { useNotifications } from '../../state/NotificationProvider';

interface PendingMigration {
  readonly localSemesters: number;
  readonly cloudSemesters: number;
  readonly resolve: (choice: MigrationChoice) => void;
}

export interface CloudSyncProviderProps {
  readonly config: RuntimeConfig;
  readonly children: ReactNode;
}

export function CloudSyncProvider({ config, children }: CloudSyncProviderProps) {
  const auth = useAuth();
  const { notify } = useNotifications();
  const [pending, setPending] = useState<PendingMigration | null>(null);

  // Latest notify without re-creating the engine when it changes.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const engine = useMemo<CloudSyncEngine>(() => {
    const repo = createUserDocRepo({
      config: config.firebase,
      recaptchaV3SiteKey: config.recaptchaV3SiteKey,
    });
    return createCloudSyncEngine({
      repo,
      local: createBrowserStore(),
      session: createSessionStore(),
      promptMigration: (localSemesters, cloudSemesters) =>
        new Promise<MigrationChoice>((resolve) => {
          setPending({ localSemesters, cloudSemesters, resolve });
        }),
      notify: (kind, message) => notifyRef.current({ kind, message }),
      applyRemote: () => {
        if (typeof window !== 'undefined') window.location.reload();
      },
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      now: () => Date.now(),
    });
  }, [config]);

  // Start on sign-in, stop on sign-out. Skips 'loading' so we don't act before
  // the auth state settles.
  useEffect(() => {
    if (auth.status === 'authenticated' && auth.uid) {
      void engine.start(auth.uid);
      return () => engine.stop();
    }
    return undefined;
  }, [engine, auth.status, auth.uid]);

  // Forward local writes to the debounced cloud save (inert while signed out —
  // the engine's decideCloudSave no-ops without a uid).
  useEffect(() => onLocalSave((json) => engine.queueSave(json)), [engine]);

  const settle = (choice: MigrationChoice) => {
    pending?.resolve(choice);
    setPending(null);
  };

  return (
    <>
      {children}
      {pending !== null && (
        <div className="shell-modal-backdrop" data-testid="cloud-migration-modal">
          {/* No backdrop/Escape dismiss — a choice is required (legacy parity). */}
          <div
            className="shell-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-migration-title"
          >
            <h2 id="cloud-migration-title" className="shell-modal-title">
              Which data should we keep?
            </h2>
            <p className="shell-modal-message">
              This device has {pending.localSemesters} semester
              {pending.localSemesters !== 1 ? 's' : ''} and your cloud account has{' '}
              {pending.cloudSemesters} semester{pending.cloudSemesters !== 1 ? 's' : ''}. Keep one —
              the other is replaced.
            </p>
            <div className="shell-modal-actions">
              <Button variant="primary" onClick={() => settle('local')}>
                Keep this device&apos;s data
              </Button>
              <Button variant="secondary" onClick={() => settle('cloud')}>
                Keep cloud data
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
