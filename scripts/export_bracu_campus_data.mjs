// scripts/export_bracu_campus_data.mjs (#792)
//
// Exports the BRACU facts Shohoj still keeps in code into data/campuses/bracu/,
// so the campus database holds BRACU alongside NSU:
//
//   node scripts/export_bracu_campus_data.mjs \
//     --feed 20263=<connect.json> --feed 20262=<semester-20262.json>
//
// Reads the live modules rather than retyping them — grading, marks, standing
// tiers, the minor, the BRACU profile, bus, cafeteria and campus places, campus
// location and hours, faculty and seed reviews — plus CONNECT feed snapshots
// for sections (the feed carries one semester; pass each snapshot you have).
// tests/bracuCampusParity.test.js then rebuilds every runtime structure from
// the exported data and requires it to equal what the code exports, so the two
// cannot drift apart unnoticed.
//
// Re-run after changing any of those modules; the parity test says when.
//
// NOT exported, because the direction has reversed (#869): the catalogue,
// prerequisites, departments, programs and presets. Those are written in
// data/campuses/bracu/ and the code is generated from them
// (npm run generate:legacy-catalog). This script leaves programs.json,
// plans.json and departments.json alone, and in courses.json and
// prerequisites.json replaces only the records a CONNECT snapshot supplied.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRADES, POINTS_TO_GRADE } from '../js/core/grades.js';
import { MARK_SCALE } from '../js/core/courseMarks.js';
import { MILESTONE_TIERS } from '../js/core/milestones.js';
import { MINOR_PROGRAMS } from '../js/core/minors.js';
import { CAMPUS_START_MIN, CAMPUS_END_MIN } from '../js/core/freeRooms.js';
import { CAMPUS_UTC_OFFSET_MIN } from '../js/core/semesterBriefing.js';
import * as bus from '../src/core/busRoutes.ts';
import * as cafeteria from '../src/core/cafeteriaOutlets.ts';
import * as places from '../src/core/campusPlaces.ts';
import { CAMPUS_LAT, CAMPUS_LNG, CAMPUS_RADIUS_M } from '../src/core/campusRooms.ts';
import { UNIVERSITIES } from '../src/core/university.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'campuses', 'bracu');
const RETRIEVED = '2026-09-28';
// Provenance links pin the commit the literals were exported from.
const COMMIT = '7f3279375d99a3295da7ec912d117dbbe66bfd34';
const repoFile = (file) => `https://github.com/souravmondalshuvo/Shohoj/blob/${COMMIT}/${file}`;

// ── JSON with one record per line, so diffs stay readable ──────────────────
function encode(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((v) => v && typeof v === 'object' && !Array.isArray(v))
  ) {
    return `[\n${value.map((v) => `${pad}  ${JSON.stringify(v)}`).join(',\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${encode(v, indent + 1)}`).join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}
function write(rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${encode(data)}\n`);
  return rel;
}
const fail = (msg) => {
  throw new Error(`export_bracu_campus_data: ${msg}`);
};

// ── Sources ─────────────────────────────────────────────────────────────────
const inherited = (id, title, file) => ({
  id,
  status: 'inherited',
  title,
  url: repoFile(file),
  retrieved: RETRIEVED,
});
const SOURCES = [
  inherited(
    'bracu-catalog',
    'Course catalogue, prerequisites and department ownership, hand-kept in js/core/catalog.js (original sources not recorded)',
    'js/core/catalog.js',
  ),
  inherited(
    'bracu-departments',
    'Programs, total credits and semester presets, hand-kept in js/core/departments.js',
    'js/core/departments.js',
  ),
  inherited(
    'bracu-grading',
    'Grade points (js/core/grades.js) and mark cutoffs (js/core/courseMarks.js); src/core/university.ts flags the cutoffs as unsourced',
    'js/core/grades.js',
  ),
  inherited(
    'bracu-standing',
    'Standing tiers (Summer 2022+ probation policy per the code), js/core/milestones.js',
    'js/core/milestones.js',
  ),
  inherited(
    'bracu-meter',
    "Shohoj's own CGPA meter messaging bands, js/main.js — not a university policy",
    'js/main.js',
  ),
  inherited(
    'bracu-registry',
    'BRACU profile: sign-in domain, retake and repeat policy, credit load and feature list, src/core/university.ts',
    'src/core/university.ts',
  ),
  inherited(
    'bracu-terms',
    'Term code rule (session id % 10) and week order, js/core/semesterIdentity.js and js/core/routineGrid.js',
    'js/core/semesterIdentity.js',
  ),
  inherited(
    'bracu-campus-location',
    'Campus coordinates, on-campus radius and room-code format (src/core/campusRooms.ts); campus hours (js/core/freeRooms.js); UTC offset (js/core/semesterBriefing.js)',
    'src/core/campusRooms.ts',
  ),
  inherited(
    'bracu-math-minor',
    'Minor in Mathematics, transcribed in js/core/minors.js from the MPS department course guide',
    'js/core/minors.js',
  ),
  inherited(
    'bracu-transport',
    'Transport Office brochure (schedule effective 9 June 2026), transcribed in src/core/busRoutes.ts',
    'src/core/busRoutes.ts',
  ),
  {
    id: 'bracu-campus-360',
    status: 'official',
    title:
      'BRACU Campus 360 (named places by level, checked 2026-09-23), as transcribed in src/core/campusPlaces.ts',
    url: 'https://www.bracu.ac.bd/campus-360',
    retrieved: '2026-09-23',
  },
  {
    id: 'bracu-cafeteria-placeholder',
    status: 'placeholder',
    title:
      'Cafeteria outlet templates in src/core/cafeteriaOutlets.ts — every outlet is unverified',
    url: repoFile('src/core/cafeteriaOutlets.ts'),
    retrieved: RETRIEVED,
  },
  inherited(
    'bracu-faculty-profiles',
    'Faculty directory seed, data/faculty_profiles.jsonl',
    'data/faculty_profiles.jsonl',
  ),
  inherited(
    'bracu-transcript-parser',
    'BRACU grade-sheet header words the transcript parser skips, js/import/transcript-core.js',
    'js/import/transcript-core.js',
  ),
  {
    id: 'bracu-seed-reviews',
    status: 'third-party',
    title:
      'Seed faculty reviews imported from a student review site (each row carries its sourceUrl), data/input_reviews.jsonl',
    url: repoFile('data/input_reviews.jsonl'),
    retrieved: RETRIEVED,
  },
];

// ── Profile ─────────────────────────────────────────────────────────────────
const registry = UNIVERSITIES.bracu;
const DAYS = [
  ['A', 'SATURDAY'],
  ['S', 'SUNDAY'],
  ['M', 'MONDAY'],
  ['T', 'TUESDAY'],
  ['W', 'WEDNESDAY'],
  ['R', 'THURSDAY'],
  ['F', 'FRIDAY'],
];
const DAY_CODE = Object.fromEntries(DAYS.map(([code, name]) => [name, code]));
const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const scale = MARK_SCALE.map(({ letter, min }) => {
  if (!(letter in GRADES)) fail(`mark letter ${letter} has no grade point`);
  return { letter, points: GRADES[letter], minMark: min };
});
for (const [letter, points] of Object.entries(GRADES)) {
  if (points !== null && !scale.some((g) => g.letter === letter))
    scale.push({ letter, points, minMark: null });
}
const NON_GPA_MEANING = {
  P: 'Pass; no grade point',
  I: 'Incomplete; no grade point',
  W: 'Withdrawal; no grade point, but it still consumed an attempt',
};
const nonGpaGrades = Object.entries(GRADES)
  .filter(([, points]) => points === null)
  .map(([letter]) => ({
    letter,
    meaning: NON_GPA_MEANING[letter] ?? fail(`no meaning recorded for ${letter}`),
  }));

// Repeat eligibility: registry.repeat says "below 3.0, exclusive"; expressed on
// the scale that is the highest letter strictly under the threshold.
const repeatLetter = scale
  .filter(
    (g) =>
      (registry.repeat.inclusive
        ? g.points <= registry.repeat.threshold
        : g.points < registry.repeat.threshold) && g.minMark !== null,
  )
  .sort((a, b) => b.points - a.points)[0].letter;

const SEASONS_TO_SYSTEM = new Map([
  ['Spring,Summer,Fall', 'trimester'],
  ['Spring,Summer', 'spring-summer'],
  ['Spring,Fall', 'spring-fall'],
]);
const profile = {
  id: 'bracu',
  name: registry.name,
  shortName: registry.shortName,
  identity: {
    source: 'bracu-registry',
    note: 'Students only; faculty and staff on the bare bracu.ac.bd domain are not admitted.',
    emailDomains: [...registry.emailDomains],
  },
  grading: {
    source: 'bracu-grading',
    note: 'Two letters share 4.0 (A+ and A); F(NT) scores 0 but no mark earns it directly. The mark cutoffs are not sourced from a university document — verify before relying on them.',
    scale,
    pointsToGrade: POINTS_TO_GRADE.map(([p, l]) => [p, l]),
    nonGpaGrades,
  },
  retake: {
    source: 'bracu-registry',
    note: 'Students who started before Fall 2024 keep their best attempt; from Fall 2024 on, the latest attempt counts.',
    eligibleAtOrBelow: repeatLetter,
    counts: registry.retake.kind,
    cutoff: { ...registry.retake.cutoff },
    maxRetakes: registry.maxRetakes ?? null,
  },
  standingTiers: {
    source: 'bracu-standing',
    records: MILESTONE_TIERS.map((t) => ({
      id: t.id,
      standingLabel: t.standingLabel,
      goalLabel: t.goalLabel,
      minCgpa: t.threshold,
    })),
  },
  meterBands: {
    source: 'bracu-meter',
    note: "Shohoj's own encouragement messages on the CGPA meter; not a BRACU policy.",
    records: [
      { label: 'Outstanding!', minCgpa: 3.75 },
      { label: 'Excellent.', minCgpa: 3.5 },
      { label: 'Good standing.', minCgpa: 3.0 },
      { label: 'Keep pushing.', minCgpa: 2.5 },
      { label: 'Recovery mode.', minCgpa: 0 },
    ],
  },
  // Required blocks Shohoj's code has never recorded for BRACU: empty, and
  // saying so, rather than guessed.
  ...Object.fromEntries(
    ['classDivisions', 'honours', 'classStanding', 'academicRules', 'buildings'].map((key) => [
      key,
      {
        source: 'bracu-registry',
        note: "Not recorded anywhere in Shohoj's code for BRACU; to be sourced from the university.",
        records: [],
      },
    ]),
  ),
  creditLoad: {
    source: 'bracu-registry',
    min: registry.creditLoad.min,
    warnAbove: registry.creditLoad.warnAbove,
    max: registry.creditLoad.max,
  },
  termSystems: {
    source: 'bracu-departments',
    note: 'Most programs run three terms a year; some presets use only two of the seasons.',
    records: [...SEASONS_TO_SYSTEM].map(([seasons, id]) => ({
      id,
      terms: seasons.split(',').map((season) => ({ season })),
    })),
  },
  termCodes: {
    source: 'bracu-terms',
    pattern:
      'CONNECT session id: four-digit year followed by 1 (Spring), 2 (Summer) or 3 (Fall); 20263 is Fall 2026',
  },
  days: {
    source: 'bracu-terms',
    note: 'Week order starts on Saturday. CONNECT writes days in full (SATURDAY); these letters are ours.',
    records: DAYS.map(([code, day]) => ({ code, day: day[0] + day.slice(1).toLowerCase() })),
  },
  roomCodes: {
    source: 'bracu-campus-location',
    note: 'Tower rooms only; venues such as AN1-01C or FT11-02L do not follow the pattern.',
    pattern: 'FFZ-NNK: two-digit floor, zone letter, room number, kind letter (e.g. 09G-31T)',
    regex: '^(\\d{2})([A-Z])-(\\d{2,3})([A-Z])$',
    kinds: { C: 'classroom', L: 'lab', T: 'theater' },
  },
  location: {
    source: 'bracu-campus-location',
    lat: CAMPUS_LAT,
    lng: CAMPUS_LNG,
    radiusM: CAMPUS_RADIUS_M,
    utcOffsetMinutes: CAMPUS_UTC_OFFSET_MIN,
    dayStart: clock(CAMPUS_START_MIN),
    dayEnd: clock(CAMPUS_END_MIN),
  },
  features: { source: 'bracu-registry', records: [...registry.features] },
  transcript: {
    source: 'bracu-transcript-parser',
    note: 'Header words of the BRACU grade sheet (issuer and its Kha 224, Merul Badda address) that the transcript parser skips.',
    headerMarkers: ['BRAC University', 'Kha 224', 'Merul', 'GRADE SHEET', 'UNOFFICIAL'],
  },
};

// ── The catalogue and its rules: kept, not exported ─────────────────────────
// Everything in these two files that did not come off a CONNECT snapshot is
// written by hand there, and stays exactly as it is.
const FEED_SOURCE = /^bracu-connect-/;
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(OUT, rel), 'utf8'));
const coursesFile = readJson('courses.json');
const prerequisitesFile = readJson('prerequisites.json');
const kept = (file) => file.records.filter((r) => !FEED_SOURCE.test(r.source ?? file.source));
const courses = kept(coursesFile);
const prerequisites = kept(prerequisitesFile);
const catalogued = new Set(courses.map((c) => c.code));

// ── Sections from CONNECT feed snapshots ────────────────────────────────────
const FEED_SOURCES = {
  20263: {
    status: 'third-party',
    title:
      'CONNECT feed mirror (usis-cdn.eniamza.com), semester 20263 (Fall 2026), fetched 2026-09-28; seats as of that moment',
    url: 'https://usis-cdn.eniamza.com/connect.json',
    retrieved: RETRIEVED,
  },
  20262: {
    status: 'third-party',
    title:
      "Shohoj's archived snapshot of the CONNECT feed for semester 20262 (Summer 2026): hand-imported, seats frozen, many faculty TBA",
    url: 'https://usis-cdn.eniamza.com/connect.json',
    retrieved: RETRIEVED,
  },
};
const feeds = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] !== '--feed') continue;
  const [term, file] = process.argv[++i].split('=');
  feeds.push({ term, file });
}
const hhmm = (t) => (t ? t.slice(0, 5) : null);
const nullIfTba = (v) => (v && v.trim() && v.trim().toUpperCase() !== 'TBA' ? v.trim() : null);
const sortDays = (list) =>
  [...list].sort(
    (a, b) => DAYS.findIndex(([c]) => c === a.day) - DAYS.findIndex(([c]) => c === b.day),
  );
const toMeetings = (schedules, room) =>
  sortDays(
    (schedules ?? []).map((s) => ({
      day: DAY_CODE[s.day] ?? fail(`unknown day ${s.day}`),
      start: hhmm(s.startTime),
      end: hhmm(s.endTime),
      room,
    })),
  );
const exam = (date, start, end) => (date ? { date, start: hhmm(start), end: hhmm(end) } : null);

// DNF of the feed's "(A AND B) OR (C)" prerequisite expressions.
function parsePrereq(text) {
  const tokens = text
    .replace(/[()]/g, (p) => ` ${p} `)
    .trim()
    .split(/\s+/);
  let i = 0;
  const expr = () => {
    let left = term();
    while (tokens[i] === 'OR') {
      i++;
      left = [...left, ...term()];
    }
    return left;
  };
  const term = () => {
    let left = factor();
    while (tokens[i] === 'AND') {
      i++;
      const right = factor();
      left = left.flatMap((a) => right.map((b) => [...new Set([...a, ...b])]));
    }
    return left;
  };
  const factor = () => {
    const t = tokens[i++];
    if (t === '(') {
      const inner = expr();
      if (tokens[i++] !== ')') throw new Error('unbalanced');
      return inner;
    }
    if (!/^[A-Z]{2,4}\d{3}[A-Z]{0,2}$/.test(t ?? '')) throw new Error(`unexpected token ${t}`);
    return [[t]];
  };
  const dnf = expr();
  if (i !== tokens.length) throw new Error('trailing tokens');
  return dnf;
}

const feedCourses = new Map();
const feedRules = new Map();
const sectionFiles = [];
for (const { term, file } of feeds) {
  const meta = FEED_SOURCES[term] ?? fail(`no source description for feed term ${term}`);
  const sourceId = `bracu-connect-${term}`;
  SOURCES.push({ id: sourceId, ...meta });
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = rows
    .filter((r) => String(r.semesterSessionId) === term)
    .map((r) => {
      const sch = r.sectionSchedule ?? {};
      const room = nullIfTba(r.roomName);
      const meetings = toMeetings(sch.classSchedules, room);
      const sameSlot =
        meetings.length && new Set(meetings.map((m) => `${m.start}-${m.end}`)).size === 1;
      const rec = {
        course: r.courseCode,
        section: r.sectionName,
        faculty: nullIfTba(r.faculties),
        days: sameSlot ? meetings.map((m) => m.day).join('') : null,
        start: sameSlot ? meetings[0].start : null,
        end: sameSlot ? meetings[0].end : null,
        room,
        capacity: r.capacity,
      };
      if (meetings.length && !sameSlot) rec.meetings = meetings;
      Object.assign(rec, {
        sectionId: r.sectionId,
        type: r.courseType,
        title: r.courseName,
        seatsTaken: r.consumedSeat,
      });
      if (r.labCourseCode) {
        rec.lab = {
          course: r.labCourseCode,
          sectionId: r.labSectionId ?? null,
          title: r.labName ?? null,
          faculty: nullIfTba(r.labFaculties),
          room: nullIfTba(r.labRoomName),
          meetings: toMeetings(r.labSchedules, nullIfTba(r.labRoomName)),
        };
      }
      rec.exams = {
        mid: exam(sch.midExamDate, sch.midExamStartTime, sch.midExamEndTime),
        final: exam(sch.finalExamDate, sch.finalExamStartTime, sch.finalExamEndTime),
      };
      rec.classDates = { start: sch.classStartDate ?? null, end: sch.classEndDate ?? null };
      if (!catalogued.has(r.courseCode) && !feedCourses.has(r.courseCode))
        feedCourses.set(r.courseCode, {
          code: r.courseCode,
          title: r.courseName,
          credits: r.courseCredit,
          source: sourceId,
        });
      const expr = (r.prerequisiteCourses ?? '').trim();
      if (expr && expr !== 'N/A') {
        const key = `${r.courseCode}|${sourceId}`;
        const prior = feedRules.get(key);
        if (prior && prior.raw !== expr)
          fail(`${r.courseCode}: sections disagree on prerequisites in ${term}`);
        if (!prior) {
          const dnf = parsePrereq(expr);
          const rule = { course: r.courseCode };
          if (dnf.length === 1) rule.allOf = dnf[0].map((c) => [c]);
          else if (dnf.every((set) => set.length === 1)) rule.allOf = [dnf.map((set) => set[0])];
          else rule.anyOf = dnf;
          rule.raw = expr;
          rule.source = sourceId;
          feedRules.set(key, rule);
        }
      }
      return rec;
    })
    .sort(
      (a, b) =>
        a.course.localeCompare(b.course) || String(a.section).localeCompare(String(b.section)),
    );
  if (!records.length) fail(`${file} holds no sections for ${term}`);
  sectionFiles.push(
    write(`sections/${term}-trimester.json`, {
      term,
      termSystem: 'trimester',
      source: sourceId,
      note: 'From the CONNECT feed. section is the name exactly as CONNECT prints it; a lab runs as its own component under lab. seatsTaken is a snapshot, not live.',
      records,
    }),
  );
}
for (const c of feedCourses.values()) courses.push(c);
for (const rule of feedRules.values()) prerequisites.push(rule);
// Prerequisites naming a course nothing else lists: record the course from its
// rule's own feed section title when we have it, else leave the warning.

// ── Everything else ─────────────────────────────────────────────────────────
const written = [
  write('sources.json', {
    note: "Every other BRACU file cites one of these ids. inherited: carried over from Shohoj's own code, original source not recorded. placeholder: marked unconfirmed in the code itself.",
    records: SOURCES,
  }),
  write('profile.json', profile),
  write('courses.json', { ...coursesFile, records: courses }),
  write('prerequisites.json', { ...prerequisitesFile, records: prerequisites }),
  write('minors.json', {
    source: 'bracu-math-minor',
    records: MINOR_PROGRAMS.map(({ source, core, electives, ...rest }) => ({
      ...rest,
      core: core.map((r) => ({ ...r, codes: [...r.codes] })),
      electives: {
        credits: electives.credits,
        codes: [...electives.codes],
        patterns: electives.patterns.map((p) => ({ subject: p.subject, levels: [...p.levels] })),
        options: electives.options.map((o) => ({ ...o })),
      },
      document: source,
    })),
  }),
  write('faculty.json', {
    source: 'bracu-faculty-profiles',
    records: fs
      .readFileSync(path.join(ROOT, 'data/faculty_profiles.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  }),
  write('reviews.json', {
    source: 'bracu-seed-reviews',
    note: 'Student-written seed reviews, verbatim; each keeps the URL it was imported from.',
    records: fs
      .readFileSync(path.join(ROOT, 'data/input_reviews.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  }),
  write('bus.json', {
    source: 'bracu-transport',
    effectiveFrom: bus.BUS_SCHEDULE_EFFECTIVE_FROM,
    availability: bus.BUS_SERVICE_AVAILABILITY,
    fareNote: bus.BUS_FARE_NOTE,
    contacts: bus.BUS_CONTACTS.map((c) => ({ ...c })),
    instructions: [...bus.BUS_GENERAL_INSTRUCTIONS],
    records: bus.BUS_ROUTES.map((r) => ({
      id: r.id,
      routeNo: r.routeNo,
      name: r.name,
      inbound: r.inbound.map((s) => ({ ...s })),
      outbound: { ...r.outbound },
      attendantPhone: r.attendantPhone,
      fareOneWay: r.fareOneWay,
      fareRoundTrip: r.fareRoundTrip,
    })),
  }),
  write('cafeteria.json', {
    source: 'bracu-cafeteria-placeholder',
    note: 'Placeholder outlets and hours: every outlet is unverified in the code itself.',
    lastReviewed: cafeteria.CAFETERIA_LAST_REVIEWED,
    disclaimer: cafeteria.CAFETERIA_DISCLAIMER,
    records: cafeteria.CAFETERIA_OUTLETS.map((o) => ({
      ...o,
      payment: [...o.payment],
      hours: o.hours.map((d) => d.map((s) => ({ ...s }))),
    })),
  }),
  write('places.json', {
    source: 'bracu-campus-360',
    note: 'Floor-level precision only. aliases are search helpers, not official names.',
    levels: {
      basement: places.BASEMENT_LEVEL,
      ground: places.GROUND_LEVEL,
      upperRoof: places.UPPER_ROOF_LEVEL,
    },
    records: places.CAMPUS_PLACES.map((p) => ({ ...p, aliases: [...p.aliases] })),
  }),
];
console.log(
  `wrote ${[...written, ...sectionFiles].length} files to data/campuses/bracu: ${courses.length} courses and ${prerequisites.length} prerequisite rules (${feedCourses.size} and ${feedRules.size} of them from CONNECT snapshots)`,
);
