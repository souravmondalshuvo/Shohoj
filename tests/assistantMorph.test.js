// tests/assistantMorph.test.js
//
// Covers the geometry behind the Assistant's pill→panel morph
// (js/core/assistantMorph.js). The clip values are what make the panel look
// exactly like the launcher at frame one; if the insets are wrong the move
// starts from the wrong shape, and that is not something a screenshot test
// would obviously catch.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSISTANT_MORPH_CLOSE_MS,
  ASSISTANT_MORPH_OPEN_MS,
  canMorphPanel,
  panelClipPath,
  pillClipPath,
} from '../js/core/assistantMorph.js';

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test('the pill clip is measured inward from the panel edges', () => {
  // A 380×560 panel anchored bottom-right, with the 150×44 pill inside it.
  const panel = rect(500, 100, 380, 560);
  const pill = rect(726, 592, 150, 44);
  assert.equal(pillClipPath(panel, pill), 'inset(492px 4px 24px 226px round 22px)');
});

test('the pill clip rounds to half the short side, so it is a pill', () => {
  const panel = rect(0, 0, 400, 600);
  const tall = rect(0, 0, 40, 400);
  assert.match(pillClipPath(panel, tall), /round 20px\)$/);
});

test('a pill outside the panel box clamps to zero rather than going negative', () => {
  // A negative inset clips nothing, which would show the panel fully formed on
  // the first frame — the one failure that makes the whole move pointless.
  const panel = rect(100, 100, 200, 200);
  const pill = rect(40, 40, 400, 400);
  assert.equal(pillClipPath(panel, pill), 'inset(0px 0px 0px 0px round 200px)');
});

test('the open panel clip keeps the panel corner radius', () => {
  assert.equal(panelClipPath('16px'), 'inset(0px 0px 0px 0px round 16px)');
  assert.equal(panelClipPath(''), 'inset(0px 0px 0px 0px round 0px)');
  assert.equal(panelClipPath(undefined), 'inset(0px 0px 0px 0px round 0px)');
});

test('sub-pixel rects do not produce runaway precision', () => {
  const panel = rect(0, 0, 100.123456, 100.987654);
  const pill = rect(10.5551, 20.4449, 30.3333, 10.1111);
  const value = pillClipPath(panel, pill);
  assert.equal(/\.\d{3,}/.test(value), false, value);
});

test('the morph is refused without the Web Animations API', () => {
  assert.equal(canMorphPanel(null, {}), false);
  assert.equal(canMorphPanel({}, {}), false);
});

test('the morph is refused when the student asked for reduced motion', () => {
  const panel = { animate() {} };
  const reduced = { matchMedia: (q) => ({ matches: q.includes('reduce') }) };
  const normal = { matchMedia: () => ({ matches: false }) };
  assert.equal(canMorphPanel(panel, reduced), false);
  assert.equal(canMorphPanel(panel, normal), true);
  // No matchMedia at all (old browsers, some test environments): the morph is
  // allowed rather than silently dropped.
  assert.equal(canMorphPanel(panel, {}), true);
});

test('the two front-ends share one set of durations', () => {
  assert.equal(typeof ASSISTANT_MORPH_OPEN_MS, 'number');
  assert.equal(typeof ASSISTANT_MORPH_CLOSE_MS, 'number');
  // Leaving should never take longer than arriving.
  assert.ok(ASSISTANT_MORPH_CLOSE_MS < ASSISTANT_MORPH_OPEN_MS);
});
