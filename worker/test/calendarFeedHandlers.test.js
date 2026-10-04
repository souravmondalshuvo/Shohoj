// worker/test/calendarFeedHandlers.test.js
//
// Minting, rotating and revoking a feed (#744).
//
// Exercise conditional atomic commits, including interleaved rotations and
// revocation. Reverse documents alone are never credentials.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCalendarFeed,
  deleteCalendarFeed,
  getCalendarFeed,
} from '../calendarFeedHandlers.js';
import { resolveCalendarFeedOwner } from '../calendarFeed.js';

const UID = 'uid_alice';
const ORIGIN = 'https://worker.example';

/** Firestore's atomic preconditions and field masks, without network I/O. */
function fakeStore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const versions = new Map([...docs.keys()].map((path) => [path, 1]));
  const commits = [];
  let conflicts = 0;
  return {
    docs,
    commits,
    get conflicts() { return conflicts; },
    deps: {
      getDoc: async (path) => docs.get(path) ?? null,
      getDocSnapshot: async (path) => {
        if (!docs.has(path)) return null;
        return { fields: structuredClone(docs.get(path)), updateTime: String(versions.get(path)) };
      },
      commitWrites: async (writes) => {
        // Validate every precondition BEFORE applying any write.
        for (const write of writes) {
          if ((write.exists === false && docs.has(write.path)) ||
              (write.updateTime && write.updateTime !== String(versions.get(write.path)))) {
            conflicts++;
            throw Object.assign(new Error('Firestore precondition failed'), { conflict: true });
          }
        }
        commits.push(writes);
        for (const write of writes) {
          if (write.delete) {
            docs.delete(write.path);
          } else {
            docs.set(write.path, { ...(docs.get(write.path) ?? {}), ...write.fields });
          }
          versions.set(write.path, (versions.get(write.path) ?? 0) + 1);
        }
      },
    },
  };
}

function ctxFor(store) {
  let counter = 0;
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

test('minting commits both pointers atomically without replacing the profile', async () => {
  const profile = { email: 'alice@example.edu', university: 'bracu', createdAt: 'old' };
  const store = fakeStore({ [userPath]: profile });
  await createCalendarFeed(ctxFor(store));

  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0].length, 2);
  const ownerWrite = store.commits[0].find((write) => write.path === userPath);
  assert.equal(ownerWrite.updateTime, '1');
  assert.deepEqual(Object.keys(ownerWrite.fields), ['calendarFeedToken']);
  for (const [field, value] of Object.entries(profile)) {
    assert.equal(store.docs.get(userPath)[field], value);
  }
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

test('rotation commits the new pointer and old deletion in the same operation', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);

  await createCalendarFeed(ctx);
  store.commits.length = 0;
  await createCalendarFeed(ctx);

  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0].length, 3);
  assert.equal(store.commits[0].filter((write) => write.delete).length, 1);
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

test('revoking clears the pointer and deletes the reverse document atomically', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);
  store.commits.length = 0;

  await deleteCalendarFeed(ctx);

  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0].length, 2);
  assert.equal(store.commits[0].filter((write) => write.delete).length, 1);
  assert.deepEqual(store.commits[0][0].fields, { calendarFeedToken: '' });
});

test('revoking a feed that does not exist is a success, not a 404', async () => {
  // A student clicking twice should not get an error for getting what they
  // asked for.
  const store = fakeStore({ [userPath]: {} });
  const result = await deleteCalendarFeed(ctxFor(store));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { feed: null });
  assert.equal(store.commits.length, 0, 'and it writes nothing');
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

test('parallel rotations retry stale writes and leave exactly one live credential', async () => {
  const store = fakeStore({ [userPath]: { email: 'alice@example.edu' } });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);

  const results = await Promise.all([createCalendarFeed(ctx), createCalendarFeed(ctx)]);
  assert.ok(store.conflicts > 0, 'the test must force a stale snapshot');
  const tokens = results.map(({ body }) => /tasks\/(cft_[0-9a-f]{32})\.ics/.exec(body.feed.url)[1]);
  const owners = await Promise.all(tokens.map((token) => resolveCalendarFeedOwner(store.deps, token)));
  assert.equal(owners.filter((owner) => owner === UID).length, 1);
  assert.equal([...store.docs.keys()].filter((path) => path.startsWith('calendarFeeds/')).length, 1);
  assert.equal(store.docs.get(userPath).email, 'alice@example.edu');
});

test('revocation racing with a rotation retries and revokes the latest credential', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);

  // Both read the old owner version. Rotation commits first; revocation must
  // reread its new credential rather than clearing the pointer it read earlier.
  await Promise.all([createCalendarFeed(ctx), deleteCalendarFeed(ctx)]);
  assert.ok(store.conflicts > 0);
  assert.equal(store.docs.get(userPath).calendarFeedToken, '');
  assert.equal([...store.docs.keys()].filter((path) => path.startsWith('calendarFeeds/')).length, 0);
});

test('a failed rotation leaves the current feed and profile intact', async () => {
  const store = fakeStore({ [userPath]: { email: 'alice@example.edu' } });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);
  const before = structuredClone([...store.docs]);
  store.deps.commitWrites = async () => { throw new Error('storage unavailable'); };

  await assert.rejects(createCalendarFeed(ctx), /storage unavailable/);
  assert.deepEqual([...store.docs], before);
});

test('a failed revoke reports failure without a partial pointer update', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);
  const before = structuredClone([...store.docs]);
  store.deps.commitWrites = async () => { throw new Error('storage unavailable'); };

  await assert.rejects(deleteCalendarFeed(ctx), /storage unavailable/);
  assert.deepEqual([...store.docs], before);
});

test('a random collision cannot overwrite a different student’s feed', async () => {
  const collision = `cft_${'0'.repeat(31)}1`;
  const store = fakeStore({
    [userPath]: {},
    [feedPath(collision)]: { firebaseUid: 'uid_bob' },
  });
  const { body } = await createCalendarFeed(ctxFor(store));

  assert.equal(store.docs.get(feedPath(collision)).firebaseUid, 'uid_bob');
  assert.ok(!body.feed.url.includes(collision));
  assert.equal(store.conflicts, 1);
});

test('persistent contention is bounded and never reported as a successful revoke', async () => {
  const store = fakeStore({ [userPath]: {} });
  const ctx = ctxFor(store);
  await createCalendarFeed(ctx);
  let attempts = 0;
  store.deps.commitWrites = async () => {
    attempts++;
    throw Object.assign(new Error('precondition failed'), { conflict: true });
  };

  await assert.rejects(deleteCalendarFeed(ctx), /precondition failed/);
  assert.equal(attempts, 5);
  assert.notEqual(store.docs.get(userPath).calendarFeedToken, '');
});

test('GET refuses a reverse document owned by someone else', async () => {
  const token = `cft_${'a'.repeat(32)}`;
  const store = fakeStore({
    [userPath]: { calendarFeedToken: token },
    [feedPath(token)]: { firebaseUid: 'uid_bob' },
  });

  assert.deepEqual((await getCalendarFeed(ctxFor(store))).body, { feed: null });
});

test('minting cannot recreate a missing owner as a token-only profile', async () => {
  const store = fakeStore();
  await assert.rejects(createCalendarFeed(ctxFor(store)), /owner is unavailable/);
  assert.equal(store.commits.length, 0);
});
