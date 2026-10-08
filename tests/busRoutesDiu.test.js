/**
 * tests/busRoutesDiu.test.js
 * DIU's bus dataset (src/core/busRoutesDiu.ts) is a transcription of the
 * campus database's record of DIU's public transport feed. This holds the two
 * together, and pins the helpers the page formats with.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DIU_BUS_CHECKED_ON,
  DIU_BUS_FEED_SEMESTER,
  DIU_BUS_FEED_TITLE,
  DIU_BUS_FEED_URL,
  DIU_BUS_PAGE_URL,
  DIU_BUS_ROUTES,
  DIU_BUS_SERVICES,
  diuBusRouteLabel,
  diuBusServiceDays,
  findDiuBusRoute,
  formatDiuBusServiceDays,
  formatDiuBusTime,
} from '../src/core/busRoutesDiu.ts';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const record = read('data/campuses/diu/bus.json');
const sources = read('data/campuses/diu/sources.json');
const dayCodes = read('data/campuses/diu/profile.json').days.records;

const route = (id) => findDiuBusRoute(id);

test('every route, stop, time and off-day matches the campus database, in order', () => {
  assert.deepEqual(
    DIU_BUS_ROUTES.map(({ name, service, stops, towardsCampus, fromCampus, daysOff, note }) => ({
      route: name,
      service,
      stops: [...stops],
      // The record's field names are shared with NSU, whose notice gives times
      // at campus. DIU's feed gives the time a bus sets off (`from_home`).
      arriveCampus: [...towardsCampus],
      departCampus: [...fromCampus],
      daysOff,
      ...(note ? { note } : {}),
    })),
    record.records,
  );
  assert.equal(DIU_BUS_ROUTES.length, 20);
});

test('no fare and no service period is claimed, because DIU publishes neither', () => {
  assert.equal(record.fares, null);
  assert.equal(record.servicePeriod, null);
  // What the page says instead is the feed's own title, which the record quotes.
  assert.ok(record.note.includes(DIU_BUS_FEED_TITLE));
  assert.ok(record.note.includes(DIU_BUS_FEED_SEMESTER.replace(' ', '-')));
});

test('the feed link and the day it was read are the ones the campus database cites', () => {
  const source = sources.records.find((s) => s.id === record.source);
  assert.ok(source, `no source '${record.source}'`);
  assert.equal(DIU_BUS_FEED_URL, source.url);
  assert.equal(DIU_BUS_CHECKED_ON, source.retrieved);
  assert.ok(record.note.includes(DIU_BUS_CHECKED_ON));
  assert.match(DIU_BUS_PAGE_URL, /^https:\/\/daffodilvarsity\.edu\.bd\//);
});

test('route ids are unique, URL-safe and resolvable', () => {
  const ids = DIU_BUS_ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]+$/);
    assert.equal(route(id).id, id);
  }
  assert.equal(route('uttara'), null);
  assert.equal(route(null), null);
});

test('every route belongs to a listed service, and every service has routes', () => {
  const listed = DIU_BUS_SERVICES.map((s) => s.id);
  assert.deepEqual(listed, ['regular', 'shuttle', 'friday']);
  const counts = Object.fromEntries(listed.map((id) => [id, 0]));
  for (const r of DIU_BUS_ROUTES) {
    assert.ok(listed.includes(r.service), `${r.name}: ${r.service}`);
    counts[r.service] += 1;
  }
  assert.deepEqual(counts, { regular: 10, shuttle: 5, friday: 5 });
});

test('every route ends at the campus', () => {
  for (const r of DIU_BUS_ROUTES) {
    assert.match(r.stops[r.stops.length - 1], /Daffodil Smart City/, r.name);
  }
});

test('every time is a 24-hour HH:MM the formatter can read', () => {
  for (const r of DIU_BUS_ROUTES) {
    for (const time of [...r.towardsCampus, ...r.fromCampus]) {
      assert.match(time, /^([01]\d|2[0-3]):[0-5]\d$/, `${r.name}: ${time}`);
      assert.match(formatDiuBusTime(time), /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/);
    }
  }
  assert.equal(formatDiuBusTime('13:30'), '1:30 PM');
  assert.equal(formatDiuBusTime('07:00'), '7:00 AM');
  assert.equal(formatDiuBusTime('soon'), 'soon');
});

test('no bus leaves campus before a bus has set off for it', () => {
  // The Friday routes are where the feed printed 02:20 for 14:20; this is the
  // check that a 12-hour value has not slipped back in.
  for (const r of DIU_BUS_ROUTES) {
    const firstIn = [...r.towardsCampus].sort()[0];
    for (const time of r.fromCampus) {
      assert.ok(time > firstIn, `${r.name}: leaves campus at ${time}, first bus in at ${firstIn}`);
    }
  }
});

test('service days are the days the record does not mark off', () => {
  // The codes are the campus database's own.
  const known = dayCodes.map((d) => d.code).sort().join('');
  for (const r of DIU_BUS_ROUTES) {
    assert.ok([...r.daysOff].every((code) => known.includes(code)), `${r.name}: ${r.daysOff}`);
    assert.equal(diuBusServiceDays(r).length, 7 - r.daysOff.length);
    for (const day of diuBusServiceDays(r)) {
      const code = dayCodes.find((d) => d.day === day).code;
      assert.equal(r.daysOff.includes(code), false, `${r.name} runs on ${day}`);
    }
  }
  assert.equal(formatDiuBusServiceDays(route('dhanmondi')), 'Saturday to Thursday');
  assert.equal(formatDiuBusServiceDays(route('uttara-rajlokkhi')), 'Sunday to Thursday');
  assert.equal(formatDiuBusServiceDays(route('friday-dhanmondi')), 'Friday');
  assert.equal(formatDiuBusServiceDays({ ...route('dhanmondi'), daysOff: 'SW' }), 'Saturday, Monday, Tuesday, Thursday, Friday');
  assert.equal(formatDiuBusServiceDays({ ...route('dhanmondi'), daysOff: 'ASMTWRF' }), 'No service day listed');
});

test('a route label drops the service prefix and evens out the separators', () => {
  assert.equal(diuBusRouteLabel(route('dhanmondi')), 'Dhanmondi ↔ DSC');
  assert.equal(
    diuBusRouteLabel(route('uttara-rajlokkhi')),
    'Uttara - Rajlokkhi ↔ Uttara Metro rail Center ↔ DSC',
  );
  assert.equal(diuBusRouteLabel(route('narayanganj-chasara')), 'Narayanganj Chasara ↔ Dhanmondi ↔ DSC');
  assert.equal(diuBusRouteLabel(route('shuttle-c-b')), 'C&B ↔ DSC');
  assert.equal(diuBusRouteLabel(route('friday-savar')), 'Savar ↔ Nabinagar ↔ C&B ↔ DSC');
  // A route the feed names by its first stop alone is left as it is.
  assert.equal(diuBusRouteLabel(route('mugha-medical-college')), 'Mugha Medical College');
  for (const r of DIU_BUS_ROUTES) assert.doesNotMatch(diuBusRouteLabel(r), /[<>]|Schedule|Shuttle\s*:/);
});
