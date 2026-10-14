/**
 * tests/snapshotRooms.test.js
 * Free Rooms for a campus on a section snapshot: the room names in the
 * university's own listing are folded into physical rooms before anything is
 * called free.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { snapshotRoomBase, withPhysicalRooms } from '../js/core/snapshotRooms.js';
import { parseFeed } from '../js/core/connectFeed.js';
import { buildRoomBusyIndex, freeRoomsAt, listAllRooms, occupantAt } from '../js/core/freeRooms.js';
import { CAMPUS_FEED_SNAPSHOTS } from '../js/core/campusFeeds.generated.js';

const slot = (day, startMin, endMin, room) => ({ day, startMin, endMin, kind: 'theory', room });
const section = (courseCode, sectionName, classSlots, roomName = '') => ({ courseCode, sectionName, roomName, classSlots });

test('a variant name resolves to the room before its suffix', () => {
  assert.equal(snapshotRoomBase('LIB901_V'), 'LIB901');
  assert.equal(snapshotRoomBase('SAC415_v1'), 'SAC415');
  assert.equal(snapshotRoomBase('NAC201-v1'), 'NAC201');
  assert.equal(snapshotRoomBase('OAT803_V2'), 'OAT803');
  assert.equal(snapshotRoomBase('SAC415B_V'), 'SAC415B');
});

test('an ordinary room is not a variant', () => {
  for (const room of ['NAC603', 'SAC415B', 'NAC512A', 'LAB2', 'TV', 'NTR1001', '', null, undefined]) {
    assert.equal(snapshotRoomBase(room), null, String(room));
  }
});

test('a variant’s class counts against the real room', () => {
  const { sections, folded, dropped } = withPhysicalRooms([
    section('ENG102', '1', [slot('MONDAY', 600, 690, 'LIB901')]),
    section('ENG102', '2', [slot('MONDAY', 700, 790, 'LIB901_V')]),
  ]);
  assert.equal(folded, 1);
  assert.equal(dropped, 0);
  const index = buildRoomBusyIndex(sections);
  assert.deepEqual(listAllRooms(index), ['LIB901']);
  // Without the fold LIB901 would read as free at 11:40 while a class is in it.
  assert.equal(occupantAt(index, 'LIB901', 'MONDAY', 720).sectionName, '2');
  assert.deepEqual(freeRoomsAt(index, 'MONDAY', 720), []);
});

test('a variant spelled in another case still counts against the room', () => {
  // RDS's Fall 2026 page lists LIB907 and, for a second section, Lib907_V.
  const { sections, folded, dropped } = withPhysicalRooms([
    section('ENG103', '1', [slot('SUNDAY', 600, 690, 'LIB907')]),
    section('ENG103', '2', [slot('MONDAY', 600, 690, 'Lib907_V')]),
  ]);
  assert.equal(folded, 1);
  assert.equal(dropped, 0);
  const index = buildRoomBusyIndex(sections);
  assert.deepEqual(listAllRooms(index), ['LIB907']);
  assert.equal(occupantAt(index, 'LIB907', 'MONDAY', 620).sectionName, '2');
});

test('a variant with no real room behind it is left out, not invented', () => {
  const { sections, folded, dropped } = withPhysicalRooms([
    section('BIO101', '1', [slot('SUNDAY', 600, 690, 'XYZ101_V')]),
    section('BIO102', '1', [slot('SUNDAY', 600, 690, 'NAC101')]),
  ]);
  assert.equal(folded, 0);
  assert.equal(dropped, 1);
  assert.deepEqual(listAllRooms(buildRoomBusyIndex(sections)), ['NAC101']);
});

test('the section-level room is used when a slot names none, and not reintroduced', () => {
  const { sections } = withPhysicalRooms([
    section('CSE115', '1', [slot('TUESDAY', 480, 570, '')], 'SAC308_V'),
    section('CSE115', '2', [slot('TUESDAY', 600, 690, 'SAC308')]),
  ]);
  assert.deepEqual(listAllRooms(buildRoomBusyIndex(sections)), ['SAC308']);
  assert.equal(sections[0].roomName, '');
});

test('nothing is mutated', () => {
  const input = [section('ENG102', '2', [slot('MONDAY', 700, 790, 'LIB901_V')]), section('ENG102', '1', [slot('MONDAY', 600, 690, 'LIB901')])];
  const before = JSON.stringify(input);
  withPhysicalRooms(input);
  assert.equal(JSON.stringify(input), before);
});

test('on NSU’s real feed every variant folds into a room that exists', () => {
  const raw = JSON.parse(readFileSync(new URL(`../${CAMPUS_FEED_SNAPSHOTS.nsu.url}`, import.meta.url), 'utf8'));
  const { sections } = parseFeed(raw);
  const rawRooms = listAllRooms(buildRoomBusyIndex(sections));
  const variants = rawRooms.filter((room) => snapshotRoomBase(room) !== null);
  assert.ok(variants.length > 0, 'the feed does carry variant names');

  const result = withPhysicalRooms(sections);
  const rooms = listAllRooms(buildRoomBusyIndex(result.sections));
  assert.deepEqual(rooms.filter((room) => snapshotRoomBase(room) !== null), []);
  assert.equal(rooms.length, rawRooms.length - variants.length);
  assert.ok(result.folded > 0);
  // A variant is dropped only when no room of its name, in any case, is listed
  // on its own: the tab cannot vouch for a room nothing else is booked in.
  // Fall 2026 has three: TBA_V and TBA_v2, which are no room at all, and
  // LIB913_V. If another appears, decide whether it is a room.
  const listed = new Set(rawRooms.filter((room) => snapshotRoomBase(room) === null).map((room) => room.toUpperCase()));
  const orphans = variants.filter((room) => !listed.has(snapshotRoomBase(room).toUpperCase())).sort();
  assert.deepEqual(orphans, ['LIB913_V', 'TBA_V', 'TBA_v2']);
  assert.ok(result.dropped > 0);
  // The fold only ever makes a room busier.
  const before = buildRoomBusyIndex(sections);
  const after = buildRoomBusyIndex(result.sections);
  for (const room of rooms) assert.ok(after.get(room).length >= (before.get(room)?.length ?? 0), room);
});
