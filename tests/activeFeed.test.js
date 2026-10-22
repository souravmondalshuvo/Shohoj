/**
 * tests/activeFeed.test.js
 * Which section feed the Routine tab reads for the campus the page is showing.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// activeCampus.js announces changes on window.
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;

const { setActiveCampusForEmail } = await import('../js/core/activeCampus.js');
const { campusFeedSnapshotHasRooms, campusHasFeedSnapshot, feedSnapshotFor, getActiveFeedSnapshot, pruneFeedSnapshotCaches } = await import('../js/core/activeFeed.js');
const { DEFAULT_CACHE_KEY, DEFAULT_FEED_URL } = await import('../js/core/connectFeedClient.js');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('BRACU is on the live feed: no snapshot', () => {
  assert.equal(campusHasFeedSnapshot('bracu'), false);
  assert.equal(feedSnapshotFor('bracu'), null);
  assert.equal(getActiveFeedSnapshot(), null);
});

test('NSU has a snapshot, with what the tab needs to label it', () => {
  const snapshot = feedSnapshotFor('nsu');
  assert.equal(snapshot.campusId, 'nsu');
  assert.match(snapshot.capturedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(snapshot.semesterSessionId, 20263);
  assert.ok(snapshot.sectionCount > 0);
});

test('a snapshot has its own cache slot and never the live feed’s URL', () => {
  const { fetchOptions } = feedSnapshotFor('nsu');
  assert.notEqual(fetchOptions.cacheKey, DEFAULT_CACHE_KEY);
  assert.notEqual(fetchOptions.url, DEFAULT_FEED_URL);
  assert.ok(fetchOptions.cacheKey.includes('nsu') && fetchOptions.cacheKey.includes('263'));
  // Same-origin and relative: served by this site, from the page's own folder.
  assert.ok(!/^[a-z]+:|^\//i.test(fetchOptions.url));
  assert.ok(existsSync(new URL(`../${fetchOptions.url.split('?')[0]}`, import.meta.url)), 'the file the URL names exists');
  // Nothing changes between deploys, so it is not refetched every ten minutes.
  assert.ok(fetchOptions.ttlMs >= 60 * 60 * 1000);
});

test('DIU has a snapshot too, one that cannot serve Free Rooms', () => {
  const snapshot = feedSnapshotFor('diu');
  assert.equal(snapshot.campusId, 'diu');
  assert.equal(snapshot.semesterSessionId, 20263);
  assert.ok(snapshot.fetchOptions.cacheKey.includes('diu'));
  assert.ok(existsSync(new URL(`../${snapshot.fetchOptions.url.split('?')[0]}`, import.meta.url)), 'the file the URL names exists');
  assert.equal(campusFeedSnapshotHasRooms('diu'), false);
  assert.equal(campusFeedSnapshotHasRooms('nsu'), true);
  assert.equal(campusFeedSnapshotHasRooms('bracu'), false);
});

test('a regenerated snapshot is asked for by revision, never served from an older copy', () => {
  const { revision } = feedSnapshotFor('diu');
  assert.match(revision, /^[0-9a-f]{10}$/);
  const { fetchOptions } = feedSnapshotFor('diu');
  assert.ok(fetchOptions.cacheKey.endsWith(`_${revision}`));
  assert.ok(fetchOptions.url.endsWith(`?v=${revision}`));
});

test('pruning drops snapshots this build no longer serves, and nothing else', () => {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => data.delete(k),
  };
  const current = [feedSnapshotFor('nsu').fetchOptions.cacheKey, feedSnapshotFor('diu').fetchOptions.cacheKey];
  for (const key of [
    ...current,
    'shohoj_campus_feed_nsu_263', // before revisions
    'shohoj_campus_feed_diu_263_0000000000', // an older revision
    'shohoj_campus_feed_nsu_253_1111111111', // an older term
    DEFAULT_CACHE_KEY,
    'shohoj_routine_v1',
  ]) data.set(key, '{}');
  pruneFeedSnapshotCaches(storage);
  assert.deepEqual([...data.keys()].sort(), [...current, DEFAULT_CACHE_KEY, 'shohoj_routine_v1'].sort());
  pruneFeedSnapshotCaches(null); // no storage: a no-op, not a throw
});

test('an unknown campus, or a prototype key, has no snapshot', () => {
  assert.equal(feedSnapshotFor('bubt'), null);
  assert.equal(feedSnapshotFor('constructor'), null);
  assert.equal(feedSnapshotFor('__proto__'), null);
});

test('the active snapshot follows the campus', () => {
  setActiveCampusForEmail('student@northsouth.edu');
  assert.equal(getActiveFeedSnapshot().campusId, 'nsu');
  setActiveCampusForEmail('student@g.bracu.ac.bd');
  assert.equal(getActiveFeedSnapshot(), null);
});

test('the page may fetch from its own origin, and the deploy publishes the feed', () => {
  const csp = read('index.html').match(/connect-src([^;]*);/);
  assert.ok(csp, 'found connect-src in index.html');
  assert.ok(csp[1].split(/\s+/).includes("'self'"), "connect-src lost 'self': the snapshot fetch would be blocked");
  assert.ok(
    read('.github/workflows/ci.yml').includes('cp -R feeds _deploy/feeds'),
    'the Pages deploy no longer copies feeds/ — the snapshot would 404 in production',
  );
});
