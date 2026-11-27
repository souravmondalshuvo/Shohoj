/**
 * tests/campusSurroundings.test.js
 * The city round a Dhaka campus map: the OpenStreetMap extract for NSU stays
 * off the campus and within its radius; buildings are drawn as tall as OSM
 * says, or a likely height for the plot; street trees keep off roads,
 * buildings, water and the campus; the illustrative city stays in its ring;
 * shops face only the streets; people keep to footpaths and plazas, and
 * rickshaws wait at the kerb by the campus.
 * All of it is seeded, so it repeats exactly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { NSU_SITE } from '../src/core/campusNsu.ts';
import { farCity, insidePolygon, outlineArea, pedestrians, plazaPeople, rickshawStands, roadTraffic, streetFront, streetPoles, streetTrees, urbanStoreys } from '../src/core/campusSurroundings.ts';
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

test('traffic stays on the roads, off the campus, buses on the main roads only', () => {
    const traffic = roadTraffic(NSU_SURROUNDINGS, NSU_SITE);
    assert.deepEqual(roadTraffic(NSU_SURROUNDINGS, NSU_SITE), traffic);
    assert.ok(traffic.length > 300, `vehicles: ${traffic.length}`);
    const kinds = new Set(traffic.map((v) => v.kind));
    for (const k of ['car', 'cng', 'rickshaw']) assert.ok(kinds.has(k), k);
    const roads = NSU_SURROUNDINGS.roads.filter((r) => !r.kind.startsWith('water-'));
    for (const v of traffic) {
        assert.ok(!inSite([v.x, v.y], NSU_SITE), `on the campus at ${v.x}, ${v.y}`);
        // On a road: within half its width of its line (a little slack for the kerb).
        let best = Infinity;
        let width = 0;
        for (const r of roads) {
            for (let i = 1; i < r.path.length; i++) {
                const d = segmentDistance([v.x, v.y], r.path[i - 1], r.path[i]);
                if (d < best) {
                    best = d;
                    width = r.width;
                }
            }
        }
        assert.ok(best <= width / 2 + 0.01, `${best.toFixed(2)} m off a ${width} m road`);
        if (v.kind === 'bus') assert.ok(width >= 10, `a bus on a ${width} m road`);
    }
    const half = roadTraffic(NSU_SURROUNDINGS, NSU_SITE, 2).length;
    assert.ok(half < traffic.length * 0.7, `${half} of ${traffic.length}`);
});

test('poles stand off the campus and out of buildings, with cables only between neighbours', () => {
    const { poles, spans } = streetPoles(NSU_SURROUNDINGS, NSU_SITE);
    assert.deepEqual(streetPoles(NSU_SURROUNDINGS, NSU_SITE), { poles, spans });
    assert.ok(poles.length > 100 && spans.length > 50, `${poles.length} poles, ${spans.length} spans`);
    for (const p of poles) {
        assert.ok(!inSite([p.x, p.y], NSU_SITE), `on the campus at ${p.x}, ${p.y}`);
        for (const b of NSU_SURROUNDINGS.buildings) assert.ok(!insidePolygon([p.x, p.y], b.outline), `in a building at ${p.x}, ${p.y}`);
    }
    for (const [a, b] of spans) {
        const d = Math.hypot(poles[a].x - poles[b].x, poles[a].y - poles[b].y);
        assert.ok(d > 5 && d < 45, `a ${d.toFixed(1)} m span`);
    }
});

test('a street front is the kerb of a road with shops on it, not a lane or the campus middle', () => {
    const front = streetFront(NSU_SURROUNDINGS);
    const shopping = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'living_street']);
    let checked = 0;
    for (const r of NSU_SURROUNDINGS.roads) {
        const [a, b] = r.path;
        if (!a || !b) continue;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (shopping.has(r.kind)) {
            // On the road, and just past its kerb.
            assert.ok(front(mid, 0), `${r.kind} at ${mid}`);
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const off = [mid[0] - ((b[1] - a[1]) / len) * (r.width / 2 + 3), mid[1] + ((b[0] - a[0]) / len) * (r.width / 2 + 3)];
            assert.ok(front(off, 4), `3 m past a ${r.kind}'s kerb at ${off}`);
            checked++;
        }
    }
    assert.ok(checked > 50, `checked ${checked}`);
    // The middle of the campus is nowhere near a street.
    assert.equal(front([0, 0], 6), false);
    // Nothing is a front without roads.
    assert.equal(streetFront({ ...NSU_SURROUNDINGS, roads: [] })([0, 0], 1000), false);
});

const onCarriageway = (p, roads) =>
    roads.some((r) => r.path.some((q, i) => i > 0 && segmentDistance(p, r.path[i - 1], q) <= r.width / 2));

test('people keep to the footpaths: off the carriageway, out of buildings, off the campus', () => {
    const people = pedestrians(NSU_SURROUNDINGS, NSU_SITE, 320);
    assert.deepEqual(pedestrians(NSU_SURROUNDINGS, NSU_SITE, 320), people);
    assert.ok(people.length > 200, `people: ${people.length}`);
    const roads = NSU_SURROUNDINGS.roads.filter((r) => !r.kind.startsWith('water-'));
    for (const p of people) {
        const at = [p.x, p.y];
        assert.ok(Math.hypot(p.x, p.y) <= 320, `${Math.hypot(p.x, p.y).toFixed(0)} m out`);
        assert.ok(!inSite(at, NSU_SITE), `on the campus at ${at}`);
        assert.ok(!onCarriageway(at, roads), `on a carriageway at ${at}`);
        for (const b of NSU_SURROUNDINGS.buildings) assert.ok(!insidePolygon(at, b.outline), `in a building at ${at}`);
        assert.ok(p.height >= 1.5 && p.height <= 1.78, String(p.height));
    }
    assert.ok(pedestrians(NSU_SURROUNDINGS, NSU_SITE, 320, 2).length < people.length * 0.7);
});

test('a plaza crowd stays on the plaza, clear of its buildings and the kept-out site', () => {
    const area = [[-100, -60], [100, -60], [100, 60], [-100, 60]];
    const avoid = [{ x1: -40, x2: 40, y1: -10, y2: 10 }];
    const keepOut = { x1: 60, x2: 100, y1: 20, y2: 60 };
    const people = plazaPeople(area, avoid, keepOut, 150, 7);
    assert.deepEqual(plazaPeople(area, avoid, keepOut, 150, 7), people);
    assert.equal(people.length, 150);
    for (const p of people) {
        const at = [p.x, p.y];
        assert.ok(insidePolygon(at, area), `off the plaza at ${at}`);
        assert.ok(!(p.x > -40 && p.x < 40 && p.y > -10 && p.y < 10), `in a building at ${at}`);
        assert.ok(!(p.x > 60 && p.y > 20), `in the kept-out site at ${at}`);
    }
    // Nowhere to stand: nobody, and no endless search.
    assert.equal(plazaPeople(area, [{ x1: -200, x2: 200, y1: -200, y2: 200 }], null, 50, 7).length, 0);
});

test('rickshaws wait in rows at the kerb next to the campus, never on it', () => {
    const stands = rickshawStands(NSU_SURROUNDINGS, NSU_SITE);
    assert.deepEqual(rickshawStands(NSU_SURROUNDINGS, NSU_SITE), stands);
    assert.ok(stands.length >= 20, `rickshaws: ${stands.length}`);
    const roads = NSU_SURROUNDINGS.roads.filter((r) => !r.kind.startsWith('water-'));
    for (const v of stands) {
        const at = [v.x, v.y];
        assert.equal(v.kind, 'rickshaw');
        assert.ok(!inSite(at, NSU_SITE), `on the campus at ${at}`);
        // Within a road, and within about 25 m of the campus's edge.
        assert.ok(onCarriageway(at, roads), `off the road at ${at}`);
        const dx = Math.max(NSU_SITE.x1 - v.x, 0, v.x - NSU_SITE.x2);
        const dy = Math.max(NSU_SITE.y1 - v.y, 0, v.y - NSU_SITE.y2);
        assert.ok(Math.hypot(dx, dy) <= 25, `${Math.hypot(dx, dy).toFixed(1)} m from the campus`);
    }
    assert.ok(rickshawStands(NSU_SURROUNDINGS, NSU_SITE, 1).length <= 12);
});
