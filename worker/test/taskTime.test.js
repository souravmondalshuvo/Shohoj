/**
 * worker/test/taskTime.test.js
 *
 * The timezone half of Shohoj Tasks (#715) — worker/taskTime.js.
 *
 * Its own file because this is the code most likely to be subtly wrong, and
 * wrong here is not cosmetic: a Today view that is off by a day is a Today view
 * nobody trusts, and a student only notices after they have missed something.
 *
 * Every case pins a real instant against a real zone. Nothing reads the clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  TASK_TYPES,
  dayWindowUtc,
  isValidTimeZone,
  localDateIn,
} from '../taskTime.js';

const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();
const hours = (ms) => ms / 3_600_000;

test('a Dhaka evening is still today, not tomorrow', () => {
  // THE bug this module exists to prevent. Bangladesh is UTC+6, so 11:30pm
  // local is already 05:30 the NEXT day in UTC. Computing "today" in UTC puts
  // a student's whole evening on tomorrow's list.
  const now = at('2026-10-05T17:30:00Z'); // 2026-10-05 23:30 in Dhaka

  assert.equal(localDateIn(now, 'Asia/Dhaka'), '2026-10-05');

  const { startUtc, endUtc } = dayWindowUtc(now, 'Asia/Dhaka');
  assert.equal(iso(startUtc), '2026-10-04T18:00:00.000Z');
  assert.equal(iso(endUtc), '2026-10-05T18:00:00.000Z');
  assert.ok(now >= startUtc && now < endUtc, 'the current instant must fall inside its own day');
});

test('the same instant is a different day in UTC', () => {
  const now = at('2026-10-05T17:30:00Z');
  assert.notEqual(
    dayWindowUtc(now, 'Asia/Dhaka').startUtc,
    dayWindowUtc(now, 'UTC').startUtc,
    'if these agreed, the zone would not be being applied at all',
  );
});

test('the window is half-open — midnight belongs to the new day', () => {
  const dayBefore = dayWindowUtc(at('2026-10-04T17:59:59.999Z'), 'Asia/Dhaka');
  const dayAfter = dayWindowUtc(at('2026-10-04T18:00:00.000Z'), 'Asia/Dhaka');
  assert.equal(
    dayBefore.endUtc,
    dayAfter.startUtc,
    'one day must end exactly where the next begins',
  );
  assert.notEqual(dayBefore.startUtc, dayAfter.startUtc);
});

test('an ordinary day is exactly 24 hours', () => {
  const { startUtc, endUtc } = dayWindowUtc(at('2026-06-15T12:00:00Z'), 'Asia/Dhaka');
  assert.equal(hours(endUtc - startUtc), 24);
});

test('a DST spring-forward day is 23 hours, not 24', () => {
  // Naively adding 86_400_000 to the day start would run an hour into the next
  // day, so tomorrow's first hour would be listed as today.
  const { startUtc, endUtc } = dayWindowUtc(at('2026-03-08T18:00:00Z'), 'America/New_York');
  assert.equal(hours(endUtc - startUtc), 23);
});

test('a DST fall-back day is 25 hours', () => {
  const { startUtc, endUtc } = dayWindowUtc(at('2026-11-01T18:00:00Z'), 'America/New_York');
  assert.equal(hours(endUtc - startUtc), 25);
});

test('a quarter-hour offset zone works', () => {
  // Kathmandu is UTC+5:45. Anything that assumed whole-hour offsets breaks here.
  const { startUtc, endUtc } = dayWindowUtc(at('2026-06-15T12:00:00Z'), 'Asia/Kathmandu');
  assert.equal(iso(startUtc), '2026-06-14T18:15:00.000Z');
  assert.equal(hours(endUtc - startUtc), 24);
});

test('a zone behind UTC works as well as one ahead', () => {
  const now = at('2026-06-15T04:00:00Z'); // 2026-06-15 00:00 in New York
  assert.equal(localDateIn(now, 'America/New_York'), '2026-06-15');
  assert.equal(iso(dayWindowUtc(now, 'America/New_York').startUtc), '2026-06-15T04:00:00.000Z');
});

test('midnight exactly resolves to its own day, not the previous one', () => {
  // hourCycle h23 rather than hour12:false — some implementations report hour
  // 24 at midnight, which would put every midnight on the wrong day.
  const midnight = at('2026-10-04T18:00:00.000Z'); // 2026-10-05 00:00 Dhaka
  assert.equal(localDateIn(midnight, 'Asia/Dhaka'), '2026-10-05');
  assert.equal(dayWindowUtc(midnight, 'Asia/Dhaka').startUtc, midnight);
});

test('a year boundary is handled', () => {
  const now = at('2026-12-31T18:30:00Z'); // 2027-01-01 00:30 Dhaka
  assert.equal(localDateIn(now, 'Asia/Dhaka'), '2027-01-01');
});

test('unknown timezones are rejected rather than silently defaulted', () => {
  // A silent fallback to UTC answers the wrong day for every Dhaka evening.
  assert.equal(isValidTimeZone('Asia/Dhaka'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('Mars/Olympus_Mons'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(42), false);
});

test('the enum sets are frozen and SCREAMING_SNAKE', () => {
  for (const set of [TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES, TASK_SOURCES]) {
    assert.equal(Object.isFrozen(set), true);
    for (const value of set) assert.match(value, /^[A-Z_]+$/);
  }
  // Present from the start though nothing produces them until Phase 7 — adding
  // the field later would leave every existing row reading MANUAL.
  assert.ok(TASK_SOURCES.includes('GMAIL'));
  assert.ok(TASK_SOURCES.includes('AI_SUGGESTION'));
});
