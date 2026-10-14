// tests/campusMapStyles.test.js
//
// The Campus Map wears the legacy site's look in two places — the legacy
// page's Campus Map tab and the standalone /campus/ page — from one sheet,
// css/campus-map.css (#887). These hold the arrangement together:
//
//   - both pages link that sheet, and style.css no longer carries a copy;
//   - the standalone page, which cannot load style.css (its landing-page
//     rules would restyle the map), carries style.css's colour tokens
//     verbatim, so the two pages cannot drift apart in colour.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const STYLE = read('css/style.css');
const MAP = read('css/campus-map.css');
const LEGACY_PAGE = read('index.html');
const STANDALONE = read('campus/index.html');

/** style.css's token block: its first comment up to the rule that follows it. */
function tokenBlock(css) {
  const start = css.indexOf('/* ── TOKENS');
  const end = css.indexOf('*, *::before');
  assert.ok(start === 0 && end > start, 'found the token block at the top of css/style.css');
  return css.slice(start, end).trimEnd();
}

test('the standalone page carries css/style.css\'s colour tokens, verbatim', () => {
  const tokens = tokenBlock(STYLE);
  assert.ok(tokens.includes('[data-theme="dark"]') && tokens.includes('[data-theme="light"]'));
  assert.ok(
    STANDALONE.includes(tokens),
    'campus/index.html must contain css/style.css\'s TOKENS block unchanged — copy it across again',
  );
});

test('both pages wear the one map sheet, and style.css keeps no copy of it', () => {
  assert.ok(LEGACY_PAGE.includes('<link rel="stylesheet" href="css/campus-map.css">'));
  assert.ok(STANDALONE.includes('<link rel="stylesheet" href="../css/campus-map.css" />'));
  assert.ok(STANDALONE.includes('<main id="campusMap">'), 'the standalone page names the scope the sheet uses');
  assert.equal(STYLE.includes('.campus-floor-btn'), false, 'the map\'s rules live in css/campus-map.css only');
  assert.ok(MAP.includes(':is(#tabCampus, #campusMap) .campus-floor-btn'));
});

/** A selector list's members — commas inside :is( … ) do not split it. */
function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

test('every map rule is scoped to one of the two pages', () => {
  // A rule that escaped its scope would restyle the shell, which uses the
  // same class names. Strip comments and at-rule headers, then every selector
  // that names a map or shell class must start inside the scope.
  const body = MAP.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...body.matchAll(/(^|[{}])([^{}]*?)\{/g)]
    .map((m) => m[2].trim())
    .filter((s) => !s.startsWith('@') && !/^(from|to|\d+%)/.test(s));
  assert.ok(selectors.length > 50, `parsed the sheet (${selectors.length} selectors)`);
  for (const list of selectors) {
    for (const selector of splitSelectors(list)) {
      if (/^\.campus-map-(tab|skeleton)\b/.test(selector)) continue; // the loader's own nodes
      assert.match(selector, /^:(is|where)\(#tabCampus, #campusMap\) /, selector);
    }
  }
});
