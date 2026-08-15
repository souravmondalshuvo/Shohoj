// src/platform/firebase/lostFoundRepo.ts
//
// Typed Firestore repo for the lost & found board (#371). Mirrors the
// reviewsRepo pattern: a repo interface over an injected backend, defaulting
// to the lazy npm SDK via the shared firebaseClient, unit-testable with a
// fake. Validation lives in src/core/lostFound.ts; Firestore RULES remain the
// authorization boundary — this is a client convenience layer.
//
// Write shapes must match the rules exactly:
//   - createPost writes the post AND the (client-unreadable) contact doc in
//     ONE batch — the rules' getAfter() tie rejects either alone.
//   - claims use the deterministic `${postId}_${uid}` id (one per user/post).
//   - every createdAt is serverTimestamp() (rules pin `== request.time`).

import { campusStamp } from './campusStamp.ts';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import type { LostFoundDraft, LostFoundPost } from '../../core/lostFound.ts';

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface LostFoundBackend {
  /** Newest posts (any status; the caller filters), up to `limit`. */
  listRecent(limit: number): Promise<LostFoundPost[]>;
  /** Batch-create post + contact doc; resolves to the new post id. */
  createPost(draft: LostFoundDraft, uid: string, email: string): Promise<string>;
  /** Owner-only status flip (open → resolved). */
  resolvePost(postId: string): Promise<void>;
  deletePost(postId: string): Promise<void>;
  /** Queue a claim; the Worker emails the poster on the next cron tick. */
  createClaim(postId: string, uid: string, email: string, note: string): Promise<void>;
}

export interface LostFoundRepo {
  listRecent(limit?: number): Promise<LostFoundPost[]>;
  createPost(draft: LostFoundDraft, uid: string, email: string): Promise<string>;
  resolvePost(postId: string): Promise<void>;
  deletePost(postId: string): Promise<void>;
  createClaim(postId: string, uid: string, email: string, note: string): Promise<void>;
}

export const DEFAULT_LIST_LIMIT = 100;

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<LostFoundBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app, auth } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const {
    getFirestore,
    collection,
    doc,
    getDocs,
    query,
    orderBy,
    limit: qLimit,
    writeBatch,
    updateDoc,
    deleteDoc,
    setDoc,
    serverTimestamp,
  } = await import('firebase/firestore');
  const db = getFirestore(app);
  const posts = collection(db, 'lostFoundPosts');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toPost = (d: any): LostFoundPost => {
    const data = d.data();
    return {
      id: d.id,
      type: data.type,
      title: data.title,
      description: data.description,
      locationHint: data.locationHint,
      roomCode: data.roomCode,
      status: data.status,
      creatorUid: data.creatorUid,
      createdAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
    };
  };

  return {
    async listRecent(limit) {
      const snap = await getDocs(query(posts, orderBy('createdAt', 'desc'), qLimit(limit)));
      return snap.docs.map(toPost);
    },
    async createPost(draft, uid, email) {
      const postRef = doc(posts);
      const batch = writeBatch(db);
      batch.set(postRef, {
        ...draft,
        status: 'open',
        creatorUid: uid,
        // Required by rules and pinned to this session's own campus.
        university: campusStamp(auth),
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'lostFoundContacts', postRef.id), {
        email,
        uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return postRef.id;
    },
    async resolvePost(postId) {
      await updateDoc(doc(db, 'lostFoundPosts', postId), { status: 'resolved' });
    },
    async deletePost(postId) {
      await deleteDoc(doc(db, 'lostFoundPosts', postId));
    },
    async createClaim(postId, uid, email, note) {
      const payload: Record<string, unknown> = {
        postId,
        fromUid: uid,
        fromEmail: email,
        createdAt: serverTimestamp(),
      };
      if (note !== '') payload.note = note;
      await setDoc(doc(db, 'lostFoundClaims', `${postId}_${uid}`), payload);
    },
  };
}

export interface LostFoundRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<LostFoundBackend>;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createLostFoundRepo(options: LostFoundRepoOptions): LostFoundRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<LostFoundBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async listRecent(limit = DEFAULT_LIST_LIMIT) {
      try {
        return await (await load()).listRecent(Math.max(1, Math.min(limit, 500)));
      } catch {
        // A failed read behaves like "no posts" (reviewsRepo parity); the
        // route shows its own error state only for missing config/auth.
        return [];
      }
    },
    async createPost(draft, uid, email) {
      return (await load()).createPost(draft, uid, email);
    },
    async resolvePost(postId) {
      await (await load()).resolvePost(postId);
    },
    async deletePost(postId) {
      await (await load()).deletePost(postId);
    },
    async createClaim(postId, uid, email, note) {
      await (await load()).createClaim(postId, uid, email, note);
    },
  };
}
