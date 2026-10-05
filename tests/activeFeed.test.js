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
const { campusHasFeedSnapshot, feedSnapshotFor, getActiveFeedSnapshot } = await import('../js/core/activeFeed.js');
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
  assert.ok(existsSync(new URL(`../${fetchOptions.url}`, import.meta.url)), 'the file the URL names exists');
  // Nothing changes between deploys, so it is not refetched every ten minutes.
  assert.ok(fetchOptions.ttlMs >= 60 * 60 * 1000);
});

test('an unknown campus, or a prototype key, has no snapshot', () => {
  assert.equal(feedSnapshotFor('diu'), null);
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
