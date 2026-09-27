// scripts/build_campus_db.mjs (#784)
//
// Compiles data/campuses/ into a queryable SQLite database.
//
//   npm run db:build                 → dist-data/campus.db + dist-data/campus.sql
//   node scripts/build_campus_db.mjs --out <dir>
//
// The build first renders the whole database as one SQL script, then runs that
// same script into SQLite. The script is also written out as campus.sql, which
// Cloudflare D1 loads as-is (`wrangler d1 execute <db> --file dist-data/campus.sql`),
// so the local database and a D1 copy can never be built by two different code
// paths. Output is deterministic: rows are emitted in sorted order and nothing
// time-dependent is stored, so an unchanged source rebuilds byte-for-byte.
//
// Refuses to build when scripts/campus_data.mjs reports errors — a database
// compiled from data that failed validation would answer queries with it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadCampuses } from './campus_data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT_DIR = path.join(ROOT, 'dist-data');

const SCHEMA = `
CREATE TABLE sources (
  campus TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL,
  url TEXT NOT NULL, retrieved TEXT NOT NULL, PRIMARY KEY (campus, id));
CREATE TABLE campuses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL, email_domains TEXT NOT NULL,
  retake_eligible_at_or_below TEXT, retake_counts TEXT, max_retakes INTEGER,
  good_standing_min_cgpa REAL, probation_below_cgpa REAL, probation_terms_to_recover INTEGER,
  credit_load_max INTEGER);
CREATE TABLE grades (
  campus TEXT NOT NULL, letter TEXT NOT NULL, points REAL, min_mark REAL,
  counts_in_gpa INTEGER NOT NULL, meaning TEXT, rank INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, letter));
CREATE TABLE cgpa_bands (
  campus TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, min_cgpa REAL NOT NULL,
  source TEXT NOT NULL, PRIMARY KEY (campus, kind, label));
CREATE TABLE class_standing (
  campus TEXT NOT NULL, label TEXT NOT NULL, min_credits INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, label));
CREATE TABLE full_time_loads (
  campus TEXT NOT NULL, term_system TEXT NOT NULL, min_credits INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, term_system));
CREATE TABLE academic_rules (
  campus TEXT NOT NULL, id TEXT NOT NULL, rule TEXT NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, id));
CREATE TABLE term_systems (
  campus TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, season TEXT NOT NULL,
  months TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, id, position));
CREATE TABLE days (
  campus TEXT NOT NULL, code TEXT NOT NULL, day TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY (campus, code));
CREATE TABLE buildings (
  campus TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (campus, code));
CREATE TABLE programs (
  campus TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, school TEXT NOT NULL,
  total_credits INTEGER NOT NULL, term_system TEXT NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, code));
CREATE TABLE program_conflicts (
  campus TEXT NOT NULL, program TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL,
  source TEXT NOT NULL, note TEXT NOT NULL);
CREATE TABLE courses (
  campus TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, credits REAL NOT NULL,
  subject TEXT NOT NULL, level INTEGER NOT NULL, is_lab INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, code));
CREATE TABLE prerequisites (
  campus TEXT NOT NULL, course TEXT NOT NULL, min_credits INTEGER, or_consent INTEGER NOT NULL,
  unparsed INTEGER NOT NULL, raw TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, course));
-- One row per acceptable course for each requirement: a course needs, for every
-- requirement number, at least one of that requirement's rows satisfied.
CREATE TABLE prerequisite_options (
  campus TEXT NOT NULL, course TEXT NOT NULL, requirement INTEGER NOT NULL, requires TEXT NOT NULL,
  PRIMARY KEY (campus, course, requirement, requires));
CREATE TABLE sections (
  campus TEXT NOT NULL, term TEXT NOT NULL, course TEXT NOT NULL, section INTEGER NOT NULL,
  faculty TEXT, days TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL, room TEXT,
  capacity INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, term, course, section));
-- A section's days expanded to one row per weekday, which is what free-room
-- and clash queries actually join on.
CREATE TABLE meetings (
  campus TEXT NOT NULL, term TEXT NOT NULL, course TEXT NOT NULL, section INTEGER NOT NULL,
  day TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL, room TEXT,
  PRIMARY KEY (campus, term, course, section, day));
CREATE TABLE calendar_events (
  campus TEXT NOT NULL, term TEXT NOT NULL, term_system TEXT NOT NULL, date TEXT NOT NULL,
  kind TEXT NOT NULL, event TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE bus_routes (
  campus TEXT NOT NULL, route TEXT NOT NULL, stops TEXT NOT NULL, service_from TEXT NOT NULL,
  service_to TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, route));
CREATE TABLE bus_times (
  campus TEXT NOT NULL, route TEXT NOT NULL, direction TEXT NOT NULL, time TEXT NOT NULL,
  PRIMARY KEY (campus, route, direction, time));
CREATE INDEX meetings_room ON meetings (campus, term, room, day);
CREATE INDEX sections_faculty ON sections (campus, term, faculty);
CREATE VIEW rooms AS
  SELECT campus, term, room,
         CASE WHEN room GLOB '[A-Z]*[0-9]*' THEN rtrim(room, '0123456789') ELSE NULL END AS building,
         COUNT(*) AS sections, MAX(capacity) AS largest_section
  FROM sections WHERE room IS NOT NULL GROUP BY campus, term, room;
`;

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot store ${value}`);
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, columns, rows) {
  const cols = columns.map((c) => (c === 'end' ? '"end"' : c)).join(', ');
  return rows.map(
    (row) => `INSERT INTO ${table} (${cols}) VALUES (${row.map(sqlValue).join(', ')});`,
  );
}

const byKey =
  (...keys) =>
  (a, b) => {
    for (const k of keys) {
      const x = a[k];
      const y = b[k];
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };

function campusStatements(c) {
  const out = [];
  const p = c.profile;
  const id = c.id;

  out.push(
    ...insert(
      'sources',
      ['campus', 'id', 'status', 'title', 'url', 'retrieved'],
      [...c.sources.records]
        .sort(byKey('id'))
        .map((s) => [id, s.id, s.status, s.title, s.url, s.retrieved]),
    ),
  );

  out.push(
    ...insert(
      'campuses',
      [
        'id',
        'name',
        'short_name',
        'email_domains',
        'retake_eligible_at_or_below',
        'retake_counts',
        'max_retakes',
        'good_standing_min_cgpa',
        'probation_below_cgpa',
        'probation_terms_to_recover',
        'credit_load_max',
      ],
      [
        [
          id,
          p.name,
          p.shortName,
          p.identity.emailDomains.join(','),
          p.retake.eligibleAtOrBelow,
          p.retake.counts,
          p.retake.maxRetakes,
          p.standing.goodStandingMinCgpa,
          p.standing.probation.belowCgpa,
          p.standing.probation.termsToRecover,
          p.creditLoad.max,
        ],
      ],
    ),
  );

  const grades = p.grading.scale.map((g, i) => [
    id,
    g.letter,
    g.points,
    g.minMark,
    1,
    null,
    i,
    p.grading.source,
  ]);
  p.grading.nonGpaGrades.forEach((g, i) =>
    grades.push([id, g.letter, null, null, 0, g.meaning, grades.length + i, p.grading.source]),
  );
  out.push(
    ...insert(
      'grades',
      ['campus', 'letter', 'points', 'min_mark', 'counts_in_gpa', 'meaning', 'rank', 'source'],
      grades,
    ),
  );

  const bands = [
    ...p.classDivisions.records.map((b) => [
      id,
      'class-division',
      b.label,
      b.minCgpa,
      p.classDivisions.source,
    ]),
    ...p.honours.records.map((b) => [id, 'honours', b.label, b.minCgpa, p.honours.source]),
  ];
  out.push(...insert('cgpa_bands', ['campus', 'kind', 'label', 'min_cgpa', 'source'], bands));
  out.push(
    ...insert(
      'class_standing',
      ['campus', 'label', 'min_credits', 'source'],
      p.classStanding.records.map((s) => [id, s.label, s.minCredits, p.classStanding.source]),
    ),
  );
  out.push(
    ...insert(
      'full_time_loads',
      ['campus', 'term_system', 'min_credits', 'source'],
      Object.entries(p.creditLoad.fullTimeMin)
        .sort()
        .map(([sys, min]) => [id, sys, min, p.creditLoad.source]),
    ),
  );
  out.push(
    ...insert(
      'academic_rules',
      ['campus', 'id', 'rule', 'source'],
      p.academicRules.records.map((r) => [id, r.id, r.rule, p.academicRules.source]),
    ),
  );
  out.push(
    ...insert(
      'term_systems',
      ['campus', 'id', 'position', 'season', 'months', 'source'],
      p.termSystems.records.flatMap((t) =>
        t.terms.map((term, i) => [id, t.id, i, term.season, term.months, p.termSystems.source]),
      ),
    ),
  );
  out.push(
    ...insert(
      'days',
      ['campus', 'code', 'day', 'position'],
      p.days.records.map((d, i) => [id, d.code, d.day, i]),
    ),
  );
  out.push(
    ...insert(
      'buildings',
      ['campus', 'code', 'name'],
      p.buildings.records.map((b) => [id, b.code, b.name]),
    ),
  );

  if (c.programs) {
    const programs = [...c.programs.records].sort(byKey('code'));
    out.push(
      ...insert(
        'programs',
        ['campus', 'code', 'name', 'school', 'total_credits', 'term_system', 'source'],
        programs.map((r) => [
          id,
          r.code,
          r.name,
          r.school,
          r.totalCredits,
          r.termSystem,
          c.programs.source,
        ]),
      ),
    );
    out.push(
      ...insert(
        'program_conflicts',
        ['campus', 'program', 'field', 'value', 'source', 'note'],
        programs.flatMap((r) =>
          (r.conflicts ?? []).map((x) => [
            id,
            r.code,
            x.field,
            JSON.stringify(x.value),
            x.source,
            x.note,
          ]),
        ),
      ),
    );
  }

  if (c.courses) {
    out.push(
      ...insert(
        'courses',
        ['campus', 'code', 'title', 'credits', 'subject', 'level', 'is_lab', 'source'],
        [...c.courses.records].sort(byKey('code')).map((r) => {
          const [, subject, digits, suffix] = r.code.match(/^([A-Z]+)(\d{3})([A-Z]?)$/);
          return [
            id,
            r.code,
            r.title,
            r.credits,
            subject,
            Number(digits[0]) * 100,
            suffix === 'L',
            r.source ?? c.courses.source,
          ];
        }),
      ),
    );
  }

  if (c.prerequisites) {
    const rules = [...c.prerequisites.records].sort(byKey('course'));
    out.push(
      ...insert(
        'prerequisites',
        ['campus', 'course', 'min_credits', 'or_consent', 'unparsed', 'raw', 'source'],
        rules.map((r) => [
          id,
          r.course,
          r.minCredits ?? null,
          !!r.orConsent,
          !!r.unparsed,
          r.raw,
          c.prerequisites.source,
        ]),
      ),
    );
    out.push(
      ...insert(
        'prerequisite_options',
        ['campus', 'course', 'requirement', 'requires'],
        rules.flatMap((r) =>
          (r.allOf ?? []).flatMap((group, i) => group.map((code) => [id, r.course, i + 1, code])),
        ),
      ),
    );
  }

  for (const term of Object.keys(c.sections).sort()) {
    const file = c.sections[term];
    const rows = [...file.records].sort(byKey('course', 'section'));
    out.push(
      ...insert(
        'sections',
        [
          'campus',
          'term',
          'course',
          'section',
          'faculty',
          'days',
          'start',
          'end',
          'room',
          'capacity',
          'source',
        ],
        rows.map((s) => [
          id,
          term,
          s.course,
          s.section,
          s.faculty,
          s.days,
          s.start,
          s.end,
          s.room,
          s.capacity,
          file.source,
        ]),
      ),
    );
    out.push(
      ...insert(
        'meetings',
        ['campus', 'term', 'course', 'section', 'day', 'start', 'end', 'room'],
        rows.flatMap((s) =>
          [...s.days].map((day) => [id, term, s.course, s.section, day, s.start, s.end, s.room]),
        ),
      ),
    );
  }

  for (const term of Object.keys(c.calendars).sort()) {
    const file = c.calendars[term];
    out.push(
      ...insert(
        'calendar_events',
        ['campus', 'term', 'term_system', 'date', 'kind', 'event', 'source'],
        file.records.map((e) => [id, term, file.termSystem, e.date, e.kind, e.event, file.source]),
      ),
    );
  }

  if (c.bus) {
    const routes = [...c.bus.records].sort(byKey('route'));
    out.push(
      ...insert(
        'bus_routes',
        ['campus', 'route', 'stops', 'service_from', 'service_to', 'source'],
        routes.map((r) => [
          id,
          r.route,
          JSON.stringify(r.stops),
          c.bus.servicePeriod.from,
          c.bus.servicePeriod.to,
          c.bus.source,
        ]),
      ),
    );
    out.push(
      ...insert(
        'bus_times',
        ['campus', 'route', 'direction', 'time'],
        routes.flatMap((r) => [
          ...r.arriveNsu.map((t) => [id, r.route, 'arrive', t]),
          ...r.departNsu.map((t) => [id, r.route, 'depart', t]),
        ]),
      ),
    );
  }
  return out;
}

/** Render the complete database as one SQL script. */
export function renderCampusSql(campuses) {
  const lines = [
    '-- Generated by scripts/build_campus_db.mjs from data/campuses/. Do not edit.',
    SCHEMA.trim(),
  ];
  for (const c of campuses) lines.push(`-- ${c.id}`, ...campusStatements(c));
  return `${lines.join('\n')}\n`;
}

/**
 * Validate data/campuses/, then write <outDir>/campus.sql and <outDir>/campus.db.
 * Throws with the validation errors rather than building from bad data.
 */
export function buildCampusDb({ dataDir, outDir = DEFAULT_OUT_DIR } = {}) {
  const { campuses, errors, warnings } = loadCampuses(dataDir);
  if (errors.length) {
    throw new Error(
      `campus data has ${errors.length} error(s); run node scripts/campus_data.mjs\n${errors.slice(0, 10).join('\n')}`,
    );
  }
  const sql = renderCampusSql(campuses);
  fs.mkdirSync(outDir, { recursive: true });
  const sqlPath = path.join(outDir, 'campus.sql');
  const dbPath = path.join(outDir, 'campus.db');
  fs.writeFileSync(sqlPath, sql);
  fs.rmSync(dbPath, { force: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`BEGIN;\n${sql}COMMIT;`);
  } finally {
    db.close();
  }
  return { dbPath, sqlPath, campuses: campuses.map((c) => c.id), warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outFlag = process.argv.indexOf('--out');
  const outDir = outFlag > -1 ? path.resolve(process.argv[outFlag + 1]) : DEFAULT_OUT_DIR;
  try {
    const { dbPath, sqlPath, campuses, warnings } = buildCampusDb({ outDir });
    const show = (p) => (p.startsWith(ROOT + path.sep) ? path.relative(ROOT, p) : p);
    console.log(
      `built ${show(dbPath)} and ${show(sqlPath)} for ${campuses.join(', ')}` +
        (warnings.length
          ? ` (${warnings.length} data warning(s); node scripts/campus_data.mjs lists them)`
          : ''),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
