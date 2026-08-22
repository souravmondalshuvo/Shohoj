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
export const DEFAULT_MIN_HOUR = 8; // 8:00 AM
export const DEFAULT_MAX_HOUR = 19; // 7:00 PM

export interface GridBlock {
  sectionId: number;
  courseCode: string;
  sectionName: string;
  facultyInitials: string;
  /**
   * Room for *this meeting* — the slot's own room (labs meet elsewhere than
   * their theory class), falling back to the section room when the feed leaves
   * the slot's room blank.
   */
  roomName: string;
  day: WeekdayName;
  /** Column index (0-based) into `days[]`. */
  dayCol: number;
  /** Inclusive grid row (1-based to match CSS `grid-row`). */
  gridRowStart: number;
  /** Span in grid rows (`gridRowEnd = gridRowStart + gridRowSpan`). */
  gridRowSpan: number;
  /** Sub-column index (0-based) among blocks it overlaps in time on its day. */
  subCol: number;
  /** Number of side-by-side sub-columns in this block's overlap cluster (1 = no overlap). */
  subCols: number;
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

  const lowerBoundMin =
    options.minHour !== undefined ? options.minHour * 60 : snapDown(earliest, rowMinutes);
  const upperBoundMin =
    options.maxHour !== undefined ? options.maxHour * 60 : snapUp(latest, rowMinutes);

  const startMin = clamp(lowerBoundMin, 0, 24 * 60 - rowMinutes);
  const endMin = clamp(upperBoundMin, startMin + rowMinutes, 24 * 60);

  const days = pruneEmptyDays ? WEEK_ORDER.filter((d) => daysWithClasses.has(d)) : [...WEEK_ORDER];

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
        roomName: slot.room || s.roomName,
        day: slot.day,
        dayCol,
        // CSS grid is 1-based.
        gridRowStart: rowStart + 1,
        gridRowSpan: Math.max(1, rowEnd - rowStart),
        subCol: 0,
        subCols: 1,
        startMin: slot.startMin,
        endMin: slot.endMin,
      });
    }
  }

  assignSubColumns(blocks);

  return { days, startMin, endMin, rowMinutes, totalRows, rowLabels, blocks };
}

/**
 * Lay overlapping blocks side-by-side instead of stacking them. For each day,
 * group blocks into clusters of transitively-overlapping time ranges, then
 * partition each cluster greedily into the fewest columns (classic interval
 * partitioning). Mutates each block's `subCol` (its column) and `subCols`
 * (columns in its cluster) in place. Non-overlapping blocks stay at 0 / 1.
 */
function assignSubColumns(blocks: GridBlock[]): void {
  const byDay = new Map<number, GridBlock[]>();
  for (const b of blocks) {
    const list = byDay.get(b.dayCol);
    if (list) list.push(b);
    else byDay.set(b.dayCol, [b]);
  }

  for (const dayBlocks of byDay.values()) {
    dayBlocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    let cluster: GridBlock[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
      if (cluster.length === 0) return;
      const colEnds: number[] = []; // last endMin placed in each column
      for (const b of cluster) {
        let placed = -1;
        for (let c = 0; c < colEnds.length; c++) {
          if (colEnds[c] <= b.startMin) {
            placed = c;
            break;
          }
        }
        if (placed === -1) {
          placed = colEnds.length;
          colEnds.push(b.endMin);
        } else colEnds[placed] = b.endMin;
        b.subCol = placed;
      }
      const width = colEnds.length;
      for (const b of cluster) b.subCols = width;
      cluster = [];
    };

    for (const b of dayBlocks) {
      if (cluster.length > 0 && b.startMin >= clusterEnd) flush();
      cluster.push(b);
      clusterEnd = Math.max(clusterEnd, b.endMin);
    }
    flush();
  }
}
