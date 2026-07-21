// src/core/papers.ts
//
// Typed, browser-independent core for the past-papers library (migration
// Step 2). Pure metadata/validation helpers only — no DOM, no Firebase, no
// Storage. The course catalog is injected (mirroring planner.ts) rather than
// imported. Behavior mirrors js/core/papers.js; parity is guarded by
// tests/typedCoreParity.test.js.

import type { CourseCatalog } from './types';

const PAPERS_COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const ALLOWED_PAPER_MIME_RE = /^application\/pdf$|^image\/(?:png|jpeg|webp|gif)$/;

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const PAPER_TYPES = [
  'midterm',
  'final',
  'quiz',
  'notes',
  'assignment',
  'lab',
  'lab-quiz',
] as const;
export type PaperType = (typeof PAPER_TYPES)[number];

export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  midterm: 'Midterm',
  final: 'Final',
  quiz: 'Quiz',
  notes: 'Notes',
  assignment: 'Assignment',
  lab: 'Lab Report',
  'lab-quiz': 'Lab Quiz',
};

export interface PaperUploadInput {
  file?: { size: number; type?: string } | null;
  courseCode?: string;
  type?: string;
  title?: string;
}

// Firestore Timestamp-like shape (matches js/core/papers.js, which only reads
// .toMillis() / .seconds — a raw number createdAt yields 0, as it does today).
export interface PaperTimestampLike {
  createdAt?: { toMillis?: () => number; seconds?: number } | null;
}

export function normalizeCourseCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .trim();
}

export function isKnownCourseCode(raw: unknown, catalog: CourseCatalog): boolean {
  const code = normalizeCourseCode(raw);
  return PAPERS_COURSE_CODE_RE.test(code) && !!catalog[code];
}

export function isValidPaperType(type: unknown): boolean {
  return (PAPER_TYPES as readonly string[]).includes(String(type ?? '').toLowerCase());
}

export function validatePaperUpload(
  { file, courseCode, type, title }: PaperUploadInput,
  catalog: CourseCatalog,
): string | null {
  if (!file) return 'File is required';
  if (file.size <= 0) return 'File is empty';
  if (file.size > MAX_FILE_SIZE) return 'File must be 10 MB or smaller';
  if (!ALLOWED_PAPER_MIME_RE.test(file.type || ''))
    return 'Only PDFs, PNG, JPEG, WebP, and GIF images are allowed';
  const code = normalizeCourseCode(courseCode);
  if (!isKnownCourseCode(code, catalog)) return 'Unknown course code';
  if (!isValidPaperType(type)) return 'Invalid paper type';
  const cleanTitle = String(title ?? '').trim();
  if (cleanTitle.length < 3) return 'Title must be at least 3 characters';
  if (cleanTitle.length > 120) return 'Title must be 120 characters or less';
  return null;
}

export function paperTimestampMs(paper: PaperTimestampLike | null | undefined): number {
  const createdAt = paper?.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (createdAt.seconds) return createdAt.seconds * 1000;
  return 0;
}
