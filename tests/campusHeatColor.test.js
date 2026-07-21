/**
 * tests/campusHeatColor.test.js
 * Pure tests for the campus scene's per-floor occupancy heat tint (#385). The
 * WebGL parts of campusScene.ts can't run under node; floorHeatColor is
 * exported pure precisely so the ramp's endpoints and clamping stay pinned.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { floorHeatColor } from '../src/features/campus/campusScene.ts';

const BASE = '#a9cdb8'; // slab green
const HOT = '#e74c3c';  // busy red

test('an empty floor stays exactly its base slab color', () => {
    assert.equal(floorHeatColor(BASE, HOT, 0), BASE);
});

test('fractions clamp: negatives read as empty, >1 reads as full', () => {
    assert.equal(floorHeatColor(BASE, HOT, -0.5), floorHeatColor(BASE, HOT, 0));
    assert.equal(floorHeatColor(BASE, HOT, 5), floorHeatColor(BASE, HOT, 1));
});

test('a fully-busy floor tints toward hot but never all the way (stays legible)', () => {
    const full = floorHeatColor(BASE, HOT, 1);
    assert.match(full, /^#[0-9a-f]{6}$/i);
    assert.notEqual(full, BASE, 'a packed floor must visibly shift');
    assert.notEqual(full, HOT, 'the tint caps below the pure hot color');
});

test('the ramp is monotonic — a busier floor tints at least as red', () => {
    const redness = (hex) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(3, 5), 16);
    let prev = -Infinity;
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        const r = redness(floorHeatColor(BASE, HOT, frac));
        assert.ok(r >= prev, `fraction ${frac} should not be less red than the last step`);
        prev = r;
    }
});
