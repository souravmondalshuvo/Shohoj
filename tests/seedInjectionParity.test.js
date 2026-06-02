/**
 * tests/seedInjectionParity.test.js
 *
 * Guards the Vite seed-injection plugin (vite/seed-injection.js) against drift
 * from build3.py. Both must produce identical SEEDED_REVIEWS and
 * SEEDED_FACULTY_PROFILES from the same data/*.jsonl inputs.
 *
 * build3.py is treated as a black box: we import its (untouched) module in a
 * Python subprocess, run build_bundled_js() over the relevant source file, and
 * extract the injected array. No changes to build3.py are required.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSeededReviews, buildSeededProfiles } from '../vite/seed-injection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Run build3.py's build_bundled_js over a single source file and pull out the
// `const <NAME> = [...];` array it injected. We locate the assignment and let
// Python's JSON decoder consume exactly one value from that offset — robust to
// any "]" or ";" inside review text, and it natively handles the backslash
// escapes that js_safe_json (build3.py:132-145) emits.
function build3SeedArray(sourceFile, constName) {
  const py = [
    'import build3, json, sys, io, contextlib',
    'buf = io.StringIO()',
    'with contextlib.redirect_stdout(buf):',  // build3 prints progress; keep it out of our JSON
    `    s = build3.build_bundled_js(${JSON.stringify([sourceFile])}, inject_seeds=True, include_clear_all_data=False)`,
    `marker = 'const ${constName} = '`,
    'i = s.index(marker) + len(marker)',
    'val, _ = json.JSONDecoder().raw_decode(s, i)',
    'sys.stdout.write(json.dumps(val))',
  ].join('\n');

  const raw = execFileSync('python3', ['-c', py], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.ok(raw.trim().length > 0, `build3.py produced no ${constName} array`);
  return JSON.parse(raw);
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`  PASS ${name}`);
  } catch (err) {
    results.push(`  FAIL ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

const reviewsJsonl = readFileSync(path.join(repoRoot, 'data', 'input_reviews.jsonl'), 'utf8');
const profilesJsonl = readFileSync(path.join(repoRoot, 'data', 'faculty_profiles.jsonl'), 'utf8');

check('typed plugin reviews match build3.py SEEDED_REVIEWS', () => {
  const expected = build3SeedArray('js/core/reviews.js', 'SEEDED_REVIEWS');
  const actual = buildSeededReviews(reviewsJsonl);
  assert.equal(actual.length, expected.length, 'review count mismatch');
  assert.deepEqual(actual, expected);
});

check('typed plugin profiles match build3.py SEEDED_FACULTY_PROFILES', () => {
  const expected = build3SeedArray('js/core/faculty.js', 'SEEDED_FACULTY_PROFILES');
  const actual = buildSeededProfiles(profilesJsonl);
  assert.equal(actual.length, expected.length, 'profile count mismatch');
  assert.deepEqual(actual, expected);
});

console.log('\nSeed injection parity:');
for (const line of results) console.log(line);
const passed = results.filter(r => r.startsWith('  PASS')).length;
console.log(`\nResults: ${passed} passed, ${results.length - passed} failed, ${results.length} total`);
