// worker/test/sqlSafety.test.js
//
// SQL injection is a live surface since #908 put Shohoj's first SQL in front
// of student data. The rule is the security review's: every query is a
// prepared statement with bound parameters, and no text a caller supplies is
// ever spliced into SQL. This fails the build when code drifts from it.
//
// Checked structurally rather than by reading every query:
//
//   * `.prepare(` appears in the D1 store and nowhere else in the Worker;
//   * there, it is only ever called as `.prepare(SQL.<name>)`, or with
//     `sql` — the parameter of the store's own helpers, which are themselves
//     only called with `SQL.<name>`;
//   * the `SQL` table holds constants: no `${…}` interpolation and no `+`
//     concatenation anywhere inside it;
//   * nothing calls a database `.exec(`, D1's unparameterised entry point.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D1_MODULE = 'academicStoreD1.js';

/** Source with block comments and whole-line `//` comments removed. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function workerModules() {
  return readdirSync(WORKER_DIR).filter(
    (name) => name.endsWith('.js') && !name.endsWith('.generated.js'),
  );
}

const d1Source = () => codeOnly(readFileSync(path.join(WORKER_DIR, D1_MODULE), 'utf8'));

/** The text of `const SQL = Object.freeze({ … });`. */
function sqlTable(source) {
  const start = source.indexOf('const SQL = Object.freeze({');
  assert.notEqual(start, -1, 'the D1 store must keep its statements in `const SQL`');
  const end = source.indexOf('\n});', start);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

/** Every argument passed to `.prepare(`, as written. */
function prepareArguments(source) {
  return [...source.matchAll(/\.prepare\(\s*([^)]*?)\s*\)/g)].map((match) => match[1]);
}

/** Every argument passed as the first argument of the store's helpers. */
function helperArguments(source) {
  return [...source.matchAll(/\b(?:first|all|run)\(\s*([^,)]+)/g)].map((match) => match[1].trim());
}

test('only the D1 store prepares SQL', () => {
  const offenders = workerModules()
    .filter((name) => name !== D1_MODULE)
    .filter((name) =>
      /\.prepare\(/.test(codeOnly(readFileSync(path.join(WORKER_DIR, name), 'utf8'))),
    );
  assert.deepEqual(offenders, []);
});

test('the D1 store prepares named constants only', () => {
  const args = prepareArguments(d1Source());
  assert.ok(args.length > 0, 'the scan must find the store’s prepare calls');
  for (const arg of args) {
    assert.match(arg, /^(SQL\.[A-Za-z]+|sql)$/, `.prepare(${arg}) is not a named statement`);
  }
});

test("the store's query helpers are only handed named constants", () => {
  const args = helperArguments(d1Source()).filter((arg) => arg !== 'sql' && !arg.startsWith('('));
  assert.ok(args.length > 0, 'the scan must find the helper calls');
  for (const arg of args) {
    assert.match(arg, /^(SQL\.[A-Za-z]+|get|list|put|remove)$/, `helper called with ${arg}`);
  }
});

test('the statement table is constants: no interpolation, no concatenation', () => {
  const table = sqlTable(d1Source());
  assert.ok(!table.includes('${'), 'a statement interpolates a value');
  assert.ok(!/['"`]\s*\+|\+\s*['"`]/.test(table), 'a statement is built by concatenation');
});

test('nothing calls an unparameterised exec on a database', () => {
  for (const name of workerModules()) {
    const code = codeOnly(readFileSync(path.join(WORKER_DIR, name), 'utf8'));
    assert.ok(!/\b(?:db|DB|database)\s*\.\s*exec\(/.test(code), `${name} calls exec()`);
  }
});

test('the guard sees the shapes it is meant to refuse', () => {
  assert.deepEqual(prepareArguments('db.prepare(`SELECT * FROM t WHERE id = ${id}`)'), [
    '`SELECT * FROM t WHERE id = ${id}`',
  ]);
  assert.doesNotMatch('`SELECT ${id}`', /^(SQL\.[A-Za-z]+|sql)$/);
  assert.ok(sqlTable('const SQL = Object.freeze({\n  a: `x ${y}`,\n});').includes('${'));
});
