// src/features/calculator/gpaTrend.ts
//
// Pure GPA-trend model + chart geometry for the shell dashboard (#315).
// The series/direction logic mirrors the trend block in recalc() (js/main.js):
// completed, non-summary semesters with a computable GPA; labels shortened the
// same way ("Fall 2024 (1st Semester)" → "Fall '24"); visible from 2 points;
// direction by the first→last diff with the 0.1 stability threshold. The
// geometry mirrors drawTrendChart (js/ui/charts.js): same padding, the
// min−0.3/max+0.3 range clamped to [0,4], gridlines at whole GPAs inside the
// range — as data for an SVG rendering (typed, testable, accessible; the
// legacy page keeps its canvas until cutover).

import { calcSemesterGpa } from '../../core/gpa.ts';
import type { GradeScale } from '../../core/university.ts';
import { stripTags } from '../../core/helpers.ts';
import type { SemesterEntry } from '../../core/types.ts';

export interface TrendPoint {
  readonly label: string;
  readonly gpa: number;
}

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface GpaTrend {
  readonly points: readonly TrendPoint[];
  /** Direction across the series; null when the trend is not visible. */
  readonly direction: TrendDirection | null;
  /** Legacy rule: the trend box shows only with 2+ plottable semesters. */
  readonly visible: boolean;
}

function trendLabel(semester: SemesterEntry): string {
  if (!semester.name) return `S${semester.id + 1}`;
  return stripTags(semester.name)
    .replace(/\s*\(.*\)$/, '')
    .replace(/(\d{4})/, (year) => `'${year.slice(2)}`);
}

export function computeGpaTrend(semesters: readonly SemesterEntry[], scale: GradeScale): GpaTrend {
  const points: TrendPoint[] = [];
  for (const semester of semesters) {
    if (semester.running || semester.summary) continue;
    const gpa = calcSemesterGpa(semester, scale);
    if (gpa === null) continue;
    points.push({ label: trendLabel(semester), gpa });
  }

  if (points.length < 2) return { points, direction: null, visible: false };

  const diff = points[points.length - 1].gpa - points[0].gpa;
  const direction: TrendDirection =
    Math.abs(diff) < 0.1 ? 'stable' : diff > 0 ? 'improving' : 'declining';
  return { points, direction, visible: true };
}

// ── Chart geometry (drawTrendChart parity) ───────────────────────────────────

const PAD = { top: 12, right: 16, bottom: 48, left: 36 } as const;

export interface TrendDot {
  readonly x: number;
  readonly y: number;
  readonly gpaText: string;
  readonly label: string;
}

export interface TrendGridline {
  readonly y: number;
  readonly label: string;
}

export interface TrendChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly gridlines: readonly TrendGridline[];
  /** SVG points attribute for the GPA polyline. */
  readonly linePoints: string;
  /** Closed SVG path for the gradient area under the line. */
  readonly areaPath: string;
  readonly dots: readonly TrendDot[];
  /** Legacy rule: x labels rotate when there are more than 5 points. */
  readonly rotateLabels: boolean;
  /** Baseline y of the plot area (where x labels anchor). */
  readonly baselineY: number;
}

export function trendChartGeometry(
  points: readonly TrendPoint[],
  width: number,
  height: number,
): TrendChartGeometry | null {
  if (points.length < 2) return null;

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;
  const gpas = points.map((p) => p.gpa);
  const minG = Math.max(0, Math.min(...gpas) - 0.3);
  const maxG = Math.min(4, Math.max(...gpas) + 0.3);
  const range = maxG - minG || 1;

  const xOf = (i: number) => PAD.left + (i / (points.length - 1)) * chartW;
  const yOf = (g: number) => PAD.top + chartH - ((g - minG) / range) * chartH;

  const gridlines: TrendGridline[] = [];
  for (const g of [1, 2, 3, 4]) {
    if (g < minG - 0.1 || g > maxG + 0.1) continue;
    gridlines.push({ y: yOf(g), label: g.toFixed(1) });
  }

  const coords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.gpa) }));
  const linePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const baselineY = height - PAD.bottom;
  const areaPath =
    `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} ` +
    coords
      .slice(1)
      .map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ') +
    ` L ${coords[coords.length - 1].x.toFixed(1)} ${baselineY} L ${coords[0].x.toFixed(1)} ${baselineY} Z`;

  return {
    width,
    height,
    gridlines,
    linePoints,
    areaPath,
    dots: coords.map((c, i) => ({
      x: c.x,
      y: c.y,
      gpaText: points[i].gpa.toFixed(2),
      label: points[i].label,
    })),
    rotateLabels: points.length > 5,
    baselineY,
  };
}
