// scripts/campus_data.mjs (#784)
//
// Loads and validates the campus reference data under data/campuses/<campus>/.
// Those JSON files are the source of truth; the SQLite database that
// scripts/build_campus_db.mjs produces is compiled from them, so anything that
// passes here is what every query will see.
//
// Two layers of checking:
//   - shape: a zod schema per file, so a typo in a field name or a string where
//     a number belongs fails loudly instead of loading as `undefined`;
//   - meaning: cross-file rules the schema cannot see on its own — every cited
//     source exists, every section's course is in the catalogue, day strings use
//     the campus's own day codes, a term file's name matches the term inside it.
//
// Problems split into errors (the data is wrong) and warnings (the data is
// incomplete but not contradictory — a prerequisite naming a course we have no
// record of yet). Only errors should fail a build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CAMPUS_DATA_DIR = path.join(ROOT, 'data', 'campuses');

// Undergraduate and graduate codes as NSU and BRACU print them: CSE115,
// CSE115L, CSE499A, BBA-level EMB601. Four-digit graduate codes (CE6207) are
// deliberately out of scope for now.
export const COURSE_CODE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;
const TERM_CODE = /^\d{2}[123]$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const courseCode = z.string().regex(COURSE_CODE, 'not a course code');
const sourceId = z.string().min(1);
const time = z.string().regex(TIME, 'not an HH:MM time');
// Credits come in halves at most (architecture studios are 4.5); anything else
// is a transcription error.
const credits = z
  .number()
  .min(0)
  .max(12)
  .refine((n) => Number.isInteger(n * 2), 'credits must be a multiple of 0.5');

const sourcesSchema = z
  .object({
    note: z.string().optional(),
    records: z
      .array(
        z
          .object({
            id: sourceId,
            status: z.enum(['official', 'third-party', 'derived']),
            title: z.string().min(1),
            url: z.url(),
            retrieved: z.string().regex(ISO_DATE),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const cited = (shape) =>
  z.object({ source: sourceId, note: z.string().optional(), ...shape }).strict();
const citedRecords = (record) => cited({ records: z.array(record).min(1) });

const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    name: z.string().min(1),
    shortName: z.string().min(1),
    identity: cited({ emailDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]+$/)).min(1) }),
    grading: cited({
      scale: z
        .array(
          z
            .object({
              letter: z.string(),
              points: z.number().min(0).max(5),
              minMark: z.number().min(0).max(100),
            })
            .strict(),
        )
        .min(2),
      nonGpaGrades: z.array(z.object({ letter: z.string(), meaning: z.string() }).strict()),
      unknown: z.array(z.string()).optional(),
    }),
    retake: cited({
      eligibleAtOrBelow: z.string(),
      counts: z.enum(['best', 'latest']),
      maxRetakes: z.number().int().positive().nullable(),
      beyondMax: z.string().optional(),
    }),
    standing: cited({
      goodStandingMinCgpa: z.number(),
      probation: z
        .object({ belowCgpa: z.number(), termsToRecover: z.number().int(), then: z.string() })
        .strict(),
    }),
    classDivisions: citedRecords(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    honours: citedRecords(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    classStanding: citedRecords(
      z.object({ label: z.string(), minCredits: z.number().int().min(0) }).strict(),
    ),
    creditLoad: cited({
      fullTimeMin: z.record(z.string(), z.number().int().positive()),
      max: z.number().int().positive().nullable(),
    }),
    academicRules: citedRecords(z.object({ id: z.string(), rule: z.string() }).strict()),
    termSystems: citedRecords(
      z
        .object({
          id: z.string(),
          terms: z.array(z.object({ season: z.string(), months: z.string() }).strict()).min(1),
          note: z.string().optional(),
        })
        .strict(),
    ),
    termCodes: cited({ pattern: z.string() }),
    days: citedRecords(z.object({ code: z.string().length(1), day: z.string() }).strict()),
    buildings: citedRecords(z.object({ code: z.string(), name: z.string() }).strict()),
  })
  .strict();

const programsSchema = citedRecords(
  z
    .object({
      code: z.string().regex(/^[A-Z]+(-[A-Z]+)?$/),
      name: z.string().min(1),
      school: z.string().min(1),
      totalCredits: z.number().int().positive(),
      termSystem: z.string(),
      conflicts: z
        .array(
          z
            .object({ field: z.string(), value: z.unknown(), source: sourceId, note: z.string() })
            .strict(),
        )
        .optional(),
    })
    .strict(),
);

const coursesSchema = citedRecords(
  z
    .object({
      code: courseCode,
      title: z.string().min(1),
      credits,
      source: sourceId.optional(),
    })
    .strict(),
);

const prerequisitesSchema = citedRecords(
  z
    .object({
      course: courseCode,
      allOf: z.array(z.array(courseCode).min(1)).optional(),
      minCredits: z.number().int().positive().optional(),
      orConsent: z.literal(true).optional(),
      unparsed: z.literal(true).optional(),
      raw: z.string().min(1),
    })
    .strict(),
);

const sectionsSchema = z
  .object({
    term: z.string().regex(TERM_CODE),
    source: sourceId,
    note: z.string().optional(),
    records: z
      .array(
        z
          .object({
            course: courseCode,
            section: z.number().int().positive(),
            faculty: z.string().min(1).nullable(),
            days: z.string().min(1),
            start: time,
            end: time,
            room: z.string().min(1).nullable(),
            capacity: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const calendarSchema = z
  .object({
    term: z.string().regex(TERM_CODE),
    termSystem: z.string(),
    source: sourceId,
    note: z.string().optional(),
    records: z
      .array(
        z
          .object({
            date: z.string().regex(ISO_DATE),
            kind: z.string().regex(/^[a-z-]+$/),
            event: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const busSchema = cited({
  servicePeriod: z
    .object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) })
    .strict(),
  fares: z.object({ oneWay: z.number(), roundTrip: z.number(), currency: z.string() }).strict(),
  records: z
    .array(
      z
        .object({
          route: z.string(),
          stops: z.array(z.string()).min(1),
          arriveNsu: z.array(time),
          departNsu: z.array(time),
        })
        .strict(),
    )
    .min(1),
});

// File name → schema. Optional files may be absent; a campus is its profile
// plus whatever it has data for.
const FILES = {
  sources: { file: 'sources.json', schema: sourcesSchema, required: true },
  profile: { file: 'profile.json', schema: profileSchema, required: true },
  programs: { file: 'programs.json', schema: programsSchema },
  courses: { file: 'courses.json', schema: coursesSchema },
  prerequisites: { file: 'prerequisites.json', schema: prerequisitesSchema },
  bus: { file: 'bus.json', schema: busSchema },
};
const TERM_DIRS = {
  sections: { dir: 'sections', schema: sectionsSchema },
  calendars: { dir: 'calendar', schema: calendarSchema },
};

function readJson(file, problems) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.errors.push(`${file}: ${error.message}`);
    return undefined;
  }
}

function parseWith(schema, value, label, problems) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    problems.errors.push(`${label}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return undefined;
}

function loadCampus(dir, id, problems) {
  const campus = { id, sections: {}, calendars: {} };
  for (const [key, { file, schema, required }] of Object.entries(FILES)) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      if (required) problems.errors.push(`${id}: missing ${file}`);
      continue;
    }
    const raw = readJson(full, problems);
    if (raw !== undefined) campus[key] = parseWith(schema, raw, `${id}/${file}`, problems);
  }
  for (const [key, { dir: sub, schema }] of Object.entries(TERM_DIRS)) {
    const full = path.join(dir, sub);
    if (!fs.existsSync(full)) continue;
    for (const name of fs
      .readdirSync(full)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      const label = `${id}/${sub}/${name}`;
      const raw = readJson(path.join(full, name), problems);
      const data = raw === undefined ? undefined : parseWith(schema, raw, label, problems);
      if (!data) continue;
      if (`${data.term}.json` !== name)
        problems.errors.push(`${label}: file name does not match term ${data.term}`);
      campus[key][data.term] = data;
    }
  }
  return campus;
}

// Cross-file rules. Runs only on files that passed their schema, so it can
// trust shapes and concentrate on meaning.
function checkCampus(campus, problems) {
  const { id } = campus;
  const err = (msg) => problems.errors.push(`${id}: ${msg}`);
  const warn = (msg) => problems.warnings.push(`${id}: ${msg}`);

  const sourceIds = new Set();
  for (const s of campus.sources?.records ?? []) {
    if (sourceIds.has(s.id)) err(`sources: duplicate id ${s.id}`);
    sourceIds.add(s.id);
  }
  const cite = (where, sid) => {
    if (sid && !sourceIds.has(sid)) err(`${where} cites unknown source "${sid}"`);
  };

  const profile = campus.profile;
  if (profile) {
    if (profile.id !== id) err(`profile id "${profile.id}" does not match its folder`);
    for (const [key, block] of Object.entries(profile)) {
      if (block && typeof block === 'object' && 'source' in block)
        cite(`profile.${key}`, block.source);
    }
    const letters = profile.grading.scale.map((g) => g.letter);
    if (new Set(letters).size !== letters.length) err('grading: duplicate letter');
    if (!letters.includes(profile.retake.eligibleAtOrBelow))
      err(`retake: "${profile.retake.eligibleAtOrBelow}" is not on the scale`);
    const points = profile.grading.scale.map((g) => g.points);
    const marks = profile.grading.scale.map((g) => g.minMark);
    if (
      points.some((p, i) => i && p > points[i - 1]) ||
      marks.some((m, i) => i && m >= marks[i - 1])
    ) {
      err('grading: scale must run from the highest letter down');
    }
  }
  const dayCodes = new Set(profile?.days.records.map((d) => d.code) ?? []);
  const termSystems = new Set(profile?.termSystems.records.map((t) => t.id) ?? []);

  for (const key of ['programs', 'courses', 'prerequisites', 'bus']) {
    if (campus[key]) cite(key, campus[key].source);
  }
  const programCodes = new Set();
  for (const p of campus.programs?.records ?? []) {
    if (programCodes.has(p.code)) err(`programs: duplicate code ${p.code}`);
    programCodes.add(p.code);
    if (!termSystems.has(p.termSystem))
      err(`programs: ${p.code} uses unknown term system "${p.termSystem}"`);
    for (const c of p.conflicts ?? []) cite(`programs.${p.code}.conflicts`, c.source);
  }

  const courses = new Set();
  for (const c of campus.courses?.records ?? []) {
    if (courses.has(c.code)) err(`courses: duplicate code ${c.code}`);
    courses.add(c.code);
    cite(`courses.${c.code}`, c.source);
  }

  const prereqCourses = new Set();
  for (const p of campus.prerequisites?.records ?? []) {
    if (prereqCourses.has(p.course)) err(`prerequisites: duplicate entry for ${p.course}`);
    prereqCourses.add(p.course);
    if (!courses.has(p.course)) err(`prerequisites: ${p.course} is not in courses.json`);
    if (!p.unparsed && !p.allOf && !p.minCredits)
      err(`prerequisites: ${p.course} states no requirement; mark it unparsed`);
    for (const code of (p.allOf ?? []).flat()) {
      if (!courses.has(code))
        warn(`prerequisites: ${p.course} requires ${code}, which is not in courses.json yet`);
    }
  }

  for (const [term, file] of Object.entries(campus.sections)) {
    cite(`sections/${term}`, file.source);
    const keys = new Set();
    for (const s of file.records) {
      const label = `sections/${term} ${s.course}.${s.section}`;
      const key = `${s.course}#${s.section}`;
      if (keys.has(key)) err(`${label}: duplicate section`);
      keys.add(key);
      if (!courses.has(s.course)) err(`${label}: course is not in courses.json`);
      const days = [...s.days];
      if (days.some((d) => !dayCodes.has(d)) || new Set(days).size !== days.length)
        err(`${label}: bad day string "${s.days}"`);
      if (s.start >= s.end) err(`${label}: starts at ${s.start} but ends at ${s.end}`);
    }
  }

  for (const [term, file] of Object.entries(campus.calendars)) {
    cite(`calendar/${term}`, file.source);
    if (!termSystems.has(file.termSystem))
      err(`calendar/${term}: unknown term system "${file.termSystem}"`);
    for (const e of file.records) {
      if (Number.isNaN(Date.parse(`${e.date}T00:00:00Z`)))
        err(`calendar/${term}: bad date ${e.date}`);
    }
  }
}

/**
 * Load every campus under `dir`. Returns the parsed data plus every problem
 * found; callers decide whether warnings matter.
 */
export function loadCampuses(dir = CAMPUS_DATA_DIR) {
  const problems = { errors: [], warnings: [] };
  const campuses = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const campus = loadCampus(path.join(dir, entry.name), entry.name, problems);
    checkCampus(campus, problems);
    campuses.push(campus);
  }
  campuses.sort((a, b) => a.id.localeCompare(b.id));
  return { campuses, ...problems };
}

// CLI: `node scripts/campus_data.mjs` prints a report and exits non-zero on errors.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { campuses, errors, warnings } = loadCampuses();
  for (const c of campuses) {
    const sections = Object.values(c.sections).reduce((n, f) => n + f.records.length, 0);
    console.log(
      `${c.id}: ${c.programs?.records.length ?? 0} programs, ${c.courses?.records.length ?? 0} courses, ` +
        `${c.prerequisites?.records.length ?? 0} prerequisite rules, ${sections} sections`,
    );
  }
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error    ${e}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
