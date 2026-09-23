// worker/test/calendarFeedHandlers.test.js
//
// Minting, rotating and revoking a feed (#744).
//
// The failure here is asymmetric, and that is what most of these are about. A
// forward pointer with no reverse doc is a dead link — annoying. A reverse doc
// with no forward pointer is a LIVE URL the student can no longer see or
// revoke, which is the one outcome this feature must never produce.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCalendarFeed,
  deleteCalendarFeed,
  getCalendarFeed,
} from '../calendarFeedHandlers.js';

const UID = 'uid_alice';
const ORIGIN = 'https://worker.example';

/** An in-memory Firestore, recording the order writes happened in. */
function fakeStore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const writes = [];
  return {
    docs,
    writes,
    deps: {
      getDoc: async (path) => docs.get(path) ?? null,
      patchDoc: async (path, fields) => {
        writes.push({ op: 'patch', path });
        docs.set(path, { ...(docs.get(path) ?? {}), ...fields });
      },
      deleteDoc: async (path) => {
        writes.push({ op: 'delete', path });
        docs.delete(path);
      },
    },
  };
}

let counter = 0;
function ctxFor(store) {
  counter = 0;
  return {
    deps: store.deps,
    firebaseUid: UID,
    feedOrigin: ORIGIN,
    // Deterministic "randomness", so a test can name the token it expects.
    randomHex: () => String(++counter).padStart(32, '0'),
    now: () => new Date('2026-09-23T08:00:00.000Z'),
  };
}

const userPath = `shohojUsers/${UID}`;
const feedPath = (token) => `calendarFeeds/${token}`;

// ── Reading ─────────────────────────────────────────────────────────────────

test('a student with no feed has none', async () => {
  const store = fakeStore({ [userPath]: {} });
  const result = await getCalendarFeed(ctxFor(store));

  assert.deepEqual(result.body, { feed: null });
});

test('a forward pointer whose reverse doc is gone reports no feed', async () => {
  // The URL is already dead. Handing it back would be a link that 404s.
  const store = fakeStore({ [userPath]: { calendarFeedToken: 'cft_' + 'a'.repeat(32) } });
  const result = await getCalendarFeed(ctxFor(store));

  assert.deepEqual(result.body, { feed: null });
});

// ── Minting ─────────────────────────────────────────────────────────────────

test('minting returns an absolute URL the student can paste', async () => {
  const store = fakeStore({ [userPath]: {} });
  const result = await createCalendarFeed(ctxFor(store));

  assert.match(result.body.feed.url, /^https:\/\/worker\.example\/feeds\/tasks\/cft_[0-9a-f]{32}\.ics$/);
  assert.equal(result.body.feed.createdAt, '2026-09-23T08:00:00.000Z');
});

test('minting writes both documents, reverse first', async () => {
  // A failure between the two must leave a dead link, never a live orphan.
  const store = fakeStore({ [userPath]: {} });
  await createCalendarFeed(ctxFor(store));

  assert.equal(store.writes.length, 2);
  assert.match(store.writes[0].path, /^calendarFeeds\//);
  assert.equal(store.writes[1].path, userPath);
});

test('the reverse document records whose feed it is', async () => {
  const store = fakeStore({ [userPath]: {} });
  const { body } = await createCalendarFeed(ctxFor(store));
  const token = /tasks\/(cft_[0-9a-f]{32})\.ics/.exec(body.feed.url)[1];

  assert.equal(store.docs.get(feedPath(token)).firebaseUid, UID);
});

test('a minted feed reads back', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  const minted = await createCalendarFeed(ctx);

  assert.deepEqual((await getCalendarFeed(ctx)).body, minted.body);
});

// ── Rotation is the revocation story ────────────────────────────────────────

test('rotating replaces the URL and kills the old one', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);

  const first = await createCalendarFeed(ctx);
  const firstToken = /tasks\/(cft_[0-9a-f]{32})\.ics/.exec(first.body.feed.url)[1];
  const second = await createCalendarFeed(ctx);

  assert.notEqual(second.body.feed.url, first.body.feed.url);
  assert.equal(store.docs.has(feedPath(firstToken)), false, 'the old URL must stop resolving');
});

test('rotation deletes the old document LAST', async () => {
  // The new feed has to be live before the old one dies, or a failure between
  // them leaves the student with no working URL at all.
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);

  await createCalendarFeed(ctx);
  store.writes.length = 0;
  await createCalendarFeed(ctx);

  assert.equal(store.writes.at(-1).op, 'delete');
  assert.match(store.writes[0].path, /^calendarFeeds\//);
  assert.equal(store.writes[0].op, 'patch');
});

test('only one feed is ever live for a student', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);

  await createCalendarFeed(ctx);
  await createCalendarFeed(ctx);
  await createCalendarFeed(ctx);

  const live = [...store.docs.keys()].filter((k) => k.startsWith('calendarFeeds/'));
  assert.equal(live.length, 1);
});

// ── Revoking ────────────────────────────────────────────────────────────────

test('revoking kills the URL and clears the pointer', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  const { body } = await createCalendarFeed(ctx);
  const token = /tasks\/(cft_[0-9a-f]{32})\.ics/.exec(body.feed.url)[1];

  const result = await deleteCalendarFeed(ctx);

  assert.deepEqual(result.body, { feed: null });
  assert.equal(store.docs.has(feedPath(token)), false);
  assert.equal(store.docs.get(userPath).calendarFeedToken, '');
});

test('revoking deletes the reverse document FIRST', async () => {
  // That is what actually kills the URL; clearing the pointer is bookkeeping.
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);
  store.writes.length = 0;

  await deleteCalendarFeed(ctx);

  assert.equal(store.writes[0].op, 'delete');
  assert.match(store.writes[0].path, /^calendarFeeds\//);
});

test('revoking a feed that does not exist is a success, not a 404', async () => {
  // A student clicking twice should not get an error for getting what they
  // asked for.
  const store = fakeStore({ [userPath]: {} });
  const result = await deleteCalendarFeed(ctxFor(store));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { feed: null });
  assert.equal(store.writes.length, 0, 'and it writes nothing');
});

test('revoking twice is still a success', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);

  assert.equal((await deleteCalendarFeed(ctx)).status, 200);
  assert.equal((await deleteCalendarFeed(ctx)).status, 200);
});

// ── Identity ────────────────────────────────────────────────────────────────

test('identity is not an input to the token', async () => {
  // Stated as the inverse, which is the form that actually tests it: hold the
  // randomness fixed, change who is asking, and the token does not move. A
  // token that shifted with the uid would be one derived from it — and a
  // derived token cannot be revoked without changing who the student is.
  const fixed = () => 'f'.repeat(32);

  const a = fakeStore({ [userPath]: {} });
  const b = fakeStore({ ['shohojUsers/uid_bob']: {} });

  const urlA = (await createCalendarFeed({ ...ctxFor(a), randomHex: fixed })).body.feed.url;
  const urlB = (
    await createCalendarFeed({ ...ctxFor(b), firebaseUid: 'uid_bob', randomHex: fixed })
  ).body.feed.url;

  assert.equal(urlA, urlB);
  assert.match(urlA, /cft_f{32}/);
});

test('different randomness gives different feeds', async () => {
  // The other half: the token is a function of the entropy it was handed, so
  // two mints never collide.
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);

  const first = (await createCalendarFeed(ctx)).body.feed.url;
  const second = (await createCalendarFeed(ctx)).body.feed.url;

  assert.notEqual(first, second);
});
