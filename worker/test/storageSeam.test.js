// worker/test/storageSeam.test.js
//
// The storage seam (#908): nothing outside academicRepo.js names an academic
// Firestore path.
//
// ADR 0003 moves the academic records to Cloudflare D1 by giving the store a
// second implementation. That only works if the store is the ONLY code that
// knows where those records live — one raw `shohojUsers/…` read left in a
// handler would keep reading Firestore after the switch, silently, against data
// that has stopped changing. So this is checked, not remembered.
//
// Source is scanned with comments removed: prose explaining the old layout is
// fine, code that reaches it is not.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The one module allowed to know the layout. */
const STORE_MODULE = 'academicRepo.js';

/** Code that reaches academic storage without going through the store. */
const FORBIDDEN = [
  { pattern: /shohojUsers/, why: 'the user collection, by name' },
  { pattern: /calendarFeeds/, why: 'the feed reverse index, by name' },
  { pattern: /\bUSERS_COLLECTION\b/, why: 'the user collection, by constant' },
  { pattern: /\bCALENDAR_FEED_COLLECTION\b/, why: 'the feed reverse index, by constant' },
  { pattern: /allDescendants/, why: 'a collection-group query' },
  {
    pattern:
      /\b(createAcademicRepo|semesterPath|enrollmentPath|taskPath|assessmentPath|reminderPath)\b/,
    why: 'a Firestore repository or path helper instead of createAcademicStore',
  },
];

/** Source with block comments and whole-line `//` comments removed. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function violations(source) {
  const code = codeOnly(source);
  return FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ why }) => why);
}

function workerModules() {
  return readdirSync(WORKER_DIR).filter(
    (name) => name.endsWith('.js') && !name.endsWith('.generated.js') && name !== STORE_MODULE,
  );
}

test('no Worker module outside the store names an academic Firestore path', () => {
  const found = [];
  for (const name of workerModules()) {
    for (const why of violations(readFileSync(path.join(WORKER_DIR, name), 'utf8'))) {
      found.push(`${name}: ${why}`);
    }
  }
  assert.deepEqual(
    found,
    [],
    `academic storage must go through createAcademicStore:\n${found.join('\n')}`,
  );
});

test('the scan covers the modules that used to reach Firestore directly', () => {
  const scanned = workerModules();
  for (const name of ['index.js', 'apiV1.js', 'calendarFeed.js', 'calendarFeedHandlers.js']) {
    assert.ok(scanned.includes(name), `${name} must be scanned`);
  }
});

test('the guard sees code and ignores prose', () => {
  assert.deepEqual(violations('// shohojUsers/{uid} is where the record lives'), []);
  assert.deepEqual(violations('/**\n * calendarFeeds/{token}\n */'), []);
  assert.deepEqual(violations('const p = `shohojUsers/${uid}`;'), ['the user collection, by name']);
  assert.deepEqual(violations("from: [{ collectionId: 'reminders', allDescendants: true }]"), [
    'a collection-group query',
  ]);
  assert.deepEqual(violations("import { taskPath } from './academicRepo.js';"), [
    'a Firestore repository or path helper instead of createAcademicStore',
  ]);
});

test('the store module itself still holds the layout the guard looks for', () => {
  // If the names moved, the patterns above would be guarding nothing.
  const store = codeOnly(readFileSync(path.join(WORKER_DIR, STORE_MODULE), 'utf8'));
  assert.match(store, /'shohojUsers'/);
  assert.match(store, /'calendarFeeds'/);
  assert.match(store, /allDescendants/);
});
