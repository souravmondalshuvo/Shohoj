/**
 * tests/campusSurroundings.test.js
 * The city round a Dhaka campus map: the OpenStreetMap extract for NSU stays
 * off the campus and within its radius; buildings are drawn as tall as OSM
 * says, or a likely height for the plot; street trees keep off roads,
 * buildings, water and the campus; the illustrative city stays in its ring.
 * All of it is seeded, so it repeats exactly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { NSU_SITE } from '../src/core/campusNsu.ts';
import { farCity, insidePolygon, outlineArea, streetTrees, urbanStoreys } from '../src/core/campusSurroundings.ts';
import { BRACU_SURROUNDINGS } from '../src/core/surroundingsBracu.generated.ts';
import { NSU_SURROUNDINGS } from '../src/core/surroundingsNsu.generated.ts';
import { urbanPlan } from '../src/features/campus/rsNeighbours.ts';

const inSite = ([x, y], site) => x > site.x1 && x < site.x2 && y > site.y1 && y < site.y2;
const centroid = (pts) => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];

const segmentDistance = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

test("NSU's extract leaves the campus to the campus and stays within its radius", () => {
    const { buildings, roads } = NSU_SURROUNDINGS;
    assert.ok(buildings.length > 1000, `buildings: ${buildings.length}`);
    assert.ok(roads.length > 50, `roads: ${roads.length}`);
    for (const b of buildings) {
        const c = centroid(b.outline);
        assert.ok(!inSite(c, NSU_SITE), `a building on the campus at ${c}`);
        assert.ok(Math.hypot(c[0], c[1]) <= 520, `a building ${Math.hypot(...c).toFixed(0)} m out`);
        assert.ok(b.levels === null || (b.levels >= 1 && b.levels <= 60), String(b.levels));
    }
    for (const r of roads) assert.ok(r.width > 0 && r.path.length >= 2, r.kind);
});

test("BRACU's extract keeps its plot clear and the tower's foot inside it", () => {
    const { buildings, plot } = BRACU_SURROUNDINGS;
    assert.ok(plot && plot.length >= 4, 'the plot is written out');
    assert.ok(buildings.length > 1500, `buildings: ${buildings.length}`);
    // The frame's origin is the tower's foot: inside the university's plot.
    assert.ok(insidePolygon([0, 0], plot), 'the origin is in the plot');
    // The model's own site (x north −45..45, y west −35..38) lies in the plot.
    for (const corner of [[-40, -30], [40, -30], [40, 30], [-40, 30]]) {
        assert.ok(insidePolygon(corner, plot), `the model's site corner ${corner} is in the plot`);
    }
    const xs = plot.map((p) => p[0]);
    const ys = plot.map((p) => p[1]);
    const site = { x1: Math.min(...xs) - 2, x2: Math.max(...xs) + 2, y1: Math.min(...ys) - 2, y2: Math.max(...ys) + 2 };
    for (const b of buildings) {
        const c = centroid(b.outline);
        assert.ok(!inSite(c, site), `a building in the plot at ${c}`);
        assert.ok(Math.hypot(c[0], c[1]) <= 520);
    }
});

test('a building is as tall as OSM says, or a likely height for its plot', () => {
    assert.equal(urbanStoreys(300, 14, 0), 14);
    assert.equal(urbanStoreys(30, null, 0), 1);
    for (let i = 0; i < 100; i++) {
        const small = urbanStoreys(80, null, i);
        const plot = urbanStoreys(300, null, i);
        assert.ok(small >= 2 && small <= 5, `small ${small}`);
        assert.ok(plot >= 5 && plot <= 9, `plot ${plot}`);
        assert.equal(urbanStoreys(300, null, i), plot);
    }
});

test('a Dhaka block keeps its storeys and wears a plain wash, not a village colour', () => {
    const washes = new Set();
    for (let i = 0; i < 300; i++) {
        const p = urbanPlan(300, 7, i);
        assert.equal(p.storeys, 7);
        assert.equal(p.roof, 'flat');
        washes.add(String(p.walls));
    }
    // Sky blue and mint (washes 3 and 4) are Savar's, not Bashundhara's.
    assert.ok(!washes.has('3') && !washes.has('4'), [...washes].join());
    assert.ok(washes.has('brick') && washes.has('0'), [...washes].join());
    assert.equal(urbanPlan(40, 1, 3).kind, 'hut');
});

test('street trees keep off roads, buildings, water and the campus, the same every load', () => {
    const trees = streetTrees(NSU_SURROUNDINGS, NSU_SITE);
    assert.deepEqual(streetTrees(NSU_SURROUNDINGS, NSU_SITE), trees);
    assert.ok(trees.length > 300, `trees: ${trees.length}`);
    const roads = NSU_SURROUNDINGS.roads.filter((r) => !r.kind.startsWith('water-'));
    for (const p of trees) {
        assert.ok(!inSite(p, NSU_SITE), `on the campus at ${p}`);
        for (const b of NSU_SURROUNDINGS.buildings) {
            const xs = b.outline.map((q) => q[0]);
            const ys = b.outline.map((q) => q[1]);
            if (p[0] < Math.min(...xs) || p[0] > Math.max(...xs) || p[1] < Math.min(...ys) || p[1] > Math.max(...ys)) continue;
            assert.ok(!insidePolygon(p, b.outline), `in a building at ${p}`);
        }
        for (const w of NSU_SURROUNDINGS.water) assert.ok(!insidePolygon(p, w), `in water at ${p}`);
        for (const r of roads) {
            for (let i = 1; i < r.path.length; i++) {
                assert.ok(segmentDistance(p, r.path[i - 1], r.path[i]) >= r.width / 2 + 0.8 - 1e-9, `on ${r.kind} at ${p}`);
            }
        }
    }
    const half = streetTrees(NSU_SURROUNDINGS, NSU_SITE, 2).length;
    assert.ok(half < trees.length * 0.75, `${half} of ${trees.length}`);
    for (const d of [0, -1, Number.NaN]) assert.equal(streetTrees(NSU_SURROUNDINGS, NSU_SITE, d).length, trees.length, String(d));
});

test('the illustrative city stays in its ring and repeats', () => {
    const blocks = farCity(530, 1700);
    assert.deepEqual(farCity(530, 1700), blocks);
    assert.ok(blocks.length > 1500, `blocks: ${blocks.length}`);
    for (const b of blocks) {
        const d = Math.hypot(b.x, b.y);
        assert.ok(d >= 530 && d <= 1700, `${d.toFixed(0)} m`);
        assert.ok(b.storeys >= 4 && b.storeys <= 23, `storeys ${b.storeys}`);
        assert.ok(b.length > 0 && b.width > 0);
    }
    assert.ok(farCity(530, 1700, 2).length < blocks.length * 0.7);
});

test('the shoelace area is signed by winding', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    assert.equal(outlineArea(square), 100);
    assert.equal(outlineArea([...square].reverse()), -100);
});
