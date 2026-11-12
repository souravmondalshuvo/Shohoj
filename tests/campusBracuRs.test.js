/**
 * tests/campusBracuRs.test.js
 * BRAC University's Residential Campus (#978): the site data the 3D map draws.
 * Holds it to what the sources say: OpenStreetMap's wall and footprints, names
 * only where a source gives one, and every storey count labelled by where it
 * comes from.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RS_BUILDINGS,
    RS_GATE,
    RS_GROUNDS,
    RS_LANDMARKS,
    RS_NEIGHBOURS,
    RS_ORIGIN,
    RS_ROADS,
    RS_TREES,
    RS_WALL,
    pointInPolygon,
    polygonArea,
    polygonCentre,
    rsBuilding,
    rsLevelsConfirmed,
    rsLevelsSourceLabel,
    rsToLatLon,
    rsWallTop,
} from '../src/core/campusBracuRs.ts';

/** Distance from a point to the nearest edge of a polygon. */
function distanceToEdge([x, y], polygon) {
    let best = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const [ax, ay] = polygon[i];
        const [bx, by] = polygon[(i + 1) % polygon.length];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
}

/**
 * Inside, or within `slack` metres of the outline. Nikunja and the east block
 * stand on the wall line — the building is the boundary there — and OSM's
 * outlines cross by up to 1.9 m: drawing tolerance, not a building through
 * the wall.
 */
function insideOrOn(point, polygon, slack = 2) {
    return pointInPolygon(point, polygon) || distanceToEdge(point, polygon) <= slack;
}

test('the wall is OpenStreetMap\'s campus outline: 11.1 acres at Khagan, Savar', () => {
    const acres = Math.abs(polygonArea(RS_WALL)) / 4046.86;
    assert.ok(acres > 11.0 && acres < 11.2, `${acres.toFixed(2)} acres`);
    // The origin is the middle of the wall, on the Ashulia–Birulia side of Savar.
    assert.ok(Math.abs(RS_ORIGIN.lat - 23.8676) < 0.001);
    assert.ok(Math.abs(RS_ORIGIN.lon - 90.3087) < 0.001);
    const centre = polygonCentre(RS_WALL);
    assert.ok(Math.hypot(...centre) < 1, 'campus metres are measured from the wall\'s middle');
});

test('campus metres convert back to where OpenStreetMap has the gate', () => {
    // OSM node 11478715412.
    const gate = rsToLatLon(RS_GATE);
    assert.ok(Math.abs(gate.lat - 23.8674663) < 0.00001, String(gate.lat));
    assert.ok(Math.abs(gate.lon - 90.3102808) < 0.00001, String(gate.lon));
    assert.ok(distanceToEdge(RS_GATE, RS_WALL) < 0.5, 'the gate is in the wall');
});

test('every building stands inside the wall', () => {
    for (const b of RS_BUILDINGS) {
        assert.ok(pointInPolygon(polygonCentre(b.footprint), RS_WALL), `${b.id} centre`);
        for (const p of b.footprint) assert.ok(insideOrOn(p, RS_WALL), `${b.id} corner ${p}`);
        assert.ok(Math.abs(polygonArea(b.footprint)) > 20, `${b.id} has a real footprint`);
    }
});

test('ids are unique and every building can be looked up', () => {
    const ids = RS_BUILDINGS.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.equal(rsBuilding(id)?.id, id);
    assert.equal(rsBuilding('nope'), null);
    assert.equal(rsBuilding(null), null);
});

test('names appear only where a source gives one', () => {
    const named = RS_BUILDINGS.filter((b) => b.name !== null).map((b) => b.name).sort();
    assert.deepEqual(named, ['Anandapur', 'Maloncho', 'Nikunja']);
    for (const b of RS_BUILDINGS) {
        if (b.name !== null) assert.equal(b.label, b.name);
    }
    // An unnamed building is described, never given a name: these labels are
    // plain descriptions, and any new one has to be added here on purpose.
    const descriptions = Object.fromEntries(
        RS_BUILDINGS.filter((b) => b.name === null).map((b) => [b.id, b.label]),
    );
    assert.deepEqual(descriptions, {
        'east-block': 'East block',
        'dorm-two-wing': 'Three-storey dormitory',
        'north-block': 'North block',
        'courtyard-building': 'Courtyard building',
        'west-block': 'West block',
        'west-shed': 'Long shed, west',
        'north-west-shed': 'Long shed, north-west',
        'hut-south': 'Small shed',
        'hut-south-2': 'Small shed',
    });
    assert.equal(rsBuilding('nikunja')?.aka, 'Nikunjo', 'the RS handbook\'s spelling');
});

test('storey counts say where they come from; only OpenStreetMap\'s are confirmed', () => {
    const levels = Object.fromEntries(RS_BUILDINGS.map((b) => [b.id, [b.levels, b.levelsFrom]]));
    assert.deepEqual(levels.nikunja, [10, 'osm']);
    assert.deepEqual(levels.maloncho, [6, 'osm']);
    assert.deepEqual(levels['dorm-two-wing'], [3, 'osm']);
    assert.deepEqual(levels['north-block'], [3, 'osm']);
    for (const b of RS_BUILDINGS) {
        assert.ok(Number.isInteger(b.levels) && b.levels >= 1, b.id);
        assert.equal(rsLevelsConfirmed(b), b.levelsFrom === 'osm', b.id);
    }
    assert.equal(rsLevelsSourceLabel('osm'), 'OpenStreetMap');
    assert.equal(rsLevelsSourceLabel('photo'), 'counted in an RS-handbook photo');
    assert.equal(rsLevelsSourceLabel('imagery'), 'estimated from the satellite image');
    // Nikunja is the tallest thing on campus.
    const tallest = [...RS_BUILDINGS].sort((a, b) => rsWallTop(b) - rsWallTop(a))[0];
    assert.equal(tallest.id, 'nikunja');
});

test('a pitched roof has the parts it is drawn over', () => {
    for (const b of RS_BUILDINGS) {
        if (b.roof === 'hip' || b.roof === 'gable') {
            assert.ok(b.roofParts && b.roofParts.length > 0, b.id);
            for (const r of b.roofParts) {
                assert.ok(r.length >= r.width && r.width > 0, `${b.id} roof part is long side first`);
                assert.ok(pointInPolygon([r.cx, r.cy], RS_WALL), `${b.id} roof inside the wall`);
            }
        }
    }
    assert.equal(rsBuilding('nikunja')?.roofParts?.length, 2, 'Nikunja is two hipped blocks');
});

test('the outline OSM has on bare ground is not drawn', () => {
    assert.ok(!RS_BUILDINGS.some((b) => b.osmWay === 587837347));
});

test('the fields are where OpenStreetMap has them, and named as it names them', () => {
    const byId = Object.fromEntries(RS_GROUNDS.map((g) => [g.id, g]));
    assert.equal(byId.duronto.name, 'Duronto');
    assert.equal(byId.durbar.name, 'Durbar');
    assert.equal(byId.duronto.kind, 'pitch');
    for (const g of RS_GROUNDS) {
        assert.ok(pointInPolygon(polygonCentre(g.outline), RS_WALL), g.id);
    }
    for (const l of RS_LANDMARKS) assert.ok(pointInPolygon(l.at, RS_WALL), l.id);
});

test('trees stand inside the wall and never inside a building', () => {
    assert.ok(RS_TREES.length > 200, 'the campus is heavily planted');
    for (const t of RS_TREES) {
        assert.ok(pointInPolygon(t, RS_WALL), `tree ${t}`);
        for (const b of RS_BUILDINGS) assert.ok(!pointInPolygon(t, b.footprint), `tree ${t} in ${b.id}`);
    }
});

test('the campus has roads of its own and the trunk road outside the gate', () => {
    assert.ok(RS_ROADS.some((r) => r.inside));
    const trunk = RS_ROADS.find((r) => r.kind === 'trunk');
    assert.equal(trunk?.name, 'Birulia-Akran Road');
    // The neighbours are context: none of them is inside the wall.
    assert.ok(RS_NEIGHBOURS.length > 50);
    for (const n of RS_NEIGHBOURS) assert.ok(!pointInPolygon(polygonCentre(n), RS_WALL));
});
