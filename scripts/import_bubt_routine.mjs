// scripts/import_bubt_routine.mjs
//
// Turns BUBT class-routine pages, saved by hand from a browser, into campus
// term files.
//
//   node scripts/import_bubt_routine.mjs --source bubt-routine-271 \
//     --retrieved 2027-01-20 <saved-page.html | folder> [...]
//
// BUBT publishes routines at annex.bubt.edu.bd/global_file/routine.php, one
// page per programme, but only for the running term, and since October 2026
// behind a bot check. So Shohoj never fetches them: a person opens each
// programme's routine in their own browser and saves the page, and this reads
// the saved files (see data/campuses/README.md, "Importing a BUBT term").
//
// Writes data/campuses/bubt/sections/<term>-<system>.json for every term system
// the pages cover (Law runs bi-semester, the rest trimester), adds every
// programme course the routines' legends name that program-courses.json lacks
// (title from the legend, credits null), and registers the source.
//
// Each record is one course in one intake-section, taught by one teacher; a
// course with two teachers in one section stops the import rather than drop one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPUS_DATA_DIR } from './campus_data.mjs';

/** The programme label each routine page prints → Shohoj's program code. */
export const PROGRAMME_LABELS = {
  BBA: 'BBA',
  'B.Sc. in CSE': 'CSE',
  'B.Sc. Engg in CSE (DH)': 'CSE-DH',
  'B. Sc. in DSE': 'DSE',
  'B.Sc. in EEE': 'EEE',
  'B.Sc. in EEE (DH)': 'EEE-DH',
  'B.Sc. in Civil Engg.': 'CE',
  'B.Sc. in Civil Engg. (DH)': 'CE-DH',
  'B.Sc. in Textile Engg.': 'TEX',
  'B.Sc. in Textile Engg. (DH)': 'TEX-DH',
  'B.A (Hons) in English': 'ENG',
  'B.Sc (Hons) in Economics': 'ECO',
  'LL.B (Hons)': 'LLB',
  'LL.M (1 Year)': 'LLM',
  'M.Sc in Economics': 'MSC-ECO',
  'MA in ELT (1 Year)': 'MA-ELT',
};

/** The routine's day labels → profile.json's day codes. */
const DAY_CODES = { SUN: 'S', MON: 'M', TUE: 'T', WED: 'W', THR: 'R', FRI: 'F', SAT: 'A' };
const DAY_ORDER = 'SMTWRFA';
const SEASON_DIGIT = { Spring: '1', Summer: '2', Fall: '3' };

export const ROUTINE_ENDPOINT = 'https://annex.bubt.edu.bd/global_file/routine.php';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Text of a fragment: tags out, entities decoded, whitespace collapsed. */
function text(fragment) {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, name) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

/** `01:15 PM` → `13:15`. */
function to24h(clock) {
  const m = /^(\d{1,2}):(\d{2}) ?(AM|PM)$/.exec(clock.trim());
  if (!m) throw new Error(`not a 12-hour time: "${clock}"`);
  const h = (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * A printed course code → the shape the campus data uses (`CSE 101` →
 * `CSE101`), with a note when the subject had to be uppercased (LL.B prints
 * `Law 624`, `ICTs 3105`).
 */
export function normaliseCode(raw) {
  const m = /^([A-Za-z]+)\s*(\d{3,4})([A-Za-z]?)$/.exec(raw.trim());
  if (!m) throw new Error(`not a course code: "${raw}"`);
  const code = m[1].toUpperCase() + m[2] + m[3].toUpperCase();
  if (!/^[A-Z]{2,4}\d{3,4}[A-Z]{0,2}$/.test(code)) throw new Error(`not a course code: "${raw}"`);
  const note =
    m[1] === m[1].toUpperCase() ? null : `Printed "${raw.trim()}" in the routine; uppercased.`;
  return { code, note };
}

/** `52 - 1 (Major: Finance )` → `52-1 (Major: Finance)`. */
export function normaliseSection(label) {
  return label
    .trim()
    .replace(/^(\d+)\s*-\s*/, '$1-')
    .replace(/\(\s*Major:\s*(.*?)\s*\)/, '(Major: $1)')
    .replace(/\s+/g, ' ');
}

/** `Fall, 2026` → `{ term: '263', label: 'Fall 2026' }`. */
export function termOf(semester) {
  const m = /^(Spring|Summer|Fall),?\s*(\d{4})$/.exec(semester.trim());
  if (!m) throw new Error(`not a semester: "${semester}"`);
  return { term: `${m[2].slice(2)}${SEASON_DIGIT[m[1]]}`, label: `${m[1]} ${m[2]}` };
}

/**
 * Read one saved routine page: every intake-section on it, each with its
 * programme, term, grid meetings and legend.
 */
export function parseRoutinePage(html) {
  const blocks = html.split(/<table id="HdtableRtn"/).slice(1);
  return blocks.map((block) => {
    const field = (name) => {
      const m = new RegExp(`${name}:\\s*</strong>([\\s\\S]*?)<`).exec(block);
      if (!m) throw new Error(`a routine block without "${name}"`);
      return text(m[1]);
    };
    const programme = field('Program');
    const intake = field('Intake');
    const semester = field('Semester');

    const grid = /<table align="center" id="tableRtn"[\s\S]*?<\/table>/.exec(block);
    if (!grid) throw new Error(`${programme} ${intake}: no routine grid`);
    const rows = [...grid[0].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    const slots = [...rows[0].matchAll(/<th>([\s\S]*?)<\/th>/g)].slice(1).map((m) => {
      const [from, to] = text(m[1]).split(' to ');
      return { start: to24h(from), end: to24h(to) };
    });
    const meetings = [];
    for (const row of rows.slice(1)) {
      const dayLabel = text(/<th>([\s\S]*?)<\/th>/.exec(row)[1]);
      const day = DAY_CODES[dayLabel];
      if (!day) throw new Error(`${programme} ${intake}: unknown day "${dayLabel}"`);
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
      cells.forEach((cell, i) => {
        if (!cell) return;
        const m = /^(.*?)\s*FC:\s*(.*?)\s*R:\s*(.*)$/.exec(cell);
        if (!m) throw new Error(`${programme} ${intake} ${dayLabel}: unreadable cell "${cell}"`);
        if (!slots[i])
          throw new Error(`${programme} ${intake} ${dayLabel}: a cell past the last slot`);
        meetings.push({ course: m[1], faculty: m[2], room: m[3], day, ...slots[i] });
      });
    }

    const legend = [];
    const legendAt = block.indexOf('Course Code');
    if (legendAt !== -1) {
      for (const m of block.slice(legendAt).matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
        if (cells.length >= 4 && cells[0] && cells[0] !== 'Course Code') {
          legend.push({ course: cells[0], title: cells[1], faculty: cells[2], name: cells[3] });
        }
      }
    }
    return { programme, intake, semester, meetings, legend };
  });
}

const sectionOrder = (s) => {
  const m = /^(\d+)-(\d+)(.*)$/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), m[3]] : [0, 0, s];
};
function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Turn parsed routine blocks into section records, and the courses their
 * legends name.
 *
 * `termSystemOf(program)` says which calendar file a programme belongs in.
 */
export function buildRecords(blocks, termSystemOf) {
  const terms = new Set(blocks.map((b) => termOf(b.semester).term));
  if (terms.size !== 1)
    throw new Error(`the pages span more than one term: ${[...terms].join(', ')}`);
  const groups = new Map();
  const titles = new Map();
  for (const block of blocks) {
    const program = PROGRAMME_LABELS[block.programme];
    if (!program) {
      throw new Error(`unknown programme "${block.programme}": add it to PROGRAMME_LABELS`);
    }
    const section = normaliseSection(block.intake);
    for (const m of block.meetings) {
      const { code } = normaliseCode(m.course);
      const key = `${program}\u0000${section}\u0000${code}`;
      if (!groups.has(key))
        groups.set(key, { program, section, course: code, faculty: new Set(), meetings: [] });
      const g = groups.get(key);
      g.faculty.add(m.faculty);
      g.meetings.push({ day: m.day, start: m.start, end: m.end, room: m.room });
    }
    for (const l of block.legend) {
      const key = `${program}\u0000${normaliseCode(l.course).code}`;
      if (!titles.has(key)) titles.set(key, { program, raw: l.course, counts: new Map() });
      const t = titles.get(key);
      t.counts.set(l.title, (t.counts.get(l.title) ?? 0) + 1);
    }
  }

  const bySystem = {};
  const ordered = [...groups.values()].sort((a, b) =>
    compareKeys(
      [a.program, ...sectionOrder(a.section), a.course],
      [b.program, ...sectionOrder(b.section), b.course],
    ),
  );
  let merged = 0;
  for (const g of ordered) {
    if (g.faculty.size !== 1) {
      throw new Error(
        `${g.program} ${g.section} ${g.course} has ${g.faculty.size} teachers: ${[...g.faculty].join(', ')}`,
      );
    }
    const unique = [
      ...new Map(g.meetings.map((m) => [`${m.day}${m.start}${m.end}${m.room}`, m])).values(),
    ];
    unique.sort((a, b) =>
      compareKeys([DAY_ORDER.indexOf(a.day), a.start], [DAY_ORDER.indexOf(b.day), b.start]),
    );
    const meetings = [];
    for (const m of unique) {
      const last = meetings[meetings.length - 1];
      // A lab's two consecutive slots in one room are one meeting.
      if (last && last.day === m.day && last.end === m.start && last.room === m.room) {
        last.end = m.end;
        merged++;
      } else meetings.push({ ...m });
    }
    const record = {
      program: g.program,
      course: g.course,
      section: g.section,
      faculty: [...g.faculty][0],
      days: null,
      start: null,
      end: null,
      room: null,
      capacity: null,
      meetings,
    };
    const system = termSystemOf(g.program);
    if (!system) throw new Error(`${g.program} has no term system in programs.json`);
    (bySystem[system] ??= []).push(record);
  }

  // Each programme's most frequent title for a code (ties: the later title in
  // sort order), so a one-off slip in one section's legend never wins.
  const courses = [...titles.entries()]
    .map(([key, t]) => {
      const code = key.split('\u0000')[1];
      const title = [...t.counts.entries()].sort(
        (x, y) => y[1] - x[1] || (y[0] < x[0] ? -1 : y[0] > x[0] ? 1 : 0),
      )[0][0];
      return { program: t.program, code, title, note: normaliseCode(t.raw).note };
    })
    .sort((a, b) => compareKeys([a.program, a.code], [b.program, b.code]));

  // A record whose code had to be corrected says so.
  const notes = new Map(
    courses.filter((c) => c.note).map((c) => [`${c.program}\u0000${c.code}`, c.note]),
  );
  for (const records of Object.values(bySystem)) {
    for (const r of records) {
      const note = notes.get(`${r.program}\u0000${r.course}`);
      if (note) r.note = note;
    }
  }

  return {
    term: [...terms][0],
    label: termOf(blocks[0].semester).label,
    bySystem,
    courses,
    merged,
  };
}

/** Add the legend courses a program's list lacks; existing records are kept as they are. */
export function mergeProgramCourses(file, courses, source) {
  const known = new Set(file.records.map((r) => `${r.program}\u0000${r.code}`));
  const added = courses
    .filter((c) => !known.has(`${c.program}\u0000${c.code}`))
    .map((c) => ({
      program: c.program,
      code: c.code,
      title: c.title,
      credits: null,
      source,
      ...(c.note ? { note: c.note } : {}),
    }));
  const records = [...file.records, ...added].sort((a, b) =>
    compareKeys([a.program, a.code], [b.program, b.code]),
  );
  return { file: { ...file, records }, added };
}

// ── Writing, in the layout the committed files already use ─────────────────

/** One JSON value the way the committed files spell it: `{"a": 1, "b": [2, 3]}`. */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`)
    .join(', ')}}`;
}

/** A records file: top-level keys two spaces in, one record per line. */
export function formatRecordsFile(data) {
  const lines = Object.entries(data).map(([k, v]) =>
    k === 'records'
      ? `  "records": [\n${v.map((r) => `    ${inline(r)}`).join(',\n')}\n  ]`
      : `  ${JSON.stringify(k)}: ${inline(v)}`,
  );
  return `{\n${lines.join(',\n')}\n}\n`;
}

const FILE_NOTE = {
  trimester:
    'A section is a programme\'s intake-section as the routine prints it ("59-1", "52-1 (Major: Finance)"), with spacing normalised; each record is one course in one intake-section, taught by one teacher. Meetings in consecutive slots of the same room are merged (a lab\'s two 90-minute slots become one meeting). Rooms are as printed: four digits, the first being the building. BUBT publishes no section sizes or seats, so capacity is null throughout.',
  bisemester:
    'A section is a programme\'s intake-section as the routine prints it ("56-1"), with spacing normalised; each record is one course in one intake-section, taught by one teacher. Meetings in consecutive slots of the same room are merged. BUBT publishes no section sizes or seats, so capacity is null throughout.',
};

function readLayout(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  // Rewriting must not reflow the lines nobody touched.
  if (formatRecordsFile(data) !== raw) {
    throw new Error(`${file} is not in the layout this script writes; refusing to rewrite it`);
  }
  return data;
}

function listInputs(inputs) {
  return inputs.flatMap((input) =>
    fs.statSync(input).isDirectory()
      ? fs
          .readdirSync(input)
          .filter((f) => /\.html?$/i.test(f))
          .sort()
          .map((f) => path.join(input, f))
      : [input],
  );
}

function main(argv) {
  const args = { campus: 'bubt' };
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else inputs.push(a);
  }
  if (!args.source || !/^\d{4}-\d{2}-\d{2}$/.test(args.retrieved ?? '') || inputs.length === 0) {
    console.error(
      'usage: import_bubt_routine.mjs --source <id> --retrieved YYYY-MM-DD <saved-page.html | folder> [...]',
    );
    process.exit(2);
  }

  const files = listInputs(inputs);
  const blocks = files.flatMap((f) => parseRoutinePage(fs.readFileSync(f, 'utf8')));
  if (blocks.length === 0) {
    throw new Error('no routine found in the saved pages (a bot-check page saved by mistake?)');
  }

  const dir = path.join(CAMPUS_DATA_DIR, args.campus);
  const programs = JSON.parse(fs.readFileSync(path.join(dir, 'programs.json'), 'utf8'));
  const systemOf = new Map(programs.records.map((p) => [p.code, p.termSystem]));
  const built = buildRecords(blocks, (program) => systemOf.get(program));
  const programmes = [...new Set(blocks.map((b) => PROGRAMME_LABELS[b.programme]))].sort();

  const sourcesPath = path.join(dir, 'sources.json');
  const sources = readLayout(sourcesPath);
  const source = {
    id: args.source,
    status: 'official',
    title: `BUBT class routines, ${built.label}: ${programmes.length} programme pages (${programmes.join(', ')}) saved by hand from annex.bubt.edu.bd and imported with scripts/import_bubt_routine.mjs`,
    url: ROUTINE_ENDPOINT,
    retrieved: args.retrieved,
  };
  sources.records = [...sources.records.filter((s) => s.id !== args.source), source];

  const coursesPath = path.join(dir, 'program-courses.json');
  const merged = mergeProgramCourses(readLayout(coursesPath), built.courses, args.source);

  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  for (const [system, records] of Object.entries(built.bySystem)) {
    const inSystem = [...new Set(records.map((r) => r.program))].sort();
    const termFile = {
      term: built.term,
      termSystem: system,
      source: args.source,
      note: `${built.label} class routines of BUBT's ${inSystem.join(', ')} on the ${system} calendar, saved by hand from annex.bubt.edu.bd on ${args.retrieved}. ${FILE_NOTE[system]}${args.note ? ` ${args.note}` : ''}`,
      capacityPublished: false,
      records,
    };
    const name = `${built.term}-${system}.json`;
    fs.writeFileSync(path.join(dir, 'sections', name), formatRecordsFile(termFile));
    const meetings = records.reduce((n, r) => n + r.meetings.length, 0);
    console.log(`${records.length} sections, ${meetings} meetings → sections/${name}`);
  }
  fs.writeFileSync(coursesPath, formatRecordsFile(merged.file));
  fs.writeFileSync(sourcesPath, formatRecordsFile(sources));
  console.log(
    `${built.label}: ${files.length} file(s), ${programmes.length} programme(s); ${built.merged} lab slot(s) merged; ` +
      `${merged.added.length} course(s) added to program-courses.json. Run npm run check:campus-data next.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
