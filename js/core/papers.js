// ── js/core/papers.js ─────────────────────────────────────────────────────────
// Pure data layer for the past papers & notes library. Wraps the Firestore +
// Storage hooks that firebase.js exposes on window._shohoj_* so the rest of
// the bundled code can browse, upload, and report papers without touching
// Firebase directly.

import { COURSE_DB } from './catalog.js';

const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const PAPER_TYPES = ['midterm', 'final', 'quiz', 'notes', 'assignment'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const PAPER_TYPE_LABELS = {
  midterm:    'Midterm',
  final:      'Final',
  quiz:       'Quiz',
  notes:      'Notes',
  assignment: 'Assignment',
};

export function normalizeCourseCode(raw) {
  return String(raw || '').toUpperCase().trim();
}

export function isKnownCourseCode(raw) {
  const code = normalizeCourseCode(raw);
  return COURSE_CODE_RE.test(code) && !!COURSE_DB[code];
}

export function isValidPaperType(t) {
  return PAPER_TYPES.includes(String(t || '').toLowerCase());
}

export function validatePaperUpload({ file, courseCode, type, title }) {
  if (!file) return 'File is required';
  if (file.size <= 0) return 'File is empty';
  if (file.size > MAX_FILE_SIZE) return 'File must be 10 MB or smaller';
  if (!/^application\/pdf$|^image\//.test(file.type || '')) return 'Only PDFs and images are allowed';
  const code = normalizeCourseCode(courseCode);
  if (!isKnownCourseCode(code)) return 'Unknown course code';
  if (!isValidPaperType(type)) return 'Invalid paper type';
  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < 3) return 'Title must be at least 3 characters';
  if (cleanTitle.length > 120) return 'Title must be 120 characters or less';
  return null;
}

export async function fetchPapersByCourse(courseCode) {
  if (typeof window._shohoj_fetchPapersByCourse !== 'function') return [];
  const code = normalizeCourseCode(courseCode);
  if (!isKnownCourseCode(code)) return [];
  return window._shohoj_fetchPapersByCourse(code);
}

export async function fetchRecentPapers(n = 30) {
  if (typeof window._shohoj_fetchRecentPapers !== 'function') return [];
  return window._shohoj_fetchRecentPapers(n);
}

export async function fetchMyPapers() {
  if (typeof window._shohoj_fetchMyPapers !== 'function') return [];
  return window._shohoj_fetchMyPapers();
}

export async function getPaperDownloadUrl(storagePath) {
  if (typeof window._shohoj_paperDownloadUrl !== 'function') return null;
  return window._shohoj_paperDownloadUrl(storagePath);
}

export async function uploadPaper(payload) {
  if (typeof window._shohoj_uploadPaper !== 'function') {
    return { ok: false, error: 'Upload unavailable' };
  }
  const err = validatePaperUpload(payload);
  if (err) return { ok: false, error: err };
  return window._shohoj_uploadPaper({
    ...payload,
    courseCode: normalizeCourseCode(payload.courseCode),
    type: String(payload.type).toLowerCase(),
    title: String(payload.title).trim(),
  });
}

export async function reportPaper(paperId, reason) {
  if (typeof window._shohoj_reportPaper !== 'function') {
    return { ok: false, error: 'Reporting unavailable' };
  }
  return window._shohoj_reportPaper({ paperId, reason });
}

export function paperTimestampMs(p) {
  if (!p || !p.createdAt) return 0;
  if (typeof p.createdAt.toMillis === 'function') return p.createdAt.toMillis();
  if (p.createdAt.seconds) return p.createdAt.seconds * 1000;
  return 0;
}

// ── Admin helpers ────────────────────────────────────────────────────────────
export function isPaperAdmin() {
  return typeof window._shohoj_isPaperAdmin === 'function' && window._shohoj_isPaperAdmin();
}

export async function fetchUnapprovedPapers() {
  if (typeof window._shohoj_fetchUnapprovedPapers !== 'function') return [];
  return window._shohoj_fetchUnapprovedPapers();
}

export async function fetchPaperReports() {
  if (typeof window._shohoj_fetchPaperReports !== 'function') return [];
  return window._shohoj_fetchPaperReports();
}

export async function approvePaper(paperId) {
  if (typeof window._shohoj_approvePaper !== 'function') {
    return { ok: false, error: 'Unavailable' };
  }
  return window._shohoj_approvePaper(paperId);
}

export async function deletePaper(paperId, storagePath) {
  if (typeof window._shohoj_deletePaper !== 'function') {
    return { ok: false, error: 'Unavailable' };
  }
  return window._shohoj_deletePaper(paperId, storagePath);
}

export async function deletePaperReport(reportId) {
  if (typeof window._shohoj_deletePaperReport !== 'function') {
    return { ok: false, error: 'Unavailable' };
  }
  return window._shohoj_deletePaperReport(reportId);
}
