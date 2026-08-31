// tests/personalDataCoverage.test.js
//
// Every browser-storage key Shohoj writes must be classified.
//
// tests/personalDataDrift.test.js holds the two personal-data lists to each
// other, which catches a key added to one side. It cannot catch a key that is
// on NEITHER — and that is the miss that actually happened: the shell keeps its
// routine under `shohoj_routine_picks_v1` (not legacy's `shohoj_routine_v1`)
// and its pre-migration transcript backup under `shohoj_cgpa_backup_v1`, so
// both sailed straight through a sign-out that was supposed to clear the
// device (#627).
//
// So this sweeps the source for every `shohoj_*` literal and demands each one
// be either on a wipe list or in NOT_PERSONAL below, with a reason. A new key
// fails this test until somebody decides which it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERSONAL_LOCAL_KEYS,
  PERSONAL_SESSION_KEYS,
  PREFERENCE_LOCAL_KEYS,
  SYNC_LOCAL_KEYS,
} from '../js/core/personalData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');

// Keys that are deliberately NOT a student's data. Each needs a reason: the
// point of this list is that excluding a key is a decision somebody made, not
// a key somebody forgot.
const NOT_PERSONAL = {
  shohoj_connect_feed_v1:
    'cache of the public CONNECT section feed — identical bytes for every student',
  shohoj_routine_ratings_v1:
    'cache of the aggregate faculty-rating map — public, same for everyone',
  shohoj_campus_floor_v1: 'which campus-map floor was last viewed — a view preference',
  shohoj_routine_semester:
    'which semester the Routine tab is showing — a view preference, like the '
    + 'campus-map floor. The semesters themselves are public timetables, and '
    + 'the picks it applies to live in shohoj_routine_v1, which IS wiped.',
  'shohoj_semester_archive_v1':
    'cache of an archived public semester feed, keyed by session id — the same '
    + 'bytes for every student, exactly like shohoj_connect_feed_v1',
  shohoj_pdfjs_preview: 'developer flag for the pdf.js preview path',
  shohoj_assistant:
    'IndexedDB database, not a storage key — the transcript is cleared through '
    + 'clearStoredHistory() on sign-out, since removeItem cannot reach it',
};

const SOURCE_DIRS = [
  { dir: 'js', exts: ['.js'] },
  { dir: 'src', exts: ['.ts', '.tsx'] },
];

function walk(dir, exts, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, exts, found);
    } else if (exts.includes(path.extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

function referencedKeys() {
  const keys = new Map(); // key -> the files that mention it
  for (const { dir, exts } of SOURCE_DIRS) {
    for (const file of walk(path.join(ROOT, dir), exts)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/'(shohoj_[a-zA-Z0-9_]+)'/g)) {
        const rel = path.relative(ROOT, file);
        // The lists themselves name every key; they are not a usage site.
        if (rel.endsWith('personalData.js') || rel.endsWith('personalData.ts')) continue;
        if (!keys.has(match[1])) keys.set(match[1], []);
        keys.get(match[1]).push(rel);
      }
    }
  }
  return keys;
}

const CLEARED = new Set([
  ...PERSONAL_LOCAL_KEYS,
  ...SYNC_LOCAL_KEYS,
  ...PREFERENCE_LOCAL_KEYS,
  ...PERSONAL_SESSION_KEYS,
]);

test('every shohoj_* key in the source is either wiped or explicitly not personal', () => {
  const unclassified = [];
  for (const [key, files] of referencedKeys()) {
    if (CLEARED.has(key)) continue;
    if (key in NOT_PERSONAL) continue;
    unclassified.push(`${key} (${[...new Set(files)].join(', ')})`);
  }
  assert.deepEqual(
    unclassified,
    [],
    'unclassified storage key(s) — add each to js/core/personalData.js AND '
      + 'src/services/storage/personalData.ts if it holds a student\'s data, or to '
      + `NOT_PERSONAL in this test with a reason if it does not:\n  ${unclassified.join('\n  ')}`,
  );
});

test('nothing is both wiped and declared not personal', () => {
  const both = Object.keys(NOT_PERSONAL).filter((key) => CLEARED.has(key));
  assert.deepEqual(both, [], `contradictory classification: ${both}`);
});

test('every excluded key carries a reason', () => {
  for (const [key, reason] of Object.entries(NOT_PERSONAL)) {
    assert.ok(reason && reason.length > 20, `${key} needs a real reason, got: ${reason}`);
  }
});
