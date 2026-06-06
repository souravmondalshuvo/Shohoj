/**
 * Routine grid layout — pure helpers that turn a selected routine into
 * positioning data for a weekly-calendar style grid.
 *
 * UI-agnostic on purpose. The output is plain numbers; the renderer maps
 * grid rows / columns to CSS grid-row / grid-column or to pixel offsets.
 */

import type { NormalizedSection, WeekdayName } from './connectFeed';

const WEEK_ORDER: readonly WeekdayName[] = [
    'SATURDAY',
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
];

export const DEFAULT_ROW_MINUTES = 30;
export const DEFAULT_MIN_HOUR = 8;   // 8:00 AM
export const DEFAULT_MAX_HOUR = 19;  // 7:00 PM

export interface GridBlock {
    sectionId: number;
    courseCode: string;
    sectionName: string;
    facultyInitials: string;
    roomName: string;
    day: WeekdayName;
    /** Column index (0-based) into `days[]`. */
    dayCol: number;
    /** Inclusive grid row (1-based to match CSS `grid-row`). */
    gridRowStart: number;
    /** Span in grid rows (`gridRowEnd = gridRowStart + gridRowSpan`). */
    gridRowSpan: number;
    startMin: number;
    endMin: number;
}

export interface GridLayout {
    /** Days that have at least one class slot, in canonical Sat→Fri order. */
    days: WeekdayName[];
    /** First displayed minute (rounded down to row granularity). */
    startMin: number;
    /** Last displayed minute (rounded up to row granularity). */
    endMin: number;
    /** Row granularity in minutes (default 30). */
    rowMinutes: number;
    /** Total number of rows in the grid. */
    totalRows: number;
    /** Labels for each row (e.g. "08:00", "08:30", ...) — caller may format differently. */
    rowLabels: string[];
    blocks: GridBlock[];
}

export interface ComputeGridOptions {
    rowMinutes?: number;
    /** When provided, forces the lower bound (in hours). Otherwise derived from the routine. */
    minHour?: number;
    /** When provided, forces the upper bound (in hours). */
    maxHour?: number;
    /** When true, days with zero classes are filtered out. Default: true. */
    pruneEmptyDays?: boolean;
}

function clamp(n: number, lo: number, hi: number) {
    return n < lo ? lo : n > hi ? hi : n;
}

function snapDown(min: number, granularity: number) {
    return Math.floor(min / granularity) * granularity;
}

function snapUp(min: number, granularity: number) {
    return Math.ceil(min / granularity) * granularity;
}

function formatRowLabel(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeGridLayout(
    routine: readonly NormalizedSection[],
    options: ComputeGridOptions = {},
): GridLayout | null {
    const rowMinutes = options.rowMinutes ?? DEFAULT_ROW_MINUTES;
    const pruneEmptyDays = options.pruneEmptyDays !== false;
    if (rowMinutes <= 0) throw new Error('rowMinutes must be positive');
    if (routine.length === 0) return null;

    let earliest = Infinity;
    let latest = -Infinity;
    const daysWithClasses = new Set<WeekdayName>();
    for (const s of routine) {
        for (const slot of s.classSlots) {
            if (slot.startMin < earliest) earliest = slot.startMin;
            if (slot.endMin > latest) latest = slot.endMin;
            daysWithClasses.add(slot.day);
        }
    }
    if (earliest === Infinity) return null;

    const lowerBoundMin = options.minHour !== undefined
        ? options.minHour * 60
        : snapDown(earliest, rowMinutes);
    const upperBoundMin = options.maxHour !== undefined
        ? options.maxHour * 60
        : snapUp(latest, rowMinutes);

    const startMin = clamp(lowerBoundMin, 0, 24 * 60 - rowMinutes);
    const endMin = clamp(upperBoundMin, startMin + rowMinutes, 24 * 60);

    const days = pruneEmptyDays
        ? WEEK_ORDER.filter(d => daysWithClasses.has(d))
        : [...WEEK_ORDER];

    const totalRows = (endMin - startMin) / rowMinutes;
    const rowLabels: string[] = [];
    for (let i = 0; i < totalRows; i++) {
        rowLabels.push(formatRowLabel(startMin + i * rowMinutes));
    }

    const blocks: GridBlock[] = [];
    for (const s of routine) {
        for (const slot of s.classSlots) {
            const dayCol = days.indexOf(slot.day);
            if (dayCol === -1) continue;
            const localStart = clamp(slot.startMin, startMin, endMin);
            const localEnd = clamp(slot.endMin, startMin, endMin);
            if (localEnd <= localStart) continue;
            const rowStart = Math.floor((localStart - startMin) / rowMinutes);
            const rowEnd = Math.ceil((localEnd - startMin) / rowMinutes);
            blocks.push({
                sectionId: s.sectionId,
                courseCode: s.courseCode,
                sectionName: s.sectionName,
                facultyInitials: s.facultyInitials,
                roomName: s.roomName,
                day: slot.day,
                dayCol,
                // CSS grid is 1-based.
                gridRowStart: rowStart + 1,
                gridRowSpan: Math.max(1, rowEnd - rowStart),
                startMin: slot.startMin,
                endMin: slot.endMin,
            });
        }
    }

    return { days, startMin, endMin, rowMinutes, totalRows, rowLabels, blocks };
}
