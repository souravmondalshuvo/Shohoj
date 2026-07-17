/**
 * tests/freeRoomsTimeline.test.js
 * Pure tests for the shell Free Rooms helpers in src/core/freeRooms.ts:
 * room-type classification and the per-day free/busy timeline that backs the
 * /rooms route's weekly-availability dialog (#434).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRoomBusyIndex,
    roomTypeKey,
    isLabOccupant,
    dayTimeline,
    ROOM_TYPE_LABELS,
    CAMPUS_START_MIN,
    CAMPUS_END_MIN,
} from '../src/core/freeRooms.ts';

function section(over) {
    return {
        sectionId: 1,
        courseCode: 'CSE110',
        courseName: 'Programming Language',
        credits: 3,
        sectionName: '01',
        capacity: 40,
        consumedSeat: 10,
        isFull: false,
        facultyInitials: 'ABC',
        roomName: '07A-01C',
        semesterSessionId: null,
        classSlots: [],
        ...over,
    };
}

const slot = (day, startMin, endMin, kind = 'theory') => ({ day, startMin, endMin, kind });

test('roomTypeKey classifies by trailing letter, defaulting to classroom', () => {
    assert.equal(roomTypeKey('07A-01C'), 'C');
    assert.equal(roomTypeKey('09G-31L'), 'L');
    assert.equal(roomTypeKey('10B-02T'), 'T');
    assert.equal(roomTypeKey('10b-02t'), 'T'); // case-insensitive
    assert.equal(roomTypeKey('AUDITORIUM1'), 'C'); // unknown suffix → classroom
    assert.equal(ROOM_TYPE_LABELS[roomTypeKey('09G-31L')], 'Lab');
});

test('isLabOccupant: lab kind OR lab room reads as a lab session', () => {
    assert.equal(isLabOccupant('07A-01C', 'lab'), true);
    assert.equal(isLabOccupant('09G-31L', 'theory'), true); // lab room, mistagged feed
    assert.equal(isLabOccupant('07A-01C', 'theory'), false);
});

test('dayTimeline interleaves free windows and labelled busy segments', () => {
    const index = buildRoomBusyIndex([
        section({ sectionId: 1, courseCode: 'CSE110', sectionName: '01', roomName: 'R1',
            classSlots: [slot('SUNDAY', 9 * 60, 10 * 60 + 20)] }),
        section({ sectionId: 2, courseCode: 'PHY111', sectionName: '05', roomName: 'R1',
            classSlots: [slot('SUNDAY', 14 * 60, 15 * 60 + 20, 'lab')] }),
    ]);
    const segs = dayTimeline(index, 'R1', 'SUNDAY');

    assert.equal(segs.length, 5); // free, busy, free, busy(lab), free
    assert.deepEqual(segs.map(s => s.busy), [false, true, false, true, false]);
    assert.equal(segs[0].startMin, CAMPUS_START_MIN);
    assert.equal(segs[0].endMin, 9 * 60);
    assert.equal(segs[1].courseCode, 'CSE110');
    assert.equal(segs[1].sectionName, '01');
    assert.equal(segs[1].lab, false);
    assert.equal(segs[3].courseCode, 'PHY111');
    assert.equal(segs[3].lab, true);
    assert.equal(segs[4].endMin, CAMPUS_END_MIN);

    // Chronological, and clamped to campus hours.
    for (let i = 1; i < segs.length; i++) {
        assert.ok(segs[i].startMin >= segs[i - 1].startMin, 'sorted by start');
    }
});

test('dayTimeline: no classes → one all-day free window', () => {
    const index = buildRoomBusyIndex([
        section({ roomName: 'R1', classSlots: [slot('MONDAY', 9 * 60, 10 * 60)] }),
    ]);
    assert.deepEqual(dayTimeline(index, 'R1', 'TUESDAY'), [
        { startMin: CAMPUS_START_MIN, endMin: CAMPUS_END_MIN, busy: false },
    ]);
});

test('dayTimeline clamps busy segments that spill past campus hours', () => {
    const index = buildRoomBusyIndex([
        section({ roomName: 'R1', classSlots: [slot('MONDAY', 7 * 60, 8 * 60 + 30)] }),
    ]);
    const segs = dayTimeline(index, 'R1', 'MONDAY');
    assert.equal(segs[0].busy, true);
    assert.equal(segs[0].startMin, CAMPUS_START_MIN); // clamped from 07:00
    assert.equal(segs[0].endMin, 8 * 60 + 30);
});
