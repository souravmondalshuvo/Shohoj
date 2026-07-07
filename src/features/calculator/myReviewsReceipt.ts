// src/features/calculator/myReviewsReceipt.ts
//
// The "my reviews" receipt (#357): a local record of the reviews this user has
// submitted, keyed by uid, kept in localStorage under `shohoj_my_reviews_v1`.
// Byte-parity with legacy js/auth/firebase.js `_recordMyReview` (the writer) and
// js/ui/profileTab.js `_myReviews` (the reader) — same key, `{ [uid]: Entry[] }`
// shape, entry fields, and the dedupe-by-pair rule. Reviews are immutable
// server-side (a re-submit 409s), but the receipt still replaces any prior local
// entry for the same faculty+course so the newest local record wins. The Profile
// tab reads this list; the provider writes it on a successful submit.

import type { KeyValueStore } from '../../services/storage/keyValueStore.ts';

/** The localStorage key shared with the legacy writer + Profile reader. */
export const MY_REVIEWS_KEY = 'shohoj_my_reviews_v1';

/** One submitted-review receipt (legacy _recordMyReview entry shape). */
export interface MyReviewEntry {
  /** Worker-assigned doc id, or null when the response omitted it. */
  readonly id: string | null;
  readonly facultyInitials: string;
  readonly courseCode: string;
  readonly semester: string;
  /** Unix ms when the receipt was recorded (legacy Date.now()). */
  readonly at: number;
}

type MyReviewsByUid = Record<string, MyReviewEntry[]>;

const pairKey = (entry: Pick<MyReviewEntry, 'facultyInitials' | 'courseCode'>) =>
  `${entry.facultyInitials}|${entry.courseCode}`;

/**
 * Append `entry` under `uid`, first dropping any prior entry for the same
 * faculty+course pair (legacy dedupe — the newest local record wins). Pure: a
 * new map is returned, the input is untouched.
 */
export function appendMyReview(
  all: MyReviewsByUid,
  uid: string,
  entry: MyReviewEntry,
): MyReviewsByUid {
  const list = Array.isArray(all[uid]) ? all[uid] : [];
  const key = pairKey(entry);
  const next = list.filter((r) => pairKey(r) !== key);
  next.push(entry);
  return { ...all, [uid]: next };
}

/** Parse the stored map defensively (legacy JSON.parse(_ || '{}')). */
function readAll(store: KeyValueStore): MyReviewsByUid {
  try {
    const parsed = JSON.parse(store.getItem(MY_REVIEWS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as MyReviewsByUid) : {};
  } catch {
    return {};
  }
}

/**
 * Record a submitted review's receipt (legacy _recordMyReview). A no-op without
 * a uid; storage errors are swallowed by the store so a failed write never
 * breaks the submit flow.
 */
export function recordMyReview(store: KeyValueStore, uid: string, entry: MyReviewEntry): void {
  if (!uid) return;
  store.setItem(MY_REVIEWS_KEY, JSON.stringify(appendMyReview(readAll(store), uid, entry)));
}

/** A uid's receipts, newest last (legacy _myReviews). Empty without a uid. */
export function readMyReviews(store: KeyValueStore, uid: string): MyReviewEntry[] {
  if (!uid) return [];
  const list = readAll(store)[uid];
  return Array.isArray(list) ? list : [];
}
