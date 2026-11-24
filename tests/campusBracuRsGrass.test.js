/**
 * tests/campusBracuRsGrass.test.js
 * Grass on the Residential Campus's lawns, and the country's tree crowns
 * (#999): seeded, kept off buildings, pitches, the court and the ponds, and
 * only where the painted ground is grass (or, sparsely, bare earth).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RS_BUILDINGS, RS_GROUNDS, RS_WATER, pointInPolygon } from '../src/core/campusBracuRs.ts';
import { grassScatter, isEarth, isGrass } from '../src/features/campus/rsGrass.ts';
import { crownGeometry } from '../src/features/campus/rsLandscape.ts';

const OLIVE = [120, 114, 70];
const EARTH = [144, 120, 84];
const PAVING = [186, 178, 162];

test('grass is told from earth and paving by its colour', () => {
    for (const c of [OLIVE, [77, 95, 45], [92, 128, 54], [129, 122, 76]]) assert.equal(isGrass(c), true, String(c));
    for (const c of [EARTH, PAVING, [100, 88, 61], [20, 26, 14]]) assert.equal(isGrass(c), false, String(c));
    assert.equal(isEarth(EARTH), true);
    assert.equal(isEarth(PAVING), false);
    assert.equal(isEarth(OLIVE), false);
});

test('grass is scattered the same on every load', () => {
    const sample = () => OLIVE;
    assert.deepEqual(grassScatter(sample), grassScatter(sample));
});

test('no clump stands in a building, on a pitch or the court, or in a pond', () => {
    const tufts = grassScatter(() => OLIVE);
    assert.ok(tufts.length > 20000, `tufts: ${tufts.length}`);
    const bare = RS_GROUNDS.filter((g) => g.kind !== 'garden');
    for (const t of tufts) {
        const p = [t.x, t.y];
        assert.ok(!RS_BUILDINGS.some((b) => pointInPolygon(p, b.footprint)), `in a building at ${p}`);
        assert.ok(!bare.some((g) => pointInPolygon(p, g.outline)), `on a pitch at ${p}`);
        assert.ok(!RS_WATER.some((w) => pointInPolygon(p, w.outline)), `in a pond at ${p}`);
    }
});

test('paving gets no grass, bare earth only a sprinkle of weeds', () => {
    assert.equal(grassScatter(() => PAVING).length, 0);
    assert.equal(grassScatter(() => null).length, 0);
    const grass = grassScatter(() => OLIVE).length;
    const weeds = grassScatter(() => EARTH).length;
    assert.ok(weeds > 0 && weeds < grass * 0.25, `${weeds} weeds against ${grass}`);
});

test('a light device gets about half the grass, and a bad density the full amount', () => {
    const sample = () => OLIVE;
    const full = grassScatter(sample, 1).length;
    const half = grassScatter(sample, 2).length;
    assert.ok(half > full * 0.4 && half < full * 0.6, `${half} of ${full}`);
    for (const d of [0, -1, Number.NaN, Infinity]) assert.equal(grassScatter(sample, d).length, full, String(d));
});

test('a country crown is several clumps, hanging from its top, the same each time', () => {
    const a = crownGeometry(9605);
    const b = crownGeometry(9605);
    assert.deepEqual(Array.from(a.getAttribute('position').array), Array.from(b.getAttribute('position').array));
    a.computeBoundingBox();
    const box = a.boundingBox;
    assert.ok(box.max.y <= 1.2 && box.min.y >= -0.9, `y ${box.min.y}..${box.max.y}`);
    assert.ok(box.max.x - box.min.x > 1.6, `spread ${box.max.x - box.min.x}`);
    // Six lumps of an icosphere: far more than one ball's 42 vertices.
    assert.ok(a.getAttribute('position').count >= 6 * 42);
});
