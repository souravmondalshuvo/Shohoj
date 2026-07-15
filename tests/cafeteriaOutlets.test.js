/**
 * tests/cafeteriaOutlets.test.js
 * Constraints over the cafeteria guide data (#373) and its open/closed-now
 * helper. Two jobs: (1) schema tripwires so a malformed outlet fails here
 * rather than shipping, including the data-honesty rule that NO menu/price
 * field exists; (2) behaviour of outletStatusNow across verified/unverified,
 * open, closed-earlier and closed-until-tomorrow cases.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CAFETERIA_OUTLETS,
    outletTimeToMinutes,
    outletStatusNow,
    outletKindLabel,
    findOutlet,
} from '../src/core/cafeteriaOutlets.ts';

const FORBIDDEN_MENU_KEYS = ['menu', 'dish', 'price', 'meal', 'dishes', 'items', 'prices'];
const VALID_KINDS = new Set(['cafeteria', 'cafe', 'canteen', 'kiosk']);

test('outlets have unique ids, valid kinds, a 7-day hours grid and no menu fields', () => {
    assert.ok(CAFETERIA_OUTLETS.length > 0);
    assert.equal(new Set(CAFETERIA_OUTLETS.map((o) => o.id)).size, CAFETERIA_OUTLETS.length);
    for (const outlet of CAFETERIA_OUTLETS) {
        assert.ok(VALID_KINDS.has(outlet.kind), `${outlet.id} kind`);
        assert.ok(Number.isInteger(outlet.floor) && outlet.floor > 0, `${outlet.id} floor`);
        assert.equal(outlet.hours.length, 7, `${outlet.id} hours length`);
        assert.ok(Array.isArray(outlet.payment) && outlet.payment.length > 0, `${outlet.id} payment`);
        assert.equal(typeof outlet.verified, 'boolean', `${outlet.id} verified`);
        // Data-honesty tripwire: no menu-of-the-day style field may exist.
        for (const key of Object.keys(outlet)) {
            assert.ok(!FORBIDDEN_MENU_KEYS.includes(key.toLowerCase()), `${outlet.id} has forbidden field ${key}`);
        }
        // Every declared interval must be parseable and open-before-close.
        for (const day of outlet.hours) {
            for (const interval of day) {
                const open = outletTimeToMinutes(interval.open);
                const close = outletTimeToMinutes(interval.close);
                assert.ok(open !== null, `${outlet.id} bad open ${interval.open}`);
                assert.ok(close !== null, `${outlet.id} bad close ${interval.close}`);
                assert.ok(close > open, `${outlet.id} interval not increasing ${interval.open}-${interval.close}`);
            }
        }
    }
});

test('outletTimeToMinutes parses 12-hour times and rejects junk', () => {
    assert.equal(outletTimeToMinutes('12:00 AM'), 0);
    assert.equal(outletTimeToMinutes('8:00 AM'), 8 * 60);
    assert.equal(outletTimeToMinutes('12:00 PM'), 12 * 60);
    assert.equal(outletTimeToMinutes('8:30 PM'), 20 * 60 + 30);
    assert.equal(outletTimeToMinutes('13:00 PM'), null);
    assert.equal(outletTimeToMinutes('nope'), null);
});

test('outletKindLabel and findOutlet', () => {
    assert.equal(outletKindLabel('cafe'), 'Café');
    assert.equal(outletKindLabel('cafeteria'), 'Cafeteria');
    assert.equal(findOutlet(CAFETERIA_OUTLETS[0].id.toUpperCase()).id, CAFETERIA_OUTLETS[0].id);
    assert.equal(findOutlet('does-not-exist'), null);
    assert.equal(findOutlet(null), null);
});

// A Thursday. getDay(): Thu = 4, Fri = 5.
const thursday = (h, m = 0) => new Date(2026, 6, 16, h, m); // 2026-07-16 is a Thursday
const friday = (h, m = 0) => new Date(2026, 6, 17, h, m);

function fixture(overrides = {}) {
    const openBlock = [{ open: '8:00 AM', close: '8:00 PM' }];
    return {
        id: 'x', name: 'X', kind: 'cafeteria', floor: 2, zone: null,
        locationNote: '', payment: ['Cash'], verified: true,
        // Sun..Sat; Thu open, Fri closed
        hours: [openBlock, openBlock, openBlock, openBlock, openBlock, [], openBlock],
        ...overrides,
    };
}

test('unverified outlets always report unconfirmed, never a status', () => {
    const status = outletStatusNow(fixture({ verified: false }), thursday(12));
    assert.equal(status.state, 'unconfirmed');
});

test('open now returns closing time', () => {
    const status = outletStatusNow(fixture(), thursday(12));
    assert.equal(status.state, 'open');
    assert.equal(status.closesAt, '8:00 PM');
});

test('before opening today: closed, opens later today', () => {
    const status = outletStatusNow(fixture(), thursday(7));
    assert.equal(status.state, 'closed');
    assert.equal(status.opensAt, '8:00 AM');
    assert.equal(status.opensDay, 'today');
});

test('after closing today: closed until tomorrow (next day open)', () => {
    const openBlock = [{ open: '8:00 AM', close: '8:00 PM' }];
    const allOpen = fixture({ hours: Array.from({ length: 7 }, () => openBlock) });
    const status = outletStatusNow(allOpen, thursday(21));
    assert.equal(status.state, 'closed');
    assert.equal(status.opensAt, '8:00 AM');
    assert.equal(status.opensDay, 'tomorrow');
});

test('next opening two or more days out names the weekday', () => {
    const openBlock = [{ open: '8:00 AM', close: '8:00 PM' }];
    // Closed Fri (5) and Sat (6); from Friday the next open is Sunday (0).
    const hours = [openBlock, openBlock, openBlock, openBlock, openBlock, [], []];
    const status = outletStatusNow(fixture({ hours }), friday(12));
    assert.equal(status.state, 'closed');
    assert.equal(status.opensAt, '8:00 AM');
    assert.equal(status.opensDay, 'Sunday');
});

test('midday-break interval: closed during the break, open after', () => {
    const broken = fixture({
        hours: Array.from({ length: 7 }, () => [
            { open: '8:00 AM', close: '1:00 PM' },
            { open: '2:00 PM', close: '8:00 PM' },
        ]),
    });
    assert.equal(outletStatusNow(broken, thursday(13, 30)).state, 'closed');
    assert.equal(outletStatusNow(broken, thursday(15)).state, 'open');
});
