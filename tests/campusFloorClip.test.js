/**
 * tests/campusFloorClip.test.js
 * Where BRACU's model is cut away to open a level: just under the slab of the
 * level above, so the open level's own floor and walls stay and nothing of
 * the floors above it does.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { floorClipHeight } from '../src/features/campus/campusScene.ts';
import { BASEMENT_LEVEL, GROUND_LEVEL, UPPER_ROOF_LEVEL } from '../src/core/campusPlaces.ts';
import { MODEL_GROUND_Y } from '../src/features/campus/campusModel.ts';

const FLOOR_GAP = 3.1; // the scene's storey height

test('a floor is cut just under the next floor up', () => {
    for (let floor = 1; floor <= 13; floor += 1) {
        const cut = floorClipHeight(floor);
        const ownSlab = (floor - 1) * FLOOR_GAP;
        const nextSlab = floor * FLOOR_GAP;
        assert.ok(cut > ownSlab + 2, `floor ${floor} keeps its walls`);
        assert.ok(cut < nextSlab, `floor ${floor} loses the slab above it`);
    }
});

test('the levels below floor 1 are cut under their own ceilings', () => {
    // The ground floor's ceiling is floor 1's slab, at y = 0.
    assert.ok(floorClipHeight(GROUND_LEVEL) < 0);
    assert.ok(floorClipHeight(GROUND_LEVEL) > MODEL_GROUND_Y);
    // The basements' ceiling is the ground.
    assert.ok(floorClipHeight(BASEMENT_LEVEL) < MODEL_GROUND_Y);
});

test('the cuts rise with the levels, and the upper roof is not cut', () => {
    const levels = [BASEMENT_LEVEL, GROUND_LEVEL, ...Array.from({ length: 13 }, (_, i) => i + 1)];
    const cuts = levels.map(floorClipHeight);
    for (let i = 1; i < cuts.length; i += 1) assert.ok(cuts[i] > cuts[i - 1]);
    assert.equal(floorClipHeight(UPPER_ROOF_LEVEL), null);
});
