// src/platform/firebase/studyGroupsRepo.ts
//
// Typed Firestore repo for the Study Group Finder (#443). Mirrors the
// lostFoundRepo pattern: a repo interface over an injected backend, defaulting
// to the lazy npm SDK via the shared firebaseClient, unit-testable with a
// fake. Validation lives in src/core/studyGroups; Firestore RULES remain the
// authorization boundary — this is a client convenience layer.
//
// Shapes must match the legacy client (js/auth/firebase.js) exactly:
//   - group docs land in `studyGroups` (optional description/schedule are
//     OMITTED when empty, not written as '').
//   - memberships live in `studyGroupMembers` under `${groupId}_${uid}`,
//     pinning the joiner's own verified email.
//   - reports live in `studyGroupReports` under `${uid}_${groupId}`.

import { campusStamp } from './campusStamp.ts';
import type { FirebaseConfig } from '../configuration/runtimeConfig.ts';
import {
  GROUPS_LIMIT,
  isValidMode,
  type GroupDraft,
  type GroupMember,
  type StudyGroup,
} from '../../core/studyGroups.ts';

export interface GroupMembership {
  groupId: string;
}

/** The Firestore surface the repo needs (real SDK or a test fake). */
export interface StudyGroupsBackend {
  listGroups(limit: number): Promise<StudyGroup[]>;
  listMyMemberships(uid: string): Promise<GroupMembership[]>;
  /** Member-only by rules; a denied read resolves to []. */
  listMembers(groupId: string): Promise<GroupMember[]>;
  create(draft: GroupDraft, uid: string): Promise<string>;
  join(groupId: string, uid: string, email: string): Promise<void>;
  leave(groupId: string, uid: string): Promise<void>;
  /** Creator-only by rules. */
  remove(groupId: string): Promise<void>;
  report(groupId: string, reason: string, uid: string): Promise<void>;
}

export interface StudyGroupsRepo {
  listGroups(): Promise<StudyGroup[]>;
  listMyMemberships(uid: string): Promise<GroupMembership[]>;
  listMembers(groupId: string): Promise<GroupMember[]>;
  create(draft: GroupDraft, uid: string): Promise<string>;
  join(groupId: string, uid: string, email: string): Promise<void>;
  leave(groupId: string, uid: string): Promise<void>;
  remove(groupId: string): Promise<void>;
  report(groupId: string, reason: string, uid: string): Promise<void>;
}

export const REPORT_REASON_MAX = 300;

async function defaultBackend(
  config: FirebaseConfig,
  recaptchaV3SiteKey?: string,
): Promise<StudyGroupsBackend> {
  const { loadFirebaseClient } = await import('./firebaseClient.ts');
  const { app, auth } = await loadFirebaseClient(config, recaptchaV3SiteKey);
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
  const groups = collection(db, 'studyGroups');
  const members = collection(db, 'studyGroupMembers');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toGroup = (id: string, data: any): StudyGroup[] => {
    if (!isValidMode(data.mode)) return [];
    return [
      {
        id,
        courseCode: typeof data.courseCode === 'string' ? data.courseCode : '',
        title: typeof data.title === 'string' ? data.title : '',
        ...(typeof data.description === 'string' && data.description !== ''
          ? { description: data.description }
          : {}),
        mode: data.mode,
        ...(typeof data.schedule === 'string' && data.schedule !== ''
          ? { schedule: data.schedule }
          : {}),
        contactLink: typeof data.contactLink === 'string' ? data.contactLink : '',
        capacity: typeof data.capacity === 'number' ? data.capacity : 0,
        creatorUid: typeof data.creatorUid === 'string' ? data.creatorUid : '',
        createdAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
      },
    ];
  };

  return {
    async listGroups(limit) {
      const snap = await getDocs(query(groups, orderBy('createdAt', 'desc'), qLimit(limit)));
      return snap.docs.flatMap((d) => toGroup(d.id, d.data()));
    },
    async listMyMemberships(uid) {
      const snap = await getDocs(query(members, where('uid', '==', uid), qLimit(500)));
      return snap.docs.flatMap((d) => {
        const data = d.data();
        return typeof data.groupId === 'string' ? [{ groupId: data.groupId }] : [];
      });
    },
    async listMembers(groupId) {
      try {
        const snap = await getDocs(
          query(members, where('groupId', '==', groupId), orderBy('joinedAt', 'asc'), qLimit(50)),
        );
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: typeof data.uid === 'string' ? data.uid : '',
            email: typeof data.email === 'string' ? data.email : '',
          };
        });
      } catch {
        // Non-members are denied the roster by rules — read as empty.
        return [];
      }
    },
    async create(draft, uid) {
      const data: Record<string, unknown> = {
        courseCode: draft.courseCode,
        title: draft.title,
        mode: draft.mode,
        contactLink: draft.contactLink,
        capacity: draft.capacity,
        creatorUid: uid,
        // Required by rules and pinned to this session's own campus.
        university: campusStamp(auth),
        createdAt: serverTimestamp(),
      };
      if (draft.description !== '') data.description = draft.description;
      if (draft.schedule !== '') data.schedule = draft.schedule;
      const ref = await addDoc(groups, data);
      return ref.id;
    },
    async join(groupId, uid, email) {
      await setDoc(doc(db, 'studyGroupMembers', `${groupId}_${uid}`), {
        groupId,
        uid,
        email,
        joinedAt: serverTimestamp(),
      });
    },
    async leave(groupId, uid) {
      await deleteDoc(doc(db, 'studyGroupMembers', `${groupId}_${uid}`));
    },
    async remove(groupId) {
      await deleteDoc(doc(db, 'studyGroups', groupId));
    },
    async report(groupId, reason, uid) {
      await setDoc(doc(db, 'studyGroupReports', `${uid}_${groupId}`), {
        groupId,
        reason: reason.slice(0, REPORT_REASON_MAX),
        reporterUid: uid,
        createdAt: serverTimestamp(),
      });
    },
  };
}

export interface StudyGroupsRepoOptions {
  readonly config: FirebaseConfig;
  readonly recaptchaV3SiteKey?: string;
  /** Injectable backend loader (tests); defaults to the lazy npm SDK. */
  readonly loadBackend?: () => Promise<StudyGroupsBackend>;
}

/** Create the repo; the Firestore SDK loads on first use, shared thereafter. */
export function createStudyGroupsRepo(options: StudyGroupsRepoOptions): StudyGroupsRepo {
  const loadBackend =
    options.loadBackend ?? (() => defaultBackend(options.config, options.recaptchaV3SiteKey));
  let backend: Promise<StudyGroupsBackend> | null = null;
  const load = () => (backend ??= loadBackend());

  return {
    async listGroups() {
      try {
        return await (await load()).listGroups(GROUPS_LIMIT);
      } catch {
        // A failed read behaves like "no groups" (legacy parity).
        return [];
      }
    },
    async listMyMemberships(uid) {
      try {
        return await (await load()).listMyMemberships(uid);
      } catch {
        return [];
      }
    },
    async listMembers(groupId) {
      return (await load()).listMembers(groupId);
    },
    async create(draft, uid) {
      return (await load()).create(draft, uid);
    },
    async join(groupId, uid, email) {
      await (await load()).join(groupId, uid, email);
    },
    async leave(groupId, uid) {
      await (await load()).leave(groupId, uid);
    },
    async remove(groupId) {
      await (await load()).remove(groupId);
    },
    async report(groupId, reason, uid) {
      await (await load()).report(groupId, reason, uid);
    },
  };
}
