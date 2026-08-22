/**
 * Routine grid → PNG export plan.
 *
 * Turns a GridLayout (from routineGrid) into a flat list of canvas draw
 * operations plus the canvas dimensions. Pure and renderer-agnostic: the
 * browser side (routineTab.js) just walks the ops against a 2D context and
 * calls toDataURL. Keeping the geometry here makes it unit-testable without
 * a DOM.
 */

import type { GridLayout } from './routineGrid';

export interface ExportTheme {
  bg: string;
  headerText: string;
  timeText: string;
  gridLine: string;
  hourLine: string;
  blockText: string;
  titleText: string;
}

export interface ExportOptions {
  timeColWidth?: number;
  dayColWidth?: number;
  rowHeight?: number;
  headerHeight?: number;
  titleHeight?: number;
  padding?: number;
  title?: string;
  theme?: Partial<ExportTheme>;
  /** Optional per-section hue override; defaults to the same formula as the UI. */
  hueForSection?: (sectionId: number) => number;
}

export type DrawOp =
  | {
      type: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      radius?: number;
    }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | {
      type: 'text';
      x: number;
      y: number;
      text: string;
      font: string;
      fill: string;
      align: 'left' | 'center' | 'right';
      /** Condense the text to this width when painting (canvas `fillText` maxWidth). */
      maxWidth?: number;
    };

export interface ExportPlan {
  width: number;
  height: number;
  ops: DrawOp[];
}

const DEFAULT_THEME: ExportTheme = {
  bg: '#0b0f0d',
  headerText: '#cfd8d3',
  timeText: '#8a948f',
  gridLine: 'rgba(255,255,255,0.06)',
  hourLine: 'rgba(255,255,255,0.12)',
  blockText: '#ffffff',
  titleText: '#2ecc71',
};

export function defaultHueForSection(sectionId: number): number {
  const raw = (sectionId * 47) % 360;
  return Math.round((raw + 30) % 360);
}

function dayLabel(day: string): string {
  return (
    (
      {
        SATURDAY: 'Sat',
        SUNDAY: 'Sun',
        MONDAY: 'Mon',
        TUESDAY: 'Tue',
        WEDNESDAY: 'Wed',
        THURSDAY: 'Thu',
        FRIDAY: 'Fri',
      } as Record<string, string>
    )[day] ?? day.slice(0, 3)
  );
}

function hhmm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function buildExportPlan(layout: GridLayout, options: ExportOptions = {}): ExportPlan {
  const timeColWidth = options.timeColWidth ?? 64;
  const dayColWidth = options.dayColWidth ?? 150;
  const rowHeight = options.rowHeight ?? 22;
  const headerHeight = options.headerHeight ?? 34;
  const titleHeight = options.title ? (options.titleHeight ?? 36) : 0;
  const padding = options.padding ?? 16;
  const theme: ExportTheme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
  const hueFor = options.hueForSection ?? defaultHueForSection;

  const cols = layout.days.length;
  const gridWidth = timeColWidth + cols * dayColWidth;
  const gridHeight = headerHeight + layout.totalRows * rowHeight;

  const width = padding * 2 + gridWidth;
  const height = padding * 2 + titleHeight + gridHeight;

  const ops: DrawOp[] = [];
  const originX = padding;
  const originY = padding + titleHeight;

  // Background
  ops.push({ type: 'rect', x: 0, y: 0, w: width, h: height, fill: theme.bg });

  // Title
  if (options.title) {
    ops.push({
      type: 'text',
      x: padding,
      y: padding + 22,
      text: options.title,
      font: '700 18px sans-serif',
      fill: theme.titleText,
      align: 'left',
    });
  }

  // Day headers
  layout.days.forEach((day, i) => {
    const x = originX + timeColWidth + i * dayColWidth + dayColWidth / 2;
    ops.push({
      type: 'text',
      x,
      y: originY + headerHeight - 12,
      text: dayLabel(day),
      font: '700 13px sans-serif',
      fill: theme.headerText,
      align: 'center',
    });
  });

  // Row lines + hour time labels
  for (let r = 0; r <= layout.totalRows; r++) {
    const y = originY + headerHeight + r * rowHeight;
    const min = layout.startMin + r * layout.rowMinutes;
    const isHour = min % 60 === 0;
    ops.push({
      type: 'line',
      x1: originX,
      y1: y,
      x2: originX + gridWidth,
      y2: y,
      stroke: isHour ? theme.hourLine : theme.gridLine,
    });
    if (isHour && r < layout.totalRows) {
      ops.push({
        type: 'text',
        x: originX + timeColWidth - 8,
        y: y + 14,
        text: hhmm(min),
        font: '500 10px sans-serif',
        fill: theme.timeText,
        align: 'right',
      });
    }
  }

  // Column separators
  for (let c = 0; c <= cols; c++) {
    const x = originX + timeColWidth + c * dayColWidth;
    ops.push({
      type: 'line',
      x1: x,
      y1: originY + headerHeight,
      x2: x,
      y2: originY + gridHeight,
      stroke: theme.gridLine,
    });
  }

  // Blocks
  for (const block of layout.blocks) {
    const x = originX + timeColWidth + block.dayCol * dayColWidth + 2;
    const y = originY + headerHeight + (block.gridRowStart - 1) * rowHeight + 1;
    const w = dayColWidth - 4;
    const h = block.gridRowSpan * rowHeight - 2;
    const hue = hueFor(block.sectionId);
    ops.push({
      type: 'rect',
      x,
      y,
      w,
      h,
      radius: 5,
      fill: `hsl(${hue}, 60%, 24%)`,
      stroke: `hsl(${hue}, 70%, 50%)`,
    });
    // Text starts 7px in and must not run past the block's right edge — a long
    // room name would otherwise spill over the next day's column.
    const textMaxWidth = Math.max(1, w - 14);
    ops.push({
      type: 'text',
      x: x + 7,
      y: y + 15,
      text: block.courseCode,
      font: '700 12px sans-serif',
      fill: theme.blockText,
      align: 'left',
      maxWidth: textMaxWidth,
    });
    if (h >= 32) {
      const fac = block.facultyInitials || 'TBA';
      ops.push({
        type: 'text',
        x: x + 7,
        y: y + 29,
        text: `${fac} · Section ${block.sectionName}`,
        font: '400 10px sans-serif',
        fill: theme.blockText,
        align: 'left',
        maxWidth: textMaxWidth,
      });
    }
    if (h >= 46) {
      ops.push({
        type: 'text',
        x: x + 7,
        y: y + 42,
        // Room first, matching the on-screen block: it is the line's point.
        text: `${block.roomName ? `${block.roomName} · ` : ''}${hhmm(block.startMin)}–${hhmm(block.endMin)}`,
        font: '400 9px sans-serif',
        fill: theme.blockText,
        align: 'left',
        maxWidth: textMaxWidth,
      });
    }
  }

  return { width, height, ops };
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `shohoj-routine-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.png`;
}
