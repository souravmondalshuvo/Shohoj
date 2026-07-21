// src/platform/firebase/userDocRepo.ts
//
// Typed Firestore repo for the synced user document (#333): users/{uid} with
// { data: <JSON string of the full shohoj_cgpa_v1 snapshot>, updatedAt:
// serverTimestamp() } — the exact shape js/auth/firebase.js reads and writes,
// so both apps stay interoperable during the migration. The Firestore surface
// is injected (defaulting to the lazy npm SDK over the shared client), so the
// repo is unit-testable with a fake and the SDK chunk loads only when a
// signed-in cloud shell actually syncs. Firestore RULES remain the
// authorization boundary — this is a client convenience layer.

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';

/** The raw synced payload: the JSON string stored in the doc's `data` field. */
export type UserDocData = string | null;

export interface UserDocRepo {
  /** The stored JSON string, or null when the doc/field is missing or unreadable. */
  load(uid: string): Promise<UserDocData>;
  /** Persist the snapshot JSON with a server timestamp (merge, legacy shape). */
  save(uid: string, dataJson: string): Promise<void>;
  /** Realtime doc subscription; emits the raw `data` string (null when absent). */
  subscribe(uid: string, onData: (data: UserDocData, exists: boolean) => void): () => void;
  /** Delete the synced doc (account-data deletion). */
  remove(uid: string): Promise<void>;
}

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface FirestoreBackend {
  getDocData(uid: string): Promise<{ exists: boolean; data: unknown }>;
  setDocData(uid: string, dataJson: string): Promise<void>;
  onDocSnapshot(
    uid: string,
    next: (snap: { exists: boolean; data: unknown }) => void,
    onError?: (err: unknown) => void,
  ): () => void;
  deleteDoc(uid: string): Promise<void>;
}

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<FirestoreBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteDoc } =
    await import('firebase/firestore');
  const db = getFirestore(app);
  const ref = (uid: string) => doc(db, 'users', uid);
  return {
    async getDocData(uid) {
      const snap = await getDoc(ref(uid));
      return { exists: snap.exists(), data: snap.exists() ? snap.data()?.data : undefined };
    },
    async setDocData(uid, dataJson) {
      await setDoc(ref(uid), { data: dataJson, updatedAt: serverTimestamp() }, { merge: true });
    },
    onDocSnapshot(uid, next, onError) {
      return onSnapshot(
        ref(uid),
        (snap) =>
          next({ exists: snap.exists(), data: snap.exists() ? snap.data()?.data : undefined }),
        (err) => onError?.(err),
      );
    },
    deleteDoc: (uid) => deleteDoc(ref(uid)),
  };
}

function asDataString(value: unknown): UserDocData {
  return typeof value === 'string' && value ? value : null;
}

export interface UserDocRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<FirestoreBackend>;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createUserDocRepo(options: UserDocRepoOptions): UserDocRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<FirestoreBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async load(uid) {
      try {
        const snap = await (await load()).getDocData(uid);
        if (!snap.exists) return null;
        return asDataString(snap.data);
      } catch {
        // Legacy loadFromCloud: a failed read behaves like "no cloud data".
        return null;
      }
    },
    async save(uid, dataJson) {
      await (await load()).setDocData(uid, dataJson);
    },
    subscribe(uid, onData) {
      let cancelled = false;
      let unsubscribe: (() => void) | null = null;
      void load().then((loaded) => {
        if (cancelled) return;
        unsubscribe = loaded.onDocSnapshot(uid, (snap) =>
          onData(asDataString(snap.data), snap.exists),
        );
      });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    async remove(uid) {
      await (await load()).deleteDoc(uid);
    },
  };
}
