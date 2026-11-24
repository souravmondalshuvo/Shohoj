/**
 * tests/campusBracuRsCountry.test.js
 * The country round the Residential Campus map and the buildings outside its
 * wall (#996): seeded layouts that must repeat exactly, keep off the mapped
 * area and the ponds, and give the neighbourhood a believable mix.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RS_NEIGHBOURS, RS_WATER, pointInPolygon, polygonArea } from '../src/core/campusBracuRs.ts';
import { countryPlan, countryScatter, inNearArea } from '../src/features/campus/rsLandscape.ts';
import { fitRect, gableFits, planNeighbour } from '../src/features/campus/rsNeighbours.ts';

const inPond = (x, y) => RS_WATER.some((w) => pointInPolygon([x, y], w.outline));

test('the country is laid out the same on every load', () => {
    assert.deepEqual(countryPlan(), countryPlan());
    const plan = countryPlan();
    assert.deepEqual(countryScatter(plan), countryScatter(plan));
});

test('the country has villages and kilns, all clear of the mapped area', () => {
    const { villages, kilns } = countryPlan();
    assert.ok(villages.length >= 30, `villages: ${villages.length}`);
    assert.ok(kilns.length >= 3, `kilns: ${kilns.length}`);
    for (const v of villages) {
        for (const l of v.lobes) assert.ok(!inNearArea(l.x, l.y, 60), `lobe at ${l.x}, ${l.y}`);
        assert.ok(!inPond(v.x, v.y), `village in a pond at ${v.x}, ${v.y}`);
    }
    for (const k of kilns) assert.ok(!inNearArea(k.x, k.y, 300), `kiln at ${k.x}, ${k.y}`);
});

test('no country tree or house stands on the map or in a mapped pond', () => {
    const { trees, houses } = countryScatter(countryPlan());
    assert.ok(trees.length > 3000, `trees: ${trees.length}`);
    for (const t of trees) {
        assert.ok(!inNearArea(t.x, t.y, 10), `tree at ${t.x}, ${t.y}`);
        assert.ok(!inPond(t.x, t.y), `tree in a pond at ${t.x}, ${t.y}`);
    }
    for (const h of houses) assert.ok(!inNearArea(h.x, h.y, 10), `house at ${h.x}, ${h.y}`);
});

test('a density that is not a positive number falls back to the full country', () => {
    const plan = countryPlan();
    const full = countryScatter(plan, 1).trees.length;
    for (const d of [0, -1, Number.NaN, Infinity]) assert.equal(countryScatter(plan, d).trees.length, full, String(d));
});

test('only a near-rectangular footprint is redrawn on its rectangle for a gable', () => {
    assert.equal(gableFits([[0, 0], [10, 0], [10, 6], [0, 6]]), true);
    // An L: a third of its bounding rectangle is empty.
    assert.equal(gableFits([[0, 0], [12, 0], [12, 4], [4, 4], [4, 9], [0, 9]]), false);
});

test('a small screen gets about half the country trees', () => {
    const plan = countryPlan();
    const full = countryScatter(plan, 1).trees.length;
    const half = countryScatter(plan, 2).trees.length;
    assert.ok(half > full * 0.35 && half < full * 0.65, `${half} of ${full}`);
});

test('what stands on a footprint follows its size, and repeats', () => {
    assert.equal(planNeighbour(40, 3).kind, 'hut');
    assert.equal(planNeighbour(2000, 3).kind, 'shed');
    for (let i = 0; i < 200; i++) {
        const p = planNeighbour(300, i);
        assert.equal(p.kind, 'house');
        assert.ok(p.storeys >= 1 && p.storeys <= 4, `storeys ${p.storeys}`);
        assert.deepEqual(planNeighbour(300, i), p);
        if (p.roof !== 'flat') assert.ok(!p.tank && !p.stairHead && !p.stubs);
    }
});

test('the neighbourhood is a mix, not one kind of building', () => {
    const walls = new Set();
    const roofs = new Set();
    const kinds = new Set();
    RS_NEIGHBOURS.forEach((nb, i) => {
        const p = planNeighbour(Math.abs(polygonArea(nb)), i);
        walls.add(String(p.walls));
        roofs.add(p.roof);
        kinds.add(p.kind);
    });
    assert.ok(walls.size >= 5, [...walls].join());
    assert.ok(roofs.size >= 3, [...roofs].join());
    assert.ok(kinds.has('house') && kinds.has('hut'), [...kinds].join());
});

test('a fitted rectangle matches a turned rectangle and holds every footprint', () => {
    const a = (30 * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rect = [
        [0, 0],
        [12 * c, 12 * s],
        [12 * c - 5 * s, 12 * s + 5 * c],
        [-5 * s, 5 * c],
    ];
    const r = fitRect(rect);
    assert.ok(Math.abs(r.length - 12) < 1e-6 && Math.abs(r.width - 5) < 1e-6, JSON.stringify(r));
    for (const nb of RS_NEIGHBOURS) {
        const f = fitRect(nb);
        assert.ok(f.length >= f.width);
        assert.ok(f.length * f.width >= Math.abs(polygonArea(nb)) - 1e-6);
    }
});
