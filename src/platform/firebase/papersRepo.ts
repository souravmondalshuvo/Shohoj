// src/platform/firebase/papersRepo.ts
//
// Typed data layer for the past-papers library (#440). Two backends behind one
// repo (lostFoundRepo pattern): Firestore for the approved-papers reads and the
// report write, and the papers Worker for upload/download (R2 storage, admin
// notification email, MIME handling). Validation lives in src/core/papers;
// Firestore rules + Worker auth remain the authorization boundary.
//
// Shapes must match the legacy client (js/auth/firebase.js) exactly:
//   - reads filter `approved == true`, newest first (composite indexes exist);
//     load errors RE-THROW so the UI can distinguish "error" from "no papers".
//   - reports land in `paperReports` under `${uid}_${paperId}` (one per user).
//   - upload POSTs the raw file to `/upload?courseCode=…&filename=…&title=…`
//     with a Bearer ID token; download GETs `/download?paperId=…` and re-types
//     generic blobs via the #375 magic-byte sniff.

import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import { retypeGenericBlob } from '../../core/paperPreview.ts';

export interface PaperRecord {
  id: string;
  courseCode: string;
  type: string;
  title: string;
  semester?: string;
  facultyInitials?: string;
  size?: number;
  createdAtMs: number;
}

export interface PaperUploadPayload {
  file: File;
  courseCode: string;
  type: string;
  title: string;
  semester?: string;
  facultyInitials?: string;
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface PapersBackend {
  listRecent(limit: number): Promise<PaperRecord[]>;
  listByCourse(courseCode: string, limit: number): Promise<PaperRecord[]>;
  report(paperId: string, reason: string, uid: string): Promise<void>;
}

export interface PapersRepo {
  /** Approved papers, newest first. Throws on load failure (≠ empty). */
  listRecent(): Promise<PaperRecord[]>;
  listByCourse(courseCode: string): Promise<PaperRecord[]>;
  /** Object URL for the paper's bytes, or null when unavailable. */
  downloadUrl(paperId: string): Promise<string | null>;
  upload(payload: PaperUploadPayload): Promise<UploadResult>;
  report(paperId: string, reason: string, uid: string): Promise<void>;
}

export const RECENT_LIMIT = 30;
export const COURSE_LIMIT = 50;
export const REPORT_REASON_MAX = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(id: string, data: any): PaperRecord {
  return {
    id,
    courseCode: typeof data.courseCode === 'string' ? data.courseCode : '',
    type: typeof data.type === 'string' ? data.type : '',
    title: typeof data.title === 'string' ? data.title : '',
    ...(typeof data.semester === 'string' && data.semester !== ''
      ? { semester: data.semester }
      : {}),
    ...(typeof data.facultyInitials === 'string' && data.facultyInitials !== ''
      ? { facultyInitials: data.facultyInitials }
      : {}),
    ...(typeof data.size === 'number' ? { size: data.size } : {}),
    createdAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
  };
}

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<PapersBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app } = await loadFirebaseClient(config, recaptchaV3SiteKey);
  const {
    getFirestore,
    collection,
    doc,
    getDocs,
    setDoc,
    query,
    where,
    orderBy,
    limit: qLimit,
    serverTimestamp,
  } = await import('firebase/firestore');
  const db = getFirestore(app);
  const papers = collection(db, 'papers');

  return {
    async listRecent(limit) {
      const snap = await getDocs(
        query(papers, where('approved', '==', true), orderBy('createdAt', 'desc'), qLimit(limit)),
      );
      return snap.docs.map((d) => toRecord(d.id, d.data()));
    },
    async listByCourse(courseCode, limit) {
      const snap = await getDocs(
        query(
          papers,
          where('courseCode', '==', courseCode),
          where('approved', '==', true),
          orderBy('createdAt', 'desc'),
          qLimit(limit),
        ),
      );
      return snap.docs.map((d) => toRecord(d.id, d.data()));
    },
    async report(paperId, reason, uid) {
      await setDoc(doc(db, 'paperReports', `${uid}_${paperId}`), {
        paperId,
        reason: reason.slice(0, REPORT_REASON_MAX),
        reporterUid: uid,
        createdAt: serverTimestamp(),
      });
    },
  };
}

export interface PapersRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Papers Worker base URL (runtime config); upload/download fail without it. */
  readonly workerUrl?: string;
  /** Fresh Firebase ID token for Worker calls. */
  readonly getIdToken: () => Promise<string | null>;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<PapersBackend>;
  /** Injectable fetch (tests); defaults to the global. */
  readonly fetchFn?: typeof fetch;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createPapersRepo(options: PapersRepoOptions): PapersRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let backend: Promise<PapersBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async listRecent() {
      return (await load()).listRecent(RECENT_LIMIT);
    },
    async listByCourse(courseCode) {
      return (await load()).listByCourse(courseCode, COURSE_LIMIT);
    },
    async downloadUrl(paperId) {
      if (!options.workerUrl) return null;
      const token = await options.getIdToken();
      if (!token) return null;
      try {
        const res = await fetchFn(
          `${options.workerUrl}/download?paperId=${encodeURIComponent(paperId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return null;
        const blob = await retypeGenericBlob(await res.blob());
        const url = URL.createObjectURL(blob);
        // Object URLs leak until revoked; five minutes covers any preview.
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
        return url;
      } catch {
        return null;
      }
    },
    async upload(payload) {
      if (!options.workerUrl) {
        return { ok: false, error: 'Upload service not configured. Contact admin.' };
      }
      const token = await options.getIdToken();
      if (!token) return { ok: false, error: 'Could not get auth token' };
      const ext = (payload.file.name.split('.').pop() || 'pdf')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const params = new URLSearchParams({
        courseCode: payload.courseCode,
        filename,
        title: payload.title.slice(0, 120),
        type: payload.type,
      });
      if (payload.semester) params.set('semester', payload.semester.slice(0, 40));
      if (payload.facultyInitials) {
        params.set('facultyInitials', payload.facultyInitials.toUpperCase().slice(0, 20));
      }
      try {
        const res = await fetchFn(`${options.workerUrl}/upload?${params.toString()}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': payload.file.type || 'application/octet-stream',
          },
          body: payload.file,
        });
        if (!res.ok) {
          let msg = 'Upload failed';
          try {
            msg = (await res.json())?.error || msg;
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          return { ok: false, error: msg };
        }
        const body = await res.json().catch(() => ({}));
        if (!body?.id) return { ok: false, error: 'Upload metadata was not saved' };
        return { ok: true, id: String(body.id) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
      }
    },
    async report(paperId, reason, uid) {
      await (await load()).report(paperId, reason, uid);
    },
  };
}
