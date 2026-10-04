// tests/cloudSyncEngine.test.js — scenario battery for the cloud-sync
// orchestrator (#333). Every legacy sign-in/save/realtime branch runs against
// fakes, asserting the exact side effects: which action fired, what got
// written where, which toast, and whether a reload (applyRemote) happened.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCloudSyncEngine,
  CLOUD_APPLIED_FLAG,
  SKIP_FIRST_SAVE_FLAG,
  STORAGE_KEY,
  LAST_SYNC_KEY,
  UPLOADED_MESSAGE,
  MIGRATED_LOCAL_MESSAGE,
  REMOTE_UPDATE_MESSAGE,
  SAVE_FAILED_MESSAGE,
} from '../src/services/cloudSync/cloudSyncEngine.ts';

function memStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function fakeRepo() {
  const state = { cloud: null, saved: [], deleted: [], failSave: false };
  let snapshotHandler = null;
  return {
    repo: {
      load: async () => state.cloud,
      save: async (_uid, dataJson) => {
        if (state.failSave) throw new Error('offline write');
        state.saved.push(dataJson);
        state.cloud = dataJson;
      },
      subscribe: (_uid, onData) => {
        snapshotHandler = onData;
        return () => {
          snapshotHandler = null;
        };
      },
      remove: async (uid) => state.deleted.push(uid),
    },
    state,
    fire: (data, exists = true) => snapshotHandler?.(data, exists),
    hasListener: () => snapshotHandler !== null,
  };
}

function harness({ local = {}, session = {}, cloud = null, online = true, migrationChoice = 'local', repoOverrides = {}, migrationPrompt } = {}) {
  const { repo, state, fire, hasListener } = fakeRepo();
  state.cloud = cloud;
  const localStore = memStore(local);
  const sessionStore = memStore(session);
  const events = { notify: [], applyRemote: 0, prompts: 0 };
  let clock = 10_000;

  const engine = createCloudSyncEngine({
    repo: { ...repo, ...repoOverrides },
    local: localStore,
    session: sessionStore,
    promptMigration: async () => {
      events.prompts += 1;
      return migrationPrompt ? migrationPrompt() : migrationChoice;
    },
    notify: (kind, message) => events.notify.push([kind, message]),
    applyRemote: () => {
      events.applyRemote += 1;
    },
    isOnline: () => online,
    now: () => clock,
    debounceMs: 50,
    graceMs: 5000,
    remoteApplyDelayMs: 0,
  });

  return {
    engine,
    state,
    fire,
    hasListener,
    events,
    localStore,
    sessionStore,
    advance: (ms) => {
      clock += ms;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const snap = (semesters, extra = {}) => JSON.stringify({ semesters, ...extra });

// ── Sign-in matrix ────────────────────────────────────────────────────────────

test('neither local nor cloud: marks synced, listens, no upload', async () => {
  const h = harness();
  await h.engine.start('u1');
  assert.equal(h.sessionStore.getItem(CLOUD_APPLIED_FLAG), '1');
  assert.deepEqual(h.state.saved, []);
  assert.ok(h.hasListener());
});

test('cloud only: adopts cloud (writes local, reloads), no listener this page', async () => {
  const h = harness({ cloud: snap([{ id: 1 }]) });
  await h.engine.start('u1');
  assert.equal(h.localStore.getItem(STORAGE_KEY), JSON.stringify(JSON.parse(snap([{ id: 1 }]))));
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), '1');
  assert.equal(h.events.applyRemote, 1);
  assert.equal(h.hasListener(), false);
});

test('local only: uploads immediately with the ✓ toast, keeps local, listens', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([{ id: 1 }]) } });
  await h.engine.start('u1');
  assert.deepEqual(h.state.saved, [JSON.stringify(JSON.parse(snap([{ id: 1 }])))]);
  assert.deepEqual(h.events.notify, [['success', UPLOADED_MESSAGE]]);
  assert.equal(h.sessionStore.getItem(CLOUD_APPLIED_FLAG), '1');
  assert.ok(h.hasListener());
  assert.equal(h.events.applyRemote, 0);
});

test('both + identical data: marks synced-equal, does NOT arm skip-first-save', async () => {
  const same = snap([{ id: 1 }], { currentDept: 'CSE' });
  const h = harness({ local: { [STORAGE_KEY]: same }, cloud: same });
  await h.engine.start('u1');
  assert.equal(h.events.prompts, 0);
  assert.equal(h.sessionStore.getItem(CLOUD_APPLIED_FLAG), '1');
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), null); // the load-bearing distinction
  assert.ok(h.hasListener());
});

test('both + cloud-applied flag set: arms skip-echo, no prompt', async () => {
  const h = harness({
    local: { [STORAGE_KEY]: snap([{ id: 1 }]) },
    cloud: snap([{ id: 2 }]),
    session: { [CLOUD_APPLIED_FLAG]: '1' },
  });
  await h.engine.start('u1');
  assert.equal(h.events.prompts, 0);
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), '1');
  assert.ok(h.hasListener());
});

test('both + local has zero semesters: adopts cloud without prompting', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([]) }, cloud: snap([{ id: 9 }]) });
  await h.engine.start('u1');
  assert.equal(h.events.prompts, 0);
  assert.equal(h.events.applyRemote, 1);
});

test('both differ → migration modal → keep local uploads with its toast', async () => {
  const h = harness({
    local: { [STORAGE_KEY]: snap([{ id: 1 }]) },
    cloud: snap([{ id: 2 }, { id: 3 }]),
    migrationChoice: 'local',
  });
  await h.engine.start('u1');
  assert.equal(h.events.prompts, 1);
  assert.deepEqual(h.state.saved, [JSON.stringify(JSON.parse(snap([{ id: 1 }])))]);
  assert.deepEqual(h.events.notify, [['success', MIGRATED_LOCAL_MESSAGE]]);
  assert.equal(h.events.applyRemote, 0);
  assert.ok(h.hasListener());
});

test('both differ → migration modal → keep cloud adopts and reloads', async () => {
  const h = harness({
    local: { [STORAGE_KEY]: snap([{ id: 1 }]) },
    cloud: snap([{ id: 2 }]),
    migrationChoice: 'cloud',
  });
  await h.engine.start('u1');
  assert.equal(h.events.prompts, 1);
  assert.equal(h.events.applyRemote, 1);
  assert.equal(h.hasListener(), false); // reloading
});

// ── Debounced save + echo skip ────────────────────────────────────────────────

test('queueSave debounces and persists the latest snapshot', async () => {
  const h = harness();
  await h.engine.start('u1'); // signed in
  h.engine.queueSave(snap([{ id: 1 }]));
  h.engine.queueSave(snap([{ id: 1 }, { id: 2 }]));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, [snap([{ id: 1 }, { id: 2 }])]); // last wins, one write
  assert.ok(h.localStore.getItem(LAST_SYNC_KEY));
});

test('queueSave consumes skip-first-save exactly once (echo of an applied cloud)', async () => {
  const h = harness({ session: { [SKIP_FIRST_SAVE_FLAG]: '1' } });
  await h.engine.start('u1');
  h.engine.queueSave(snap([{ id: 1 }])); // the echo-back — skipped
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, []);
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), null);
  // The next save goes through.
  h.engine.queueSave(snap([{ id: 2 }]));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, [snap([{ id: 2 }])]);
});

test('queueSave is a no-op while signed out', async () => {
  const h = harness();
  h.engine.queueSave(snap([{ id: 1 }])); // never started
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, []);
});

test('offline save is deferred (data stays local), reported', async () => {
  const h = harness({ online: false });
  await h.engine.start('u1');
  const ok = await h.engine.saveNow(snap([{ id: 1 }]));
  assert.equal(ok, false);
  assert.deepEqual(h.state.saved, []);
});

test('a failed cloud write resets the guard and toasts the fallback copy', async () => {
  const h = harness();
  await h.engine.start('u1');
  h.state.failSave = true;
  const ok = await h.engine.saveNow(snap([{ id: 1 }]));
  assert.equal(ok, false);
  assert.deepEqual(h.events.notify, [['error', SAVE_FAILED_MESSAGE]]);
});

// ── Realtime snapshots ────────────────────────────────────────────────────────

test('realtime: first snapshot ignored; a genuine other-device update applies + reloads', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([{ id: 1 }]) } });
  await h.engine.start('u1'); // local-only upload → listens
  await flush();

  h.fire(snap([{ id: 1 }])); // first snapshot — always ignored
  assert.equal(h.events.applyRemote, 0);

  h.advance(6000); // past the own-write grace window
  h.fire(snap([{ id: 1 }, { id: 2 }])); // real change from another device
  await flush();
  assert.equal(h.localStore.getItem(STORAGE_KEY), snap([{ id: 1 }, { id: 2 }]));
  assert.deepEqual(h.events.notify.at(-1), ['info', REMOTE_UPDATE_MESSAGE]);
  assert.equal(h.events.applyRemote, 1);
});

test('realtime: own-write grace, pending save, and identical data are all ignored', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([{ id: 1 }]) } });
  await h.engine.start('u1');
  await flush();
  h.fire(snap([{ id: 1 }])); // consume the first-snapshot skip

  // Within the grace window after our upload → ignored.
  h.fire(snap([{ id: 9 }]));
  assert.equal(h.events.applyRemote, 0);

  // Past grace but a local save is queued → ignored (don't clobber local).
  h.advance(6000);
  h.engine.queueSave(snap([{ id: 5 }]));
  h.fire(snap([{ id: 9 }]));
  assert.equal(h.events.applyRemote, 0);
  await new Promise((r) => setTimeout(r, 60)); // let the queued save flush

  // Identical fingerprint → ignored.
  h.advance(6000);
  h.fire(h.localStore.getItem(STORAGE_KEY));
  assert.equal(h.events.applyRemote, 0);
});

// ── Sign-out cleanup ──────────────────────────────────────────────────────────

test('stop() detaches the listener, clears queued saves and the applied flag', async () => {
  const h = harness({ session: { [CLOUD_APPLIED_FLAG]: '1' } });
  await h.engine.start('u1');
  await flush();
  h.engine.queueSave(snap([{ id: 1 }]));
  h.engine.stop();
  assert.equal(h.hasListener(), false);
  assert.equal(h.sessionStore.getItem(CLOUD_APPLIED_FLAG), null);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, []); // the queued save was cancelled
});

// ── isCloudCurrent: the gate on sign-out's device wipe (#627) ─────────────────
// Sign-out erases the device, so a wrong "yes" here costs somebody's transcript.
// Every branch that cannot prove the account holds this device's data must
// answer false, and a pending debounced save must get its chance first.

test('isCloudCurrent: true when the account holds the same data', async () => {
  const same = snap([{ id: 1 }], { currentDept: 'CSE' });
  const h = harness({ local: { [STORAGE_KEY]: same }, cloud: same });
  await h.engine.start('u1');
  assert.equal(await h.engine.isCloudCurrent(), true);
});

test('isCloudCurrent: true when the device holds nothing to lose', async () => {
  const h = harness({ cloud: snap([{ id: 1 }]) });
  await h.engine.start('u1');
  assert.equal(await h.engine.isCloudCurrent(), true);
});

test('isCloudCurrent: false when the cloud copy is stale', async () => {
  const same = snap([{ id: 1 }]);
  const h = harness({ local: { [STORAGE_KEY]: same }, cloud: same });
  await h.engine.start('u1');
  await flush();

  // A local write whose cloud save never happened — the debounce was cancelled,
  // the tab was offline at the time, whatever. Nothing is queued to flush, so
  // only the content compare can tell that the account is behind.
  h.localStore.setItem(STORAGE_KEY, snap([{ id: 1 }, { id: 2 }]));
  assert.equal(await h.engine.isCloudCurrent(), false);
});

test('isCloudCurrent: false when the account has no doc at all', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([{ id: 1 }]) } });
  await h.engine.start('u1');
  await flush();
  h.state.cloud = null; // doc deleted from another device
  assert.equal(await h.engine.isCloudCurrent(), false);
});

test('isCloudCurrent: false when offline', async () => {
  const same = snap([{ id: 1 }]);
  const h = harness({ local: { [STORAGE_KEY]: same }, cloud: same, online: false });
  await h.engine.start('u1');
  assert.equal(await h.engine.isCloudCurrent(), false);
});

test('isCloudCurrent: false while signed out', async () => {
  const h = harness({ local: { [STORAGE_KEY]: snap([{ id: 1 }]) } });
  assert.equal(await h.engine.isCloudCurrent(), false);
});

test('isCloudCurrent: pushes the debounced save through before answering', async () => {
  const first = snap([{ id: 1 }]);
  const h = harness({ local: { [STORAGE_KEY]: first }, cloud: first });
  await h.engine.start('u1');
  await flush();

  // Typed seconds ago — still sitting in the debounce window, not in the cloud.
  const typed = snap([{ id: 1 }, { id: 2 }]);
  h.localStore.setItem(STORAGE_KEY, typed);
  h.engine.queueSave(typed);

  assert.equal(await h.engine.isCloudCurrent(), true);
  assert.equal(h.state.cloud, typed); // flushed rather than dropped
});

test('isCloudCurrent: false when the flushed save cannot land', async () => {
  const first = snap([{ id: 1 }]);
  const h = harness({ local: { [STORAGE_KEY]: first }, cloud: first });
  await h.engine.start('u1');
  await flush();

  const typed = snap([{ id: 1 }, { id: 2 }]);
  h.localStore.setItem(STORAGE_KEY, typed);
  h.engine.queueSave(typed);
  h.state.failSave = true;

  assert.equal(await h.engine.isCloudCurrent(), false);
  assert.equal(h.state.cloud, first); // the account still has the older copy
});

test('isCloudCurrent: false when the local snapshot is present but unreadable', async () => {
  // Truncated by a quota error, say. Unreadable is not the same as absent: it
  // is still the only copy of something, so the erase must not be waved through.
  const same = snap([{ id: 1 }]);
  const h = harness({ local: { [STORAGE_KEY]: same }, cloud: same });
  await h.engine.start('u1');
  await flush();
  h.localStore.setItem(STORAGE_KEY, '{"semesters":[{"id"');
  assert.equal(await h.engine.isCloudCurrent(), false);
});

// ── Cross-device restore (#627) ───────────────────────────────────────────────
// The point of putting the routine, watchlist, review receipt and profile in
// the snapshot: a student signs in on a second device and finds their whole
// Shohoj there, not just the calculator. These drive that through the real
// sign-in flow rather than the slice helpers alone.

const FULL_SNAPSHOT = JSON.stringify({
  semesters: [{ id: 1, name: 'Fall 2024' }],
  currentDept: 'CSE',
  routine: { picks: { CSE110: 12 } },
  seatWatches: [{ sectionId: 12, courseCode: 'CSE110' }],
  seatAlertsEnabled: false,
  myReviews: [{ facultyInitials: 'ABC', courseCode: 'CSE110' }],
  profileSnapshot: { studentId: '20101234' },
});

test('a fresh device signing in gets the routine, watchlist and profile too', async () => {
  // Nothing local: the sign-in flow adopts the cloud copy wholesale.
  const h = harness({ cloud: FULL_SNAPSHOT });
  await h.engine.start('u_me');

  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_routine_v1')), {
    picks: { CSE110: 12 },
  });
  // Legacy and the shell name the routine key differently; one student has one
  // routine, so both are written.
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_routine_picks_v1')), {
    picks: { CSE110: 12 },
  });
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_seat_watch_v1')), [
    { sectionId: 12, courseCode: 'CSE110' },
  ]);
  assert.equal(h.localStore.getItem('shohoj_seat_alerts_enabled'), '0');
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_connect_profile_v1')), {
    studentId: '20101234',
  });
  // The receipt is keyed by uid — a browser can be shared.
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_my_reviews_v1')), {
    u_me: [{ facultyInitials: 'ABC', courseCode: 'CSE110' }],
  });
  assert.equal(h.events.applyRemote, 1); // adopted, then reloads
});

test('an edit on another device brings the routine across in realtime', async () => {
  const before = JSON.stringify({ semesters: [{ id: 1 }], routine: { picks: {} } });
  const h = harness({ local: { [STORAGE_KEY]: before }, cloud: before });
  await h.engine.start('u_me');
  await flush();

  h.fire(before); // the listener's first snapshot is always the current state
  h.advance(6000); // past the own-write grace window
  h.fire(JSON.stringify({ semesters: [{ id: 1 }], routine: { picks: { MAT110: 4 } } }));
  await flush(); // applyRemote fires on the remote-apply timer

  assert.equal(h.events.applyRemote, 1);
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_routine_v1')), {
    picks: { MAT110: 4 },
  });
});

test('a doc written before these fields existed leaves the device alone', async () => {
  // The upgrade path: an old client's doc must not read as "no routine" and
  // wipe one this device already has.
  const h = harness({
    local: {
      [STORAGE_KEY]: JSON.stringify({ semesters: [{ id: 1 }] }),
      shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
    },
    cloud: JSON.stringify({ semesters: [{ id: 1 }] }),
  });
  await h.engine.start('u_me');
  assert.deepEqual(JSON.parse(h.localStore.getItem('shohoj_routine_v1')), {
    picks: { CSE110: 1 },
  });
});

// A deferred port lets sign-out/account-switch happen at the actual I/O
// boundary, rather than merely testing that stop() clears a timer.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a load finishing after stop cannot restore private data or start a listener', async () => {
  const load = deferred();
  const h = harness({ repoOverrides: { load: () => load.promise } });
  const starting = h.engine.start('alice');
  h.engine.stop();
  load.resolve(FULL_SNAPSHOT);
  await starting;
  assert.equal(h.localStore._map.size, 0);
  assert.equal(h.sessionStore._map.size, 0);
  assert.equal(h.hasListener(), false);
  assert.equal(h.events.applyRemote, 0);
});

test('a stale sign-in load cannot overwrite a new account or its subscription', async () => {
  const load = deferred();
  const h = harness({ repoOverrides: { load: (uid) => uid === 'alice' ? load.promise : null } });
  const starting = h.engine.start('alice');
  h.engine.stop();
  await h.engine.start('bob');
  const bobLocal = [...h.localStore._map];
  const bobSession = [...h.sessionStore._map];
  load.resolve(FULL_SNAPSHOT);
  await starting;
  assert.deepEqual([...h.localStore._map], bobLocal);
  assert.deepEqual([...h.sessionStore._map], bobSession);
  assert.deepEqual(h.events.notify, []);
  assert.equal(h.events.applyRemote, 0);
  assert.ok(h.hasListener());
  h.fire(snap([]));
  h.fire(snap([{ id: 2 }]));
  assert.equal(h.localStore.getItem(STORAGE_KEY), snap([{ id: 2 }]));
  h.engine.stop();
});

test('restarting the same UID invalidates the earlier sign-in generation', async () => {
  const load = deferred();
  let loads = 0;
  const h = harness({ repoOverrides: { load: () => ++loads === 1 ? load.promise : null } });
  const staleStart = h.engine.start('alice');
  h.engine.stop();
  await h.engine.start('alice');
  load.resolve(FULL_SNAPSHOT);
  await staleStart;
  assert.equal(h.localStore._map.size, 0);
  assert.equal(h.events.applyRemote, 0);
  assert.ok(h.hasListener());
  h.engine.stop();
});

for (const choice of ['local', 'cloud']) {
  test(`a migration choice (${choice}) after account switch cannot copy the former account`, async () => {
    const prompt = deferred();
    const h = harness({
      local: { [STORAGE_KEY]: snap([{ id: 1 }]) },
      repoOverrides: { load: async (uid) => uid === 'alice' ? FULL_SNAPSHOT : null },
      migrationPrompt: () => prompt.promise,
    });
    const starting = h.engine.start('alice');
    await flush();
    assert.equal(h.events.prompts, 1);
    h.engine.stop();
    h.localStore._map.clear(); // the sign-out flow wipes the former account
    await h.engine.start('bob');
    const bobLocal = [...h.localStore._map];
    const bobSession = [...h.sessionStore._map];
    prompt.resolve(choice);
    await starting;
    assert.deepEqual(h.state.saved, []);
    assert.deepEqual([...h.localStore._map], bobLocal);
    assert.deepEqual([...h.sessionStore._map], bobSession);
    assert.deepEqual(h.events.notify, []);
    assert.equal(h.events.applyRemote, 0);
    assert.ok(h.hasListener());
    h.engine.stop();
  });
}

for (const fails of [false, true]) {
  test(`an old ${fails ? 'failed' : 'successful'} write cannot drain its queue into the next account`, async () => {
    const write = deferred();
    const writes = [];
    const h = harness({ repoOverrides: {
      save: async (uid, data) => {
        writes.push([uid, data]);
        if (uid === 'alice') await write.promise;
      },
    } });
    await h.engine.start('alice');
    const firstData = snap([{ id: 1 }]);
    const oldSave = h.engine.saveNow(firstData);
    await flush(); // first write is in flight; the next one waits behind it
    const queued = h.engine.saveNow(snap([{ id: 2 }]));
    h.engine.stop();
    await h.engine.start('bob');
    h.advance(1000);
    const bobData = snap([{ id: 3 }]);
    // Bob's saves must not wait for Alice's unresolved request.
    assert.equal(await h.engine.saveNow(bobData), true);
    const bobSyncedAt = h.localStore.getItem(LAST_SYNC_KEY);
    h.advance(1000);
    if (fails) write.reject(new Error('old account write failed'));
    else write.resolve();
    assert.equal(await oldSave, false);
    assert.equal(await queued, false);
    assert.deepEqual(writes, [['alice', firstData], ['bob', bobData]]);
    assert.equal(h.localStore.getItem(LAST_SYNC_KEY), bobSyncedAt);
    assert.deepEqual(h.events.notify, []);
    h.engine.stop();
  });
}

test('a sign-in upload finishing after stop cannot set flags, notify or subscribe', async () => {
  const write = deferred();
  const h = harness({
    local: { [STORAGE_KEY]: snap([{ id: 1 }]) },
    repoOverrides: { save: () => write.promise },
  });
  const starting = h.engine.start('alice');
  await flush();
  h.engine.stop();
  h.localStore._map.clear();
  write.resolve();
  await starting;
  assert.equal(h.localStore._map.size, 0);
  assert.equal(h.sessionStore._map.size, 0);
  assert.deepEqual(h.events.notify, []);
  assert.equal(h.hasListener(), false);
});

test('a callback queued before unsubscribe cannot restore the former account', async () => {
  const callbacks = new Map();
  const unsubscribed = [];
  const h = harness({ repoOverrides: {
    subscribe: (uid, callback) => {
      callbacks.set(uid, callback);
      return () => unsubscribed.push(uid);
    },
  } });
  await h.engine.start('alice');
  callbacks.get('alice')(null, false); // consume first-snapshot suppression
  await h.engine.start('bob'); // direct account switch also cancels Alice
  assert.deepEqual(unsubscribed, ['alice']);
  const bobLocal = [...h.localStore._map];
  const bobSession = [...h.sessionStore._map];
  callbacks.get('alice')(FULL_SNAPSHOT, true);
  await flush();
  assert.deepEqual([...h.localStore._map], bobLocal);
  assert.deepEqual([...h.sessionStore._map], bobSession);
  assert.equal(h.events.applyRemote, 0);
  assert.deepEqual(h.events.notify, []);
  h.engine.stop();
});

test('stop cancels a remote reload already scheduled by the former account', async () => {
  const h = harness();
  await h.engine.start('alice');
  h.fire(null, false);
  h.fire(FULL_SNAPSHOT);
  assert.equal(h.events.applyRemote, 0); // the timeout has not fired yet
  h.engine.stop();
  h.localStore._map.clear();
  await h.engine.start('bob');
  await flush();
  assert.equal(h.events.applyRemote, 0);
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), null);
  h.engine.stop();
});

test('a direct account switch drops a queued save and old echo flags', async () => {
  const h = harness();
  await h.engine.start('alice');
  h.engine.queueSave(FULL_SNAPSHOT);
  h.sessionStore.setItem(SKIP_FIRST_SAVE_FLAG, '1');
  await h.engine.start('bob');
  h.engine.queueSave(snap([{ id: 2 }]));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(h.state.saved, [snap([{ id: 2 }])]);
  assert.equal(h.sessionStore.getItem(SKIP_FIRST_SAVE_FLAG), null);
  h.engine.stop();
});

test('isCloudCurrent cannot authorize a wipe using an earlier account load', async () => {
  const load = deferred();
  let loads = 0;
  const same = snap([{ id: 1 }]);
  const h = harness({
    local: { [STORAGE_KEY]: same },
    repoOverrides: { load: () => ++loads === 2 ? load.promise : same },
  });
  await h.engine.start('alice');
  const checking = h.engine.isCloudCurrent();
  await flush();
  h.engine.stop();
  await h.engine.start('bob');
  load.resolve(same);
  assert.equal(await checking, false);
  h.engine.stop();
});

test('isCloudCurrent cannot read the next account after awaiting an old save', async () => {
  const write = deferred();
  const loads = [];
  const same = snap([{ id: 1 }]);
  const h = harness({
    local: { [STORAGE_KEY]: same },
    repoOverrides: {
      load: async (uid) => { loads.push(uid); return same; },
      save: () => write.promise,
    },
  });
  await h.engine.start('alice');
  h.engine.queueSave(same);
  const checking = h.engine.isCloudCurrent();
  await flush();
  h.engine.stop();
  await h.engine.start('bob');
  write.resolve();
  assert.equal(await checking, false);
  assert.deepEqual(loads, ['alice', 'bob']);
  h.engine.stop();
});
