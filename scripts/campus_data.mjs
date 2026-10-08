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
// CSE115L, CSE499A, BBA-level EMB601, and BRACU's two-letter lab suffix
// (CSE490BL). Four-digit graduate codes (CE6207) are deliberately out of scope.
export const COURSE_CODE = /^[A-Z]{2,4}\d{3}[A-Z]{0,2}$/;
// Term codes are the campus's own: NSU prints a two-digit year and a term digit
// (252 = Summer 2025); BRACU's CONNECT session ids use the full year (20263 =
// Fall 2026). Either way the last digit is 1 Spring, 2 Summer, 3 Fall.
const TERM_CODE = /^(\d{2}|\d{4})[123]$/;
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
            // inherited: carried over from Shohoj's own hand-kept code, whose
            // original source was never recorded. placeholder: a template the
            // code itself marks as unconfirmed; never present it as fact.
            status: z.enum(['official', 'third-party', 'derived', 'inherited', 'placeholder']),
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
              // null for a letter no mark earns directly (BRACU's F(NT)).
              minMark: z.number().min(0).max(100).nullable(),
            })
            .strict(),
        )
        .min(2),
      // Grade point → the letter shown for it, when a campus has two letters on
      // one point (BRACU's A+ and A are both 4.0; 4.0 displays as A).
      pointsToGrade: z
        .array(z.tuple([z.number(), z.string()]))
        .min(1)
        .optional(),
      nonGpaGrades: z.array(z.object({ letter: z.string(), meaning: z.string() }).strict()),
      unknown: z.array(z.string()).optional(),
    }),
    retake: cited({
      eligibleAtOrBelow: z.string(),
      // best-before: the best attempt counts for students who started before
      // `cutoff`, the latest for everyone after (BRACU from Fall 2024).
      counts: z.enum(['best', 'latest', 'best-before']),
      cutoff: z.object({ season: z.string(), year: z.number().int() }).strict().optional(),
      maxRetakes: z.number().int().positive().nullable(),
      beyondMax: z.string().optional(),
    }),
    standing: cited({
      goodStandingMinCgpa: z.number(),
      probation: z
        .object({ belowCgpa: z.number(), termsToRecover: z.number().int(), then: z.string() })
        .strict(),
    }).optional(),
    // Named CGPA tiers a campus's calculator shows (BRACU's Perfect Standing …
    // Academic Probation), highest first; the last is the floor.
    standingTiers: citedRecords(
      z
        .object({
          id: z.string(),
          standingLabel: z.string(),
          goalLabel: z.string(),
          minCgpa: z.number().min(0),
        })
        .strict(),
    ).optional(),
    // Shohoj's own progress-meter bands. Messaging, not university policy.
    meterBands: citedRecords(
      z.object({ label: z.string(), minCgpa: z.number().min(0) }).strict(),
    ).optional(),
    // Required, but may be empty with a note when the campus doesn't publish
    // them (DIU) or Shohoj never recorded them (BRACU).
    classDivisions: citedList(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    honours: citedList(z.object({ label: z.string(), minCgpa: z.number() }).strict()),
    classStanding: citedList(
      z.object({ label: z.string(), minCredits: z.number().int().min(0) }).strict(),
    ),
    creditLoad: cited({
      fullTimeMin: z.record(z.string(), z.number().int().positive()).optional(),
      min: z.number().int().positive().optional(),
      warnAbove: z.number().int().positive().optional(),
      max: z.number().int().positive().nullable(),
    }).optional(),
    // A rule may cite its own source when it comes from a different document
    // than the block's (DIU's graduation CGPA is in its FAQ, not its rules).
    academicRules: citedList(
      z.object({ id: z.string(), rule: z.string(), source: sourceId.optional() }).strict(),
    ),
    termSystems: citedRecords(
      z
        .object({
          id: z.string(),
          terms: z
            .array(z.object({ season: z.string(), months: z.string().optional() }).strict())
            .min(1),
          note: z.string().optional(),
        })
        .strict(),
    ),
    termCodes: cited({ pattern: z.string() }),
    days: citedRecords(z.object({ code: z.string().length(1), day: z.string() }).strict()),
    buildings: citedList(z.object({ code: z.string(), name: z.string() }).strict()),
    // How the campus writes a room: a pattern, its regex, and what the kind
    // letter means (BRACU's tower codes, FFZ-NNK).
    roomCodes: cited({
      pattern: z.string(),
      regex: z.string(),
      kinds: z.record(z.string(), z.string()),
    }).optional(),
    location: cited({
      lat: z.number(),
      lng: z.number(),
      radiusM: z.number().positive(),
      utcOffsetMinutes: z.number().int(),
      dayStart: time,
      dayEnd: time,
    }).optional(),
    // Shohoj features the campus has data for (src/core/university.ts).
    features: cited({ records: z.array(z.string()).min(1) }).optional(),
    // Header words on the campus's grade sheet, which a transcript parser
    // recognises and skips (BRACU's issuer name and address).
    transcript: cited({ headerMarkers: z.array(z.string().min(1)).min(1) }).optional(),
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
      // Null for a stub: a code a term file offers whose title and credits no
      // source we have publishes (RDS lists codes only). A stub must cite the
      // source it came from.
      title: z.string().min(1).nullable(),
      credits: credits.nullable(),
      department: z
        .string()
        .regex(/^[A-Z]{2,4}$/)
        .optional(),
      // The catalogue section a hand-kept list files the course under
      // ("GED / Common"); kept so the list can be regenerated as written.
      group: z.string().min(1).optional(),
      source: sourceId.optional(),
    })
    .strict()
    .refine((c) => c.title !== null || c.source !== undefined, {
      message: 'a course with no title must cite its own source',
    }),
);

// Academic departments and which course subjects each one owns.
const departmentsSchema = cited({
  records: z
    .array(
      z
        .object({
          code: z.string().regex(/^[A-Z]{2,6}$/),
          label: z.string().min(1),
          school: z.string().min(1),
          displayCode: z.string().min(1).optional(),
          prefixes: z.array(z.string().regex(/^[A-Z]{2,4}$/)),
        })
        .strict(),
    )
    .min(1),
  // Single courses owned by a department other than their subject's.
  overrides: z.array(z.object({ course: courseCode, department: z.string() }).strict()).optional(),
});

// A minor: named core requirements (each satisfiable by one of several codes)
// plus an elective pool given by codes and subject/level patterns.
const minorsSchema = citedRecords(
  z
    .object({
      code: z.string().regex(/^[A-Z]+$/),
      label: z.string().min(1),
      shortLabel: z.string().min(1),
      department: z.string().min(1),
      totalCredits: z.number().int().positive(),
      core: z
        .array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              codes: z.array(courseCode).min(1),
              credits,
            })
            .strict(),
        )
        .min(1),
      electives: z
        .object({
          credits,
          codes: z.array(courseCode),
          patterns: z.array(
            z
              .object({
                subject: z.string().regex(/^[A-Z]{2,4}$/),
                levels: z.array(z.number().int().min(1).max(9)),
              })
              .strict(),
          ),
          options: z.array(z.object({ label: z.string() }).strict()),
        })
        .strict(),
      // The published document the requirements come from, as the code names it.
      document: z.string().min(1),
    })
    .strict(),
);

const initials = z.string().regex(/^[A-Za-z0-9]{1,10}$/);
const facultySchema = citedRecords(
  z
    .object({
      initials,
      name: z.string().min(1),
      // "" when the directory has no address for them.
      email: z.union([z.literal(''), z.email()]),
      dept: z.string().min(1),
      courses: z.array(courseCode),
    })
    .strict(),
);

const rating = z.number().int().min(1).max(5);
const reviewsSchema = citedRecords(
  z
    .object({
      facultyInitials: initials,
      courseCode,
      semester: z.string(),
      ratings: z
        .object({
          teaching: rating,
          marking: rating,
          behavior: rating,
          difficulty: rating,
          workload: rating,
        })
        .strict(),
      text: z.string(),
      // "" when the import did not record where the review came from.
      sourceUrl: z.union([z.literal(''), z.url()]),
    })
    .strict(),
);

const clock12 = z.string().regex(/^\d{1,2}:\d{2} (AM|PM)$/, 'not an "H:MM AM/PM" time');
const cafeteriaSchema = cited({
  lastReviewed: z.string().min(1),
  disclaimer: z.string().min(1),
  records: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          kind: z.enum(['cafeteria', 'cafe', 'canteen', 'kiosk']),
          floor: z.number().int(),
          zone: z.string().nullable(),
          locationNote: z.string(),
          payment: z.array(z.string()),
          // Indexed by day of week, 0 = Sunday; [] = closed that day.
          hours: z.array(z.array(z.object({ open: clock12, close: clock12 }).strict())).length(7),
          verified: z.boolean(),
          note: z.string().optional(),
        })
        .strict(),
    )
    .min(1),
});

const placesSchema = cited({
  // Floor numbers the place list uses for levels that are not plain floors.
  levels: z
    .object({ basement: z.number().int(), ground: z.number().int(), upperRoof: z.number().int() })
    .strict(),
  records: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          floor: z.number().int(),
          kind: z.enum([
            'office',
            'department',
            'study',
            'lab',
            'food',
            'health',
            'venue',
            'recreation',
            'service',
          ]),
          aliases: z.array(z.string()),
        })
        .strict(),
    )
    .min(1),
});

// A course can carry rules from several documents, and a curriculum can state
// a rule for its own program only, so a rule is keyed by course + program +
// source rather than by course alone.
const prerequisitesSchema = citedRecords(
  z
    .object({
      course: courseCode,
      program: programCode.optional(),
      allOf: z.array(z.array(courseCode).min(1)).optional(),
      // Any one of these course sets satisfies the rule — the shape of the
      // CONNECT feed's "(A AND B) OR (C AND D)". Never set with allOf.
      anyOf: z.array(z.array(courseCode).min(1)).min(1).optional(),
      // Recommended, not enforced (the hand-kept catalogue's "soft" prereqs).
      recommended: z.array(courseCode).min(1).optional(),
      minCredits: z.number().int().positive().optional(),
      minCgpa: z.number().min(0).max(5).optional(),
      orConsent: z.literal(true).optional(),
      unparsed: z.literal(true).optional(),
      raw: z.string().min(1),
      source: sourceId.optional(),
    })
    .strict(),
);

const planRecord = z
  .object({
    program: programCode,
    year: z.number().int().min(1).max(8),
    // null when the document places a course by year only.
    term: z.number().int().min(1).max(24).nullable(),
    // The plan's own name for the term, when it has one ("Fall — Semester 1").
    termLabel: z.string().min(1).optional(),
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
  .strict();

const plansSchema = cited({
  // true when the plans are starter presets covering only the first terms (as
  // BRACU's are), so they are not expected to reach a program's total.
  partial: z.boolean().optional(),
  records: z.array(planRecord).min(1),
});

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

const meetings = z.array(
  z
    .object({
      day: z.string().length(1),
      start: time,
      end: time,
      room: z.string().min(1).nullable(),
    })
    .strict(),
);
const exam = z.object({ date: z.string().regex(ISO_DATE), start: time, end: time }).strict();

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
            // NSU numbers its sections; BRACU names them ("04", "07A",
            // "04-CLOSED"), and the name is kept exactly as printed.
            section: z.union([z.number().int().positive(), z.string().min(1)]),
            faculty: z.string().min(1).nullable(),
            // All three null for a section with no fixed schedule (an internship,
            // a thesis); never some without the others.
            days: z.string().min(1).nullable(),
            start: time.nullable(),
            end: time.nullable(),
            room: z.string().min(1).nullable(),
            // The section size. Null when the source doesn't publish it: RDS
            // shows only the seats left, recorded as seatsAvailable.
            capacity: z.number().int().min(0).nullable(),
            // Seats left when the source was captured — a snapshot, never live.
            seatsAvailable: z.number().int().min(0).optional(),
            department: z
              .string()
              .regex(/^[A-Z]{2,4}$/)
              .optional(),
            // Set when a value was corrected from an obvious printing error;
            // says what was printed and why it was read differently.
            note: z.string().min(1).optional(),
            // ── Fields a richer feed (BRACU's CONNECT) supplies ──
            // Per-day meetings when a section's days don't share one time slot;
            // days/start/end are then null.
            meetings: meetings.optional(),
            sectionId: z.number().int().positive().optional(),
            type: z.string().min(1).optional(),
            title: z.string().min(1).optional(),
            seatsTaken: z.number().int().min(0).optional(),
            lab: z
              .object({
                course: courseCode,
                sectionId: z.number().int().positive().nullable(),
                title: z.string().nullable(),
                faculty: z.string().min(1).nullable(),
                room: z.string().min(1).nullable(),
                meetings,
              })
              .strict()
              .optional(),
            exams: z.object({ mid: exam.nullable(), final: exam.nullable() }).strict().optional(),
            classDates: z
              .object({
                start: z.string().regex(ISO_DATE).nullable(),
                end: z.string().regex(ISO_DATE).nullable(),
              })
              .strict()
              .optional(),
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
            // On a "last-class" row: the day codes (profile.days) of the
            // pattern whose classes end that day, when the campus ends each
            // pattern on its own date.
            days: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

// Two published shapes. NSU's and DIU's notices list stops and a few campus
// arrival and departure times per route; BRACU's brochure times every stop on
// up to two inbound trips.
//
// servicePeriod and fares are null when the operator doesn't publish them (DIU's
// feed names a semester, not dates, and lists no fare); checkCampus requires a
// note then.
const campusTimesBusSchema = cited({
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
const bracuBusSchema = cited({
  effectiveFrom: z.string().min(1),
  availability: z.string().min(1),
  fareNote: z.string().min(1),
  contacts: z.array(
    z.object({ name: z.string(), title: z.string(), email: z.string().email() }).strict(),
  ),
  instructions: z.array(z.string().min(1)),
  records: z
    .array(
      z
        .object({
          id: z.string().min(1),
          routeNo: z.number().int().positive(),
          name: z.string().min(1),
          inbound: z
            .array(
              z
                .object({
                  name: z.string().min(1),
                  firstTrip: clock12.nullable(),
                  secondTrip: clock12.nullable(),
                })
                .strict(),
            )
            .min(1),
          outbound: z.object({ first: clock12.nullable(), second: clock12.nullable() }).strict(),
          attendantPhone: z.string().min(1),
          fareOneWay: z.number().positive(),
          fareRoundTrip: z.number().positive(),
        })
        .strict(),
    )
    .min(1),
});
const busSchema = z.union([campusTimesBusSchema, bracuBusSchema]);

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
  departments: { file: 'departments.json', schema: departmentsSchema },
  minors: { file: 'minors.json', schema: minorsSchema },
  faculty: { file: 'faculty.json', schema: facultySchema },
  reviews: { file: 'reviews.json', schema: reviewsSchema },
  bus: { file: 'bus.json', schema: busSchema },
  cafeteria: { file: 'cafeteria.json', schema: cafeteriaSchema },
  places: { file: 'places.json', schema: placesSchema },
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
    for (const key of [
      'classDivisions',
      'honours',
      'classStanding',
      'academicRules',
      'buildings',
    ]) {
      if (!profile[key].records.length && !profile[key].note)
        err(`profile.${key}: empty with no note saying why`);
    }
    for (const r of profile.academicRules.records) cite(`profile.academicRules.${r.id}`, r.source);
    const letters = profile.grading.scale.map((g) => g.letter);
    if (new Set(letters).size !== letters.length) err('grading: duplicate letter');
    if (!letters.includes(profile.retake.eligibleAtOrBelow))
      err(`retake: "${profile.retake.eligibleAtOrBelow}" is not on the scale`);
    if (profile.retake.counts === 'best-before' && !profile.retake.cutoff)
      err('retake: "best-before" needs a cutoff term');
    const tiers = profile.standingTiers?.records ?? [];
    if (tiers.some((t, i) => i && t.minCgpa >= tiers[i - 1].minCgpa))
      err('standingTiers: tiers must run from the highest CGPA down');
    const points = profile.grading.scale.map((g) => g.points);
    const marks = profile.grading.scale.map((g) => g.minMark).filter((m) => m !== null);
    if (
      points.some((p, i) => i && p > points[i - 1]) ||
      marks.some((m, i) => i && m >= marks[i - 1])
    ) {
      err('grading: scale must run from the highest letter down');
    }
  }
  const dayCodes = new Set(profile?.days.records.map((d) => d.code) ?? []);
  const termSystems = new Set(profile?.termSystems.records.map((t) => t.id) ?? []);

  for (const key of [
    'programs',
    'courses',
    'prerequisites',
    'plans',
    'requirements',
    'departments',
    'minors',
    'faculty',
    'reviews',
    'bus',
    'cafeteria',
    'places',
  ]) {
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

  // Codes a rule names that nothing lists yet, grouped per source: one line
  // per source keeps a real problem visible among hundreds of feed rules.
  const unlisted = new Map();
  const ruleKeys = new Set();
  for (const p of campus.prerequisites?.records ?? []) {
    const key = `${p.course}|${p.program ?? ''}|${p.source ?? ''}`;
    if (ruleKeys.has(key))
      err(`prerequisites: duplicate rule for ${p.course} from the same source and program`);
    ruleKeys.add(key);
    cite(`prerequisites.${p.course}`, p.source);
    if (p.program) knownProgram(`prerequisites.${p.course}`, p.program);
    if (!courses.has(p.course)) err(`prerequisites: ${p.course} is not in courses.json`);
    if (p.allOf && p.anyOf) err(`prerequisites: ${p.course} sets both allOf and anyOf`);
    if (!p.unparsed && !p.allOf && !p.anyOf && !p.minCredits && !p.recommended)
      err(`prerequisites: ${p.course} states no requirement; mark it unparsed`);
    for (const code of [
      ...(p.allOf ?? []).flat(),
      ...(p.anyOf ?? []).flat(),
      ...(p.recommended ?? []),
    ]) {
      if (courses.has(code)) continue;
      const key = p.source ?? campus.prerequisites.source;
      if (!unlisted.has(key)) unlisted.set(key, new Set());
      unlisted.get(key).add(code);
    }
  }
  for (const [source, codes] of unlisted) {
    const list = [...codes].sort();
    warn(
      `prerequisites (${source}): rules require ${list.length} course(s) not in courses.json yet: ${list.join(', ')}`,
    );
  }

  // Departments own subjects; a subject has one owner.
  const owner = new Map();
  for (const d of campus.departments?.records ?? []) {
    for (const prefix of d.prefixes) {
      if (owner.has(prefix))
        err(`departments: ${prefix} is owned by both ${owner.get(prefix)} and ${d.code}`);
      owner.set(prefix, d.code);
    }
  }
  const deptCodes = new Set((campus.departments?.records ?? []).map((d) => d.code));
  for (const o of campus.departments?.overrides ?? []) {
    if (!deptCodes.has(o.department))
      err(`departments: override for ${o.course} names unknown department ${o.department}`);
  }

  for (const m of campus.minors?.records ?? []) {
    const total = m.core.reduce((n, r) => n + r.credits, 0) + m.electives.credits;
    if (total !== m.totalCredits)
      err(`minors.${m.code}: core and electives make ${total} credits, not ${m.totalCredits}`);
    for (const code of [...m.core.flatMap((r) => r.codes), ...m.electives.codes]) {
      if (!courses.has(code)) warn(`minors.${m.code}: ${code} is not in courses.json yet`);
    }
  }

  const facultyInitials = new Set();
  for (const f of campus.faculty?.records ?? []) {
    if (facultyInitials.has(f.initials)) err(`faculty: duplicate initials ${f.initials}`);
    facultyInitials.add(f.initials);
    for (const code of f.courses) {
      if (!courses.has(code)) warn(`faculty.${f.initials}: ${code} is not in courses.json yet`);
    }
  }
  for (const r of campus.reviews?.records ?? []) {
    if (campus.faculty && !facultyInitials.has(r.facultyInitials))
      warn(`reviews: a review names faculty ${r.facultyInitials}, who is not in faculty.json`);
    if (!courses.has(r.courseCode))
      warn(`reviews: a review names ${r.courseCode}, which is not in courses.json yet`);
  }

  const toMinutes = (t) => {
    const [, h, m, ap] = t.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
    return ((Number(h) % 12) + (ap === 'PM' ? 12 : 0)) * 60 + Number(m);
  };
  const outletIds = new Set();
  for (const o of campus.cafeteria?.records ?? []) {
    if (outletIds.has(o.id)) err(`cafeteria: duplicate outlet id ${o.id}`);
    outletIds.add(o.id);
    for (const day of o.hours) {
      for (const span of day) {
        if (toMinutes(span.close) <= toMinutes(span.open))
          err(`cafeteria.${o.id}: closes at ${span.close}, before opening at ${span.open}`);
      }
    }
  }
  const placeIds = new Set();
  for (const p of campus.places?.records ?? []) {
    if (placeIds.has(p.id)) err(`places: duplicate id ${p.id}`);
    placeIds.add(p.id);
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
    if (campus.plans?.partial) break;
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
    const unlistedLabs = new Set();
    for (const s of file.records) {
      const label = `sections/${term} ${s.course}.${s.section}`;
      const key = `${s.course}#${s.section}`;
      if (keys.has(key)) err(`${label}: duplicate section`);
      keys.add(key);
      if (!courses.has(s.course)) err(`${label}: course is not in courses.json`);
      if (s.capacity === null && s.seatsAvailable === undefined)
        err(`${label}: has neither a capacity nor a seat count`);
      const checkMeetings = (list, where) => {
        for (const mt of list) {
          if (!dayCodes.has(mt.day)) err(`${where}: unknown day code "${mt.day}"`);
          if (mt.start >= mt.end) err(`${where}: meets ${mt.start}-${mt.end}`);
        }
      };
      if (s.lab) {
        if (!courses.has(s.lab.course)) unlistedLabs.add(s.lab.course);
        checkMeetings(s.lab.meetings, `${label} lab`);
      }
      const scheduled = [s.days, s.start, s.end].filter((v) => v !== null).length;
      if (s.meetings) {
        if (scheduled !== 0) err(`${label}: set per-day meetings or days/start/end, not both`);
        checkMeetings(s.meetings, label);
        continue;
      }
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
    if (unlistedLabs.size) {
      const list = [...unlistedLabs].sort();
      warn(
        `sections/${term}: ${list.length} lab course(s) not in courses.json yet: ${list.join(', ')}`,
      );
    }
  }

  // The stops-and-campus-times shape (NSU, DIU); BRACU's timed-stops shape has
  // no service period, fares object or day codes to check.
  if (campus.bus && !('effectiveFrom' in campus.bus)) {
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
      if (e.days !== undefined) {
        const days = [...e.days];
        if (e.kind !== 'last-class')
          err(`calendar/${term}: ${e.date} names days but is not a last-class row`);
        if (days.some((d) => !dayCodes.has(d)) || new Set(days).size !== days.length)
          err(`calendar/${term}: ${e.date} has a bad day string "${e.days}"`);
      }
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
