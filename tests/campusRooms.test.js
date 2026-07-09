/**
 * tests/campusRooms.test.js
 * Pure tests for the campus-map room model (#370): room-code parsing,
 * floor/zone grouping, and the geofence helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseRoomCode,
    buildCampusModel,
    roomKindLabel,
    distanceMeters,
    onCampusStatus,
    CAMPUS_LAT,
    CAMPUS_LNG,
    CAMPUS_RADIUS_M,
} from '../src/core/campusRooms.ts';

test('parseRoomCode: classroom, lab, theater kinds', () => {
    assert.deepEqual(parseRoomCode('07A-08C'), {
        code: '07A-08C', floor: 7, zone: 'A', number: 8, kind: 'classroom',
    });
    assert.deepEqual(parseRoomCode('10B-04L'), {
        code: '10B-04L', floor: 10, zone: 'B', number: 4, kind: 'lab',
    });
    assert.deepEqual(parseRoomCode('09G-31T'), {
        code: '09G-31T', floor: 9, zone: 'G', number: 31, kind: 'theater',
    });
});

test('parseRoomCode: normalizes case and whitespace', () => {
    assert.equal(parseRoomCode('  09g-31t ')?.code, '09G-31T');
});

test('parseRoomCode: unknown kind letter is kept as unknown', () => {
    assert.equal(parseRoomCode('08C-02X')?.kind, 'unknown');
});

test('parseRoomCode: rejects non-tower and junk values', () => {
    assert.equal(parseRoomCode('AN1-01C'), null);   // annex venue
    assert.equal(parseRoomCode('FT11-02L'), null);  // non-tower venue
    assert.equal(parseRoomCode('UB0000'), null);    // legacy placeholder
    assert.equal(parseRoomCode('TBA'), null);
    assert.equal(parseRoomCode('MON 11:00AM: 07A-08C; WED 2:00PM: 09G-31T'), null);
    assert.equal(parseRoomCode('00A-01C'), null);   // floor 0 is not a floor
    assert.equal(parseRoomCode(''), null);
    assert.equal(parseRoomCode(null), null);
    assert.equal(parseRoomCode(undefined), null);
});

test('roomKindLabel covers every kind', () => {
    assert.equal(roomKindLabel('classroom'), 'Classroom');
    assert.equal(roomKindLabel('lab'), 'Lab');
    assert.equal(roomKindLabel('theater'), 'Theater');
    assert.equal(roomKindLabel('unknown'), 'Room');
});

test('buildCampusModel: groups floors ascending, zones alphabetical, rooms by number', () => {
    const model = buildCampusModel([
        '09G-31T', '07B-12C', '07A-10C', '07A-02C', '12H-40L', 'AN1-01C',
    ]);
    assert.deepEqual(model.floors.map((f) => f.floor), [7, 9, 12]);

    const f7 = model.floors[0];
    assert.deepEqual(f7.zones.map((z) => z.zone), ['A', 'B']);
    assert.deepEqual(f7.zones[0].rooms.map((r) => r.code), ['07A-02C', '07A-10C']);
    assert.equal(f7.roomCount, 3);

    assert.deepEqual(model.otherVenues, ['AN1-01C']);
    assert.equal(model.roomsByCode.size, 5);
    assert.equal(model.roomsByCode.get('09G-31T')?.zone, 'G');
});

test('buildCampusModel: collapses duplicates and ignores blanks', () => {
    const model = buildCampusModel(['07A-01C', '07a-01c ', '', '   ']);
    assert.equal(model.roomsByCode.size, 1);
    assert.deepEqual(model.otherVenues, []);
});

test('distanceMeters: zero at same point, sane at known offset', () => {
    assert.equal(distanceMeters(CAMPUS_LAT, CAMPUS_LNG, CAMPUS_LAT, CAMPUS_LNG), 0);
    // ~1.11 km per 0.01° of latitude.
    const d = distanceMeters(CAMPUS_LAT, CAMPUS_LNG, CAMPUS_LAT + 0.01, CAMPUS_LNG);
    assert.ok(d > 1000 && d < 1250, `expected ~1112m, got ${d}`);
});

test('onCampusStatus: unknown without a fix, thresholds at the radius', () => {
    assert.equal(onCampusStatus(null), 'unknown');
    assert.equal(onCampusStatus(Number.NaN), 'unknown');
    assert.equal(onCampusStatus(0), 'on-campus');
    assert.equal(onCampusStatus(CAMPUS_RADIUS_M), 'on-campus');
    assert.equal(onCampusStatus(CAMPUS_RADIUS_M + 1), 'off-campus');
});
