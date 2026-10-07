/**
 * tests/campusNsu.test.js
 * NSU's campus model: room-code parsing, building/floor grouping and the
 * diagram layout — held against the section snapshot the page actually reads.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    NSU_BUILDINGS,
    NSU_SITE,
    buildNsuCampus,
    layoutNsuFloor,
    nsuTermPhase,
    nsuBuilding,
    parseNsuRoom,
} from '../src/core/campusNsu.ts';
import { CAMPUS_FEED_SNAPSHOTS } from '../js/core/campusFeeds.generated.js';

test('a room code names its building, floor and number', () => {
    assert.deepEqual(parseNsuRoom('NAC210'), {
        code: 'NAC210', building: 'NAC', floor: 2, number: 10, suffix: '',
    });
    assert.deepEqual(parseNsuRoom('SAC1018'), {
        code: 'SAC1018', building: 'SAC', floor: 10, number: 18, suffix: '',
    });
    assert.deepEqual(parseNsuRoom(' lib601 '), {
        code: 'LIB601', building: 'LIB', floor: 6, number: 1, suffix: '',
    });
    assert.equal(parseNsuRoom('SAC415B').suffix, 'B');
});

test('a second booking of a room is the room itself', () => {
    for (const name of ['NAC201-v1', 'SAC414_V', 'SAC415_v1', 'OAT803_V2', 'SAC802_v']) {
        const room = parseNsuRoom(name);
        assert.ok(room, name);
        assert.match(room.code, /^[A-Z]{3}\d{3,4}$/);
    }
    assert.equal(parseNsuRoom('SAC415B_V').code, 'SAC415B');
});

test('venues outside the mapped buildings are not guessed at', () => {
    for (const name of ['NTR201', 'B113', 'LAB4', 'TV LAB', 'Upper Plaza', '', null, undefined]) {
        assert.equal(parseNsuRoom(name), null, String(name));
    }
    // A floor the building does not have is a typo, not a room.
    assert.equal(parseNsuRoom('NAC11117'), null);
    assert.equal(parseNsuRoom('NAC1201'), null);
    assert.equal(parseNsuRoom('NAC001'), null);
});

test('every building keeps every floor, with or without rooms', () => {
    const campus = buildNsuCampus(['NAC210', 'NAC201', 'NAC201-v1', 'SAC1018', 'NTR201', '']);
    assert.deepEqual(campus.buildings.map((b) => b.building.id), NSU_BUILDINGS.map((b) => b.id));
    for (const entry of campus.buildings) {
        assert.equal(entry.floors.length, entry.building.levels);
        assert.deepEqual(entry.floors.map((f) => f.floor), entry.floors.map((_, i) => i + 1));
    }
    const nac = campus.buildings.find((b) => b.building.id === 'NAC');
    assert.deepEqual(nac.floors[1].rooms.map((r) => r.code), ['NAC201', 'NAC210']);
    assert.equal(nac.roomCount, 2);
    assert.deepEqual(campus.namesByCode.get('NAC201'), ['NAC201', 'NAC201-v1']);
    assert.deepEqual(campus.otherVenues, ['NTR201']);
});

test('buildings stand inside the site and do not overlap', () => {
    for (const b of NSU_BUILDINGS) {
        assert.ok(b.rect.x1 >= NSU_SITE.x1 && b.rect.x2 <= NSU_SITE.x2, b.id);
        assert.ok(b.rect.y1 >= NSU_SITE.y1 && b.rect.y2 <= NSU_SITE.y2, b.id);
    }
    for (const a of NSU_BUILDINGS) {
        for (const b of NSU_BUILDINGS) {
            if (a.id >= b.id) continue;
            const overlap =
                a.rect.x1 < b.rect.x2 && b.rect.x1 < a.rect.x2 &&
                a.rect.y1 < b.rect.y2 && b.rect.y1 < a.rect.y2;
            assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
        }
    }
    assert.equal(nsuBuilding('NAC').name, 'North Academic Building');
    assert.equal(nsuBuilding('XYZ'), null);
});

function assertLaidOut(building, rooms) {
    const slots = layoutNsuFloor(building, rooms);
    assert.equal(slots.length, rooms.length);
    for (const [i, slot] of slots.entries()) {
        assert.ok(slot.width > 1.5 && slot.depth > 1.5, `${slot.code} is too small to click`);
        assert.ok(slot.x - slot.width / 2 >= building.rect.x1, `${slot.code} past the west wall`);
        assert.ok(slot.x + slot.width / 2 <= building.rect.x2, `${slot.code} past the east wall`);
        assert.ok(slot.y - slot.depth / 2 >= building.rect.y1, `${slot.code} past the south wall`);
        assert.ok(slot.y + slot.depth / 2 <= building.rect.y2, `${slot.code} past the north wall`);
        for (const other of slots.slice(i + 1)) {
            const apart =
                Math.abs(slot.x - other.x) >= (slot.width + other.width) / 2 ||
                Math.abs(slot.y - other.y) >= (slot.depth + other.depth) / 2;
            assert.ok(apart, `${slot.code} overlaps ${other.code}`);
        }
    }
}

test('the snapshot the page reads resolves to rooms that fit their buildings', () => {
    const snapshot = CAMPUS_FEED_SNAPSHOTS.nsu;
    const sections = JSON.parse(readFileSync(new URL(`../${snapshot.url}`, import.meta.url), 'utf8'));
    const campus = buildNsuCampus(sections.map((s) => s.roomName));

    // Most of the timetable lands in a mapped building.
    assert.ok(campus.roomsByCode.size >= 150, `only ${campus.roomsByCode.size} rooms`);
    for (const id of ['NAC', 'SAC', 'LIB', 'OAT']) {
        const entry = campus.buildings.find((b) => b.building.id === id);
        assert.ok(entry.roomCount > 0, `${id} has no rooms`);
    }
    for (const entry of campus.buildings) {
        for (const floor of entry.floors) assertLaidOut(entry.building, floor.rooms);
    }
});

test('the timetable only speaks for the days of its term', () => {
    const phase = (day) => nsuTermPhase(day, '2026-09-20', '2026-12-20');
    assert.equal(phase('2026-09-19'), 'before');
    // The first and the last day of classes are both class days.
    assert.equal(phase('2026-09-20'), 'during');
    assert.equal(phase('2026-10-08'), 'during');
    assert.equal(phase('2026-12-20'), 'during');
    assert.equal(phase('2026-12-21'), 'after');
    assert.equal(phase('2027-01-15'), 'after');
});

test('a floor far busier than any today still fits', () => {
    const nac = nsuBuilding('NAC');
    const lib = nsuBuilding('LIB');
    const many = (prefix, count) =>
        Array.from({ length: count }, (_, i) => parseNsuRoom(`${prefix}2${String(i + 1).padStart(2, '0')}`));
    // Twice the busiest floor in the snapshot, for each shape of building.
    assertLaidOut(nac, many('NAC', 40));
    assertLaidOut(lib, many('LIB', 24));
});
