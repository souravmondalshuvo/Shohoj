/**
 * Free-room finder — pure helpers that turn the normalized section list into
 * room-availability queries. The live CONNECT feed gives every section a
 * `roomName` and class schedule; this inverts that into "which rooms are busy
 * when", so the UI can answer "what's free right now / on day D".
 *
 * UI-agnostic on purpose: plain data in, plain data out.
 */

import type { NormalizedSection, SlotKind, WeekdayName } from './connectFeed';

/** Default campus hours used when computing a room's free windows. */
export const CAMPUS_START_MIN = 8 * 60; // 08:00
export const CAMPUS_END_MIN = 22 * 60; // 22:00

export interface BusyInterval {
  day: WeekdayName;
  startMin: number;
  endMin: number;
  courseCode: string;
  sectionName: string;
  kind: SlotKind;
}

export interface FreeWindow {
  startMin: number;
  endMin: number;
}

const FR_WEEK_ORDER: readonly WeekdayName[] = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

/** A room name is usable if it's a non-empty, non-placeholder string. */
function isRealRoom(name: string | null | undefined): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed === '') return false;
  const upper = trimmed.toUpperCase();
  if (upper === 'TBA') return false;
  // The live feed sometimes stuffs a class schedule into roomName
  // (e.g. "MON 11:00AM: 07A-08C; WED 2:00PM: 09G-31T"); real room codes
  // never contain whitespace or schedule punctuation.
  if (/[\s:;]/.test(trimmed)) return false;
  // UB (old University Building) is gone post campus-move; its "UB0000"
  // placeholder still lingers in the feed.
  if (upper.startsWith('UB')) return false;
  return true;
}

/**
 * Map each room to its busy intervals across the week, sorted by day (canonical
 * Sat→Fri order) then start time. Sections with a blank/TBA room or no class
 * slots contribute nothing.
 */
export function buildRoomBusyIndex(
  sections: readonly NormalizedSection[],
): Map<string, BusyInterval[]> {
  const index = new Map<string, BusyInterval[]>();
  for (const s of sections) {
    if (!isRealRoom(s.roomName)) continue;
    const room = s.roomName.trim();
    for (const slot of s.classSlots) {
      const list = index.get(room);
      const interval: BusyInterval = {
        day: slot.day,
        startMin: slot.startMin,
        endMin: slot.endMin,
        courseCode: s.courseCode,
        sectionName: s.sectionName,
        kind: slot.kind,
      };
      if (list) list.push(interval);
      else index.set(room, [interval]);
    }
  }
  for (const list of index.values()) {
    list.sort(
      (a, b) =>
        FR_WEEK_ORDER.indexOf(a.day) - FR_WEEK_ORDER.indexOf(b.day) ||
        a.startMin - b.startMin ||
        a.endMin - b.endMin,
    );
  }
  return index;
}

/** Busy intervals for a room on a single day (already sorted by start). */
export function busyOnDay(
  index: Map<string, BusyInterval[]>,
  room: string,
  day: WeekdayName,
): BusyInterval[] {
  return (index.get(room) ?? []).filter((i) => i.day === day);
}

/** Every room in the feed, sorted alphabetically. */
export function listAllRooms(index: Map<string, BusyInterval[]>): string[] {
  return [...index.keys()].sort((a, b) => a.localeCompare(b));
}

/**
 * The class/lab occupying `room` at `minute` on `day`, or null if free. When
 * intervals overlap (rare), the one ending latest wins so "busy until" reflects
 * when the room actually frees up. Half-open [startMin, endMin): a class at
 * exactly endMin no longer occupies.
 */
export function occupantAt(
  index: Map<string, BusyInterval[]>,
  room: string,
  day: WeekdayName,
  minute: number,
): BusyInterval | null {
  let occupant: BusyInterval | null = null;
  for (const i of index.get(room) ?? []) {
    if (i.day !== day || minute < i.startMin || minute >= i.endMin) continue;
    if (!occupant || i.endMin > occupant.endMin) occupant = i;
  }
  return occupant;
}

/**
 * Rooms with no class covering `minute` on `day`, sorted alphabetically. The
 * room universe is every room that appears anywhere in the feed, so a room with
 * no class that day counts as free all day. A class is treated as
 * half-open [startMin, endMin): a room frees up exactly at endMin.
 */
export function freeRoomsAt(
  index: Map<string, BusyInterval[]>,
  day: WeekdayName,
  minute: number,
): string[] {
  const free: string[] = [];
  for (const [room, intervals] of index) {
    const occupied = intervals.some(
      (i) => i.day === day && minute >= i.startMin && minute < i.endMin,
    );
    if (!occupied) free.push(room);
  }
  return free.sort((a, b) => a.localeCompare(b));
}

/** Room type from the code's trailing letter: C=Classroom, L=Lab, T=Theater. */
export type RoomTypeKey = 'C' | 'L' | 'T';

export const ROOM_TYPE_LABELS: Record<RoomTypeKey, string> = {
  C: 'Classroom',
  L: 'Lab',
  T: 'Theater',
};

/** Trailing-letter room type; unknown suffixes read as classrooms. */
export function roomTypeKey(room: string): RoomTypeKey {
  const last = room.trim().slice(-1).toUpperCase();
  return last === 'L' || last === 'T' ? last : 'C';
}

/**
 * A slot reads as a lab session if the feed tagged it 'lab', OR it's held in a
 * lab room. Some lab-only courses (studios, MIC/ARC labs) stuff their whole
 * session into classSchedules with a lab roomName and no labSchedules array, so
 * it arrives tagged 'theory'; the room type is the reliable signal there.
 */
export function isLabOccupant(room: string, kind: SlotKind): boolean {
  return kind === 'lab' || roomTypeKey(room) === 'L';
}

/** One free or busy stretch in a room's single-day timeline. */
export interface TimelineSegment {
  startMin: number;
  endMin: number;
  busy: boolean;
  /** Busy segments only: true when the occupant is a lab session. */
  lab?: boolean;
  /** Busy segments only: occupying course code. */
  courseCode?: string;
  /** Busy segments only: occupying section name ('' when unknown). */
  sectionName?: string;
}

/**
 * Chronological free + busy segments for one room-day, clamped to campus hours
 * and sorted by start (free before busy when they touch at a boundary). Free
 * windows are the merged complement; busy segments carry the occupying
 * course/section so the UI can label them.
 */
export function dayTimeline(
  index: Map<string, BusyInterval[]>,
  room: string,
  day: WeekdayName,
  dayStart: number = CAMPUS_START_MIN,
  dayEnd: number = CAMPUS_END_MIN,
): TimelineSegment[] {
  const free: TimelineSegment[] = freeWindowsForRoom(index, room, day, dayStart, dayEnd).map(
    (w) => ({ startMin: w.startMin, endMin: w.endMin, busy: false }),
  );
  const busy: TimelineSegment[] = busyOnDay(index, room, day)
    .map((i) => ({
      startMin: Math.max(i.startMin, dayStart),
      endMin: Math.min(i.endMin, dayEnd),
      busy: true,
      lab: isLabOccupant(room, i.kind),
      courseCode: i.courseCode,
      sectionName: i.sectionName,
    }))
    .filter((s) => s.endMin > s.startMin);
  return [...free, ...busy].sort((a, b) => a.startMin - b.startMin || (a.busy ? 1 : -1));
}

/**
 * Free time windows for one room on a given day, as the complement of its busy
 * intervals within [dayStart, dayEnd). Overlapping/adjacent busy intervals are
 * merged first. Returns [] when the room is busy for the whole window.
 */
export function freeWindowsForRoom(
  index: Map<string, BusyInterval[]>,
  room: string,
  day: WeekdayName,
  dayStart: number = CAMPUS_START_MIN,
  dayEnd: number = CAMPUS_END_MIN,
): FreeWindow[] {
  if (dayEnd <= dayStart) return [];
  const busy = busyOnDay(index, room, day)
    .map((i) => ({ startMin: Math.max(i.startMin, dayStart), endMin: Math.min(i.endMin, dayEnd) }))
    .filter((i) => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const windows: FreeWindow[] = [];
  let cursor = dayStart;
  for (const b of busy) {
    if (b.startMin > cursor) windows.push({ startMin: cursor, endMin: b.startMin });
    if (b.endMin > cursor) cursor = b.endMin;
  }
  if (cursor < dayEnd) windows.push({ startMin: cursor, endMin: dayEnd });
  return windows;
}
