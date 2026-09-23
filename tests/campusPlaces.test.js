/**
 * tests/campusPlaces.test.js
 * Pure tests for the campus place directory (#748): the Campus 360 registry,
 * level labels and grouping, and the ranked place search.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CAMPUS_PLACES,
    BASEMENT_LEVEL,
    GROUND_LEVEL,
    UPPER_ROOF_LEVEL,
    levelLabel,
    placeKindLabel,
    placesByLevel,
    searchPlaces,
    normalizePlaceText,
} from '../src/core/campusPlaces.ts';

const floorOf = (name) => CAMPUS_PLACES.find((p) => p.name === name)?.floor;

test('registry: every Campus 360 level is present, basements through upper roof', () => {
    const floors = placesByLevel().map((level) => level.floor);
    assert.deepEqual(floors, [
        BASEMENT_LEVEL, GROUND_LEVEL, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, UPPER_ROOF_LEVEL,
    ]);
});

test('registry: ids are unique and names are non-empty', () => {
    const ids = CAMPUS_PLACES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const place of CAMPUS_PLACES) {
        assert.ok(place.name.trim().length > 0, place.id);
        assert.match(place.id, /^-?\d+-[a-z0-9-]+$/);
    }
});

test('registry: aliases are lowercase search terms', () => {
    for (const place of CAMPUS_PLACES) {
        for (const alias of place.aliases) {
            assert.equal(alias, alias.toLowerCase(), `${place.id}: ${alias}`);
        }
    }
});

test('registry: spot-checks against Campus 360 floors', () => {
    assert.equal(floorOf('Medical Center'), 1);
    assert.equal(floorOf('Student Information Center'), 2);
    assert.equal(floorOf('Office of Academic Advising (OAA)'), 3);
    assert.equal(floorOf('Office of the Registrar'), 4);
    assert.equal(floorOf('Office of the Controller of Examinations'), 4);
    assert.equal(floorOf('Department of Computer Science and Engineering (CSE)'), 5);
    assert.equal(floorOf('Cafeteria'), 6);
    assert.equal(floorOf('Prayer Room'), 6);
    assert.equal(floorOf('Ayesha Abed Library'), 8);
    assert.equal(floorOf('Gymnasium'), 13);
    assert.equal(floorOf('Jogging Track'), UPPER_ROOF_LEVEL);
    assert.equal(floorOf('Car and Motorbike Parking'), BASEMENT_LEVEL);
});

test('levelLabel: named levels and numbered floors', () => {
    assert.equal(levelLabel(BASEMENT_LEVEL), 'Basements 1–3');
    assert.equal(levelLabel(GROUND_LEVEL), 'Ground floor');
    assert.equal(levelLabel(7), 'Floor 7');
    assert.equal(levelLabel(UPPER_ROOF_LEVEL), 'Upper roof');
});

test('placeKindLabel: covers every kind in the registry', () => {
    for (const place of CAMPUS_PLACES) {
        assert.ok(placeKindLabel(place.kind).length > 0, place.kind);
    }
});

test('normalizePlaceText: lowercases and folds punctuation to single spaces', () => {
    assert.equal(normalizePlaceText('  BRAC Bank & ATM '), 'brac bank atm');
    assert.equal(normalizePlaceText('EEE/ECE Labs'), 'eee ece labs');
    assert.equal(normalizePlaceText('(OAA)'), 'oaa');
});

test('searchPlaces: empty or punctuation-only query matches nothing', () => {
    assert.deepEqual(searchPlaces(''), []);
    assert.deepEqual(searchPlaces('   '), []);
    assert.deepEqual(searchPlaces('&/'), []);
});

test('searchPlaces: a word inside the name finds the place', () => {
    const [first] = searchPlaces('registrar');
    assert.equal(first?.name, 'Office of the Registrar');
    assert.equal(first?.floor, 4);
});

test('searchPlaces: acronyms in parentheses match as words', () => {
    assert.equal(searchPlaces('oaa')[0]?.name, 'Office of Academic Advising (OAA)');
    assert.equal(searchPlaces('OCSAR')[0]?.floor, 3);
});

test('searchPlaces: aliases find everyday words', () => {
    assert.equal(searchPlaces('exam')[0]?.name, 'Office of the Controller of Examinations');
    assert.equal(searchPlaces('namaz')[0]?.name, 'Prayer Room');
    assert.equal(searchPlaces('doctor')[0]?.name, 'Medical Center');
    assert.equal(searchPlaces('gym')[0]?.name, 'Gymnasium');
});

test('searchPlaces: name prefix outranks word prefix, which outranks alias', () => {
    // "Cafeteria" starts with "caf"; "Arabika Coffee" only has the alias "cafe".
    const names = searchPlaces('caf').map((p) => p.name);
    assert.ok(names.indexOf('Cafeteria') < names.indexOf('Arabika Coffee'));
    // "Library" (name prefix) before "Ayesha Abed Library" (word prefix).
    const libs = searchPlaces('library').map((p) => p.name);
    assert.deepEqual(libs.slice(0, 2), ['Library', 'Ayesha Abed Library']);
});

test('searchPlaces: a place listed on several floors returns every floor', () => {
    const floors = searchPlaces('cse/ce labs').map((p) => p.floor);
    assert.deepEqual(floors.slice(0, 2), [11, 12]);
});

test('searchPlaces: substring inside a word is the weakest match', () => {
    // "motorbike" contains "bike" mid-word, but parking also has the alias "bike".
    assert.equal(searchPlaces('bike')[0]?.name, 'Car and Motorbike Parking');
    assert.deepEqual(searchPlaces('zzzz'), []);
});
