/**
 * Lost & found board — pure model, validation, and listing rules (#371).
 *
 * Privacy model (decided with the maintainer): posts carry NO visible contact
 * info. The poster's email lives in a client-unreadable Firestore doc; a
 * signed-in "I found this / this is mine" claim queues a Worker-sent email to
 * the poster, sharing the claimer's address so the two can talk directly.
 * These helpers know nothing about Firestore — plain data in, plain data out;
 * the repo and the Worker enforce the same limits at their own boundaries.
 */

import { parseRoomCode } from './campusRooms.ts';

export type LostFoundType = 'lost' | 'found';
export type LostFoundStatus = 'open' | 'resolved';

export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;
export const LOCATION_MAX = 120;
export const CLAIM_NOTE_MAX = 300;

/** Posts drop out of the default listing after this many days. */
export const POST_TTL_DAYS = 30;
export const POST_TTL_MS = POST_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface LostFoundDraft {
  type: LostFoundType;
  title: string;
  description?: string;
  locationHint?: string;
  /** Optional tower room code; links the post to the campus map. */
  roomCode?: string;
}

export interface LostFoundPost extends LostFoundDraft {
  id: string;
  status: LostFoundStatus;
  creatorUid: string;
  /** Epoch milliseconds (the repo converts Firestore timestamps). */
  createdAtMs: number;
}

export type DraftField = 'type' | 'title' | 'description' | 'locationHint' | 'roomCode';

export type DraftResult =
  | { ok: true; value: LostFoundDraft }
  | { ok: false; errors: Partial<Record<DraftField, string>> };

/**
 * Validate and normalize a draft: trims text, canonicalizes the room code,
 * drops empty optionals. Mirrors the Firestore rules limits — a draft that
 * passes here must not be rejected by the rules.
 */
export function validateDraft(input: {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  locationHint?: string | null;
  roomCode?: string | null;
}): DraftResult {
  const errors: Partial<Record<DraftField, string>> = {};

  const type = input.type === 'lost' || input.type === 'found' ? input.type : null;
  if (!type) errors.type = 'Choose lost or found.';

  const title = (input.title ?? '').trim();
  if (title.length < TITLE_MIN) {
    errors.title = `Title needs at least ${TITLE_MIN} characters.`;
  } else if (title.length > TITLE_MAX) {
    errors.title = `Title can be at most ${TITLE_MAX} characters.`;
  }

  const description = (input.description ?? '').trim();
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description can be at most ${DESCRIPTION_MAX} characters.`;
  }

  const locationHint = (input.locationHint ?? '').trim();
  if (locationHint.length > LOCATION_MAX) {
    errors.locationHint = `Location can be at most ${LOCATION_MAX} characters.`;
  }

  const roomRaw = (input.roomCode ?? '').trim();
  let roomCode: string | undefined;
  if (roomRaw !== '') {
    const parsed = parseRoomCode(roomRaw);
    if (!parsed) errors.roomCode = 'Not a tower room code (like 09G-31T).';
    else roomCode = parsed.code;
  }

  if (Object.keys(errors).length > 0 || !type) return { ok: false, errors };

  const value: LostFoundDraft = { type, title };
  if (description !== '') value.description = description;
  if (locationHint !== '') value.locationHint = locationHint;
  if (roomCode) value.roomCode = roomCode;
  return { ok: true, value };
}

export type ClaimNoteResult = { ok: true; value: string } | { ok: false; error: string };

/** Normalize an optional claim note; '' means "no note". */
export function validateClaimNote(input: string | null | undefined): ClaimNoteResult {
  const note = (input ?? '').trim();
  if (note.length > CLAIM_NOTE_MAX) {
    return { ok: false, error: `Note can be at most ${CLAIM_NOTE_MAX} characters.` };
  }
  return { ok: true, value: note };
}

export function isExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= POST_TTL_MS;
}

/**
 * The default board listing: open, unexpired posts, newest first. Resolved
 * and expired posts drop out here (nothing is deleted).
 */
export function visiblePosts(
  posts: readonly LostFoundPost[],
  nowMs: number,
  filter: LostFoundType | 'all' = 'all',
): LostFoundPost[] {
  return posts
    .filter(
      (p) =>
        p.status === 'open' &&
        !isExpired(p.createdAtMs, nowMs) &&
        (filter === 'all' || p.type === filter),
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** Compact relative age for list rows. */
export function postAge(createdAtMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - createdAtMs);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The claim button reads differently on each side of the exchange. */
export function claimLabel(type: LostFoundType): string {
  return type === 'lost' ? 'I found this' : 'This is mine';
}
