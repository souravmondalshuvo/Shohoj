// tests/transcriptPdfText.test.js — unit tests for the typed PDF positional
// text flattener (#323), the port of flattenPdfPageText from js/ui/modals.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPdfText,
  flattenPdfPageText,
} from '../src/features/calculator/transcriptPdfText.ts';

// pdf.js transform: [a, b, c, d, x, y].
const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });

test('same-row tokens join; a wide x-gap inserts a space', () => {
  const items = [
    item('SEMESTER:', 10, 700),
    item('SPRING', 60, 700), // gap 60 - (10+45) = 5 > 1.5 → space
    item('2024', 100, 700), // gap 100 - (60+30) = 10 → space
  ];
  assert.equal(flattenPdfPageText(items), 'SEMESTER: SPRING 2024');
});

test('a tiny gap (≤0.2) never spaces; a mid gap spaces on token shape', () => {
  // 'CSE' ends at 15; next starts 15.1 → gap 0.1 → glued (split code halves).
  assert.equal(flattenPdfPageText([item('CSE', 10, 700, 5), item('110', 15.1, 700)]), 'CSE110');
  // Mid gap (1.0): letter→letter spaces...
  assert.equal(flattenPdfPageText([item('Physics', 10, 700, 5), item('II', 16, 700)]), 'Physics II');
  // ...but a mid gap after a comma does not ("," fails the prev-token shape test).
  assert.equal(flattenPdfPageText([item('Physics,', 10, 700, 5), item('II', 16, 700)]), 'Physics,II');
});

test('a y-jump over 6 breaks the row', () => {
  const items = [item('Programming Language I', 10, 700), item('CSE110', 10, 680)];
  assert.equal(flattenPdfPageText(items), 'Programming Language I\nCSE110');
});

test('a course code dropped a few pixels low forces its own line', () => {
  // yDiff 3 (≤6) would normally stay in-row; the code pattern forces a break.
  const items = [item('3.00', 10, 700), item('CSE220', 60, 697)];
  assert.equal(flattenPdfPageText(items), '3.00\nCSE220');
  // A non-code token at the same offset stays in the row.
  const inRow = [item('3.00', 10, 700, 5), item('done', 60, 697)];
  assert.equal(flattenPdfPageText(inRow), '3.00 done');
});

test('an all-caps overflow fragment longer than 3 forces its own line', () => {
  const items = [item('Differential', 10, 700), item('EQUATIONS', 80, 698)];
  assert.equal(flattenPdfPageText(items), 'Differential\nEQUATIONS');
  // Short all-caps ('GPA') does not.
  const short = [item('Differential', 10, 700, 5), item('GPA', 18, 698)];
  assert.equal(flattenPdfPageText(short), 'Differential GPA');
});

test('empty-string items bridge a space on the same row and advance x', () => {
  const items = [
    item('Credits', 10, 700, 5),
    item('  ', 15.05, 700, 30), // whitespace item, same row → one space, x advances
    item('Earned', 45.1, 700),
  ];
  assert.equal(flattenPdfPageText(items), 'Credits Earned');
});

test('items without transforms contribute text without row/space logic', () => {
  const items = [{ str: 'BRAC' }, { str: 'University' }];
  assert.equal(flattenPdfPageText(items), 'BRACUniversity');
});

test('extractPdfText walks pages in order and newline-joins them', async () => {
  const page = (items) => ({ getTextContent: async () => ({ items }) });
  const pdf = {
    numPages: 2,
    getPage: async (n) => page([item(`PAGE${n}`, 10, 700)]),
  };
  assert.equal(await extractPdfText(pdf), 'PAGE1\nPAGE2\n');
});
