#!/usr/bin/env node
// scripts/generate_legacy_catalog.mjs (#810)
//
// Generates each campus's course catalogue, prerequisites and programs for the
// legacy bundle from data/campuses/:
//
//   js/core/catalogNsu.generated.js          NSU, read through activeCatalog.js
//   js/core/catalogBracu.generated.js        BRACU's courses, prerequisites and
//                                            departments, read by catalog.js
//   js/core/departmentsBracu.generated.js    BRACU's programs and presets, read
//                                            by departments.js
//   js/core/catalogDiu.generated.js          DIU's programs, which is all of a
//                                            catalogue DIU publishes
//
// The legacy bundle is one concatenated script (build3.py) and cannot read the
// campus database at run time, so the records it needs are written into
// modules it can carry. The mapping is scripts/legacy_catalog.mjs; this file
// only serialises its output, compactly, because every student downloads it.
//
// BRACU's is two files because the profile page bundles departments.js without
// the catalogue, and should not download 857 courses to list 16 programs.
//
// Run:     npm run generate:legacy-catalog
// Verify:  npm run check:legacy-catalog   (regenerates and diffs; the unit
//                                          suite runs it, so the bundle cannot
//                                          fall behind data/campuses/)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCampuses } from './campus_data.mjs';
import { BRACU_LITERAL_SOURCES, buildLegacyCatalog } from './legacy_catalog.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_PATH = resolve(repoRoot, 'js/core/catalogNsu.generated.js');
export const DIU_OUT_PATH = resolve(repoRoot, 'js/core/catalogDiu.generated.js');
// DIU's course lists are fetched by DIU students alone, not carried in the
// bundle every student downloads. feeds/ is deployed beside the page as it is.
export const DIU_COURSES_URL = 'feeds/diu-courses.json';
export const DIU_COURSES_PATH = resolve(repoRoot, DIU_COURSES_URL);
export const BRACU_CATALOG_OUT_PATH = resolve(repoRoot, 'js/core/catalogBracu.generated.js');
export const BRACU_DEPARTMENTS_OUT_PATH = resolve(
  repoRoot,
  'js/core/departmentsBracu.generated.js',
);

/** `{ a: 1 }` entries, one per line, in the order given. */
const block = (entries) =>
  entries.length === 0
    ? '{}'
    : `{\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`;

/** One program per entry, its presets as [name, [[course, credits]]] rows. */
const programRows = (programs) =>
  Object.entries(programs)
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

function loadCampus(id) {
  const { campuses, errors } = loadCampuses();
  if (errors.length > 0) {
    throw new Error(
      `data/campuses has errors; refusing to generate from it:\n${errors.join('\n')}`,
    );
  }
  return campuses.find((c) => c.id === id);
}

export function renderNsuCatalog() {
  const catalog = buildLegacyCatalog(loadCampus('nsu'));
  if (catalog.allCourses.length === 0)
    throw new Error('refusing to generate an empty NSU catalogue');

  const rows = catalog.allCourses
    .map((c) => `  ${JSON.stringify([c.code, c.name, c.credits])},`)
    .join('\n');
  const programs = programRows(catalog.programs);

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

/** subject prefix → the department that owns it. */
export const NSU_PREFIX_DEPARTMENTS = ${block(Object.entries(catalog.prefixDepartments))};

/** course → department, where it is not its subject's (graduate business courses, mostly). */
export const NSU_DEPARTMENT_OVERRIDES = ${block(Object.entries(catalog.departmentOverrides))};

/** department → { label, school }. */
export const NSU_DEPARTMENT_META = ${block(Object.entries(catalog.departmentMeta))};

/** Departments in the order their tiles are shown: by school, as NSU lists them. */
export const NSU_DEPARTMENT_ORDER = ${JSON.stringify(catalog.departmentOrder)};

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

/**
 * BRACU's catalogue, refused if it holds anything the generated modules cannot
 * say. NSU's leftovers are listed for the app to explain; BRACU's shapes have
 * no such list, so a course would simply go missing from a student's search.
 */
function bracuCatalog() {
  const catalog = buildLegacyCatalog(loadCampus('bracu'), BRACU_LITERAL_SOURCES);
  const fail = (msg) => {
    throw new Error(`data/campuses/bracu: ${msg}`);
  };
  if (catalog.allCourses.length === 0) fail('refusing to generate an empty BRACU catalogue');
  if (catalog.untitled.length) fail(`courses with no title: ${catalog.untitled.join(', ')}`);
  if (catalog.unexpressed.length)
    fail(
      `prerequisites a flat course list cannot hold: ${catalog.unexpressed.join(', ')} ` +
        '(scripts/legacy_catalog.mjs says what it can)',
    );
  // catalog.js used to add any course only a preset named. Nothing adds one
  // now, so a preset may only name courses the catalogue lists.
  for (const [code, program] of Object.entries(catalog.programs)) {
    for (const preset of program.presets) {
      for (const course of preset.courses) {
        const named = course.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]{0,2})\)$/)?.[1];
        if (!named) fail(`plans.${code} "${preset.name}": "${course.name}" names no course`);
        if (!catalog.courses[named])
          fail(`plans.${code} "${preset.name}": ${named} is not in courses.json`);
      }
    }
  }
  return catalog;
}

export function renderBracuCatalog() {
  const catalog = bracuCatalog();
  // In the order courses.json lists them, which COURSE_DB keeps.
  const rows = Object.values(catalog.courses)
    .map((c) => `  ${JSON.stringify([c.code, c.name, c.credits])},`)
    .join('\n');

  return `// js/core/catalogBracu.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:legacy-catalog
// Source of truth: data/campuses/bracu/ (courses, prerequisites, departments)
//
// BRACU's catalogue for the legacy bundle, expanded by js/core/catalog.js.
// ${catalog.allCourses.length} courses, ${Object.keys(catalog.prerequisites).length} prerequisite rules, ${catalog.departmentOrder.length} departments.

/** [code, title, credits], in the order courses.json lists them. */
export const BRACU_CATALOG_ROWS = [
${rows}
];

/** course → { hp: required courses, sp: recommended courses }. */
export const BRACU_PREREQS = ${block(Object.entries(catalog.prerequisites))};

/** subject prefix → the department that owns it. */
export const BRACU_PREFIX_DEPARTMENTS = ${block(Object.entries(catalog.prefixDepartments))};

/** course → department, where it is not its subject's. */
export const BRACU_DEPARTMENT_OVERRIDES = ${block(Object.entries(catalog.departmentOverrides))};

/** department → { label, displayCode?, school }, in the order their tiles are shown. */
export const BRACU_DEPARTMENT_META = ${block(Object.entries(catalog.departmentMeta))};
`;
}

export function renderBracuDepartments() {
  const catalog = bracuCatalog();
  const presets = Object.values(catalog.programs).reduce((n, p) => n + p.presets.length, 0);

  return `// js/core/departmentsBracu.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:legacy-catalog
// Source of truth: data/campuses/bracu/ (programs, plans)
//
// BRACU's programs for the legacy bundle, expanded by js/core/departments.js.
// ${Object.keys(catalog.programs).length} programs, ${presets} semester presets.

/** program → { label, totalCredits, seasons, presets: [[name, [[course, credits]]]] }. */
export const BRACU_PROGRAM_ROWS = {
${programRows(catalog.programs)}
};
`;
}

export function renderDiuCatalog() {
  const campus = loadCampus('diu');
  const catalog = buildLegacyCatalog(campus);
  const count = Object.keys(catalog.programs).length;
  if (count === 0) throw new Error('refusing to generate an empty DIU program list');
  if (catalog.allCourses.length > 0) {
    throw new Error(
      'data/campuses/diu now has a campus-wide courses.json; DIU lists its courses per program (program-courses.json)',
    );
  }
  // `seasons` is written only where DIU's own documents show the program's
  // calendar. The page offers all three seasons to the rest, which is right
  // for a trimester program and one season too many for a bi-semester one.
  const programs = Object.entries(catalog.programs)
    .map(([code, p]) => {
      const seasons = p.seasons ? `, seasons: ${JSON.stringify(p.seasons)}` : '';
      return `  ${JSON.stringify(code)}: { label: ${JSON.stringify(p.label)}, totalCredits: ${p.totalCredits}${seasons} },`;
    })
    .join('\n');

  const lists = diuCourseLists(campus);
  const courseCount = Object.values(lists).reduce((n, rows) => n + rows.length, 0);

  return `// js/core/catalogDiu.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:legacy-catalog
// Source of truth: data/campuses/diu/programs.json and program-courses.json
//
// DIU's programs for the legacy bundle, read through js/core/activeCatalog.js.
// ${count} programs. Their courses — ${courseCount} across the ${Object.keys(lists).length} programs whose pages list
// them in a form Shohoj reads — are in ${DIU_COURSES_URL}, fetched only when a
// DIU student is on the page (docs/campuses/diu-research.md says which programs,
// and why the rest are not there).

/** program → { label, totalCredits, seasons? }. No seasons: DIU does not say which calendar it runs on. */
export const DIU_PROGRAM_ROWS = {
${programs}
};

/** Where DIU's course lists are fetched from, relative to the page. */
export const DIU_COURSES_URL = ${JSON.stringify(DIU_COURSES_URL)};
`;
}

/**
 * Each DIU program's courses, in code order: program → [[code, title, credits]].
 * A code is only unique within a program at DIU, so these never merge into one
 * campus-wide table.
 */
function diuCourseLists(campus) {
  const lists = {};
  for (const r of campus.programCourses?.records ?? []) {
    // Autocomplete fills in a course's title and credits, so a stub (a code
    // only a routine names) has nothing to offer and stays out.
    if (r.title === null || r.credits === null) continue;
    (lists[r.program] ??= []).push([r.code, r.title, r.credits]);
  }
  const sorted = {};
  for (const program of Object.keys(lists).sort()) {
    sorted[program] = lists[program].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return sorted;
}

/** feeds/diu-courses.json — one program per line, so a data change diffs as one. */
export function renderDiuCourses() {
  const lists = diuCourseLists(loadCampus('diu'));
  const body = Object.entries(lists)
    .map(([program, rows]) => `    ${JSON.stringify(program)}: ${JSON.stringify(rows)}`)
    .join(',\n');
  return `{\n  "source": "data/campuses/diu/program-courses.json",\n  "programs": {\n${body}\n  }\n}\n`;
}

const TARGETS = [
  { path: OUT_PATH, render: renderNsuCatalog },
  { path: BRACU_CATALOG_OUT_PATH, render: renderBracuCatalog },
  { path: BRACU_DEPARTMENTS_OUT_PATH, render: renderBracuDepartments },
  { path: DIU_OUT_PATH, render: renderDiuCatalog },
  { path: DIU_COURSES_PATH, render: renderDiuCourses },
];

function main() {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const { path, render } of TARGETS) {
    const next = render();
    const name = relative(repoRoot, path);
    if (!check) {
      writeFileSync(path, next);
      console.log(`wrote ${name} (${(Buffer.byteLength(next) / 1024).toFixed(1)} kB)`);
      continue;
    }
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // missing file: falls through to the mismatch below
    }
    if (current === next) {
      console.log(`${name} is up to date.`);
    } else {
      console.error(`${name} is out of date with data/campuses/.`);
      stale = true;
    }
  }
  if (stale) {
    console.error('Run: npm run generate:legacy-catalog');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
