// src/platform/firebase/feedbackRepo.ts
//
// Typed Firestore repo for the app-feedback board (#437). Mirrors the
// lostFoundRepo pattern: a repo interface over an injected backend, defaulting
// to the lazy npm SDK via the shared firebaseClient, unit-testable with a
// fake. Validation lives in src/core/feedback.ts; Firestore RULES remain the
// authorization boundary — this is a client convenience layer.
//
// Write shapes must match the legacy client (js/auth/firebase.js) exactly so
// the existing rules keep working:
//   - feedback docs land in `appFeedback` with serverTimestamp() createdAt and
//     `uid` present only on non-anonymous submissions.
//   - upvotes live in `appFeedbackUpvotes` under the deterministic
//     `${feedbackId}_${uid}` id (one vote per user per item).

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import { FirebaseUnavailableError, PermissionError, type ShohojError } from '../../core/errors.ts';
import {
  BOARD_LIMIT,
  isFeedbackType,
  type FeedbackDraft,
  type FeedbackItem,
} from '../../core/feedback.ts';

/**
 * Map a raw Firestore rejection to the typed hierarchy, so a failed board read
 * is distinguishable from an empty board. See the equivalent note in
 * reviewsRepo.ts — these reads used to `catch { return [] }`, which rendered an
 * outage as "No feedback yet".
 */
function toFeedbackError(cause: unknown): ShohojError {
  const code =
    typeof (cause as { code?: unknown })?.code === 'string' ? (cause as { code: string }).code : '';
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return new PermissionError(`feedback read denied: ${code}`, { cause });
  }
  return new FirebaseUnavailableError(`feedback read failed: ${code || 'unknown'}`, { cause });
}

async function readOrThrow<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    const error = toFeedbackError(cause);
    console.warn(`[feedbackRepo] ${error.code}`);
    throw error;
  }
}

export interface FeedbackUpvote {
  feedbackId: string;
  uid: string;
}

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface FeedbackBackend {
  /** Newest feedback first, up to `limit`. */
  listRecent(limit: number): Promise<FeedbackItem[]>;
  /** The signed-in user's upvotes. */
  listMyUpvotes(uid: string): Promise<FeedbackUpvote[]>;
  submit(draft: FeedbackDraft, uid: string): Promise<void>;
  addUpvote(feedbackId: string, uid: string): Promise<void>;
  removeUpvote(feedbackId: string, uid: string): Promise<void>;
  /** Admin-only (enforced by rules). */
  adminDelete(feedbackId: string): Promise<void>;
}

export interface FeedbackRepo {
  listRecent(): Promise<FeedbackItem[]>;
  listMyUpvotes(uid: string): Promise<FeedbackUpvote[]>;
  submit(draft: FeedbackDraft, uid: string): Promise<void>;
  /** Flip one vote; `currentlyUpvoted` is the pre-toggle state. */
  toggleUpvote(feedbackId: string, uid: string, currentlyUpvoted: boolean): Promise<void>;
  adminDelete(feedbackId: string): Promise<void>;
}

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<FeedbackBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const {
    getFirestore,
    collection,
    doc,
    getDocs,
    addDoc,
    setDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit: qLimit,
    serverTimestamp,
  } = await import('firebase/firestore');
  const db = getFirestore(app);
  const feedback = collection(db, 'appFeedback');
  const upvotes = collection(db, 'appFeedbackUpvotes');

  return {
    async listRecent(limit) {
      const snap = await getDocs(query(feedback, orderBy('createdAt', 'desc'), qLimit(limit)));
      return snap.docs.flatMap((d) => {
        const data = d.data();
        if (!isFeedbackType(data.type)) return [];
        const item: FeedbackItem = {
          id: d.id,
          type: data.type,
          text: typeof data.text === 'string' ? data.text : '',
          anonymous: data.anonymous === true,
          createdAtMs:
            typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
        };
        if (typeof data.uid === 'string') item.uid = data.uid;
        return [item];
      });
    },
    async listMyUpvotes(uid) {
      const snap = await getDocs(query(upvotes, where('uid', '==', uid), qLimit(500)));
      return snap.docs.flatMap((d) => {
        const data = d.data();
        return typeof data.feedbackId === 'string'
          ? [{ feedbackId: data.feedbackId, uid: data.uid }]
          : [];
      });
    },
    async submit(draft, uid) {
      const data: Record<string, unknown> = {
        type: draft.type,
        text: draft.text,
        context: {},
        anonymous: draft.anonymous,
        createdAt: serverTimestamp(),
      };
      if (!draft.anonymous) data.uid = uid;
      await addDoc(feedback, data);
    },
    async addUpvote(feedbackId, uid) {
      await setDoc(doc(db, 'appFeedbackUpvotes', `${feedbackId}_${uid}`), {
        feedbackId,
        uid,
        createdAt: serverTimestamp(),
      });
    },
    async removeUpvote(feedbackId, uid) {
      await deleteDoc(doc(db, 'appFeedbackUpvotes', `${feedbackId}_${uid}`));
    },
    async adminDelete(feedbackId) {
      await deleteDoc(doc(db, 'appFeedback', feedbackId));
    },
  };
}

export interface FeedbackRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<FeedbackBackend>;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createFeedbackRepo(options: FeedbackRepoOptions): FeedbackRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<FeedbackBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async listRecent() {
      // Rejects with a typed ShohojError on a real failure so the route can
      // tell "board is empty" from "board failed to load".
      return await readOrThrow(async () => (await load()).listRecent(BOARD_LIMIT));
    },
    async listMyUpvotes(uid) {
      return await readOrThrow(async () => (await load()).listMyUpvotes(uid));
    },
    async submit(draft, uid) {
      await (await load()).submit(draft, uid);
    },
    async toggleUpvote(feedbackId, uid, currentlyUpvoted) {
      const b = await load();
      if (currentlyUpvoted) await b.removeUpvote(feedbackId, uid);
      else await b.addUpvote(feedbackId, uid);
    },
    async adminDelete(feedbackId) {
      await (await load()).adminDelete(feedbackId);
    },
  };
}
