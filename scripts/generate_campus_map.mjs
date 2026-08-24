#!/usr/bin/env node
// scripts/generate_campus_map.mjs
//
// Generates every derived copy of the campus domain map from the registry in
// src/core/university.ts.
//
// WHY THIS EXISTS
// The registry documents itself as the place you add a university. It was not:
// the domain → campus mapping was hand-copied into firestore.rules
// (campusOfEmail), into a second, separate id list in the same file
// (validCampus), and into worker/index.js (CAMPUS_EMAIL_RES) — whose own
// comment conceded it was "a hand-maintained third copy". Adding a university
// meant four edits in three languages, and nothing failed if you made fewer.
//
// The failures were silent and asymmetric, which is what made this worth
// generating rather than documenting harder:
//   registry only          → the student signs in, and every read and write is
//                            denied, because the rules resolve their campus to ''.
//   registry + rules only  → the Worker stamps `university: ''` on the review
//                            and paper rows it writes, so the server produces
//                            documents that match no campus and fail validCampus.
//   validCampus forgotten  → reads work; client writes are rejected on a check
//                            that never names the campus in its error.
//
// WHAT IT WRITES
//   worker/campus.generated.js        the Worker's table, a module like
//                                     catalog.generated.js
//   firestore.rules                   campusOfEmail() and validCampus(), in
//                                     place, between BEGIN/END markers
//
// firestore.rules has no import mechanism, so its two functions are generated
// INTO the file rather than referenced from it. That is a security-critical
// file, so the regions are marked loudly, and --check is what makes generating
// into it safe: CI regenerates and diffs, so a hand edit inside a region fails
// the build instead of quietly surviving until the next regeneration erases it.
//
// Run:      npm run generate:campus-map
// Verify:   npm run check:campus-map    (CI drift guard)

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const workerOut = resolve(repoRoot, 'worker/campus.generated.js');
const rulesPath = resolve(repoRoot, 'firestore.rules');

// ── Loading the registry ─────────────────────────────────────────────────────
// university.ts imports grades.ts and types.ts, so all three are transpiled
// together or the imports dangle. Same convention as tests/typedCoreParity.
const TS_FILES = ['grades.ts', 'types.ts', 'university.ts'];

function rewriteLocalImports(output) {
  return output.replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_m, quote, specifier) => {
    if (/\.[cm]?js$/.test(specifier)) return `from ${quote}${specifier}${quote}`;
    return `from ${quote}${specifier.replace(/\.ts$/, '')}.mjs${quote}`;
  });
}

export async function loadUniversities() {
  const dir = mkdtempSync(join(tmpdir(), 'shohoj-campus-map-'));
  for (const file of TS_FILES) {
    const sourcePath = resolve(repoRoot, 'src/core', file);
    const result = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        strict: true,
      },
    });
    writeFileSync(join(dir, file.replace(/\.ts$/, '.mjs')), rewriteLocalImports(result.outputText));
  }
  const mod = await import(pathToFileURL(join(dir, 'university.mjs')).href);
  return Object.values(mod.UNIVERSITIES);
}

// ── Domains ──────────────────────────────────────────────────────────────────

/**
 * A hostname we are willing to build a regex out of. Deliberately strict: the
 * escaping below is only correct for these characters, and a domain outside
 * this shape should stop the build rather than produce a pattern nobody
 * reviewed.
 */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function campusDomains(profiles) {
  const seen = new Map();
  for (const profile of profiles) {
    if (!profile.emailDomains || profile.emailDomains.length === 0) {
      throw new Error(`campus '${profile.id}' has no emailDomains — it could never sign anyone in`);
    }
    for (const domain of profile.emailDomains) {
      if (!DOMAIN_RE.test(domain)) {
        throw new Error(`campus '${profile.id}': '${domain}' is not a hostname this generator will escape`);
      }
      const owner = seen.get(domain);
      if (owner && owner !== profile.id) {
        throw new Error(`domain '${domain}' is claimed by both '${owner}' and '${profile.id}'`);
      }
      seen.set(domain, profile.id);
    }
  }
  return profiles.map((p) => ({ id: p.id, domains: [...p.emailDomains] }));
}

// ── The three derived forms ──────────────────────────────────────────────────
// Every one of them anchors ^…$ and escapes the dots. An unanchored or
// unescaped pattern would let x@g.bracu.ac.bd.attacker.com through as a BRACU
// student, which is the whole boundary these three copies exist to enforce.

/** JavaScript regex literal source, e.g. ^[^@]+@g\.bracu\.ac\.bd$ */
export function jsPattern(domain) {
  return `^[^@]+@${domain.replace(/\./g, '\\.')}$`;
}

/** Firestore-rules pattern. `[.]` rather than `\.`, matching the file's style. */
export function rulesPattern(domain) {
  return `^[^@]+@${domain.replace(/\./g, '[.]')}$`;
}

export function buildWorkerModule(campuses) {
  const rows = campuses
    .flatMap((c) => c.domains.map((d) => `  ['${c.id}', /${jsPattern(d)}/],`))
    .join('\n');
  const ids = campuses.map((c) => `'${c.id}'`).join(', ');
  return `// worker/campus.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:campus-map
// Source of truth: src/core/university.ts (UNIVERSITIES)
//
// The domain → campus map the Worker stamps onto every document it writes, and
// the id list the Firestore rules validate that stamp against. Anchored ^…$ and
// dot-escaped: an unanchored match would admit x@${campuses[0].domains[0]}.attacker.com
// as a ${campuses[0].id} student.
// ${campuses.length} campuses.

export const CAMPUS_EMAIL_RES = [
${rows}
];

export const VALID_CAMPUS_IDS = new Set([${ids}]);

/** The campus an address belongs to, or '' when no registered campus claims it. */
export function campusOfEmail(email) {
  if (typeof email !== 'string') return '';
  for (const [id, re] of CAMPUS_EMAIL_RES) {
    if (re.test(email)) return id;
  }
  return '';
}

/** True when \`value\` names a campus in the registry. */
export function isValidCampus(value) {
  return typeof value === 'string' && VALID_CAMPUS_IDS.has(value);
}
`;
}

/**
 * The body of the rules' campusOfEmail(), as a nested ternary chain. Indented
 * to sit inside `match /databases/{database}/documents`.
 */
export function buildRulesCampusOfEmail(campuses, indent = '    ') {
  const clause = (c) => c.domains.map((d) => `addr.matches('${rulesPattern(d)}')`).join(' || ');
  // Nested conditionals, one campus per level, each level indented past the
  // last so a fourth campus stays as readable as the second.
  const render = (i, pad) => {
    if (i >= campuses.length) return "''";
    const campus = campuses[i];
    const test = campus.domains.length > 1 ? `(${clause(campus)})` : clause(campus);
    const rest = render(i + 1, `${pad}  `);
    const tail = i + 1 >= campuses.length ? rest : `(${rest})`;
    return `${test}\n${pad}  ? '${campus.id}'\n${pad}  : ${tail}`;
  };
  return [
    `${indent}function campusOfEmail(addr) {`,
    `${indent}  return ${render(0, `${indent}  `)};`,
    `${indent}}`,
  ].join('\n');
}

export function buildRulesValidCampus(campuses, indent = '    ') {
  const ids = campuses.map((c) => `value == '${c.id}'`).join(' || ');
  return `${indent}function validCampus(value) {\n${indent}  return value is string && (${ids});\n${indent}}`;
}

// ── Splicing the rules file ──────────────────────────────────────────────────

export const RULES_REGIONS = ['campusOfEmail', 'validCampus'];

function markers(name) {
  return {
    begin: `// BEGIN GENERATED ${name} — npm run generate:campus-map`,
    end: `// END GENERATED ${name}`,
  };
}

export function spliceRules(source, name, body) {
  const { begin, end } = markers(name);
  const lines = source.split('\n');
  const beginAt = lines.findIndex((line) => line.includes(begin));
  const endAt = lines.findIndex((line) => line.includes(end));
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
    throw new Error(
      `firestore.rules is missing the '${name}' generated region. Restore the ` +
        `'${begin}' / '${end}' marker pair before regenerating.`,
    );
  }
  return [...lines.slice(0, beginAt + 1), ...body.split('\n'), ...lines.slice(endAt)].join('\n');
}

export function buildRules(source, campuses) {
  let next = source;
  next = spliceRules(next, 'campusOfEmail', buildRulesCampusOfEmail(campuses));
  next = spliceRules(next, 'validCampus', buildRulesValidCampus(campuses));
  return next;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const campuses = campusDomains(await loadUniversities());
  if (campuses.length === 0) {
    console.error('refusing to generate an empty campus map — is src/core/university.ts intact?');
    process.exit(1);
  }

  const nextWorker = buildWorkerModule(campuses);
  const currentRules = readFileSync(rulesPath, 'utf8');
  const nextRules = buildRules(currentRules, campuses);

  if (process.argv.includes('--check')) {
    const drifted = [];
    let currentWorker = '';
    try {
      currentWorker = readFileSync(workerOut, 'utf8');
    } catch {
      drifted.push('worker/campus.generated.js is missing');
    }
    if (currentWorker && currentWorker !== nextWorker) drifted.push('worker/campus.generated.js');
    if (currentRules !== nextRules) drifted.push('firestore.rules');
    if (drifted.length > 0) {
      console.error(
        `✗ campus map out of date with src/core/university.ts: ${drifted.join(', ')}\n` +
          '  Run: npm run generate:campus-map',
      );
      process.exit(1);
    }
    console.log(`✅ campus map in sync (${campuses.length} campuses).`);
    return;
  }

  writeFileSync(workerOut, nextWorker);
  writeFileSync(rulesPath, nextRules);
  console.log(
    `✅ wrote worker/campus.generated.js and firestore.rules (${campuses.length} campuses: ` +
      `${campuses.map((c) => c.id).join(', ')}).`,
  );
}

// Importable for tests; only the direct run touches the filesystem.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
