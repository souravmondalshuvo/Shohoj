/**
 * App-feedback model (#437): types, validation, and board filtering/sorting for
 * the /feedback route — the shell port of the legacy feedback modal. Pure data
 * in, pure data out; Firestore access lives in platform/firebase/feedbackRepo.
 */

export const FEEDBACK_TYPES = ['bug', 'feature', 'general'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  general: 'General',
};

export const TEXT_MIN = 3;
export const TEXT_MAX = 500;

/** Board fetch cap (mirrors the legacy fetchAllFeedback query). */
export const BOARD_LIMIT = 200;

export interface FeedbackDraft {
  type: FeedbackType;
  text: string;
  anonymous: boolean;
}

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  text: string;
  anonymous: boolean;
  /** Present only on non-anonymous items. */
  uid?: string;
  createdAtMs: number;
}

export type FeedbackTextResult = { ok: true; text: string } | { ok: false; error: string };

/** Trim + bound the feedback text the way the legacy submit hook did. */
export function validateFeedbackText(input: string | null | undefined): FeedbackTextResult {
  const trimmed = String(input ?? '').trim();
  if (trimmed.length < TEXT_MIN) {
    return { ok: false, error: 'Please enter your feedback.' };
  }
  if (trimmed.length > TEXT_MAX) {
    return { ok: false, error: `Feedback is limited to ${TEXT_MAX} characters.` };
  }
  return { ok: true, text: trimmed };
}

export function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === 'string' && (FEEDBACK_TYPES as readonly string[]).includes(value);
}

export type BoardFilter = FeedbackType | 'all';

/** Newest-first board view, optionally narrowed to one type. */
export function boardView(items: readonly FeedbackItem[], filter: BoardFilter): FeedbackItem[] {
  const filtered = filter === 'all' ? [...items] : items.filter((i) => i.type === filter);
  return filtered.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** "3d ago" / "5h ago" / "12m ago" / "just now" (legacy _timeAgo parity). */
export function feedbackAge(createdAtMs: number, nowMs: number): string {
  if (!createdAtMs) return '';
  const diff = nowMs - createdAtMs;
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  if (m > 0) return `${m}m ago`;
  return 'just now';
}
