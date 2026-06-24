// ── js/core/studyGroups.js ────────────────────────────────────────────────────
// Pure data layer for the Study Group Finder. Wraps the Firestore hooks that
// firebase.js exposes on window._shohoj_* so the rest of the bundled code can
// post, browse, join, and report study groups without touching Firebase
// directly. Mirrors js/core/papers.js. Keep this framework-free and testable —
// validation here is a UX courtesy; firestore.rules is the real gate.

import { COURSE_DB } from './catalog.js';

const GROUP_COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const HTTPS_LINK_RE = /^https:\/\/[^\s]+$/i;

export const MODES = ['online', 'in-person', 'hybrid'];
export const MODE_LABELS = {
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

export function normalizeCourseCode(raw) {
  return String(raw || '').toUpperCase().trim();
}

export function isKnownCourseCode(raw) {
  const code = normalizeCourseCode(raw);
  return GROUP_COURSE_CODE_RE.test(code) && !!COURSE_DB[code];
}

export function isValidMode(m) {
  return MODES.includes(String(m || '').toLowerCase());
}

// Returns an error string, or null when the draft is valid.
export function validateGroupDraft({ courseCode, title, description, mode, schedule, contactLink, capacity }) {
  if (!isKnownCourseCode(courseCode)) return 'Unknown course code';

  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < TITLE_MIN) return `Title must be at least ${TITLE_MIN} characters`;
  if (cleanTitle.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or less`;

  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length > DESCRIPTION_MAX) return `Description must be ${DESCRIPTION_MAX} characters or less`;

  if (!isValidMode(mode)) return 'Pick a meeting mode';

  const cleanSchedule = String(schedule || '').trim();
  if (cleanSchedule.length > SCHEDULE_MAX) return `Schedule must be ${SCHEDULE_MAX} characters or less`;

  const cleanLink = String(contactLink || '').trim();
  if (!HTTPS_LINK_RE.test(cleanLink)) return 'Contact link must be a full https:// URL';
  if (cleanLink.length > CONTACT_LINK_MAX) return `Contact link must be ${CONTACT_LINK_MAX} characters or less`;

  const cap = Number(capacity);
  if (!Number.isInteger(cap)) return 'Capacity must be a whole number';
  if (cap < MIN_CAPACITY) return `Capacity must be at least ${MIN_CAPACITY}`;
  if (cap > MAX_CAPACITY) return `Capacity must be ${MAX_CAPACITY} or less`;

  return null;
}

// Member-count summary for a group card. memberCount may be null when the
// caller isn't a member and can't read the roster (rules-gated).
export function summarizeMembers(memberCount, capacity) {
  const cap = Number(capacity) || 0;
  if (memberCount == null) {
    return { label: `up to ${cap}`, isFull: false, spotsLeft: null, known: false };
  }
  const count = Math.max(0, Number(memberCount) || 0);
  const spotsLeft = Math.max(0, cap - count);
  return {
    label: `${count} / ${cap} joined`,
    isFull: count >= cap,
    spotsLeft,
    known: true,
  };
}

export function groupTimestampMs(g) {
  if (!g || !g.createdAt) return 0;
  if (typeof g.createdAt.toMillis === 'function') return g.createdAt.toMillis();
  if (g.createdAt.seconds) return g.createdAt.seconds * 1000;
  return 0;
}

// ── Firestore hook wrappers ─────────────────────────────────────────────────
export async function createStudyGroup(draft) {
  if (typeof window._shohoj_createStudyGroup !== 'function') {
    return { ok: false, error: 'Study groups unavailable' };
  }
  const err = validateGroupDraft(draft);
  if (err) return { ok: false, error: err };
  return window._shohoj_createStudyGroup({
    courseCode: normalizeCourseCode(draft.courseCode),
    title: String(draft.title).trim(),
    description: String(draft.description || '').trim(),
    mode: String(draft.mode).toLowerCase(),
    schedule: String(draft.schedule || '').trim(),
    contactLink: String(draft.contactLink).trim(),
    capacity: Number(draft.capacity),
  });
}

export async function fetchStudyGroups(opts = {}) {
  if (typeof window._shohoj_fetchStudyGroups !== 'function') return [];
  return window._shohoj_fetchStudyGroups(opts);
}

export async function fetchMyMemberships() {
  if (typeof window._shohoj_fetchMyGroupMemberships !== 'function') return [];
  return window._shohoj_fetchMyGroupMemberships();
}

export async function fetchGroupMembers(groupId) {
  if (typeof window._shohoj_fetchGroupMembers !== 'function' || !groupId) return [];
  return window._shohoj_fetchGroupMembers(groupId);
}

export async function joinStudyGroup(groupId) {
  if (typeof window._shohoj_joinStudyGroup !== 'function') {
    return { ok: false, error: 'Join unavailable' };
  }
  return window._shohoj_joinStudyGroup(groupId);
}

export async function leaveStudyGroup(groupId) {
  if (typeof window._shohoj_leaveStudyGroup !== 'function') {
    return { ok: false, error: 'Leave unavailable' };
  }
  return window._shohoj_leaveStudyGroup(groupId);
}

export async function deleteStudyGroup(groupId) {
  if (typeof window._shohoj_deleteStudyGroup !== 'function') {
    return { ok: false, error: 'Delete unavailable' };
  }
  return window._shohoj_deleteStudyGroup(groupId);
}

export async function reportStudyGroup(groupId, reason) {
  if (typeof window._shohoj_reportStudyGroup !== 'function') {
    return { ok: false, error: 'Reporting unavailable' };
  }
  return window._shohoj_reportStudyGroup({ groupId, reason });
}

// ── Admin helpers ────────────────────────────────────────────────────────────
export async function fetchStudyGroupReports() {
  if (typeof window._shohoj_fetchStudyGroupReports !== 'function') return [];
  return window._shohoj_fetchStudyGroupReports();
}

export async function deleteStudyGroupReport(reportId) {
  if (typeof window._shohoj_deleteStudyGroupReport !== 'function') {
    return { ok: false, error: 'Unavailable' };
  }
  return window._shohoj_deleteStudyGroupReport(reportId);
}

export async function deleteStudyGroupByReport(reportId, groupId) {
  if (typeof window._shohoj_deleteStudyGroupByReport !== 'function') {
    return { ok: false, error: 'Unavailable' };
  }
  return window._shohoj_deleteStudyGroupByReport(reportId, groupId);
}
