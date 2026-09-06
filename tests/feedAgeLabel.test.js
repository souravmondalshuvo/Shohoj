// tests/feedAgeLabel.test.js — the feed-freshness ladder legacy carries twice
// (_frAgeLabel in js/ui/freeRoomsTab.js, _seatsAgeLabel in js/ui/seatsTab.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  feedAgeLabel,
  feedSourceHasAge,
  feedSourceLabel,
  FEED_SOURCE_LABEL,
} from '../src/core/feedFreshness.ts';

const NOW = Date.parse('2026-08-25T12:00:00Z');
const ago = (ms) => NOW - ms;

test('a missing timestamp reads as fresh rather than as an error', () => {
  assert.equal(feedAgeLabel(null, NOW), 'just now');
  assert.equal(feedAgeLabel(undefined, NOW), 'just now');
  assert.equal(feedAgeLabel(0, NOW), 'just now');
});

test('under a minute is "just now"', () => {
  assert.equal(feedAgeLabel(ago(59_000), NOW), 'just now');
});

test('minutes below the hour, floored', () => {
  assert.equal(feedAgeLabel(ago(60_000), NOW), '1 min ago');
  assert.equal(feedAgeLabel(ago(59 * 60_000 + 59_000), NOW), '59 min ago');
});

test('hours below the day, floored', () => {
  assert.equal(feedAgeLabel(ago(3_600_000), NOW), '1 hr ago');
  assert.equal(feedAgeLabel(ago(23 * 3_600_000), NOW), '23 hr ago');
});

test('a day or more falls back to an absolute stamp', () => {
  const stamp = feedAgeLabel(ago(86_400_000), NOW);
  assert.equal(/ago$/.test(stamp), false);
  assert.equal(stamp, new Date(ago(86_400_000)).toLocaleString());
});

test('the source labels are legacy\'s', () => {
  assert.equal(FEED_SOURCE_LABEL.live, 'Live');
  assert.equal(FEED_SOURCE_LABEL.cache, 'Cached');
  assert.equal(FEED_SOURCE_LABEL.fallback, 'Offline cache');
});

test('an archived semester is not a feed origin, and says so', () => {
  assert.equal(FEED_SOURCE_LABEL.archive, 'Archived');
  assert.equal(feedSourceLabel('archive'), 'Archived');
});

test('only the archive withholds an age, because only its age is meaningless', () => {
  // The bug: an archive fetch is a live network hit, so the badge read
  // "Live · just now" over a semester CONNECT had already dropped.
  assert.equal(feedSourceHasAge('archive'), false);
  for (const source of ['live', 'cache', 'fallback', 'imported']) {
    assert.equal(feedSourceHasAge(source), true, source);
  }
});

test('an unknown source falls back to legacy\'s em dash', () => {
  assert.equal(feedSourceLabel('live'), 'Live');
  assert.equal(feedSourceLabel(null), '—');
  assert.equal(feedSourceLabel('nonsense'), '—');
});
