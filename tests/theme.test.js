// tests/theme.test.js — unit tests for the pure theme model.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  parseStoredTheme,
} from '../src/state/theme.ts';

test('parity constants match the legacy app', () => {
  assert.equal(THEME_STORAGE_KEY, 'shohoj_theme');
  assert.equal(DEFAULT_THEME, 'dark');
});

test('isTheme accepts only the two known themes', () => {
  assert.equal(isTheme('dark'), true);
  assert.equal(isTheme('light'), true);
  assert.equal(isTheme('Dark'), false);
  assert.equal(isTheme(''), false);
  assert.equal(isTheme(null), false);
  assert.equal(isTheme(undefined), false);
});

test('parseStoredTheme honors valid values and falls back to the default', () => {
  assert.equal(parseStoredTheme('light'), 'light');
  assert.equal(parseStoredTheme('dark'), 'dark');
  assert.equal(parseStoredTheme(null), DEFAULT_THEME);
  assert.equal(parseStoredTheme('garbage'), DEFAULT_THEME);
});

test('nextTheme toggles between dark and light', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
});
