/**
 * tests/campusSceneMood.test.js
 * Pure tests for the campus scene's time-of-day palette (#385). The WebGL
 * parts of campusScene.ts can't run under node; skyMoodForHour is exported
 * pure precisely so the mood boundaries stay pinned here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { skyMoodForHour } from '../src/features/campus/campusScene.ts';

const moodAt = (hour) => skyMoodForHour(hour);

test('daytime hours get the bright sky and the strongest sun', () => {
    for (const hour of [8, 12, 16]) {
        const mood = moodAt(hour);
        assert.equal(mood.sky, '#cfe8ff', `hour ${hour}`);
        assert.equal(mood.sunIntensity, 1.3, `hour ${hour}`);
    }
});

test('golden hours (early morning, evening) get the warm palette', () => {
    for (const hour of [5, 7, 17, 19]) {
        const mood = moodAt(hour);
        assert.equal(mood.sky, '#ffd9a0', `hour ${hour}`);
        assert.ok(mood.sunIntensity < 1.3, `hour ${hour} dimmer than day`);
    }
});

test('night hours get the dark palette and the dimmest sun', () => {
    for (const hour of [20, 23, 0, 4]) {
        const mood = moodAt(hour);
        assert.equal(mood.sky, '#42507a', `hour ${hour}`);
        assert.ok(mood.sunIntensity < 1, `hour ${hour} dimmest`);
    }
});

test('every hour of the day maps to a complete mood', () => {
    for (let hour = 0; hour < 24; hour++) {
        const mood = moodAt(hour);
        for (const key of ['sky', 'horizon', 'sunColor']) {
            assert.match(mood[key], /^#[0-9a-f]{6}$/i, `hour ${hour} ${key}`);
        }
        assert.ok(mood.sunIntensity > 0, `hour ${hour} sun on`);
    }
});
