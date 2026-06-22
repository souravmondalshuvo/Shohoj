// tests/calculatorColors.test.js — unit tests for the calculator color mappings
// extracted from js/ui/render.js (Phase 5B).

import test from 'node:test';
import assert from 'node:assert/strict';

import { gpaBadgeColors, gradeLetterColor } from '../src/features/calculator/colors.ts';

test('gpaBadgeColors picks the tier by GPA threshold (inclusive lower bounds)', () => {
  assert.equal(gpaBadgeColors(4.0).color, '#2ECC71');
  assert.equal(gpaBadgeColors(3.5).color, '#2ECC71');
  assert.equal(gpaBadgeColors(3.49).color, '#27ae60');
  assert.equal(gpaBadgeColors(3.0).color, '#27ae60');
  assert.equal(gpaBadgeColors(2.99).color, '#F0A500');
  assert.equal(gpaBadgeColors(2.5).color, '#F0A500');
  assert.equal(gpaBadgeColors(2.49).color, '#e74c3c');
  assert.equal(gpaBadgeColors(0).color, '#e74c3c');
});

test('gpaBadgeColors returns matching bg + border per tier', () => {
  assert.deepEqual(gpaBadgeColors(3.7), {
    color: '#2ECC71', bg: 'rgba(46,204,113,0.10)', border: 'rgba(46,204,113,0.25)',
  });
  assert.deepEqual(gpaBadgeColors(2.0), {
    color: '#e74c3c', bg: 'rgba(231,76,60,0.10)', border: 'rgba(231,76,60,0.25)',
  });
});

test('gradeLetterColor maps fail/pass and letter ranges', () => {
  assert.equal(gradeLetterColor('F'), '#e74c3c');
  assert.equal(gradeLetterColor('F(NT)'), '#e74c3c');
  assert.equal(gradeLetterColor('P'), '#2ECC71');
  assert.equal(gradeLetterColor('A-'), '#2ECC71');
  assert.equal(gradeLetterColor('B+'), '#27ae60');
  assert.equal(gradeLetterColor('C'), '#F0A500');
  assert.equal(gradeLetterColor('D'), '#e67e22');
});

test('gradeLetterColor falls back to the muted token for unknown/empty', () => {
  assert.equal(gradeLetterColor('I'), 'var(--text3)');
  assert.equal(gradeLetterColor(''), 'var(--text3)');
  assert.equal(gradeLetterColor(null), 'var(--text3)');
  assert.equal(gradeLetterColor(undefined), 'var(--text3)');
});
