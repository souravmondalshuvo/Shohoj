// worker/test/calendarFeed.test.js
//
// The feed's identity (#744).
//
// This is the one place in the system where a URL is a credential, so the
// tests are about the properties that makes necessary: a token that cannot be
// derived from who you are, a malformed guess that costs nothing to refuse,
// and a path that cannot be logged by accident.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarFeedPath,
  calendarFeedToken,
  isCalendarFeedToken,
  parseCalendarFeedPath,
  redactFeedPath,
} from '../calendarFeed.js';

const HEX = 'a'.repeat(32);
const TOKEN = `cft_${HEX}`;

// ── Minting ─────────────────────────────────────────────────────────────────

test('a token is the prefix plus the randomness it was given', () => {
  assert.equal(calendarFeedToken(HEX), TOKEN);
});

test('randomness is injected, never read here', () => {
  // The caller owns the entropy source, so a test can pin a value without this
  // module knowing crypto exists.
  assert.notEqual(calendarFeedToken('b'.repeat(32)), calendarFeedToken(HEX));
});

test('a token refuses to be minted from too little randomness', () => {
  // Silently padding would produce a guessable credential that still looked
  // like a real one.
  for (const bad of ['', 'abc', 'a'.repeat(31), 'a'.repeat(33), 'zz'.repeat(16), null, undefined]) {
    assert.throws(() => calendarFeedToken(bad), /32 hex/, `${bad} must not mint a token`);
  }
});

test('a token is not derived from anything about the student', () => {
  // The property that makes revocation possible: two mints from different
  // randomness differ, and nothing about identity is an input at all.
  assert.equal(calendarFeedToken.length, 1, 'takes randomness and nothing else');
});

// ── Recognising ─────────────────────────────────────────────────────────────

test('a well-formed token is recognised', () => {
  assert.equal(isCalendarFeedToken(TOKEN), true);
});

test('anything else is not', () => {
  for (const bad of [
    '',
    'cft_',
    HEX,
    `cft_${'a'.repeat(31)}`,
    `cft_${'a'.repeat(33)}`,
    `CFT_${HEX}`,
    `cft_${'A'.repeat(32)}`,
    `usr_${HEX}`,
    `cft_${HEX} `,
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isCalendarFeedToken(bad), false, `${String(bad)} must not be a token`);
  }
});

// ── Paths ───────────────────────────────────────────────────────────────────

test('a path round-trips back to its token', () => {
  assert.equal(parseCalendarFeedPath(calendarFeedPath(TOKEN)), TOKEN);
});

test('the path ends in .ics, which some clients sniff', () => {
  assert.ok(calendarFeedPath(TOKEN).endsWith('.ics'));
});

test('a malformed path is refused before it can cost a read', () => {
  // A guess has to be well-formed before it is worth anything, and a
  // well-formed guess is one in 2^128.
  for (const bad of [
    '/feeds/tasks/',
    '/feeds/tasks/.ics',
    `/feeds/tasks/${TOKEN}`,
    `/feeds/tasks/${TOKEN}.ical`,
    `/feeds/${TOKEN}.ics`,
    `/feeds/tasks/nope.ics`,
    `/feeds/tasks/${TOKEN}/../../secrets.ics`,
    '/api/v1/tasks',
    '',
    null,
  ]) {
    assert.equal(parseCalendarFeedPath(bad), null, `${String(bad)} must not parse`);
  }
});

// ── Redaction ───────────────────────────────────────────────────────────────

test('a feed path logs without its token', () => {
  const redacted = redactFeedPath(calendarFeedPath(TOKEN));

  assert.doesNotMatch(redacted, /a{32}/, 'the token must not survive redaction');
  assert.ok(redacted.includes('<redacted>'));
});

test('redaction also covers a path that did not parse', () => {
  // The error handler logs whatever was requested, including the malformed
  // ones — and a near-miss token is still a secret someone tried.
  const redacted = redactFeedPath('/feeds/tasks/cft_deadbeef-nonsense.ics');
  assert.doesNotMatch(redacted, /deadbeef/);
});

test('every other path passes through unchanged', () => {
  // So a caller can redact unconditionally. The version that has to remember
  // which routes are sensitive is the version that eventually does not.
  for (const path of ['/api/v1/tasks', '/health', '/download', '/api/assistant', '']) {
    assert.equal(redactFeedPath(path), path);
  }
});
