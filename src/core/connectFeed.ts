/**
 * Connect Feed core — pure helpers for parsing and reasoning about the
 * live BRACU CONNECT section data served by `usis-cdn.eniamza.com/connect.json`.
 *
 * This module is I/O-free on purpose: fetch/cache/localStorage live in the
 * runtime client (`js/core/connect-feed-client.js`). Everything here is
 * deterministic so it can be unit-tested against fixtures.
 */

import type { CourseCode } from './types';

// ---------------------------------------------------------------------------
// Wire-level shapes (mirror the CDN payload — keep tolerant)
// ---------------------------------------------------------------------------

export type WeekdayName =
  | 'SATURDAY'
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY';

export interface RawClassSlot {
  startTime?: string | null;
  endTime?: string | null;
  day?: string | null;
}

export interface RawSectionSchedule {
  classSchedules?: readonly RawClassSlot[] | null;
  classStartDate?: string | null;
  classEndDate?: string | null;
  finalExamDate?: string | null;
  finalExamStartTime?: string | null;
  finalExamEndTime?: string | null;
  midExamDate?: string | null;
  midExamStartTime?: string | null;
  midExamEndTime?: string | null;
}

export interface RawSection {
  sectionId: number;
  courseId?: number;
  courseCode: string;
  courseName?: string;
  courseCredit?: number;
  sectionName?: string;
  capacity?: number;
  consumedSeat?: number;
  semesterSessionId?: number;
  faculties?: string | null;
  roomName?: string | null;
  roomNumber?: string | null;
  courseType?: string | null;
  academicDegree?: string | null;
  sectionType?: string | null;
  parentSectionId?: number | null;
  sectionSchedule?: RawSectionSchedule | null;
  labSchedules?: readonly RawClassSlot[] | null;
  labFaculties?: string | null;
  labRoomName?: string | null;
  prerequisiteCourses?: string | null;
}

// ---------------------------------------------------------------------------
// Normalized shapes (what the rest of the app should consume)
// ---------------------------------------------------------------------------

/** Minutes since 00:00, e.g. `14:00:00` → 840. */
export type MinutesOfDay = number;

/** Whether a slot is a theory class or a lab session. */
export type SlotKind = 'theory' | 'lab';

export interface TimeSlot {
  day: WeekdayName;
  startMin: MinutesOfDay;
  endMin: MinutesOfDay;
  kind: SlotKind;
}

export interface ExamSlot {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  startMin: MinutesOfDay;
  endMin: MinutesOfDay;
}

export interface NormalizedSection {
  sectionId: number;
  courseCode: CourseCode;
  courseName: string;
  credits: number;
  sectionName: string;
  capacity: number;
  consumedSeat: number;
  /** `consumedSeat >= capacity`. */
  isFull: boolean;
  /** Free-form faculty initials string from the feed, e.g. `"SHO"`. */
  facultyInitials: string;
  roomName: string;
  semesterSessionId: number | null;
  /** Class meetings (theory + lab merged). */
  classSlots: TimeSlot[];
  /** Semester class period, `YYYY-MM-DD` or null. Bounds recurring exports. */
  classStartDate: string | null;
  classEndDate: string | null;
  midExam: ExamSlot | null;
  finalExam: ExamSlot | null;
}

export interface ParseResult {
  sections: NormalizedSection[];
  /** sectionIds that were dropped because they couldn't be normalized. */
  dropped: number[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const WEEKDAYS: ReadonlySet<WeekdayName> = new Set([
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
]);

/** Parse `HH:MM` or `HH:MM:SS` → minutes. Returns null for malformed input. */
export function parseTimeToMinutes(value: string | null | undefined): MinutesOfDay | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeDay(value: string | null | undefined): WeekdayName | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase() as WeekdayName;
  return WEEKDAYS.has(upper) ? upper : null;
}

function normalizeSlots(
  raw: readonly RawClassSlot[] | null | undefined,
  kind: SlotKind,
): TimeSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: TimeSlot[] = [];
  for (const slot of raw) {
    const day = normalizeDay(slot?.day);
    const startMin = parseTimeToMinutes(slot?.startTime);
    const endMin = parseTimeToMinutes(slot?.endTime);
    if (day === null || startMin === null || endMin === null) continue;
    if (endMin <= startMin) continue;
    out.push({ day, startMin, endMin, kind });
  }
  return out;
}

/** Validate a bare `YYYY-MM-DD` date, returning it unchanged or null. */
function normalizeDateOnly(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeExam(
  date: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): ExamSlot | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  return { date, startMin, endMin };
}

/**
 * Normalize one raw section. Returns null if the section is unusable
 * (missing identifying fields). Sections with no class slots are still
 * returned — they may be lab-only or schedule-TBA placeholders.
 */
export function normalizeSection(raw: RawSection): NormalizedSection | null {
  if (typeof raw?.sectionId !== 'number') return null;
  if (typeof raw?.courseCode !== 'string' || raw.courseCode.trim() === '') return null;

  const capacity = Number.isFinite(raw.capacity) ? Number(raw.capacity) : 0;
  const consumedSeat = Number.isFinite(raw.consumedSeat) ? Number(raw.consumedSeat) : 0;

  const theorySlots = normalizeSlots(raw.sectionSchedule?.classSchedules, 'theory');
  const labSlots = normalizeSlots(raw.labSchedules, 'lab');
  const classSlots = [...theorySlots, ...labSlots];

  const midExam = normalizeExam(
    raw.sectionSchedule?.midExamDate,
    raw.sectionSchedule?.midExamStartTime,
    raw.sectionSchedule?.midExamEndTime,
  );
  const finalExam = normalizeExam(
    raw.sectionSchedule?.finalExamDate,
    raw.sectionSchedule?.finalExamStartTime,
    raw.sectionSchedule?.finalExamEndTime,
  );

  return {
    sectionId: raw.sectionId,
    courseCode: raw.courseCode.trim().toUpperCase(),
    courseName: (raw.courseName ?? '').trim(),
    credits: Number.isFinite(raw.courseCredit) ? Number(raw.courseCredit) : 0,
    sectionName: (raw.sectionName ?? '').trim(),
    capacity,
    consumedSeat,
    isFull: capacity > 0 && consumedSeat >= capacity,
    facultyInitials: (raw.faculties ?? '').trim().toUpperCase(),
    roomName: (raw.roomName ?? raw.roomNumber ?? '').trim(),
    semesterSessionId: typeof raw.semesterSessionId === 'number' ? raw.semesterSessionId : null,
    classSlots,
    classStartDate: normalizeDateOnly(raw.sectionSchedule?.classStartDate),
    classEndDate: normalizeDateOnly(raw.sectionSchedule?.classEndDate),
    midExam,
    finalExam,
  };
}

/**
 * Parse the full feed payload. Tolerant of junk entries: anything that fails
 * normalization is reported in `dropped` rather than throwing.
 */
export function parseFeed(payload: unknown): ParseResult {
  if (!Array.isArray(payload)) return { sections: [], dropped: [] };
  const sections: NormalizedSection[] = [];
  const dropped: number[] = [];
  for (const entry of payload) {
    const normalized = normalizeSection(entry as RawSection);
    if (normalized) sections.push(normalized);
    else if (typeof (entry as RawSection)?.sectionId === 'number') {
      dropped.push((entry as RawSection).sectionId);
    }
  }
  return { sections, dropped };
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

export type SectionIndex = Map<CourseCode, NormalizedSection[]>;

/** Group sections by uppercased courseCode. Sort order within a group is feed order. */
export function indexByCourse(sections: readonly NormalizedSection[]): SectionIndex {
  const out: SectionIndex = new Map();
  for (const s of sections) {
    const list = out.get(s.courseCode);
    if (list) list.push(s);
    else out.set(s.courseCode, [s]);
  }
  return out;
}

export function listCourseCodes(index: SectionIndex): CourseCode[] {
  return [...index.keys()].sort();
}

// ---------------------------------------------------------------------------
// Clash detection
// ---------------------------------------------------------------------------

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** True if any class slot in `a` overlaps any class slot in `b` on the same day. */
export function hasClassClash(a: NormalizedSection, b: NormalizedSection): boolean {
  if (a.sectionId === b.sectionId) return false;
  for (const sa of a.classSlots) {
    for (const sb of b.classSlots) {
      if (sa.day !== sb.day) continue;
      if (rangesOverlap(sa.startMin, sa.endMin, sb.startMin, sb.endMin)) return true;
    }
  }
  return false;
}

/** True if mid or final exams overlap (same date, overlapping times). */
export function hasExamClash(a: NormalizedSection, b: NormalizedSection): boolean {
  if (a.sectionId === b.sectionId) return false;
  const pairs: Array<[ExamSlot | null, ExamSlot | null]> = [
    [a.midExam, b.midExam],
    [a.midExam, b.finalExam],
    [a.finalExam, b.midExam],
    [a.finalExam, b.finalExam],
  ];
  for (const [x, y] of pairs) {
    if (!x || !y) continue;
    if (x.date !== y.date) continue;
    if (rangesOverlap(x.startMin, x.endMin, y.startMin, y.endMin)) return true;
  }
  return false;
}

export interface ClashReport {
  classClashes: Array<[number, number]>;
  examClashes: Array<[number, number]>;
}

/**
 * Pairwise clash report across a routine (a chosen set of sections — one per course).
 * Section pairs are reported with the smaller `sectionId` first for stable output.
 */
export function detectClashes(routine: readonly NormalizedSection[]): ClashReport {
  const classClashes: Array<[number, number]> = [];
  const examClashes: Array<[number, number]> = [];
  for (let i = 0; i < routine.length; i++) {
    for (let j = i + 1; j < routine.length; j++) {
      const a = routine[i]!;
      const b = routine[j]!;
      const pair: [number, number] =
        a.sectionId < b.sectionId ? [a.sectionId, b.sectionId] : [b.sectionId, a.sectionId];
      if (hasClassClash(a, b)) classClashes.push(pair);
      if (hasExamClash(a, b)) examClashes.push(pair);
    }
  }
  return { classClashes, examClashes };
}

export function isClashFree(routine: readonly NormalizedSection[]): boolean {
  const report = detectClashes(routine);
  return report.classClashes.length === 0 && report.examClashes.length === 0;
}

// ---------------------------------------------------------------------------
// Convenience summaries (cheap to compute, useful for UI badges)
// ---------------------------------------------------------------------------

export interface FeedSummary {
  totalSections: number;
  totalCourses: number;
  totalFaculty: number;
  semesterSessionIds: number[];
}

export function summarizeFeed(sections: readonly NormalizedSection[]): FeedSummary {
  const courses = new Set<string>();
  const faculty = new Set<string>();
  const sessions = new Set<number>();
  for (const s of sections) {
    courses.add(s.courseCode);
    if (s.facultyInitials) faculty.add(s.facultyInitials);
    if (s.semesterSessionId !== null) sessions.add(s.semesterSessionId);
  }
  return {
    totalSections: sections.length,
    totalCourses: courses.size,
    totalFaculty: faculty.size,
    semesterSessionIds: [...sessions].sort((a, b) => a - b),
  };
}
