#!/usr/bin/env node
// scripts/generate_legacy_catalog.mjs (#810)
//
// Generates js/core/catalogNsu.generated.js — NSU's course catalogue,
// prerequisites and programs for the legacy bundle — from data/campuses/nsu/.
//
// The legacy bundle is one concatenated script (build3.py) and cannot read the
// campus database at run time, so the records it needs are written into a
// module it can carry. The mapping is scripts/legacy_catalog.mjs, which is
// proven against BRACU's hand-written literals; this file only serialises its
// output, compactly, because every student downloads it.
//
// Run:     npm run generate:legacy-catalog
// Verify:  npm run check:legacy-catalog   (regenerates and diffs; the unit
//                                          suite runs it, so the bundle cannot
//                                          fall behind data/campuses/nsu/)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCampuses } from './campus_data.mjs';
import { buildLegacyCatalog } from './legacy_catalog.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_PATH = resolve(repoRoot, 'js/core/catalogNsu.generated.js');

/** `{ a: 1 }` entries, one per line, in the order given. */
const block = (entries) =>
  entries.length === 0
    ? '{}'
    : `{\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`;

export function renderNsuCatalog() {
  const { campuses, errors } = loadCampuses();
  if (errors.length > 0) {
    throw new Error(
      `data/campuses has errors; refusing to generate from it:\n${errors.join('\n')}`,
    );
  }
  const nsu = campuses.find((c) => c.id === 'nsu');
  const catalog = buildLegacyCatalog(nsu);
  if (catalog.allCourses.length === 0)
    throw new Error('refusing to generate an empty NSU catalogue');

  const rows = catalog.allCourses
    .map((c) => `  ${JSON.stringify([c.code, c.name, c.credits])},`)
    .join('\n');
  const programs = Object.entries(catalog.programs)
    .map(([code, p]) => {
      const presets = p.presets
        .map((s) => `      ${JSON.stringify([s.name, s.courses.map((c) => [c.name, c.credits])])},`)
        .join('\n');
      const head = `label: ${JSON.stringify(p.label)}, totalCredits: ${p.totalCredits}, seasons: ${JSON.stringify(p.seasons)}`;
      return presets
        ? `  ${JSON.stringify(code)}: {\n    ${head},\n    presets: [\n${presets}\n    ],\n  },`
        : `  ${JSON.stringify(code)}: { ${head}, presets: [] },`;
    })
    .join('\n');

  return `// js/core/catalogNsu.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:legacy-catalog
// Source of truth: data/campuses/nsu/ (courses, prerequisites, programs, plans)
//
// NSU's catalogue for the legacy bundle, read through js/core/activeCatalog.js.
// ${catalog.allCourses.length} courses, ${Object.keys(catalog.prerequisites).length} prerequisite rules, ${Object.keys(catalog.programs).length} programs.
//
// Left out because the data does not state them in a form these shapes hold
// (scripts/legacy_catalog.mjs says why): ${catalog.untitled.length} courses with no published title,
// listed in NSU_UNTITLED_CODES, and the prerequisites of ${catalog.unexpressed.length} courses, listed in
// NSU_UNEXPRESSED_PREREQS.

/** [code, title, credits], in code order. */
export const NSU_CATALOG_ROWS = [
${rows}
];

/** course → { hp: required courses }. */
export const NSU_PREREQS = ${block(Object.entries(catalog.prerequisites))};

/** subject prefix → department. NSU's database has no department table yet. */
export const NSU_PREFIX_DEPARTMENTS = ${block(Object.entries(catalog.prefixDepartments))};

/** department → { label, school }. */
export const NSU_DEPARTMENT_META = ${block(Object.entries(catalog.departmentMeta))};

/** program → { label, totalCredits, seasons, presets: [[name, [[course, credits]]]] }. */
export const NSU_PROGRAM_ROWS = {
${programs}
};

/** Offered at NSU, but no source publishes a title or credits. */
export const NSU_UNTITLED_CODES = ${JSON.stringify(catalog.untitled)};

/** Courses whose prerequisite the flat list above cannot express. */
export const NSU_UNEXPRESSED_PREREQS = ${JSON.stringify(catalog.unexpressed)};
`;
}

function main() {
  const next = renderNsuCatalog();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT_PATH, 'utf8');
    } catch {
      // missing file: falls through to the mismatch below
    }
    if (current !== next) {
      console.error(
        'js/core/catalogNsu.generated.js is out of date with data/campuses/nsu/.\n' +
          'Run: npm run generate:legacy-catalog',
      );
      process.exit(1);
    }
    console.log('js/core/catalogNsu.generated.js is up to date.');
    return;
  }
  writeFileSync(OUT_PATH, next);
  console.log(`wrote ${OUT_PATH} (${(Buffer.byteLength(next) / 1024).toFixed(1)} kB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
