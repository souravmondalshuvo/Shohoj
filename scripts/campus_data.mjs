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
// For facts a university may simply not publish (DIU has no class divisions):
// empty is allowed, but checkCampus then demands a note saying so.
const citedList = (record) => cited({ records: z.array(record) });

const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    name: z.string().min(1),
    shortName: z.string().min(1),
    // Empty only while unconfirmed, with a note — never a guessed domain.
    identity: cited({ emailDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]+$/)) }),
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
    classDivisions: citedList(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    honours: citedList(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    classStanding: citedList(
      z.object({ label: z.string(), minCredits: z.number().int().min(0) }).strict(),
    ),
    creditLoad: cited({
      fullTimeMin: z.record(z.string(), z.number().int().positive()),
      max: z.number().int().positive().nullable(),
    }),
    // A rule may cite its own source when it comes from a different document
    // than the block's (DIU's graduation CGPA is in its FAQ, not its rules).
    academicRules: citedRecords(
      z.object({ id: z.string(), rule: z.string(), source: sourceId.optional() }).strict(),
    ),
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
    buildings: citedList(z.object({ code: z.string(), name: z.string() }).strict()),
  })
  .strict();

const programCode = z.string().regex(/^[A-Z]+(-[A-Z]+)?$/);

const programsSchema = citedRecords(
  z
    .object({
      code: programCode,
      name: z.string().min(1),
      school: z.string().min(1).optional(),
      // Half credits exist: DIU's CSE is 154.5.
      totalCredits: z
        .number()
        .positive()
        .refine((n) => Number.isInteger(n * 2), 'credits must be a multiple of 0.5'),
      // null when the university doesn't say which calendar a program runs on;
      // checkCampus then requires a note.
      termSystem: z.string().nullable(),
      note: z.string().min(1).optional(),
      source: sourceId.optional(),
      // Inherit the requirement groups of another program (every BBA major
      // extends BBA's shared core).
      extends: programCode.optional(),
      creditLoad: z
        .object({
          minCredits: z.number().int().min(0),
          maxCredits: z.number().int().positive(),
          source: sourceId,
        })
        .strict()
        .optional(),
      rules: z
        .array(z.object({ id: z.string(), rule: z.string(), source: sourceId }).strict())
        .optional(),
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
      department: z
        .string()
        .regex(/^[A-Z]{2,4}$/)
        .optional(),
      source: sourceId.optional(),
    })
    .strict(),
);

// A course can carry rules from several documents, and a curriculum can state
// a rule for its own program only, so a rule is keyed by course + program +
// source rather than by course alone.
const prerequisitesSchema = citedRecords(
  z
    .object({
      course: courseCode,
      program: programCode.optional(),
      allOf: z.array(z.array(courseCode).min(1)).optional(),
      minCredits: z.number().int().positive().optional(),
      minCgpa: z.number().min(0).max(5).optional(),
      orConsent: z.literal(true).optional(),
      unparsed: z.literal(true).optional(),
      raw: z.string().min(1),
      source: sourceId.optional(),
    })
    .strict(),
);

const plansSchema = citedRecords(
  z
    .object({
      program: programCode,
      year: z.number().int().min(1).max(8),
      // null when the document places a course by year only.
      term: z.number().int().min(1).max(24).nullable(),
      // null for a slot (an elective, a GED choice) the title describes.
      code: courseCode.nullable(),
      title: z.string().min(1),
      credits,
      alternatives: z.array(courseCode).min(1).optional(),
      category: z.string().optional(),
      // Explains a credit value this curriculum sets differently from the
      // catalogue (a non-credit remedial, an integrated 0-credit lab).
      note: z.string().min(1).optional(),
      source: sourceId,
    })
    .strict(),
);

const requirementsSchema = citedRecords(
  z
    .object({
      program: programCode,
      group: z.string().min(1),
      rule: z.enum(['all', 'choose', 'free']),
      choose: z.number().int().positive().optional(),
      credits: z.number().min(0).optional(),
      options: z.array(z.array(courseCode).min(1)),
      note: z.string().optional(),
      source: sourceId,
    })
    .strict(),
);

const sectionsSchema = z
  .object({
    term: z.string().regex(TERM_CODE),
    termSystem: z.string(),
    source: sourceId,
    note: z.string().optional(),
    records: z
      .array(
        z
          .object({
            course: courseCode,
            section: z.number().int().positive(),
            faculty: z.string().min(1).nullable(),
            // All three null for a section with no fixed schedule (an internship,
            // a thesis); never some without the others.
            days: z.string().min(1).nullable(),
            start: time.nullable(),
            end: time.nullable(),
            room: z.string().min(1).nullable(),
            capacity: z.number().int().min(0),
            department: z
              .string()
              .regex(/^[A-Z]{2,4}$/)
              .optional(),
            // Set when a value was corrected from an obvious printing error;
            // says what was printed and why it was read differently.
            note: z.string().min(1).optional(),
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
    notices: z.array(z.string().min(1)).optional(),
    records: z
      .array(
        z
          .object({
            date: z.string().regex(ISO_DATE),
            endDate: z.string().regex(ISO_DATE).optional(),
            kind: z.string().regex(/^[a-z-]+$/),
            event: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

// servicePeriod and fares are null when the operator doesn't publish them (DIU's
// feed names a semester, not dates, and lists no fare); checkCampus requires a
// note then.
const busSchema = cited({
  servicePeriod: z
    .object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) })
    .strict()
    .nullable(),
  fares: z
    .object({ oneWay: z.number(), roundTrip: z.number(), currency: z.string() })
    .strict()
    .nullable(),
  records: z
    .array(
      z
        .object({
          route: z.string(),
          // "regular", "shuttle", "friday"… when the operator runs several.
          service: z.string().min(1).optional(),
          stops: z.array(z.string()).min(1),
          arriveCampus: z.array(time),
          departCampus: z.array(time),
          // Day codes from profile.days on which the route does not run.
          daysOff: z.string().min(1).optional(),
          // Required when a printed time was corrected, as for sections.
          note: z.string().min(1).optional(),
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
  plans: { file: 'plans.json', schema: plansSchema },
  requirements: { file: 'requirements.json', schema: requirementsSchema },
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
      // Named <term>-<termSystem>.json: NSU runs a trimester and a bi-semester
      // calendar side by side, so one term code can have two files.
      const expected = `${data.term}-${data.termSystem}`;
      if (`${expected}.json` !== name)
        problems.errors.push(`${label}: file name does not match ${expected}`);
      campus[key][expected] = data;
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
    if (!profile.identity.emailDomains.length && !profile.identity.note)
      err('identity: no email domains and no note saying why');
    for (const key of ['classDivisions', 'honours', 'classStanding', 'buildings']) {
      if (!profile[key].records.length && !profile[key].note)
        err(`profile.${key}: empty with no note saying why`);
    }
    for (const r of profile.academicRules.records) cite(`profile.academicRules.${r.id}`, r.source);
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

  for (const key of ['programs', 'courses', 'prerequisites', 'plans', 'requirements', 'bus']) {
    if (campus[key]) cite(key, campus[key].source);
  }
  const programs = new Map();
  for (const p of campus.programs?.records ?? []) {
    if (programs.has(p.code)) err(`programs: duplicate code ${p.code}`);
    programs.set(p.code, p);
    if (p.termSystem === null) {
      if (!p.note) err(`programs: ${p.code} has no term system and no note saying why`);
    } else if (!termSystems.has(p.termSystem))
      err(`programs: ${p.code} uses unknown term system "${p.termSystem}"`);
    cite(`programs.${p.code}`, p.source);
    cite(`programs.${p.code}.creditLoad`, p.creditLoad?.source);
    if (p.creditLoad && p.creditLoad.minCredits > p.creditLoad.maxCredits)
      err(`programs: ${p.code} credit load minimum exceeds its maximum`);
    for (const r of p.rules ?? []) cite(`programs.${p.code}.rules`, r.source);
    for (const c of p.conflicts ?? []) cite(`programs.${p.code}.conflicts`, c.source);
  }
  for (const p of programs.values()) {
    if (p.extends && !programs.has(p.extends))
      err(`programs: ${p.code} extends unknown program ${p.extends}`);
  }
  const knownProgram = (where, code) => {
    if (!programs.has(code)) err(`${where}: unknown program ${code}`);
  };

  const courses = new Map();
  for (const c of campus.courses?.records ?? []) {
    if (courses.has(c.code)) err(`courses: duplicate code ${c.code}`);
    courses.set(c.code, c);
    cite(`courses.${c.code}`, c.source);
  }

  const ruleKeys = new Set();
  for (const p of campus.prerequisites?.records ?? []) {
    const key = `${p.course}|${p.program ?? ''}|${p.source ?? ''}`;
    if (ruleKeys.has(key))
      err(`prerequisites: duplicate rule for ${p.course} from the same source and program`);
    ruleKeys.add(key);
    cite(`prerequisites.${p.course}`, p.source);
    if (p.program) knownProgram(`prerequisites.${p.course}`, p.program);
    if (!courses.has(p.course)) err(`prerequisites: ${p.course} is not in courses.json`);
    if (!p.unparsed && !p.allOf && !p.minCredits)
      err(`prerequisites: ${p.course} states no requirement; mark it unparsed`);
    for (const code of (p.allOf ?? []).flat()) {
      if (!courses.has(code))
        warn(`prerequisites: ${p.course} requires ${code}, which is not in courses.json yet`);
    }
  }

  // Plans: every slot names a real course or describes itself, and a
  // program's plan adds up to the program's total. A total that doesn't is a
  // transcription slip more often than a real curriculum quirk, so it warns.
  const planTotals = new Map();
  for (const item of campus.plans?.records ?? []) {
    const where = `plans.${item.program}${item.term ? ` term ${item.term}` : ` year ${item.year}`}`;
    knownProgram(where, item.program);
    cite(where, item.source);
    planTotals.set(item.program, (planTotals.get(item.program) ?? 0) + item.credits);
    for (const code of [item.code, ...(item.alternatives ?? [])]) {
      if (code && !courses.has(code)) warn(`${where}: ${code} is not in courses.json yet`);
    }
    const listed = item.code && courses.get(item.code);
    if (listed && listed.credits !== item.credits && !item.note)
      warn(
        `${where}: ${item.code} is planned at ${item.credits} credits but catalogued at ${listed.credits}`,
      );
  }
  for (const [program, total] of planTotals) {
    const expected = programs.get(program)?.totalCredits;
    if (expected !== undefined && total !== expected)
      warn(`plans.${program}: plan totals ${total} credits, the program requires ${expected}`);
  }

  // Requirement groups, with a program's inherited groups counted toward it.
  const groupCredits = new Map();
  for (const g of campus.requirements?.records ?? []) {
    const where = `requirements.${g.program} "${g.group}"`;
    knownProgram(where, g.program);
    cite(where, g.source);
    if (g.rule === 'free' && g.options.length) err(`${where}: a free group lists no options`);
    if (g.rule !== 'free' && !g.options.length) err(`${where}: needs at least one option`);
    if (g.rule === 'choose' && !(g.choose && g.choose <= g.options.length))
      err(`${where}: must choose between 1 and ${g.options.length}`);
    if (g.rule !== 'choose' && g.choose !== undefined)
      err(`${where}: only a "choose" group sets choose`);
    for (const code of g.options.flat()) {
      if (!courses.has(code)) warn(`${where}: ${code} is not in courses.json yet`);
    }
    groupCredits.set(g.program, (groupCredits.get(g.program) ?? 0) + (g.credits ?? 0));
  }
  for (const [code, p] of programs) {
    if (!groupCredits.has(code)) continue;
    const total = groupCredits.get(code) + (p.extends ? (groupCredits.get(p.extends) ?? 0) : 0);
    if (total !== p.totalCredits)
      warn(
        `requirements.${code}: groups cover ${total} of the program's ${p.totalCredits} credits`,
      );
  }

  for (const [term, file] of Object.entries(campus.sections)) {
    cite(`sections/${term}`, file.source);
    if (!termSystems.has(file.termSystem))
      err(`sections/${term}: unknown term system "${file.termSystem}"`);
    const keys = new Set();
    for (const s of file.records) {
      const label = `sections/${term} ${s.course}.${s.section}`;
      const key = `${s.course}#${s.section}`;
      if (keys.has(key)) err(`${label}: duplicate section`);
      keys.add(key);
      if (!courses.has(s.course)) err(`${label}: course is not in courses.json`);
      const scheduled = [s.days, s.start, s.end].filter((v) => v !== null).length;
      if (scheduled === 0) continue;
      if (scheduled !== 3) {
        err(`${label}: days, start and end must be all set or all null`);
        continue;
      }
      const days = [...s.days];
      if (days.some((d) => !dayCodes.has(d)) || new Set(days).size !== days.length)
        err(`${label}: bad day string "${s.days}"`);
      if (s.start >= s.end) err(`${label}: starts at ${s.start} but ends at ${s.end}`);
    }
  }

  if (campus.bus) {
    const { bus } = campus;
    if ((bus.servicePeriod === null || bus.fares === null) && !bus.note)
      err('bus: servicePeriod or fares is null with no note saying why');
    const routes = new Set();
    for (const r of bus.records) {
      if (routes.has(r.route)) err(`bus: duplicate route ${r.route}`);
      routes.add(r.route);
      const off = [...(r.daysOff ?? '')];
      if (off.some((d) => !dayCodes.has(d)) || new Set(off).size !== off.length)
        err(`bus: ${r.route} has a bad daysOff string "${r.daysOff}"`);
    }
  }

  for (const [term, file] of Object.entries(campus.calendars)) {
    cite(`calendar/${term}`, file.source);
    if (!termSystems.has(file.termSystem))
      err(`calendar/${term}: unknown term system "${file.termSystem}"`);
    for (const e of file.records) {
      if (Number.isNaN(Date.parse(`${e.date}T00:00:00Z`)))
        err(`calendar/${term}: bad date ${e.date}`);
      if (e.endDate && e.endDate < e.date)
        err(`calendar/${term}: ${e.date} ends before it starts (${e.endDate})`);
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
        `${c.prerequisites?.records.length ?? 0} prerequisite rules, ${c.requirements?.records.length ?? 0} requirement groups, ` +
        `${c.plans?.records.length ?? 0} plan items, ${sections} sections in ${Object.keys(c.sections).length} term files, ` +
        `${Object.keys(c.calendars).length} calendars`,
    );
  }
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error    ${e}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
