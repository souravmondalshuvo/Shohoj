// tests/questProgress.test.js — saving Shohoj Quest progress (#981): the saved
// form, putting two copies together, the device copy, the cloud copy, and the
// store that keeps them in step.
//
// The rule every test here leans on: a solved quest is never lost. Not by a
// second device, not by a sync that arrives late, not by a copy this build
// cannot read. firestore.rules has its own tests, in tests/firestore.rules.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PERSONAL_LOCAL_KEYS as LEGACY_KEYS } from '../js/core/personalData.js';
import { createQuestProgressRepo } from '../src/features/quest/progress/cloudProgress.ts';
import {
  DRAFT_DELAY_MS,
  MAX_DRAFTS,
  MAX_DRAFT_CHARS,
  QUEST_DRAFTS_KEY,
  QUEST_PROGRESS_KEY,
  createLocalDraftStore,
  memoryDraftStore,
  readLocalProgress,
  writeLocalProgress,
} from '../src/features/quest/progress/localProgress.ts';
import {
  MAX_COMPLETED,
  cloudNeedsWrite,
  emptyProgress,
  inZone,
  mergeProgress,
  parseProgress,
  sameProgress,
  sameSolved,
  toStored,
  withPosition,
  withSolved,
} from '../src/features/quest/progress/progress.ts';
import {
  MOVED_DELAY_MS,
  SOLVED_DELAY_MS,
  createSyncedProgressStore,
} from '../src/features/quest/progress/syncedProgress.ts';
import { PERSONAL_LOCAL_KEYS } from '../src/services/storage/personalData.ts';
import { MemoryKeyValueStore } from '../src/services/storage/keyValueStore.ts';

// ── Builders ────────────────────────────────────────────────────────────────

const progress = (completed = {}, at = null, zone = 'bridge') => ({ completed, zone, at });
const UID = 'u_one';

/** Timers the test moves by hand. */
function fakeTimers() {
  let time = 0;
  let nextId = 1;
  const waiting = new Map();
  return {
    timers: {
      set(run, ms) {
        const id = nextId++;
        waiting.set(id, { run, at: time + ms });
        return id;
      },
      clear(id) {
        waiting.delete(id);
      },
    },
    now: () => time,
    /** Let `ms` pass, running what falls due, in order. */
    advance(ms) {
      const until = time + ms;
      for (;;) {
        const due = [...waiting.entries()]
          .filter(([, w]) => w.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        waiting.delete(due[0]);
        time = due[1].at;
        due[1].run();
      }
      time = until;
    },
    pending: () => waiting.size,
  };
}

/** Let every promise that is ready settle. */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

/** A cloud that holds one document and counts what is asked of it. */
function fakeCloud(initial) {
  const state = { doc: initial, reads: 0, writes: 0, fail: false };
  const backend = {
    async transact(uid, decide) {
      state.reads += 1;
      if (state.fail) throw new Error('offline');
      const next = decide(state.doc);
      if (next) {
        state.writes += 1;
        state.doc = { ...next, updatedAt: 'server-time' };
      }
    },
  };
  return { state, repo: createQuestProgressRepo(async () => backend) };
}

// ── The saved form ──────────────────────────────────────────────────────────

test('progress survives being saved and read back', () => {
  const original = progress({ 'bridge-the-toll': 2000, 'bridge-first-span': 1000 }, { x: 4, y: 11 });
  const stored = toStored(original);
  assert.equal(stored.v, 1);
  assert.deepEqual(parseProgress(JSON.parse(JSON.stringify(stored))), original);
});

test('a saved copy carries no XP: it is recounted from the content', () => {
  assert.deepEqual(Object.keys(toStored(progress({ q: 1 }))).sort(), ['at', 'completed', 'v', 'zone']);
});

test('a copy that cannot be understood at all reads as nothing', () => {
  for (const bad of [null, undefined, 'bridge', 7, [], {}, { v: 2, zone: 'bridge', completed: {} }]) {
    assert.equal(parseProgress(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseProgress({ v: 1, zone: 'The Bridge', completed: {} }), null, 'a zone that is no id');
  assert.equal(parseProgress({ v: 1, zone: 'a'.repeat(49), completed: {} }), null, 'a zone too long');
});

test('inside a readable copy, what makes no sense is dropped and the rest kept', () => {
  const read = parseProgress({
    v: 1,
    zone: 'bridge',
    completed: {
      'bridge-the-toll': 1763200000000.9,
      'Not An Id': 5,
      'bridge-keystone': 'yesterday',
      'bridge-rope-counter': -1,
      'bridge-first-span': Number.POSITIVE_INFINITY,
      constructor: 12,
    },
    at: { x: 3.5, y: 2 },
    xp: 999999,
  });
  // `constructor` is a well-formed id, so it is kept, as data.
  assert.deepEqual(read, {
    completed: { 'bridge-the-toll': 1763200000000, constructor: 12 },
    zone: 'bridge',
    at: null,
  });
});

test('a position off any map is read as "start at the spawn point"', () => {
  const at = (where) => parseProgress({ v: 1, zone: 'bridge', completed: {}, at: where })?.at;
  assert.deepEqual(at({ x: 0, y: 1023 }), { x: 0, y: 1023 });
  assert.equal(at({ x: 1024, y: 0 }), null);
  assert.equal(at({ x: -1, y: 0 }), null);
  assert.equal(at({ x: 1 }), null);
  assert.equal(at('the far bank'), null);
});

test('a save never holds more solved quests than the rules allow, oldest kept', () => {
  const many = Object.fromEntries(
    Array.from({ length: MAX_COMPLETED + 20 }, (_, i) => [`quest-${i}`, 10_000 - i]),
  );
  const stored = toStored(progress(many));
  assert.equal(Object.keys(stored.completed).length, MAX_COMPLETED);
  // The newest twenty are the ones left out.
  assert.equal('quest-0' in stored.completed, false);
  assert.equal(`quest-${MAX_COMPLETED + 19}` in stored.completed, true);
});

test('entering another zone keeps what was solved and forgets where the hero stood', () => {
  const here = progress({ q: 1 }, { x: 4, y: 11 });
  assert.equal(inZone(here, 'bridge'), here);
  assert.deepEqual(inZone(here, 'library'), progress({ q: 1 }, null, 'library'));
});

// ── Two copies ──────────────────────────────────────────────────────────────

test('merging keeps every solved quest from both copies', () => {
  const phone = progress({ a: 100, b: 200 });
  const laptop = progress({ b: 250, c: 300 });
  assert.deepEqual(mergeProgress(phone, laptop).completed, { a: 100, b: 200, c: 300 });
  assert.deepEqual(mergeProgress(laptop, phone).completed, { b: 200, c: 300, a: 100 });
});

test('merging keeps the earlier time for a quest both have', () => {
  assert.equal(mergeProgress(progress({ q: 500 }), progress({ q: 100 })).completed.q, 100);
  assert.equal(mergeProgress(progress({ q: 100 }), progress({ q: 500 })).completed.q, 100);
});

test('merging leaves the hero where this device has it', () => {
  const mine = progress({ a: 1 }, { x: 4, y: 11 }, 'bridge');
  const other = progress({ b: 2 }, { x: 30, y: 12 }, 'library');
  const merged = mergeProgress(mine, other);
  assert.deepEqual(merged.at, { x: 4, y: 11 });
  assert.equal(merged.zone, 'bridge');
});

test('merging a copy that adds nothing returns the same object, and repeats safely', () => {
  const mine = progress({ a: 1, b: 2 });
  assert.equal(mergeProgress(mine, progress({ a: 1 })), mine);
  assert.equal(mergeProgress(mine, progress({ a: 9 })), mine, 'a later time adds nothing');
  const once = mergeProgress(mine, progress({ c: 3 }));
  assert.equal(mergeProgress(once, progress({ c: 3 })), once);
});

test('sameProgress and sameSolved tell a new solve from a new step', () => {
  const base = progress({ a: 1 }, { x: 1, y: 1 });
  assert.equal(sameProgress(base, progress({ a: 1 }, { x: 1, y: 1 })), true);
  assert.equal(sameProgress(base, withPosition(base, { x: 2, y: 1 })), false);
  assert.equal(sameSolved(base, withPosition(base, { x: 2, y: 1 })), true);
  assert.equal(sameSolved(base, withSolved(base, 'b', 2)), false);
  assert.equal(sameProgress(base, null), false);
  assert.equal(sameProgress(null, null), true);
  assert.equal(sameSolved(null, emptyProgress('bridge')), true);
});

test('the cloud is written for a new solve, and for a step only once something is solved', () => {
  const walkedOnly = progress({}, { x: 9, y: 9 });
  assert.equal(cloudNeedsWrite(null, walkedOnly), false, 'a visitor who only walked');
  assert.equal(cloudNeedsWrite(null, progress({ a: 1 })), true, 'a first solve');
  const cloud = progress({ a: 1 }, { x: 1, y: 1 });
  assert.equal(cloudNeedsWrite(cloud, progress({ a: 1 }, { x: 1, y: 1 })), false, 'nothing new');
  assert.equal(cloudNeedsWrite(cloud, progress({ a: 1 }, { x: 2, y: 1 })), true, 'a step, after a solve');
  assert.equal(cloudNeedsWrite(cloud, progress({ a: 1, b: 2 }, { x: 1, y: 1 })), true, 'a new solve');
});

// ── The device copy ─────────────────────────────────────────────────────────

test('the device copy reads back for the student who wrote it', () => {
  const storage = new MemoryKeyValueStore();
  const saved = progress({ a: 1 }, { x: 4, y: 11 });
  writeLocalProgress(storage, UID, saved);
  assert.deepEqual(readLocalProgress(storage, UID), saved);
});

test('another student\'s copy on a shared computer is not read', () => {
  const storage = new MemoryKeyValueStore();
  writeLocalProgress(storage, 'u_other', progress({ a: 1 }));
  assert.equal(readLocalProgress(storage, UID), null);
});

test('a missing or mangled device copy reads as nothing', () => {
  const storage = new MemoryKeyValueStore();
  assert.equal(readLocalProgress(storage, UID), null);
  for (const text of ['', 'not json', '[]', '"text"', JSON.stringify({ uid: UID, progress: { v: 9 } })]) {
    storage.setItem(QUEST_PROGRESS_KEY, text);
    assert.equal(readLocalProgress(storage, UID), null, text);
  }
});

test('storage that refuses does not stop the game', () => {
  const refusing = {
    getItem() {
      throw new Error('storage is disabled');
    },
    setItem() {
      throw new Error('quota exceeded');
    },
    removeItem() {},
  };
  assert.equal(readLocalProgress(refusing, UID), null);
  assert.doesNotThrow(() => writeLocalProgress(refusing, UID, progress({ a: 1 })));
  const drafts = createLocalDraftStore({ storage: refusing, uid: UID, timers: fakeTimers().timers });
  drafts.set('q', 'int x;');
  assert.doesNotThrow(() => drafts.flush());
  assert.equal(drafts.get('q'), 'int x;', 'still held in memory');
});

test('both keys are wiped at sign-out, on the shell and on the legacy page', () => {
  for (const key of [QUEST_PROGRESS_KEY, QUEST_DRAFTS_KEY]) {
    assert.ok(PERSONAL_LOCAL_KEYS.includes(key), `${key} is missing from the shell's wipe list`);
    assert.ok(LEGACY_KEYS.includes(key), `${key} is missing from the legacy wipe list`);
  }
});

// ── Unfinished code ─────────────────────────────────────────────────────────

test('a draft is written a moment after the last keystroke, not on each one', () => {
  const storage = new MemoryKeyValueStore();
  const clock = fakeTimers();
  const drafts = createLocalDraftStore({ storage, uid: UID, timers: clock.timers });
  drafts.set('q', 'i');
  drafts.set('q', 'in');
  drafts.set('q', 'int');
  assert.equal(drafts.get('q'), 'int');
  assert.equal(storage.getItem(QUEST_DRAFTS_KEY), null);
  assert.equal(clock.pending(), 1, 'one write waiting, not three');
  clock.advance(DRAFT_DELAY_MS);
  assert.deepEqual(JSON.parse(storage.getItem(QUEST_DRAFTS_KEY)), { uid: UID, drafts: { q: 'int' } });
});

test('a draft comes back after a reload, for the student who typed it', () => {
  const storage = new MemoryKeyValueStore();
  const first = createLocalDraftStore({ storage, uid: UID, timers: fakeTimers().timers });
  first.set('q', 'while (true) {}');
  first.flush();
  assert.equal(createLocalDraftStore({ storage, uid: UID }).get('q'), 'while (true) {}');
  assert.equal(createLocalDraftStore({ storage, uid: 'u_other' }).get('q'), undefined);
});

test('a draft too long to be an answer is not kept, and the oldest drafts make room', () => {
  const storage = new MemoryKeyValueStore();
  const drafts = createLocalDraftStore({ storage, uid: UID, timers: fakeTimers().timers });
  drafts.set('long', 'x'.repeat(MAX_DRAFT_CHARS + 1));
  assert.equal(drafts.get('long'), undefined);
  for (let i = 0; i < MAX_DRAFTS + 2; i += 1) drafts.set(`quest-${i}`, 'code');
  assert.equal(drafts.get('quest-0'), undefined);
  assert.equal(drafts.get('quest-1'), undefined);
  assert.equal(drafts.get(`quest-${MAX_DRAFTS + 1}`), 'code');
  // Editing a draft again makes it the newest, so it is not the next to go.
  drafts.set('quest-2', 'edited');
  drafts.set('one-more', 'code');
  assert.equal(drafts.get('quest-2'), 'edited');
  assert.equal(drafts.get('quest-3'), undefined);
});

test('the memory draft store holds drafts for the visit', () => {
  const drafts = memoryDraftStore();
  drafts.set('q', 'a');
  assert.equal(drafts.get('q'), 'a');
  assert.doesNotThrow(() => drafts.flush());
});

// ── The cloud copy ──────────────────────────────────────────────────────────

test('a first solve creates the cloud copy', async () => {
  const cloud = fakeCloud(undefined);
  const local = progress({ a: 100 }, { x: 4, y: 11 });
  assert.deepEqual(await cloud.repo.sync(UID, local), { kind: 'ok', progress: local });
  assert.deepEqual(cloud.state.doc, { ...toStored(local), updatedAt: 'server-time' });
});

test('a student with nothing solved creates no cloud copy', async () => {
  const cloud = fakeCloud(undefined);
  assert.deepEqual(await cloud.repo.sync(UID, null), { kind: 'ok', progress: null });
  assert.deepEqual(await cloud.repo.sync(UID, progress({}, { x: 9, y: 9 })), { kind: 'ok', progress: null });
  assert.equal(cloud.state.writes, 0);
});

test('a new device takes the cloud copy and writes nothing', async () => {
  const saved = progress({ a: 100 }, { x: 4, y: 11 });
  const cloud = fakeCloud(toStored(saved));
  assert.deepEqual(await cloud.repo.sync(UID, null), { kind: 'ok', progress: saved });
  assert.equal(cloud.state.writes, 0);
});

test('two devices that each solved something end with both quests in the cloud', async () => {
  const cloud = fakeCloud(toStored(progress({ laptop: 300 })));
  const phone = progress({ phone: 200 }, { x: 4, y: 11 });
  const outcome = await cloud.repo.sync(UID, phone);
  assert.deepEqual(outcome.progress.completed, { phone: 200, laptop: 300 });
  assert.deepEqual(parseProgress(cloud.state.doc).completed, { phone: 200, laptop: 300 });
  // The phone's own position goes up with it.
  assert.deepEqual(parseProgress(cloud.state.doc).at, { x: 4, y: 11 });
});

test('a sync that changes nothing writes nothing', async () => {
  const saved = progress({ a: 100 }, { x: 4, y: 11 });
  const cloud = fakeCloud(toStored(saved));
  await cloud.repo.sync(UID, saved);
  assert.equal(cloud.state.writes, 0);
});

test('a cloud copy this build cannot read is left exactly as it is', async () => {
  const fromTheFuture = { v: 2, zones: { bridge: { done: ['a'] } }, updatedAt: 'server-time' };
  const cloud = fakeCloud(fromTheFuture);
  assert.deepEqual(await cloud.repo.sync(UID, progress({ a: 1 })), { kind: 'unreadable' });
  assert.equal(cloud.state.writes, 0);
  assert.equal(cloud.state.doc, fromTheFuture);
});

test('a sync that cannot reach the cloud rejects, and the next one can succeed', async () => {
  const cloud = fakeCloud(undefined);
  cloud.state.fail = true;
  await assert.rejects(cloud.repo.sync(UID, progress({ a: 1 })), /offline/);
  cloud.state.fail = false;
  assert.equal((await cloud.repo.sync(UID, progress({ a: 1 }))).kind, 'ok');
});

test('a backend that fails to load is tried again on the next sync', async () => {
  let loads = 0;
  const repo = createQuestProgressRepo(async () => {
    loads += 1;
    if (loads === 1) throw new Error('the SDK chunk did not arrive');
    return { transact: async () => undefined };
  });
  await assert.rejects(repo.sync(UID, null), /did not arrive/);
  assert.deepEqual(await repo.sync(UID, null), { kind: 'ok', progress: null });
  assert.equal(loads, 2);
});

// ── The store that keeps the two in step ────────────────────────────────────

function synced({ cloudDoc, local, repo } = {}) {
  const storage = new MemoryKeyValueStore();
  if (local) writeLocalProgress(storage, UID, local);
  const clock = fakeTimers();
  const cloud = fakeCloud(cloudDoc);
  const store = createSyncedProgressStore({
    uid: UID,
    storage,
    repo: repo === undefined ? cloud.repo : repo,
    timers: clock.timers,
    now: clock.now,
  });
  const arrived = [];
  store.onRemote((remote) => arrived.push(remote));
  return { store, storage, clock, cloud, arrived };
}

test('load answers from the device at once, without waiting for the cloud', async () => {
  const local = progress({ a: 100 }, { x: 4, y: 11 });
  const { store, cloud } = synced({ local, cloudDoc: toStored(progress({ a: 100, b: 200 })) });
  // The cloud has not answered: nothing has been awaited but load itself.
  cloud.state.fail = false;
  assert.deepEqual(await store.load(), local);
});

test('quests solved on another device arrive after load and are kept on this one', async () => {
  const local = progress({ a: 100 }, { x: 4, y: 11 });
  const { store, storage, arrived } = synced({
    local,
    cloudDoc: toStored(progress({ a: 100, b: 200 }, { x: 30, y: 12 })),
  });
  await store.load();
  await settle();
  assert.equal(arrived.length, 1);
  assert.deepEqual(arrived[0].completed, { a: 100, b: 200 });
  assert.deepEqual(arrived[0].at, { x: 4, y: 11 }, 'the hero stays where this device left it');
  assert.deepEqual(readLocalProgress(storage, UID).completed, { a: 100, b: 200 });
});

test('a device with nothing saved takes the cloud copy whole', async () => {
  const saved = progress({ a: 100 }, { x: 30, y: 12 });
  const { store, arrived } = synced({ cloudDoc: toStored(saved) });
  assert.equal(await store.load(), null);
  await settle();
  assert.deepEqual(arrived, [saved]);
});

test('a save is on the device immediately, and in the cloud shortly after a solve', async () => {
  const { store, storage, clock, cloud } = synced();
  await store.load();
  await settle();
  const solved = progress({ a: 100 }, { x: 4, y: 11 });
  store.save(solved);
  assert.deepEqual(readLocalProgress(storage, UID), solved);
  assert.equal(cloud.state.writes, 0);
  clock.advance(SOLVED_DELAY_MS - 1);
  await settle();
  assert.equal(cloud.state.writes, 0);
  clock.advance(1);
  await settle();
  assert.equal(cloud.state.writes, 1);
  assert.deepEqual(parseProgress(cloud.state.doc), solved);
});

test('walking does not write to the cloud step by step', async () => {
  const start = progress({ a: 100 }, { x: 1, y: 1 });
  const { store, clock, cloud } = synced({ local: start, cloudDoc: toStored(start) });
  await store.load();
  await settle();
  for (let x = 2; x <= 9; x += 1) {
    store.save(withPosition(start, { x, y: 1 }));
    clock.advance(1000);
    await settle();
  }
  assert.equal(cloud.state.writes, 0, 'eight steps, eight seconds, no write yet');
  clock.advance(MOVED_DELAY_MS);
  await settle();
  assert.equal(cloud.state.writes, 1, 'one write, with where the hero ended up');
  assert.deepEqual(parseProgress(cloud.state.doc).at, { x: 9, y: 1 });
});

test('a solve does not wait behind a step', async () => {
  const start = progress({ a: 100 }, { x: 1, y: 1 });
  const { store, clock, cloud } = synced({ local: start, cloudDoc: toStored(start) });
  await store.load();
  await settle();
  const moved = withPosition(start, { x: 2, y: 1 });
  store.save(moved);
  store.save(withSolved(moved, 'b', 200));
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  assert.deepEqual(parseProgress(cloud.state.doc).completed, { a: 100, b: 200 });
});

test('a visitor who only walks about never touches the cloud after the first look', async () => {
  const { store, clock, cloud } = synced();
  await store.load();
  await settle();
  assert.equal(cloud.state.reads, 1);
  store.save(progress({}, { x: 5, y: 5 }));
  clock.advance(MOVED_DELAY_MS * 2);
  await settle();
  assert.equal(cloud.state.reads, 1);
  assert.equal(cloud.state.writes, 0);
});

test('a save that is a moment behind does not drop a quest the store already holds', async () => {
  const { store, storage, arrived } = synced({ cloudDoc: toStored(progress({ a: 100 })) });
  await store.load();
  await settle();
  assert.equal(arrived.length, 1, 'the cloud copy arrived');

  // The screen had not seen it yet, and saves what it had: an empty start.
  store.save(progress({}, { x: 5, y: 5 }));
  assert.deepEqual(readLocalProgress(storage, UID), progress({ a: 100 }, { x: 5, y: 5 }));
  // And the screen is told, so it catches up.
  assert.deepEqual(arrived.at(-1), progress({ a: 100 }, { x: 5, y: 5 }));
});

test('flush sends what is waiting now, for when the page is hidden', async () => {
  const { store, cloud } = synced();
  await store.load();
  await settle();
  store.save(progress({ a: 100 }));
  store.flush();
  await settle();
  assert.equal(cloud.state.writes, 1);
  // Nothing waiting: flushing again is free.
  store.flush();
  await settle();
  assert.equal(cloud.state.reads, 2);
});

test('with the cloud unreachable the game still saves, and catches up later', async () => {
  const { store, storage, clock, cloud } = synced();
  cloud.state.fail = true;
  await store.load();
  await settle();
  const solved = progress({ a: 100 });
  store.save(solved);
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  assert.deepEqual(readLocalProgress(storage, UID), solved, 'on the device regardless');
  assert.equal(cloud.state.writes, 0);

  cloud.state.fail = false;
  store.save(withSolved(solved, 'b', 200));
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  assert.deepEqual(parseProgress(cloud.state.doc).completed, { a: 100, b: 200 });
});

test('a failed sync is not retried in a loop', async () => {
  const { store, clock, cloud } = synced();
  cloud.state.fail = true;
  await store.load();
  await settle();
  store.save(progress({ a: 100 }));
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  const reads = cloud.state.reads;
  clock.advance(MOVED_DELAY_MS * 10);
  await settle();
  assert.equal(cloud.state.reads, reads);
  assert.equal(clock.pending(), 0);
});

test('a quest solved while a sync is in flight is not lost when the answer lands', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const repo = {
    async sync(uid, local) {
      calls.push(local);
      if (calls.length === 1) await held;
      return { kind: 'ok', progress: progress({ ...(local?.completed ?? {}), cloud: 50 }) };
    },
  };
  const { store, storage, clock, arrived } = synced({ repo });
  await store.load();
  store.save(progress({ a: 100 }));
  release();
  await settle();
  // The first answer (cloud: 50) merged into what is held now (a: 100).
  assert.deepEqual(arrived.at(-1).completed, { a: 100, cloud: 50 });
  assert.deepEqual(readLocalProgress(storage, UID).completed, { a: 100, cloud: 50 });
  // And the solve that missed the first sync goes with the next.
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  assert.deepEqual(calls.at(-1).completed, { a: 100, cloud: 50 });
});

test('an unreadable cloud copy is never written over, however much is saved', async () => {
  const { store, storage, clock, cloud } = synced({ cloudDoc: { v: 2, something: 'newer' } });
  await store.load();
  await settle();
  store.save(progress({ a: 100 }));
  clock.advance(MOVED_DELAY_MS);
  await settle();
  assert.equal(cloud.state.writes, 0);
  assert.equal(cloud.state.reads, 1, 'and it is not asked again');
  assert.deepEqual(readLocalProgress(storage, UID).completed, { a: 100 });
});

test('with no cloud at all the device copy is the whole store', async () => {
  const { store, storage, clock } = synced({ repo: null });
  assert.equal(await store.load(), null);
  store.save(progress({ a: 100 }));
  assert.deepEqual(readLocalProgress(storage, UID).completed, { a: 100 });
  assert.equal(clock.pending(), 0);
  assert.doesNotThrow(() => store.flush());
});

test('a stopped store sends what was waiting, then stays off the device', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const sent = [];
  const repo = {
    async sync(uid, local) {
      sent.push(local);
      if (sent.length === 2) await held;
      return { kind: 'ok', progress: local ? progress({ ...local.completed, late: 1 }) : null };
    },
  };
  const { store, storage, arrived } = synced({ repo });
  await store.load();
  await settle();
  store.save(progress({ a: 100 }));
  store.stop();
  assert.deepEqual(sent.at(-1).completed, { a: 100 }, 'the waiting save was sent');

  // Sign-out wipes the device while that answer is still on its way.
  storage.removeItem(QUEST_PROGRESS_KEY);
  release();
  await settle();
  assert.equal(storage.getItem(QUEST_PROGRESS_KEY), null, 'the late answer did not write it back');
  assert.equal(arrived.length, 0);
  store.save(progress({ a: 100, b: 200 }));
  assert.equal(storage.getItem(QUEST_PROGRESS_KEY), null, 'nor does a save after stopping');
});

test('a restarted store works again: development mounts everything twice', async () => {
  const { store, clock, cloud } = synced();
  store.stop();
  store.start();
  await store.load();
  await settle();
  store.save(progress({ a: 100 }));
  clock.advance(SOLVED_DELAY_MS);
  await settle();
  assert.equal(cloud.state.writes, 1);
});

// ── What ships with it ──────────────────────────────────────────────────────

test('the Firestore backend writes to the collection the rules protect', () => {
  const backend = readFileSync(
    new URL('../src/platform/firebase/questProgressRepo.ts', import.meta.url),
    'utf8',
  );
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const collection = /QUEST_PROGRESS_COLLECTION = '([^']+)'/.exec(backend)?.[1];
  assert.equal(collection, 'questProgress');
  assert.ok(rules.includes(`match /${collection}/{uid}`));
  // The rules' cap on solved quests is the one the client trims to.
  assert.ok(rules.includes(`d.completed.size() <= ${MAX_COMPLETED}`));
});
