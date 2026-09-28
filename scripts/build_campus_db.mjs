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
  retake_eligible_at_or_below TEXT, retake_counts TEXT, retake_cutoff TEXT, max_retakes INTEGER,
  good_standing_min_cgpa REAL, probation_below_cgpa REAL, probation_terms_to_recover INTEGER,
  credit_load_min INTEGER, credit_load_warn_above INTEGER, credit_load_max INTEGER,
  lat REAL, lng REAL, radius_m REAL, utc_offset_minutes INTEGER, day_start TEXT, day_end TEXT,
  room_code_pattern TEXT, room_code_regex TEXT);
CREATE TABLE grades (
  campus TEXT NOT NULL, letter TEXT NOT NULL, points REAL, min_mark REAL,
  counts_in_gpa INTEGER NOT NULL, meaning TEXT, rank INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, letter));
-- The letter shown for a grade point, when two letters share one (A+ and A).
CREATE TABLE grade_display (
  campus TEXT NOT NULL, points REAL NOT NULL, letter TEXT NOT NULL, PRIMARY KEY (campus, points));
CREATE TABLE standing_tiers (
  campus TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, standing_label TEXT NOT NULL,
  goal_label TEXT NOT NULL, min_cgpa REAL NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, id));
CREATE TABLE features (
  campus TEXT NOT NULL, feature TEXT NOT NULL, PRIMARY KEY (campus, feature));
CREATE TABLE transcript_markers (
  campus TEXT NOT NULL, position INTEGER NOT NULL, marker TEXT NOT NULL, PRIMARY KEY (campus, position));
CREATE TABLE room_kinds (
  campus TEXT NOT NULL, letter TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (campus, letter));
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
  months TEXT, source TEXT NOT NULL, PRIMARY KEY (campus, id, position));
CREATE TABLE days (
  campus TEXT NOT NULL, code TEXT NOT NULL, day TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY (campus, code));
CREATE TABLE buildings (
  campus TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (campus, code));
CREATE TABLE programs (
  campus TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, school TEXT,
  total_credits REAL NOT NULL, term_system TEXT, extends TEXT,
  credit_load_min INTEGER, credit_load_max INTEGER, note TEXT, source TEXT NOT NULL,
  PRIMARY KEY (campus, code));
CREATE TABLE program_conflicts (
  campus TEXT NOT NULL, program TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL,
  source TEXT NOT NULL, note TEXT NOT NULL);
CREATE TABLE program_rules (
  campus TEXT NOT NULL, program TEXT NOT NULL, id TEXT NOT NULL, rule TEXT NOT NULL,
  source TEXT NOT NULL, PRIMARY KEY (campus, program, id));
CREATE TABLE departments (
  campus TEXT NOT NULL, code TEXT NOT NULL, label TEXT NOT NULL, school TEXT NOT NULL,
  display_code TEXT, PRIMARY KEY (campus, code));
CREATE TABLE department_subjects (
  campus TEXT NOT NULL, subject TEXT NOT NULL, department TEXT NOT NULL,
  PRIMARY KEY (campus, subject));
CREATE TABLE department_overrides (
  campus TEXT NOT NULL, course TEXT NOT NULL, department TEXT NOT NULL,
  PRIMARY KEY (campus, course));
CREATE TABLE courses (
  campus TEXT NOT NULL, code TEXT NOT NULL, title TEXT, credits REAL,
  subject TEXT NOT NULL, level INTEGER NOT NULL, is_lab INTEGER NOT NULL, department TEXT,
  catalogue_group TEXT, position INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, code));
-- A course can carry rules from several documents, some scoped to one program,
-- so each rule has its own id.
CREATE TABLE prerequisites (
  campus TEXT NOT NULL, id INTEGER NOT NULL, course TEXT NOT NULL, program TEXT,
  min_credits INTEGER, min_cgpa REAL, or_consent INTEGER NOT NULL, unparsed INTEGER NOT NULL,
  raw TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, id));
-- One row per acceptable course for each requirement of a rule: the rule holds
-- when, for every requirement number, at least one of its rows is satisfied.
CREATE TABLE prerequisite_options (
  campus TEXT NOT NULL, rule INTEGER NOT NULL, course TEXT NOT NULL, requirement INTEGER NOT NULL,
  requires TEXT NOT NULL, PRIMARY KEY (campus, rule, requirement, requires));
-- The other shape: the rule holds when every course of any one path is done
-- (CONNECT's "(A AND B) OR (C AND D)").
CREATE TABLE prerequisite_paths (
  campus TEXT NOT NULL, rule INTEGER NOT NULL, course TEXT NOT NULL, path INTEGER NOT NULL,
  requires TEXT NOT NULL, PRIMARY KEY (campus, rule, path, requires));
CREATE TABLE prerequisite_recommended (
  campus TEXT NOT NULL, rule INTEGER NOT NULL, course TEXT NOT NULL, recommends TEXT NOT NULL,
  PRIMARY KEY (campus, rule, recommends));
CREATE TABLE plans (
  campus TEXT NOT NULL, program TEXT NOT NULL, position INTEGER NOT NULL, year INTEGER NOT NULL,
  term INTEGER, term_label TEXT, code TEXT, title TEXT NOT NULL, credits REAL NOT NULL,
  alternatives TEXT, category TEXT, note TEXT, source TEXT NOT NULL,
  PRIMARY KEY (campus, program, position));
CREATE TABLE minors (
  campus TEXT NOT NULL, code TEXT NOT NULL, label TEXT NOT NULL, short_label TEXT NOT NULL,
  department TEXT NOT NULL, total_credits REAL NOT NULL, elective_credits REAL NOT NULL,
  document TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (campus, code));
-- A core requirement is met by any one of its codes.
CREATE TABLE minor_requirements (
  campus TEXT NOT NULL, minor TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL,
  title TEXT NOT NULL, credits REAL NOT NULL, codes TEXT NOT NULL, PRIMARY KEY (campus, minor, id));
-- Elective pool: explicit codes, subject/level patterns ("MAT 3XX-4XX"), and
-- the option labels as published.
CREATE TABLE minor_electives (
  campus TEXT NOT NULL, minor TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL,
  value TEXT NOT NULL, PRIMARY KEY (campus, minor, kind, position));
CREATE TABLE faculty (
  campus TEXT NOT NULL, initials TEXT NOT NULL, name TEXT NOT NULL, email TEXT, dept TEXT NOT NULL,
  source TEXT NOT NULL, PRIMARY KEY (campus, initials));
CREATE TABLE faculty_courses (
  campus TEXT NOT NULL, initials TEXT NOT NULL, course TEXT NOT NULL,
  PRIMARY KEY (campus, initials, course));
CREATE TABLE reviews (
  campus TEXT NOT NULL, id INTEGER NOT NULL, faculty TEXT NOT NULL, course TEXT NOT NULL,
  semester TEXT, teaching INTEGER NOT NULL, marking INTEGER NOT NULL, behavior INTEGER NOT NULL,
  difficulty INTEGER NOT NULL, workload INTEGER NOT NULL, text TEXT NOT NULL, source_url TEXT,
  source TEXT NOT NULL, PRIMARY KEY (campus, id));
CREATE TABLE requirement_groups (
  campus TEXT NOT NULL, id INTEGER NOT NULL, program TEXT NOT NULL, name TEXT NOT NULL,
  rule TEXT NOT NULL, choose INTEGER, credits REAL, note TEXT, source TEXT NOT NULL,
  PRIMARY KEY (campus, id));
-- Each option of a group is a set of alternatives; one row per alternative.
CREATE TABLE requirement_options (
  campus TEXT NOT NULL, grp INTEGER NOT NULL, option INTEGER NOT NULL, code TEXT NOT NULL,
  PRIMARY KEY (campus, grp, option, code));
-- section is untyped on purpose: NSU numbers sections, BRACU names them ("04",
-- "07A", "04-CLOSED"), and a typed column would turn "04" into 4.
CREATE TABLE sections (
  campus TEXT NOT NULL, term TEXT NOT NULL, term_system TEXT NOT NULL, course TEXT NOT NULL,
  section NOT NULL, faculty TEXT, days TEXT, start TEXT, "end" TEXT, room TEXT,
  capacity INTEGER, seats_taken INTEGER, seats_available INTEGER, department TEXT, section_id INTEGER, type TEXT,
  title TEXT, lab_course TEXT, lab_section_id INTEGER, lab_title TEXT, lab_faculty TEXT,
  lab_room TEXT, mid_exam_date TEXT, mid_exam_start TEXT, mid_exam_end TEXT,
  final_exam_date TEXT, final_exam_start TEXT, final_exam_end TEXT, class_start TEXT,
  class_end TEXT, note TEXT, source TEXT NOT NULL,
  PRIMARY KEY (campus, term, term_system, course, section));
-- Every weekly meeting of a section, one row per day: its class meetings and,
-- where a section has one, its lab's. This is what free-room and clash queries
-- join on. Sections with no fixed schedule have none.
CREATE TABLE meetings (
  campus TEXT NOT NULL, term TEXT NOT NULL, term_system TEXT NOT NULL, course TEXT NOT NULL,
  section NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, start TEXT NOT NULL,
  "end" TEXT NOT NULL, room TEXT,
  PRIMARY KEY (campus, term, term_system, course, section, kind, day, start));
CREATE TABLE calendar_events (
  campus TEXT NOT NULL, term TEXT NOT NULL, term_system TEXT NOT NULL, date TEXT NOT NULL,
  end_date TEXT, kind TEXT NOT NULL, event TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE calendar_notices (
  campus TEXT NOT NULL, term TEXT NOT NULL, term_system TEXT NOT NULL, notice TEXT NOT NULL);
CREATE TABLE bus_routes (
  campus TEXT NOT NULL, route TEXT NOT NULL, name TEXT NOT NULL, route_no INTEGER,
  attendant_phone TEXT, fare_one_way REAL, fare_round_trip REAL, outbound_first TEXT,
  outbound_second TEXT, service TEXT, stops TEXT NOT NULL, service_from TEXT, service_to TEXT,
  days_off TEXT, note TEXT, source TEXT NOT NULL, PRIMARY KEY (campus, route));
-- Timed stops (BRACU's brochure times every stop on up to two trips).
CREATE TABLE bus_stops (
  campus TEXT NOT NULL, route TEXT NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL,
  first_trip TEXT, second_trip TEXT, PRIMARY KEY (campus, route, position));
CREATE TABLE bus_times (
  campus TEXT NOT NULL, route TEXT NOT NULL, direction TEXT NOT NULL, time TEXT NOT NULL,
  PRIMARY KEY (campus, route, direction, time));
-- Service-wide text: effective date, availability, fares, instructions, contacts.
CREATE TABLE bus_info (
  campus TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (campus, kind, position));
CREATE TABLE cafeteria_outlets (
  campus TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  floor INTEGER NOT NULL, zone TEXT, location_note TEXT NOT NULL, payment TEXT NOT NULL,
  verified INTEGER NOT NULL, note TEXT, source TEXT NOT NULL, PRIMARY KEY (campus, id));
-- weekday: 0 = Sunday … 6 = Saturday. No row for a day means closed.
CREATE TABLE cafeteria_hours (
  campus TEXT NOT NULL, outlet TEXT NOT NULL, weekday INTEGER NOT NULL, position INTEGER NOT NULL,
  open TEXT NOT NULL, close TEXT NOT NULL, PRIMARY KEY (campus, outlet, weekday, position));
CREATE TABLE places (
  campus TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, floor INTEGER NOT NULL,
  kind TEXT NOT NULL, aliases TEXT NOT NULL, position INTEGER NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (campus, id));
CREATE INDEX meetings_room ON meetings (campus, term, term_system, room, day);
CREATE INDEX sections_faculty ON sections (campus, term, faculty);
CREATE INDEX prerequisites_course ON prerequisites (campus, course);
CREATE INDEX requirement_options_code ON requirement_options (campus, code);
CREATE VIEW rooms AS
  SELECT m.campus, m.term, m.term_system, m.room,
         CASE WHEN m.room GLOB '[A-Z]*[0-9]' THEN rtrim(m.room, '0123456789') ELSE NULL END AS building,
         COUNT(DISTINCT m.course || '#' || m.section) AS sections, MAX(s.capacity) AS largest_section
  FROM meetings m JOIN sections s
    ON s.campus = m.campus AND s.term = m.term AND s.term_system = m.term_system
   AND s.course = m.course AND s.section = m.section
  WHERE m.room IS NOT NULL GROUP BY m.campus, m.term, m.term_system, m.room;
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
  const add = (table, columns, rows) => out.push(...insert(table, columns, rows));

  add(
    'sources',
    ['campus', 'id', 'status', 'title', 'url', 'retrieved'],
    [...c.sources.records]
      .sort(byKey('id'))
      .map((s) => [id, s.id, s.status, s.title, s.url, s.retrieved]),
  );

  // ── Profile ────────────────────────────────────────────────────────────────
  const cutoff = p.retake.cutoff ? `${p.retake.cutoff.season} ${p.retake.cutoff.year}` : null;
  add(
    'campuses',
    [
      'id',
      'name',
      'short_name',
      'email_domains',
      'retake_eligible_at_or_below',
      'retake_counts',
      'retake_cutoff',
      'max_retakes',
      'good_standing_min_cgpa',
      'probation_below_cgpa',
      'probation_terms_to_recover',
      'credit_load_min',
      'credit_load_warn_above',
      'credit_load_max',
      'lat',
      'lng',
      'radius_m',
      'utc_offset_minutes',
      'day_start',
      'day_end',
      'room_code_pattern',
      'room_code_regex',
    ],
    [
      [
        id,
        p.name,
        p.shortName,
        p.identity.emailDomains.join(','),
        p.retake.eligibleAtOrBelow,
        p.retake.counts,
        cutoff,
        p.retake.maxRetakes,
        p.standing?.goodStandingMinCgpa ?? null,
        p.standing?.probation.belowCgpa ?? null,
        p.standing?.probation.termsToRecover ?? null,
        p.creditLoad?.min ?? null,
        p.creditLoad?.warnAbove ?? null,
        p.creditLoad?.max ?? null,
        p.location?.lat ?? null,
        p.location?.lng ?? null,
        p.location?.radiusM ?? null,
        p.location?.utcOffsetMinutes ?? null,
        p.location?.dayStart ?? null,
        p.location?.dayEnd ?? null,
        p.roomCodes?.pattern ?? null,
        p.roomCodes?.regex ?? null,
      ],
    ],
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
  p.grading.nonGpaGrades.forEach((g) =>
    grades.push([id, g.letter, null, null, 0, g.meaning, grades.length, p.grading.source]),
  );
  add(
    'grades',
    ['campus', 'letter', 'points', 'min_mark', 'counts_in_gpa', 'meaning', 'rank', 'source'],
    grades,
  );
  add(
    'grade_display',
    ['campus', 'points', 'letter'],
    (p.grading.pointsToGrade ?? []).map(([points, letter]) => [id, points, letter]),
  );
  add(
    'standing_tiers',
    ['campus', 'id', 'position', 'standing_label', 'goal_label', 'min_cgpa', 'source'],
    (p.standingTiers?.records ?? []).map((t, i) => [
      id,
      t.id,
      i,
      t.standingLabel,
      t.goalLabel,
      t.minCgpa,
      p.standingTiers.source,
    ]),
  );
  const band = (kind, block) =>
    (block?.records ?? []).map((b) => [id, kind, b.label, b.minCgpa, block.source]);
  add(
    'cgpa_bands',
    ['campus', 'kind', 'label', 'min_cgpa', 'source'],
    [
      ...band('class-division', p.classDivisions),
      ...band('honours', p.honours),
      ...band('meter', p.meterBands),
    ],
  );
  add(
    'class_standing',
    ['campus', 'label', 'min_credits', 'source'],
    (p.classStanding?.records ?? []).map((s) => [
      id,
      s.label,
      s.minCredits,
      p.classStanding.source,
    ]),
  );
  add(
    'full_time_loads',
    ['campus', 'term_system', 'min_credits', 'source'],
    Object.entries(p.creditLoad?.fullTimeMin ?? {})
      .sort()
      .map(([sys, min]) => [id, sys, min, p.creditLoad.source]),
  );
  add(
    'academic_rules',
    ['campus', 'id', 'rule', 'source'],
    (p.academicRules?.records ?? []).map((r) => [
      id,
      r.id,
      r.rule,
      r.source ?? p.academicRules.source,
    ]),
  );
  add(
    'term_systems',
    ['campus', 'id', 'position', 'season', 'months', 'source'],
    p.termSystems.records.flatMap((t) =>
      t.terms.map((term, i) => [
        id,
        t.id,
        i,
        term.season,
        term.months ?? null,
        p.termSystems.source,
      ]),
    ),
  );
  add(
    'days',
    ['campus', 'code', 'day', 'position'],
    p.days.records.map((d, i) => [id, d.code, d.day, i]),
  );
  add(
    'buildings',
    ['campus', 'code', 'name'],
    (p.buildings?.records ?? []).map((b) => [id, b.code, b.name]),
  );
  add(
    'features',
    ['campus', 'feature'],
    (p.features?.records ?? []).map((f) => [id, f]),
  );
  add(
    'transcript_markers',
    ['campus', 'position', 'marker'],
    (p.transcript?.headerMarkers ?? []).map((m, i) => [id, i + 1, m]),
  );
  add(
    'room_kinds',
    ['campus', 'letter', 'kind'],
    Object.entries(p.roomCodes?.kinds ?? {}).map(([letter, kind]) => [id, letter, kind]),
  );

  // ── Programs ───────────────────────────────────────────────────────────────
  if (c.programs) {
    const programs = [...c.programs.records].sort(byKey('code'));
    add(
      'programs',
      [
        'campus',
        'code',
        'name',
        'school',
        'total_credits',
        'term_system',
        'extends',
        'credit_load_min',
        'credit_load_max',
        'note',
        'source',
      ],
      programs.map((r) => [
        id,
        r.code,
        r.name,
        r.school ?? null,
        r.totalCredits,
        r.termSystem,
        r.extends ?? null,
        r.creditLoad?.minCredits ?? null,
        r.creditLoad?.maxCredits ?? null,
        r.note ?? null,
        r.source ?? c.programs.source,
      ]),
    );
    add(
      'program_rules',
      ['campus', 'program', 'id', 'rule', 'source'],
      programs.flatMap((r) => (r.rules ?? []).map((x) => [id, r.code, x.id, x.rule, x.source])),
    );
    add(
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
    );
  }

  // ── Departments ────────────────────────────────────────────────────────────
  if (c.departments) {
    add(
      'departments',
      ['campus', 'code', 'label', 'school', 'display_code'],
      c.departments.records.map((d) => [id, d.code, d.label, d.school, d.displayCode ?? null]),
    );
    add(
      'department_subjects',
      ['campus', 'subject', 'department'],
      c.departments.records.flatMap((d) => d.prefixes.map((prefix) => [id, prefix, d.code])),
    );
    add(
      'department_overrides',
      ['campus', 'course', 'department'],
      (c.departments.overrides ?? []).map((o) => [id, o.course, o.department]),
    );
  }

  // ── Courses (file order is kept: a hand-kept catalogue's written order) ─────
  if (c.courses) {
    add(
      'courses',
      [
        'campus',
        'code',
        'title',
        'credits',
        'subject',
        'level',
        'is_lab',
        'department',
        'catalogue_group',
        'position',
        'source',
      ],
      c.courses.records.map((r, i) => {
        const [, subject, digits, suffix] = r.code.match(/^([A-Z]+)(\d{3})([A-Z]{0,2})$/);
        return [
          id,
          r.code,
          r.title,
          r.credits,
          subject,
          Number(digits[0]) * 100,
          suffix.endsWith('L'),
          r.department ?? null,
          r.group ?? null,
          i + 1,
          r.source ?? c.courses.source,
        ];
      }),
    );
  }

  // ── Prerequisites ──────────────────────────────────────────────────────────
  if (c.prerequisites) {
    // Rule ids follow file order, which the validator keeps free of duplicates.
    const rules = c.prerequisites.records.map((r, i) => ({ ...r, ruleId: i + 1 }));
    add(
      'prerequisites',
      [
        'campus',
        'id',
        'course',
        'program',
        'min_credits',
        'min_cgpa',
        'or_consent',
        'unparsed',
        'raw',
        'source',
      ],
      rules.map((r) => [
        id,
        r.ruleId,
        r.course,
        r.program ?? null,
        r.minCredits ?? null,
        r.minCgpa ?? null,
        !!r.orConsent,
        !!r.unparsed,
        r.raw,
        r.source ?? c.prerequisites.source,
      ]),
    );
    add(
      'prerequisite_options',
      ['campus', 'rule', 'course', 'requirement', 'requires'],
      rules.flatMap((r) =>
        (r.allOf ?? []).flatMap((group, i) =>
          group.map((code) => [id, r.ruleId, r.course, i + 1, code]),
        ),
      ),
    );
    add(
      'prerequisite_paths',
      ['campus', 'rule', 'course', 'path', 'requires'],
      rules.flatMap((r) =>
        (r.anyOf ?? []).flatMap((set, i) =>
          set.map((code) => [id, r.ruleId, r.course, i + 1, code]),
        ),
      ),
    );
    add(
      'prerequisite_recommended',
      ['campus', 'rule', 'course', 'recommends'],
      rules.flatMap((r) => (r.recommended ?? []).map((code) => [id, r.ruleId, r.course, code])),
    );
  }

  if (c.plans) {
    add(
      'plans',
      [
        'campus',
        'program',
        'position',
        'year',
        'term',
        'term_label',
        'code',
        'title',
        'credits',
        'alternatives',
        'category',
        'note',
        'source',
      ],
      c.plans.records.map((p2, i) => [
        id,
        p2.program,
        i + 1,
        p2.year,
        p2.term,
        p2.termLabel ?? null,
        p2.code,
        p2.title,
        p2.credits,
        p2.alternatives ? p2.alternatives.join(',') : null,
        p2.category ?? null,
        p2.note ?? null,
        p2.source,
      ]),
    );
  }

  if (c.requirements) {
    const groups = c.requirements.records.map((g, i) => ({ ...g, groupId: i + 1 }));
    add(
      'requirement_groups',
      ['campus', 'id', 'program', 'name', 'rule', 'choose', 'credits', 'note', 'source'],
      groups.map((g) => [
        id,
        g.groupId,
        g.program,
        g.group,
        g.rule,
        g.choose ?? null,
        g.credits ?? null,
        g.note ?? null,
        g.source,
      ]),
    );
    add(
      'requirement_options',
      ['campus', 'grp', 'option', 'code'],
      groups.flatMap((g) =>
        g.options.flatMap((alts, i) => alts.map((code) => [id, g.groupId, i + 1, code])),
      ),
    );
  }

  if (c.minors) {
    add(
      'minors',
      [
        'campus',
        'code',
        'label',
        'short_label',
        'department',
        'total_credits',
        'elective_credits',
        'document',
        'source',
      ],
      c.minors.records.map((m) => [
        id,
        m.code,
        m.label,
        m.shortLabel,
        m.department,
        m.totalCredits,
        m.electives.credits,
        m.document,
        c.minors.source,
      ]),
    );
    add(
      'minor_requirements',
      ['campus', 'minor', 'id', 'position', 'title', 'credits', 'codes'],
      c.minors.records.flatMap((m) =>
        m.core.map((r, i) => [id, m.code, r.id, i + 1, r.title, r.credits, r.codes.join(',')]),
      ),
    );
    add(
      'minor_electives',
      ['campus', 'minor', 'kind', 'position', 'value'],
      c.minors.records.flatMap((m) => [
        ...m.electives.codes.map((code, i) => [id, m.code, 'code', i + 1, code]),
        ...m.electives.patterns.map((pt, i) => [
          id,
          m.code,
          'pattern',
          i + 1,
          `${pt.subject} ${pt.levels.map((l) => `${l}XX`).join('/')}`,
        ]),
        ...m.electives.options.map((o, i) => [id, m.code, 'option', i + 1, o.label]),
      ]),
    );
  }

  if (c.faculty) {
    add(
      'faculty',
      ['campus', 'initials', 'name', 'email', 'dept', 'source'],
      c.faculty.records.map((f) => [
        id,
        f.initials,
        f.name,
        f.email || null,
        f.dept,
        c.faculty.source,
      ]),
    );
    add(
      'faculty_courses',
      ['campus', 'initials', 'course'],
      c.faculty.records.flatMap((f) =>
        [...new Set(f.courses)].map((course) => [id, f.initials, course]),
      ),
    );
  }

  if (c.reviews) {
    add(
      'reviews',
      [
        'campus',
        'id',
        'faculty',
        'course',
        'semester',
        'teaching',
        'marking',
        'behavior',
        'difficulty',
        'workload',
        'text',
        'source_url',
        'source',
      ],
      c.reviews.records.map((r, i) => [
        id,
        i + 1,
        r.facultyInitials,
        r.courseCode,
        r.semester || null,
        r.ratings.teaching,
        r.ratings.marking,
        r.ratings.behavior,
        r.ratings.difficulty,
        r.ratings.workload,
        r.text,
        r.sourceUrl || null,
        c.reviews.source,
      ]),
    );
  }

  // ── Sections and their weekly meetings ─────────────────────────────────────
  for (const key of Object.keys(c.sections).sort()) {
    const file = c.sections[key];
    const rows = [...file.records].sort(byKey('course', 'section'));
    add(
      'sections',
      [
        'campus',
        'term',
        'term_system',
        'course',
        'section',
        'faculty',
        'days',
        'start',
        'end',
        'room',
        'capacity',
        'seats_taken',
        'seats_available',
        'department',
        'section_id',
        'type',
        'title',
        'lab_course',
        'lab_section_id',
        'lab_title',
        'lab_faculty',
        'lab_room',
        'mid_exam_date',
        'mid_exam_start',
        'mid_exam_end',
        'final_exam_date',
        'final_exam_start',
        'final_exam_end',
        'class_start',
        'class_end',
        'note',
        'source',
      ],
      rows.map((s) => [
        id,
        file.term,
        file.termSystem,
        s.course,
        s.section,
        s.faculty,
        s.days,
        s.start,
        s.end,
        s.room,
        s.capacity,
        s.seatsTaken ?? null,
        s.seatsAvailable ?? null,
        s.department ?? null,
        s.sectionId ?? null,
        s.type ?? null,
        s.title ?? null,
        s.lab?.course ?? null,
        s.lab?.sectionId ?? null,
        s.lab?.title ?? null,
        s.lab?.faculty ?? null,
        s.lab?.room ?? null,
        s.exams?.mid?.date ?? null,
        s.exams?.mid?.start ?? null,
        s.exams?.mid?.end ?? null,
        s.exams?.final?.date ?? null,
        s.exams?.final?.start ?? null,
        s.exams?.final?.end ?? null,
        s.classDates?.start ?? null,
        s.classDates?.end ?? null,
        s.note ?? null,
        file.source,
      ]),
    );
    const meetingRows = [];
    for (const s of rows) {
      const base = [id, file.term, file.termSystem, s.course, s.section];
      if (s.meetings) {
        for (const mt of s.meetings)
          meetingRows.push([...base, 'class', mt.day, mt.start, mt.end, mt.room]);
      } else if (s.days !== null) {
        for (const day of s.days) meetingRows.push([...base, 'class', day, s.start, s.end, s.room]);
      }
      for (const mt of s.lab?.meetings ?? [])
        meetingRows.push([...base, 'lab', mt.day, mt.start, mt.end, mt.room]);
    }
    add(
      'meetings',
      ['campus', 'term', 'term_system', 'course', 'section', 'kind', 'day', 'start', 'end', 'room'],
      meetingRows,
    );
  }

  for (const key of Object.keys(c.calendars).sort()) {
    const file = c.calendars[key];
    add(
      'calendar_events',
      ['campus', 'term', 'term_system', 'date', 'end_date', 'kind', 'event', 'source'],
      file.records.map((e) => [
        id,
        file.term,
        file.termSystem,
        e.date,
        e.endDate ?? null,
        e.kind,
        e.event,
        file.source,
      ]),
    );
    add(
      'calendar_notices',
      ['campus', 'term', 'term_system', 'notice'],
      (file.notices ?? []).map((n) => [id, file.term, file.termSystem, n]),
    );
  }

  // ── Campus life ────────────────────────────────────────────────────────────
  if (c.bus) {
    const b = c.bus;
    const timed = 'effectiveFrom' in b;
    const routes = timed ? b.records : [...b.records].sort(byKey('route'));
    add(
      'bus_routes',
      [
        'campus',
        'route',
        'name',
        'route_no',
        'attendant_phone',
        'fare_one_way',
        'fare_round_trip',
        'outbound_first',
        'outbound_second',
        'service',
        'stops',
        'service_from',
        'service_to',
        'days_off',
        'note',
        'source',
      ],
      routes.map((r) =>
        timed
          ? [
              id,
              r.id,
              r.name,
              r.routeNo,
              r.attendantPhone,
              r.fareOneWay,
              r.fareRoundTrip,
              r.outbound.first,
              r.outbound.second,
              null,
              JSON.stringify(r.inbound.map((s) => s.name)),
              null,
              null,
              null,
              null,
              b.source,
            ]
          : [
              id,
              r.route,
              r.route,
              null,
              null,
              b.fares?.oneWay ?? null,
              b.fares?.roundTrip ?? null,
              null,
              null,
              r.service ?? null,
              JSON.stringify(r.stops),
              b.servicePeriod?.from ?? null,
              b.servicePeriod?.to ?? null,
              r.daysOff ?? null,
              r.note ?? null,
              b.source,
            ],
      ),
    );
    if (timed) {
      add(
        'bus_stops',
        ['campus', 'route', 'position', 'name', 'first_trip', 'second_trip'],
        routes.flatMap((r) =>
          r.inbound.map((s, i) => [id, r.id, i + 1, s.name, s.firstTrip, s.secondTrip]),
        ),
      );
      add(
        'bus_info',
        ['campus', 'kind', 'position', 'value'],
        [
          [id, 'effective-from', 1, b.effectiveFrom],
          [id, 'availability', 1, b.availability],
          [id, 'fare-note', 1, b.fareNote],
          ...b.instructions.map((text, i) => [id, 'instruction', i + 1, text]),
          ...b.contacts.map((ct, i) => [
            id,
            'contact',
            i + 1,
            `${ct.name} — ${ct.title} <${ct.email}>`,
          ]),
        ],
      );
    } else {
      add(
        'bus_times',
        ['campus', 'route', 'direction', 'time'],
        routes.flatMap((r) => [
          ...r.arriveCampus.map((t) => [id, r.route, 'arrive', t]),
          ...r.departCampus.map((t) => [id, r.route, 'depart', t]),
        ]),
      );
    }
  }

  if (c.cafeteria) {
    add(
      'cafeteria_outlets',
      [
        'campus',
        'id',
        'name',
        'kind',
        'floor',
        'zone',
        'location_note',
        'payment',
        'verified',
        'note',
        'source',
      ],
      c.cafeteria.records.map((o) => [
        id,
        o.id,
        o.name,
        o.kind,
        o.floor,
        o.zone,
        o.locationNote,
        o.payment.join(', '),
        o.verified,
        o.note ?? null,
        c.cafeteria.source,
      ]),
    );
    add(
      'cafeteria_hours',
      ['campus', 'outlet', 'weekday', 'position', 'open', 'close'],
      c.cafeteria.records.flatMap((o) =>
        o.hours.flatMap((day, weekday) =>
          day.map((span, i) => [id, o.id, weekday, i + 1, span.open, span.close]),
        ),
      ),
    );
  }

  if (c.places) {
    add(
      'places',
      ['campus', 'id', 'name', 'floor', 'kind', 'aliases', 'position', 'source'],
      c.places.records.map((pl, i) => [
        id,
        pl.id,
        pl.name,
        pl.floor,
        pl.kind,
        pl.aliases.join(', '),
        i + 1,
        c.places.source,
      ]),
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
