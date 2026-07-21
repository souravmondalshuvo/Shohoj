/**
 * Study-group model (#443): types, draft validation, and card summaries for
 * the /groups route — the shell port of the legacy Study Group Finder
 * (js/core/studyGroups.js). Pure data in, pure data out; Firestore access
 * lives in platform/firebase/studyGroupsRepo, and validation here is a UX
 * courtesy — firestore.rules is the real gate.
 */

import type { CourseCatalog } from './types';

const GROUP_COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const HTTPS_LINK_RE = /^https:\/\/[^\s]+$/i;

export const MODES = ['online', 'in-person', 'hybrid'] as const;
export type GroupMode = (typeof MODES)[number];

export const MODE_LABELS: Record<GroupMode, string> = {
  online: 'Online',
  'in-person': 'In-person',
  hybrid: 'Hybrid',
};

export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;
export const SCHEDULE_MAX = 120;
export const CONTACT_LINK_MAX = 300;
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 50;

/** Board fetch cap (mirrors the legacy fetchStudyGroups query). */
export const GROUPS_LIMIT = 200;

export interface GroupDraft {
  courseCode: string;
  title: string;
  description: string;
  mode: GroupMode;
  schedule: string;
  contactLink: string;
  capacity: number;
}

export interface StudyGroup {
  id: string;
  courseCode: string;
  title: string;
  description?: string;
  mode: GroupMode;
  schedule?: string;
  contactLink: string;
  capacity: number;
  creatorUid: string;
  createdAtMs: number;
}

export interface GroupMember {
  uid: string;
  email: string;
}

export function normalizeCourseCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .trim();
}

export function isKnownCourseCode(raw: unknown, catalog: CourseCatalog): boolean {
  const code = normalizeCourseCode(raw);
  return GROUP_COURSE_CODE_RE.test(code) && !!catalog[code];
}

export function isValidMode(mode: unknown): mode is GroupMode {
  return (MODES as readonly string[]).includes(String(mode ?? '').toLowerCase());
}

/** Returns an error string, or null when the draft is valid (legacy parity). */
export function validateGroupDraft(
  { courseCode, title, description, mode, schedule, contactLink, capacity }: Partial<GroupDraft>,
  catalog: CourseCatalog,
): string | null {
  if (!isKnownCourseCode(courseCode, catalog)) return 'Unknown course code';

  const cleanTitle = String(title ?? '').trim();
  if (cleanTitle.length < TITLE_MIN) return `Title must be at least ${TITLE_MIN} characters`;
  if (cleanTitle.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or less`;

  const cleanDesc = String(description ?? '').trim();
  if (cleanDesc.length > DESCRIPTION_MAX)
    return `Description must be ${DESCRIPTION_MAX} characters or less`;

  if (!isValidMode(mode)) return 'Pick a meeting mode';

  const cleanSchedule = String(schedule ?? '').trim();
  if (cleanSchedule.length > SCHEDULE_MAX)
    return `Schedule must be ${SCHEDULE_MAX} characters or less`;

  const cleanLink = String(contactLink ?? '').trim();
  if (!HTTPS_LINK_RE.test(cleanLink)) return 'Contact link must be a full https:// URL';
  if (cleanLink.length > CONTACT_LINK_MAX)
    return `Contact link must be ${CONTACT_LINK_MAX} characters or less`;

  const cap = Number(capacity);
  if (!Number.isInteger(cap)) return 'Capacity must be a whole number';
  if (cap < MIN_CAPACITY) return `Capacity must be at least ${MIN_CAPACITY}`;
  if (cap > MAX_CAPACITY) return `Capacity must be ${MAX_CAPACITY} or less`;

  return null;
}

export interface MemberSummary {
  label: string;
  isFull: boolean;
  spotsLeft: number | null;
  known: boolean;
}

/**
 * Member-count summary for a group card. `memberCount` is null when the caller
 * isn't a member and can't read the roster (rules-gated), so capacity stays
 * advisory — the label is the only capacity signal.
 */
export function summarizeMembers(memberCount: number | null, capacity: number): MemberSummary {
  const cap = Number(capacity) || 0;
  if (memberCount == null) {
    return { label: `up to ${cap}`, isFull: false, spotsLeft: null, known: false };
  }
  const count = Math.max(0, Number(memberCount) || 0);
  const spotsLeft = Math.max(0, cap - count);
  return { label: `${count} / ${cap} joined`, isFull: count >= cap, spotsLeft, known: true };
}

/** Newest-first board, filtered by mode and a course-code substring. */
export function groupsView(
  groups: readonly StudyGroup[],
  modeFilter: GroupMode | 'all',
  courseFilter: string,
): StudyGroup[] {
  const q = courseFilter.trim().toUpperCase();
  return groups
    .filter((g) => {
      if (modeFilter !== 'all' && g.mode !== modeFilter) return false;
      if (q !== '' && !g.courseCode.toUpperCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** "3d ago" / "5h ago" / "12m ago" / "just now" (legacy parity). */
export function groupAge(createdAtMs: number, nowMs: number): string {
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
