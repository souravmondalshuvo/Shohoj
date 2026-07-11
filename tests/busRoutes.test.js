/**
 * tests/busRoutes.test.js
 * Sanity constraints over the transcribed bus timetable (#372). These are
 * transcription tripwires: a mistyped time or a dropped stop breaks a
 * monotonicity/completeness rule here rather than shipping silently.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BUS_ROUTES,
    BUS_CONTACTS,
    BUS_GENERAL_INSTRUCTIONS,
    busTimeToMinutes,
    isBusServiceDay,
    findBusRoute,
} from '../src/core/busRoutes.ts';

const ARRIVAL = 'BRAC University (arrival time)';

test('twelve route variants across route numbers 1-8, unique ids and phones', () => {
    assert.equal(BUS_ROUTES.length, 12);
    assert.deepEqual(
        [...new Set(BUS_ROUTES.map((r) => r.routeNo))].sort((a, b) => a - b),
        [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(new Set(BUS_ROUTES.map((r) => r.id)).size, 12);
    assert.equal(new Set(BUS_ROUTES.map((r) => r.attendantPhone)).size, 12);
    for (const route of BUS_ROUTES) {
        assert.match(route.attendantPhone, /^\d{5}-\d{6}$/, route.id);
    }
});

test('every variant ends at BRAC University with parseable, increasing pickup times', () => {
    for (const route of BUS_ROUTES) {
        assert.ok(route.inbound.length >= 2, route.id);
        assert.equal(route.inbound.at(-1).name, ARRIVAL, route.id);

        for (const trip of ['firstTrip', 'secondTrip']) {
            const times = route.inbound.map((s) => s[trip]);
            // A trip either serves every stop or none (no holes mid-route).
            const present = times.filter((t) => t !== null);
            assert.ok(
                present.length === 0 || present.length === times.length,
                `${route.id} ${trip} has holes`,
            );
            const minutes = present.map((t) => busTimeToMinutes(t));
            for (let i = 0; i < minutes.length; i++) {
                assert.ok(minutes[i] !== null, `${route.id} ${trip} unparseable: ${present[i]}`);
                if (i > 0) {
                    assert.ok(
                        minutes[i] > minutes[i - 1],
                        `${route.id} ${trip} not increasing at ${present[i]}`,
                    );
                }
            }
        }
        // The 1st trip always exists.
        assert.ok(route.inbound.every((s) => s.firstTrip !== null), route.id);
    }
});

test('every variant has an afternoon outbound; all outbound times are PM departures', () => {
    for (const route of BUS_ROUTES) {
        assert.ok(route.outbound.second !== null, `${route.id} missing 2nd outbound`);
        for (const key of ['first', 'second']) {
            const time = route.outbound[key];
            if (time === null) continue;
            const minutes = busTimeToMinutes(time);
            assert.ok(minutes !== null && minutes >= 12 * 60, `${route.id} outbound ${key}: ${time}`);
        }
    }
});

test('fares follow the brochure: standard 110/220, Narayanganj 160/320, Bashundhara 50/100', () => {
    for (const route of BUS_ROUTES) {
        assert.equal(route.fareRoundTrip, route.fareOneWay * 2, route.id);
        if (route.id === 'narayanganj') assert.equal(route.fareOneWay, 160);
        else if (route.id === 'bashundhara') assert.equal(route.fareOneWay, 50);
        else assert.equal(route.fareOneWay, 110, route.id);
    }
});

test('single-trip variants match the brochure (Abdullahpur-B, Jigatola-B, Narayanganj)', () => {
    const singleTrip = BUS_ROUTES
        .filter((r) => r.inbound.every((s) => s.secondTrip === null))
        .map((r) => r.id)
        .sort();
    assert.deepEqual(singleTrip, ['abdullahpur-b', 'jigatola-b', 'narayanganj']);
    // Those same variants have no early (2 PM) outbound.
    for (const id of singleTrip) {
        assert.equal(findBusRoute(id).outbound.first, null, id);
    }
});

test('busTimeToMinutes handles meridiem edges and rejects junk', () => {
    assert.equal(busTimeToMinutes('6:40 AM'), 6 * 60 + 40);
    assert.equal(busTimeToMinutes('2:05 PM'), 14 * 60 + 5);
    assert.equal(busTimeToMinutes('12:15 PM'), 12 * 60 + 15);
    assert.equal(busTimeToMinutes('12:05 AM'), 5);
    assert.equal(busTimeToMinutes(null), null);
    assert.equal(busTimeToMinutes('25:00 AM'), null);
    assert.equal(busTimeToMinutes('7:30'), null);
});

test('service runs Saturday-Thursday, off on Friday', () => {
    assert.equal(isBusServiceDay(5), false); // Friday
    for (const day of [0, 1, 2, 3, 4, 6]) assert.equal(isBusServiceDay(day), true);
});

test('findBusRoute is forgiving about case and unknown ids', () => {
    assert.equal(findBusRoute('MIRPUR-A')?.name, 'Mirpur-A');
    assert.equal(findBusRoute('nope'), null);
    assert.equal(findBusRoute(null), null);
});

test('contacts and instructions transcribed', () => {
    assert.equal(BUS_CONTACTS.length, 2);
    assert.ok(BUS_CONTACTS.every((c) => c.email.endsWith('@bracu.ac.bd')));
    assert.ok(BUS_GENERAL_INSTRUCTIONS.length >= 10);
});
