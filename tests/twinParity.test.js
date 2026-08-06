// tests/twinParity.test.js — the js/ ↔ src/ twin contract, enforced (#484).
//
// 17 files under js/ carry a `// Generated from src/...` header. Nothing
// generates them and, until this test, nothing diffed them: they were kept in
// step by hand and the header was the only thing asserting a relationship.
// #479 was the result — the JS grew per-slot room tagging, the TS never did,
// and the gap sat there until semesterBriefing.ts had to work around it.
//
// Three layers, weakest to strongest:
//
//   1. Discovery — every header points at a file that exists.
//   2. Export surface — the two sides export the same names, modulo the
//      asymmetries declared in ASYMMETRIES below.
//   3. Behaviour — identical fixture input through both copies, identical
//      output required. This is the layer that matters: the #479 bug lived
//      inside a function body, so layer 2 would have called it clean.
//
// Direction of authority: TypeScript is the source of truth. src/ is what the
// shell ships and what typecheck covers; js/ is the hand-written mirror kept
// for the legacy bundle until cutover. When these disagree, src/ is right and
// js/ is the bug — unless the pair appears in ASYMMETRIES.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ROOT,
  discoverTwins,
  exportNames,
  importTyped,
  importVanilla,
} from './helpers/twins.mjs';
import { FIXTURES } from './helpers/twinFixtures.mjs';

const twins = discoverTwins();

/**
 * Deliberate divergences. Anything not listed here is drift.
 *
 * Keep this list short and justified — it is the escape hatch, and an
 * unexplained entry is how the contract quietly stops meaning anything.
 */
const ASYMMETRIES = {
  freeRooms: {
    tsOnly: ['ROOM_TYPE_LABELS', 'dayTimeline', 'isLabOccupant', 'roomTypeKey'],
    jsOnly: [],
    why: 'Added by #434 for the shell Rooms route; the legacy Free Rooms tab never needed them.',
  },
  routineExport: {
    tsOnly: [],
    jsOnly: ['paintExportPlan'],
    why: 'A canvas painter. The typed side deliberately keeps only the pure plan builder — rendering is the component layer\'s job on the shell.',
  },
};

/**
 * Twins with no behavioural fixtures, and why. This list is asserted, so it can
 * only shrink on purpose — adding a twin without fixtures fails here.
 */
const UNCOVERED = {
  connectFeedClient: 'every export is network- or cache-bound (fetch, localStorage TTL)',
};

// ── 1. Discovery ─────────────────────────────────────────────────────────────

test('the twin family is discovered from the headers, not a hardcoded list', () => {
  assert.ok(twins.length >= 17, `expected the known family, found ${twins.length}`);
});

test('every "Generated from" header points at a file that exists', () => {
  for (const twin of twins) {
    assert.ok(
      fs.existsSync(path.join(ROOT, twin.ts)),
      `${twin.js} claims to come from ${twin.ts}, which does not exist`,
    );
  }
});

// ── 2. Export surface ────────────────────────────────────────────────────────

test('both sides export the same names, modulo declared asymmetries', async () => {
  const undeclared = [];

  for (const twin of twins) {
    const js = exportNames(await importVanilla(twin.js));
    const ts = exportNames(await importTyped(twin.ts));
    const declared = ASYMMETRIES[twin.name] ?? { tsOnly: [], jsOnly: [] };

    const jsOnly = js.filter((n) => !ts.includes(n) && !declared.jsOnly.includes(n));
    const tsOnly = ts.filter((n) => !js.includes(n) && !declared.tsOnly.includes(n));

    if (jsOnly.length) undeclared.push(`${twin.name}: only in js/ → ${jsOnly.join(', ')}`);
    if (tsOnly.length) undeclared.push(`${twin.name}: only in src/ → ${tsOnly.join(', ')}`);
  }

  assert.deepEqual(undeclared, [], `undeclared export drift:\n  ${undeclared.join('\n  ')}`);
});

test('declared asymmetries are real and still needed', async () => {
  for (const [name, declared] of Object.entries(ASYMMETRIES)) {
    const twin = twins.find((t) => t.name === name);
    assert.ok(twin, `ASYMMETRIES lists ${name}, which is not a twin`);
    assert.ok(declared.why, `${name} asymmetry needs a reason`);

    const js = exportNames(await importVanilla(twin.js));
    const ts = exportNames(await importTyped(twin.ts));
    for (const n of declared.tsOnly) {
      assert.ok(ts.includes(n), `${name}: declared ts-only "${n}" is gone — prune the entry`);
      assert.ok(!js.includes(n), `${name}: "${n}" now exists in js/ too — prune the entry`);
    }
    for (const n of declared.jsOnly) {
      assert.ok(js.includes(n), `${name}: declared js-only "${n}" is gone — prune the entry`);
      assert.ok(!ts.includes(n), `${name}: "${n}" now exists in src/ too — prune the entry`);
    }
  }
});

// ── 3. Behaviour ─────────────────────────────────────────────────────────────

/**
 * Output projections for exports that are deterministic in substance but not in
 * detail. Kept tiny and specific: a projection is a hole in the net, so it must
 * remove only the field that genuinely cannot match.
 */
const PROJECTIONS = {
  'transcript-core': {
    // Semester ids come from a counter seeded off the clock, so the two calls
    // necessarily differ. Everything else about the parse must match.
    parseTranscriptText: stripSemesterIds,
    parseBlobFallback: stripSemesterIds,
  },
};

function stripSemesterIds(out) {
  if (!out || typeof out !== 'object' || !Array.isArray(out.semesters)) return out;
  return {
    ...out,
    semesters: out.semesters.map(({ id, ...rest }) => rest),
  };
}

/**
 * Run `fn` with Date.now() advancing by a day on every read, then restore.
 *
 * Two ordinary calls usually see the same millisecond, which is exactly why a
 * clock-reading fixture can pass a hundred times and then fail. Forcing the
 * clock forward makes clock-dependence show up on the first run instead.
 */
let clockTick = 0;

function withMovingClock(fn) {
  const real = Date.now;
  // The counter is module-level on purpose: resetting it per call would hand
  // both probes the same first reading, which is the failure this exists to
  // prevent. It must keep advancing across probes.
  Date.now = () => 1_767_225_600_000 + ++clockTick * 86_400_000;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

/** Run a call on both sides, capturing a thrown error as a comparable value. */
function outcome(fn, args) {
  try {
    return { ok: fn(...args) };
  } catch (e) {
    return { threw: e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e) };
  }
}

/** Sets and Maps do not deep-compare usefully; normalise to sorted plain data. */
function normalise(value, seen = new Set()) {
  if (value instanceof Set) return { __set: [...value].map((v) => normalise(v, seen)).sort() };
  if (value instanceof Map) {
    return {
      __map: [...value.entries()]
        .map(([k, v]) => [k, normalise(v, seen)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    };
  }
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map((v) => normalise(v, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = normalise(value[k], seen);
    return out;
  }
  if (typeof value === 'function') return '[function]';
  return value;
}

let totalCases = 0;
let totalThrew = 0;

for (const twin of twins) {
  const fixtures = FIXTURES[twin.name];
  if (!fixtures) continue;

  test(`${twin.name}: behaviour agrees on every fixture`, async () => {
    const js = await importVanilla(twin.js);
    const ts = await importTyped(twin.ts);

    const declared = ASYMMETRIES[twin.name] ?? { tsOnly: [], jsOnly: [] };
    const project = PROJECTIONS[twin.name] ?? {};

    for (const [fnName, argSets] of Object.entries(fixtures)) {
      // An export that exists on only one side by design has no parity to test.
      // Skipped rather than dropped, so it starts running if the gap ever closes.
      if (declared.tsOnly.includes(fnName) || declared.jsOnly.includes(fnName)) continue;

      assert.equal(typeof js[fnName], 'function', `${twin.js} has no ${fnName}`);
      assert.equal(typeof ts[fnName], 'function', `${twin.ts} has no ${fnName}`);

      const projector = project[fnName];
      const apply = (r) => (projector && 'ok' in r ? { ok: projector(r.ok) } : r);

      argSets.forEach((args, i) => {
        // Fresh clones per side: a function that mutates its input must not
        // hand the second call a different world than the first saw.
        const jsOut = apply(outcome(js[fnName], structuredClone(args)));
        const tsOut = apply(outcome(ts[fnName], structuredClone(args)));
        totalCases++;
        if (tsOut.threw) totalThrew++;

        // Determinism precheck, with the clock forced to move between the two
        // probe calls. Simply calling twice is not enough: Date.now() usually
        // returns the same millisecond twice in a row, so a clock-reading
        // fixture looks stable and then fails intermittently as "drift" once
        // the two sides land either side of a tick. Advancing the clock turns
        // that into a guaranteed failure, reported as the fixture bug it is.
        assert.deepEqual(
          normalise(apply(withMovingClock(() => outcome(ts[fnName], structuredClone(args))))),
          normalise(apply(withMovingClock(() => outcome(ts[fnName], structuredClone(args))))),
          `${twin.name}.${fnName} case ${i} reads a moving clock, so it cannot ` +
            `test parity — it would pass until the two sides straddled a tick. ` +
            `Inject the time (most of these take a \`now\`) or add a PROJECTIONS entry.`,
        );

        assert.deepEqual(
          normalise(jsOut),
          normalise(tsOut),
          `${twin.name}.${fnName} case ${i} disagrees\n` +
            `  args: ${JSON.stringify(args).slice(0, 200)}`,
        );
      });
    }
  });
}

test('constant exports are identical on both sides', async () => {
  for (const twin of twins) {
    const js = await importVanilla(twin.js);
    const ts = await importTyped(twin.ts);
    const declared = ASYMMETRIES[twin.name] ?? { tsOnly: [], jsOnly: [] };

    for (const name of exportNames(ts)) {
      if (typeof ts[name] === 'function') continue;
      if (declared.tsOnly.includes(name)) continue;
      assert.deepEqual(
        normalise(js[name]),
        normalise(ts[name]),
        `${twin.name}.${name} differs between js/ and src/`,
      );
    }
  }
});

// ── Coverage bookkeeping ─────────────────────────────────────────────────────

test('every twin has behavioural fixtures, or a recorded reason', () => {
  const missing = twins
    .filter((t) => !FIXTURES[t.name] && !UNCOVERED[t.name])
    .map((t) => t.name);

  assert.deepEqual(
    missing,
    [],
    `these twins have neither fixtures nor an UNCOVERED entry:\n  ${missing.join('\n  ')}`,
  );

  for (const name of Object.keys(UNCOVERED)) {
    assert.ok(
      twins.some((t) => t.name === name),
      `UNCOVERED lists ${name}, which is not a twin`,
    );
    assert.ok(!FIXTURES[name], `${name} now has fixtures — drop it from UNCOVERED`);
  }
});

test('the behavioural layer is exercising real return values, not just mutual throws', () => {
  assert.ok(totalCases > 100, `only ${totalCases} behavioural cases ran`);
  const threwRatio = totalThrew / totalCases;
  assert.ok(
    threwRatio < 0.5,
    `${(threwRatio * 100).toFixed(0)}% of cases threw — fixtures are not exercising much`,
  );
});
