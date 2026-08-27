// tests/personalDataDrift.test.js
//
// Drift guard for the two copies of "what Shohoj keeps on this device".
//
// js/core/personalData.js exists because build3.py concatenates plain JS and
// cannot pull in TypeScript, so the legacy bundle carries a hand-written copy of
// src/services/storage/personalData.ts. A hand-written copy that nothing checks
// is a copy that goes stale — and stale here is not cosmetic: a key added to one
// list and not the other keeps a student's grades, routine or review record on a
// shared machine after they sign out, on whichever build they happened to use.
//
// So the lists are compared key for key, in order, both ways.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as legacy from '../js/core/personalData.js';
import * as shell from '../src/services/storage/personalData.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const LISTS = [
  'PERSONAL_LOCAL_KEYS',
  'SYNC_LOCAL_KEYS',
  'PREFERENCE_LOCAL_KEYS',
  'PERSONAL_SESSION_KEYS',
];

for (const list of LISTS) {
  test(`${list} agrees between the legacy bundle and the shell`, () => {
    assert.deepEqual(
      [...legacy[list]],
      [...shell[list]],
      `${list} drifted between js/core/personalData.js and `
        + 'src/services/storage/personalData.ts — a key on one list and not the '
        + 'other leaks on whichever build the student is using. Update both.',
    );
  });
}

test('the cloud snapshot fields agree between the two builds', () => {
  // A mismatch here breaks nothing loudly: one build would write `seatWatches`
  // and the other read something else, and the slice would simply stop crossing
  // devices — the failure the sync was added to prevent.
  assert.deepEqual(
    [...legacy.PERSONAL_SLICE_FIELDS],
    [...shell.PERSONAL_SLICE_FIELDS],
    'PERSONAL_SLICE_FIELDS drifted — the two builds no longer agree on what the '
      + 'cloud snapshot carries beyond the calculator.',
  );
});

test('no key is claimed by two lists at once', () => {
  const all = LISTS.flatMap((list) => [...legacy[list]]);
  assert.equal(new Set(all).size, all.length, `a key appears on more than one list: ${all}`);
});

test('the shell wipe removes exactly the keys the lists name', () => {
  const local = new Map([
    ...shell.PERSONAL_LOCAL_KEYS.map((k) => [k, 'x']),
    ...shell.SYNC_LOCAL_KEYS.map((k) => [k, 'x']),
    ...shell.PREFERENCE_LOCAL_KEYS.map((k) => [k, 'x']),
  ]);
  const session = new Map(shell.PERSONAL_SESSION_KEYS.map((k) => [k, 'x']));
  const store = (map) => ({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });

  shell.clearPersonalData(store(local), store(session));

  assert.deepEqual([...local.keys()], [...shell.PREFERENCE_LOCAL_KEYS]);
  assert.equal(session.size, 0);
});

test('the spelled-out seat-watch key still matches src/core/seatWatch.ts', () => {
  // personalData.ts cannot import seatWatch.ts (its graph reaches extensionless
  // imports node cannot strip), so the key is written out there. Read the real
  // declaration rather than trust the copy.
  const source = fs.readFileSync(path.join(here, '..', 'src', 'core', 'seatWatch.ts'), 'utf8');
  const declared = /SEAT_WATCH_STORAGE_KEY\s*=\s*'([^']+)'/.exec(source);
  assert.ok(declared, 'SEAT_WATCH_STORAGE_KEY is no longer declared as a string literal');
  assert.ok(
    shell.PERSONAL_LOCAL_KEYS.includes(declared[1]),
    `seatWatch.ts stores under '${declared[1]}', which sign-out does not clear`,
  );
});
