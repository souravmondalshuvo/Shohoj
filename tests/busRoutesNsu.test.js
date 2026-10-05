/**
 * tests/busRoutesNsu.test.js
 * NSU's bus dataset (src/core/busRoutesNsu.ts) is a transcription of the
 * campus database's record of NSU's official notice. This holds the two
 * together, and pins the helpers the page formats with.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  NSU_BUS_FARES,
  NSU_BUS_NOTICE_URL,
  NSU_BUS_PORTAL_URL,
  NSU_BUS_ROUTES,
  NSU_BUS_SERVICE_PERIOD,
  findNsuBusRoute,
  formatNsuBusDate,
  formatNsuBusTime,
} from '../src/core/busRoutesNsu.ts';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const record = read('data/campuses/nsu/bus.json');
const sources = read('data/campuses/nsu/sources.json');

test('every route, stop and time matches the campus database, in order', () => {
  assert.deepEqual(
    NSU_BUS_ROUTES.map(({ name, stops, arriveCampus, departCampus }) => ({
      route: name,
      stops: [...stops],
      arriveCampus: [...arriveCampus],
      departCampus: [...departCampus],
    })),
    record.records,
  );
});

test('the service period and fares match the campus database', () => {
  assert.deepEqual({ ...NSU_BUS_SERVICE_PERIOD }, record.servicePeriod);
  assert.equal(NSU_BUS_FARES.oneWay, record.fares.oneWay);
  assert.equal(NSU_BUS_FARES.roundTrip, record.fares.roundTrip);
  assert.equal(record.fares.currency, 'BDT');
});

test('the notice link is the source the campus database cites', () => {
  const list = Array.isArray(sources) ? sources : sources.records;
  const source = list.find((s) => s.id === record.source);
  assert.ok(source, `no source '${record.source}'`);
  assert.equal(NSU_BUS_NOTICE_URL, source.url);
  assert.match(NSU_BUS_PORTAL_URL, /^https:\/\/transport\.northsouth\.edu\//);
});

test('route ids are unique, URL-safe and resolvable', () => {
  const ids = NSU_BUS_ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z-]+$/);
    assert.equal(findNsuBusRoute(id).id, id);
  }
  assert.equal(findNsuBusRoute('narayanganj'), null);
  assert.equal(findNsuBusRoute(null), null);
});

test('every time is a 24-hour HH:MM the formatter can read', () => {
  for (const route of NSU_BUS_ROUTES) {
    for (const time of [...route.arriveCampus, ...route.departCampus]) {
      assert.match(time, /^([01]\d|2[0-3]):[0-5]\d$/, `${route.name}: ${time}`);
      assert.match(formatNsuBusTime(time), /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/);
    }
  }
});

test('times and dates are formatted for reading', () => {
  assert.equal(formatNsuBusTime('07:40'), '7:40 AM');
  assert.equal(formatNsuBusTime('14:20'), '2:20 PM');
  assert.equal(formatNsuBusTime('22:20'), '10:20 PM');
  assert.equal(formatNsuBusTime('00:05'), '12:05 AM');
  assert.equal(formatNsuBusTime('12:00'), '12:00 PM');
  assert.equal(formatNsuBusTime('soon'), 'soon');
  assert.equal(formatNsuBusDate('2025-09-25'), '25 Sep 2025');
  assert.equal(formatNsuBusDate('2025-12-24'), '24 Dec 2025');
  assert.equal(formatNsuBusDate('next week'), 'next week');
});

test('the service period on record is in the past — which is why the page warns', () => {
  // When NSU publishes a new period and the campus database is updated, this
  // fails on purpose: the page's "old schedule" banner (BusRouteNsu.tsx) is
  // then wrong and has to be reworded with the data, not left behind it.
  assert.ok(
    NSU_BUS_SERVICE_PERIOD.to < '2026-10-01',
    'the notice is no longer a past period — revisit the stale banner in BusRouteNsu.tsx',
  );
});
