/**
 * tests/routineExportPainter.test.js
 *
 * The PNG painter exists twice on purpose: core keeps only the pure plan
 * builder (`paintExportPlan` is a declared `jsOnly` asymmetry in the twin
 * contract), so the legacy tab paints from js/core and the shell paints from
 * src/features/routine. Two copies of pixel logic is exactly the shape of
 * #479, so rather than trusting them to stay in step, this drives both against
 * a recording context and requires identical call sequences.
 *
 * A failure here means one painter was changed and the other was not.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExportPlan, paintExportPlan as paintVanilla } from '../js/core/routineExport.js';
import { computeGridLayout } from '../js/core/routineGrid.js';
import { paintExportPlan as paintTyped } from '../src/features/routine/paintExportPlan.ts';

/**
 * A canvas stand-in that writes down what it was told to do.
 *
 * Property assignments are recorded too: a painter that sets fillStyle in a
 * different order paints different pixels, so ordering is part of the contract.
 * measureText is deterministic (6px per char) so the run-layout branch — the
 * only place the painter does arithmetic of its own — is exercised identically.
 */
function recorder({ roundRect = true } = {}) {
  const calls = [];
  const target = {
    beginPath: (...a) => calls.push(['beginPath', ...a]),
    moveTo: (...a) => calls.push(['moveTo', ...a]),
    lineTo: (...a) => calls.push(['lineTo', ...a]),
    stroke: (...a) => calls.push(['stroke', ...a]),
    fill: (...a) => calls.push(['fill', ...a]),
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    strokeRect: (...a) => calls.push(['strokeRect', ...a]),
    fillText: (...a) => calls.push(['fillText', ...a]),
    measureText: (text) => ({ width: String(text).length * 6 }),
  };
  if (roundRect) target.roundRect = (...a) => calls.push(['roundRect', ...a]);
  const ctx = new Proxy(target, {
    set(obj, prop, value) {
      calls.push(['set', prop, value]);
      obj[prop] = value;
      return true;
    },
  });
  return { ctx, calls };
}

const section = (sectionId, courseCode, sectionName, day, startMin, endMin, room) => ({
  sectionId,
  courseCode,
  courseName: courseCode,
  sectionName,
  facultyInitials: 'ABC',
  roomName: room,
  capacity: 40,
  consumedSeat: 10,
  credits: 3,
  classSlots: [{ day, startMin, endMin, kind: 'theory', room }],
  labSlots: [],
  exams: {},
});

// Two courses, one of them twice in a week, plus a deliberately long room name
// to reach the run-measuring branch, and an overlap to reach split columns.
const SECTIONS = [
  section(1, 'CSE220', '01', 'SUNDAY', 8 * 60, 9 * 60 + 20, '07A-01C'),
  section(2, 'MAT215', '02', 'SUNDAY', 8 * 60 + 30, 9 * 60 + 50, 'UB-40301-ANNEX-LONG'),
  section(3, 'PHY111', '03', 'TUESDAY', 14 * 60, 15 * 60 + 20, '09G-31T'),
];

function plan() {
  const layout = computeGridLayout(SECTIONS);
  assert.ok(layout, 'fixture must produce a layout');
  const hues = new Map([
    [1, 210],
    [2, 160],
    [3, 275],
  ]);
  return buildExportPlan(layout, {
    title: 'Shohoj — Weekly Routine',
    hueForSection: (sid) => hues.get(sid) ?? 210,
  });
}

test('both painters emit the same calls for the same plan', () => {
  const p = plan();
  const a = recorder();
  const b = recorder();
  paintVanilla(a.ctx, p);
  paintTyped(b.ctx, p);

  assert.ok(a.calls.length > 0, 'the fixture must actually paint something');
  assert.deepEqual(b.calls, a.calls);
});

test('both painters agree on a context without roundRect', () => {
  // Older canvas implementations lack roundRect, and the painters fall back to
  // square fillRect/strokeRect. The fallback is a second code path, so it gets
  // the same treatment.
  const p = plan();
  const a = recorder({ roundRect: false });
  const b = recorder({ roundRect: false });
  paintVanilla(a.ctx, p);
  paintTyped(b.ctx, p);

  assert.ok(
    a.calls.some(([name]) => name === 'fillRect'),
    'the no-roundRect path must be the one exercised',
  );
  assert.deepEqual(b.calls, a.calls);
});

test('both painters agree on an empty plan', () => {
  const empty = { width: 100, height: 100, ops: [] };
  const a = recorder();
  const b = recorder();
  paintVanilla(a.ctx, empty);
  paintTyped(b.ctx, empty);
  assert.deepEqual(b.calls, a.calls);
  assert.deepEqual(a.calls, []);
});

test('a text run wider than its cap is condensed, identically on both sides', () => {
  // The run branch is where the painter does its own arithmetic: it measures,
  // tracks a cursor and caps only the last run. A tight maxWidth forces it.
  const runs = {
    width: 200,
    height: 50,
    ops: [
      {
        type: 'text',
        x: 10,
        y: 20,
        text: 'CSE220 UB-40301-ANNEX-LONG',
        font: '12px sans-serif',
        fill: '#fff',
        align: 'left',
        maxWidth: 60,
        runs: [{ text: 'CSE220 ', font: 'bold 12px sans-serif' }, { text: 'UB-40301-ANNEX-LONG' }],
      },
    ],
  };
  const a = recorder();
  const b = recorder();
  paintVanilla(a.ctx, runs);
  paintTyped(b.ctx, runs);

  const capped = a.calls.filter(
    ([name, , , , maxWidth]) => name === 'fillText' && maxWidth !== undefined,
  );
  assert.equal(capped.length, 1, 'only the last run is capped');
  assert.deepEqual(b.calls, a.calls);
});
