/**
 * tests/campusFeatures.test.js
 * Which calculator tabs each campus gets on the legacy page (#808), and that
 * the map behind it cannot drift from the page or from the registry.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CALC_TAB_FEATURES,
  campusAllowsFeature,
  campusAllowsTab,
  campusPageHref,
  campusTabIds,
} from '../js/core/campusFeatures.js';
import { UNIVERSITIES } from '../js/core/university.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const INDEX_HTML = read('index.html');
const MAIN_JS = read('js/main.js');

test('BRACU keeps every tab', () => {
  assert.deepEqual(campusTabIds(UNIVERSITIES.bracu), Object.keys(CALC_TAB_FEATURES));
});

test('NSU gets the tabs it has data for, and only those', () => {
  assert.deepEqual(campusTabIds(UNIVERSITIES.nsu), [
    'calculator',
    'planner',
    'playground',
    'routine',
    'reviews',
    'papers',
    'freerooms',
    'campus',
    'groups',
  ]);
});

test('the Free Rooms tab follows the rooms feature', () => {
  assert.equal(CALC_TAB_FEATURES.freerooms, 'rooms');
  assert.equal(campusAllowsTab(UNIVERSITIES.bracu, 'freerooms'), true);
  // The registry does not list rooms for NSU; this page grants the tab from
  // the section snapshot (next test).
  assert.equal(UNIVERSITIES.nsu.features.includes('rooms'), false);
});

test('an unknown tab id is refused for every campus', () => {
  assert.equal(campusAllowsTab(UNIVERSITIES.bracu, 'advising'), false);
  assert.equal(campusAllowsTab(UNIVERSITIES.nsu, 'advising'), false);
});

test('no campus is refused outright', () => {
  assert.equal(campusAllowsTab(null, 'calculator'), false);
});

test('every tab on the page has a feature, and every mapped tab is on the page', () => {
  // A tab added to index.html without an entry here would be hidden for
  // everyone, BRACU included; an entry with no tab would be dead weight.
  const start = INDEX_HTML.indexOf('id="calcTabs"');
  const end = INDEX_HTML.indexOf('TAB 1: CALCULATOR');
  assert.ok(start > 0 && end > start, 'found the tab bar in index.html');
  const onPage = [...INDEX_HTML.slice(start, end).matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...onPage].sort(), Object.keys(CALC_TAB_FEATURES).sort());
});

test('the map covers exactly the tabs main.js can switch to', () => {
  const block = MAIN_JS.match(/const TAB_MAP = \{([\s\S]*?)\};/);
  assert.ok(block, 'found TAB_MAP in js/main.js');
  const switchable = [...block[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]);
  assert.deepEqual([...switchable].sort(), Object.keys(CALC_TAB_FEATURES).sort());
});

test('every feature the page names is one the registry knows', () => {
  const known = new Set(Object.values(UNIVERSITIES).flatMap((u) => u.features));
  const named = [...INDEX_HTML.matchAll(/data-feature="([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(named.length >= 3, 'the nav Tasks link and the two standalone-page links');
  for (const feature of [...named, ...Object.values(CALC_TAB_FEATURES)]) {
    assert.ok(known.has(feature), `"${feature}" is not a registry feature`);
  }
});

test("DIU's calculator and playground are granted by this page, not by the shared registry", () => {
  // DIU has no course catalogue, so its students type credits, and only this
  // page's calculator has a field for them. In the registry these features
  // would switch on the shell's calculator and degree tracker, which read
  // BRAC University's catalogue and programs.
  for (const feature of ['calculator', 'playground', 'degree']) {
    assert.equal(UNIVERSITIES.diu.features.includes(feature), false, `${feature} is not in DIU's registry features`);
  }
  assert.deepEqual(campusTabIds(UNIVERSITIES.diu), ['calculator', 'playground']);
  // By name, for DIU alone: nothing else comes with them.
  assert.equal(campusAllowsTab(UNIVERSITIES.diu, 'planner'), false);
  assert.equal(campusAllowsTab(UNIVERSITIES.diu, 'toString'), false);
  assert.equal(campusAllowsTab({ ...UNIVERSITIES.diu, id: 'elsewhere' }, 'calculator'), false);
});

test('Routine and Free Rooms are granted to NSU by this page, not by the shared registry', () => {
  // The registry's features also switch the React shell's routes on, and the
  // shell's Routine route still reads BRACU's feed. Until it does not, the
  // registry must not list it for NSU — the legacy page grants the tab itself
  // because it has NSU's sections (js/core/activeFeed.js).
  assert.equal(UNIVERSITIES.nsu.features.includes('routine'), false);
  assert.equal(campusAllowsTab(UNIVERSITIES.nsu, 'routine'), true);
  // Free Rooms is read off the same sections.
  assert.equal(campusAllowsTab(UNIVERSITIES.nsu, 'freerooms'), true);
  // Seats is not: a snapshot carries no seat counts.
  assert.equal(campusAllowsTab(UNIVERSITIES.nsu, 'seats'), false);
});

test('the Campus Map is a tab, and NSU\'s is granted by this page', () => {
  // `campus` in NSU's registry features would switch on the shell's /campus
  // route, which shows BRAC University's tower. The tab here mounts NSU's own
  // buildings, so this page grants it — as a tab, not as a link out.
  assert.equal(UNIVERSITIES.nsu.features.includes('campus'), false);
  assert.equal(campusAllowsTab(UNIVERSITIES.nsu, 'campus'), true);
  assert.equal(campusAllowsTab(UNIVERSITIES.bracu, 'campus'), true);
  assert.equal(campusAllowsFeature(UNIVERSITIES.nsu, 'campus'), false);
  assert.ok(INDEX_HTML.includes('data-tab="campus"'));
  assert.equal(INDEX_HTML.includes('href="campus/"'), false, 'no link out to the standalone page');
  // The module the tab mounts picks NSU's map from the campus it is handed.
  const embed = read('campus/embed.tsx');
  assert.ok(embed.includes("options.campus === 'nsu'"));
});

test('Bus is NSU\'s on this site, and the other BRACU pages are not', () => {
  // Granted here, not in the registry: `bus` there would switch on the shell's
  // /bus route, which shows BRAC University's timetable.
  assert.equal(UNIVERSITIES.nsu.features.includes('bus'), false);
  assert.equal(campusAllowsFeature(UNIVERSITIES.nsu, 'bus'), true);
  assert.equal(campusAllowsFeature(UNIVERSITIES.nsu, 'lostFound'), false);
  // DIU has a bus page of its own, and no map.
  assert.equal(UNIVERSITIES.diu.features.includes('bus'), false);
  assert.equal(campusAllowsFeature(UNIVERSITIES.diu, 'bus'), true);
  assert.equal(campusAllowsFeature(UNIVERSITIES.diu, 'campus'), false);
  assert.equal(campusAllowsFeature(UNIVERSITIES.nsu, 'tasks'), false);
  for (const feature of ['bus', 'campus', 'lostFound', 'tasks']) {
    assert.equal(campusAllowsFeature(UNIVERSITIES.bracu, feature), true, feature);
  }
  assert.equal(campusAllowsFeature(null, 'bus'), false);
  assert.equal(campusAllowsFeature(UNIVERSITIES.nsu, 'constructor'), false);
});

test('a multi-campus page link carries the campus, except for the default one', () => {
  assert.equal(campusPageHref('bus/', 'bracu', 'bracu'), 'bus/');
  assert.equal(campusPageHref('bus/', 'nsu', 'bracu'), 'bus/?campus=nsu');
  // The page must read the same parameter the link writes.
  const route = readFileSync(new URL('../src/app/routes/BusRoute.tsx', import.meta.url), 'utf8');
  assert.ok(route.includes("searchParams.get('campus') === 'nsu'"));
  assert.equal(campusPageHref('bus/', 'diu', 'bracu'), 'bus/?campus=diu');
  assert.ok(route.includes("searchParams.get('campus') === 'diu'"));
  // And the link on the page declares the path this builds from.
  assert.ok(INDEX_HTML.includes('data-feature="bus" data-campus-href="bus/"'));
});
