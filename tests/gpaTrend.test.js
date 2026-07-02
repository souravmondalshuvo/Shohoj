// tests/gpaTrend.test.js — unit tests for the pure GPA-trend model + chart
// geometry (#315). Parity targets: the trend block in recalc() (js/main.js)
// and drawTrendChart (js/ui/charts.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeGpaTrend, trendChartGeometry } from '../src/features/calculator/gpaTrend.ts';

let nextId = 0;

function semester(name, grades, { running = false, summary = false } = {}) {
  return {
    id: nextId++,
    name,
    running,
    summary,
    courses: grades.map((grade, i) => ({ name: `C${i}`, grade, credits: 3 })),
  };
}

// ── Series / visibility / direction ──────────────────────────────────────────

test('fewer than two plottable semesters → not visible', () => {
  assert.equal(computeGpaTrend([]).visible, false);
  const one = computeGpaTrend([semester('Fall 2024', ['A'])]);
  assert.equal(one.visible, false);
  assert.equal(one.direction, null);
});

test('running, summary and ungraded semesters are excluded from the series', () => {
  const trend = computeGpaTrend([
    semester('Fall 2024', ['A']),
    semester('Spring 2025 (Running)', ['A'], { running: true }),
    semester('Summary', [], { summary: true }),
    semester('Summer 2025', ['']), // no grades → no GPA → excluded
    semester('Fall 2025', ['B']),
  ]);
  assert.equal(trend.points.length, 2);
  assert.deepEqual(trend.points.map(p => p.label), ["Fall '24", "Fall '25"]);
});

test("labels shorten like recalc: ordinal suffix dropped, year → 'YY", () => {
  const trend = computeGpaTrend([
    semester('Fall 2024 (1st Semester)', ['A']),
    semester('Spring 2025 (2nd Semester)', ['B']),
  ]);
  assert.deepEqual(trend.points.map(p => p.label), ["Fall '24", "Spring '25"]);
});

test('unnamed semesters label as S<id+1>', () => {
  nextId = 4;
  const trend = computeGpaTrend([semester(undefined, ['A']), semester(undefined, ['B'])]);
  assert.deepEqual(trend.points.map(p => p.label), ['S5', 'S6']);
});

test('direction thresholds mirror recalc (±0.1 stability band)', () => {
  const by = (a, b) => computeGpaTrend([semester('Fall 2024', [a]), semester('Spring 2025', [b])]).direction;
  assert.equal(by('B', 'A'), 'improving'); // 3.0 → 4.0
  assert.equal(by('A', 'B'), 'declining'); // 4.0 → 3.0
  assert.equal(by('A', 'A'), 'stable'); // diff 0
  // A (4.0) vs A- (3.7): |−0.3| ≥ 0.1 → declining, not stable.
  assert.equal(by('A', 'A-'), 'declining');
});

// ── Geometry ─────────────────────────────────────────────────────────────────

const POINTS = [
  { label: "Fall '24", gpa: 3.0 },
  { label: "Spring '25", gpa: 3.5 },
  { label: "Summer '25", gpa: 4.0 },
];

test('geometry needs two points', () => {
  assert.equal(trendChartGeometry([POINTS[0]], 660, 200), null);
});

test('range clamps to [0,4] with the 0.3 margins; gridlines stay inside', () => {
  const g = trendChartGeometry(POINTS, 660, 200);
  // min 3.0−0.3=2.7, max 4.0+0.3→clamped 4.0 → gridlines at 3 and 4 only.
  assert.deepEqual(g.gridlines.map(l => l.label), ['3.0', '4.0']);
  // Highest GPA (4.0 = maxG) sits at the top pad; lowest above the baseline.
  assert.equal(g.dots[2].y, 12);
  assert.ok(g.dots[0].y < g.baselineY && g.dots[0].y > g.dots[2].y);
});

test('dots and polyline span the padded plot area in order', () => {
  const g = trendChartGeometry(POINTS, 660, 200);
  assert.equal(g.dots.length, 3);
  assert.equal(g.dots[0].x, 36); // PAD.left
  assert.equal(g.dots[2].x, 660 - 16); // width − PAD.right
  assert.equal(g.dots[1].gpaText, '3.50');
  assert.equal(g.linePoints.split(' ').length, 3);
  assert.ok(g.areaPath.startsWith('M ') && g.areaPath.endsWith(' Z'));
  assert.equal(g.rotateLabels, false);
});

test('x labels rotate with more than five points', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ label: `S${i}`, gpa: 3 }));
  assert.equal(trendChartGeometry(many, 660, 200).rotateLabels, true);
});
