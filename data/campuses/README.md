# Campus reference data

The source of truth for what Shohoj knows about each university: grading rules,
programs, courses, prerequisites, a term's sections, calendars, bus routes.
Everything else — the SQLite database, and later the legacy bundle and the
Worker — is compiled from these files. Edit here, never downstream.

```
data/campuses/<campus>/
  sources.json                 where every fact came from (required)
  profile.json                 grading, retakes, standing, terms, days, buildings (required)
  programs.json                degree programs, total credits, program rules
  courses.json                 course catalogue
  program-courses.json         each program's own course list, where codes repeat across programs (instead of courses.json)
  prerequisites.json           prerequisite rules, per source and optionally per program
  requirements.json            degree requirement groups (all of / choose n of / free credits)
  plans.json                   suggested semester-by-semester sequence per program
  departments.json             departments and the course subjects each owns
  minors.json                  minor programs (core requirements + elective pool)
  faculty.json                 faculty directory
  reviews.json                 seed faculty reviews
  sections/<term>-<system>.json  one term's sections (course, section, faculty, days, time, room, capacity or seats left)
  calendar/<term>-<system>.json  one term's academic calendar
  bus.json                     bus routes, stops, times to and from campus, days off
  cafeteria.json               food outlets and opening hours
  places.json                  named places on campus, by floor
```

Four campuses today: `nsu/`, `diu/` and `bubt/` (researched from each university's
own documents — see [`docs/campuses/nsu-research.md`](../../docs/campuses/nsu-research.md),
[`docs/campuses/diu-research.md`](../../docs/campuses/diu-research.md) and
[`docs/campuses/bubt-research.md`](../../docs/campuses/bubt-research.md)) and
`bracu/` (first exported from the BRACU literals in Shohoj's own code — see
[`docs/campuses/bracu-data.md`](../../docs/campuses/bracu-data.md)).

### BRACU: part edited here, part still exported

BRACU is moving from "written in the code, exported here" to "written here,
generated into the code", one group of files at a time.

**Edit these here** — the code is generated from them (#869):

| File | Generated into |
|---|---|
| `courses.json`, `prerequisites.json`, `departments.json` | `js/core/catalogBracu.generated.js` |
| `programs.json`, `plans.json` | `js/core/departmentsBracu.generated.js` |

```bash
npm run generate:legacy-catalog   # after editing any of them
npm run generate:worker-catalog   # the Worker's copy of the course codes
```

`npm run check:legacy-catalog` (run by the unit suite) fails when a generated
file is stale, so a data edit cannot ship without its code. Only records whose
source is `bracu-catalog` reach the calculator's catalogue; courses a CONNECT
snapshot alone names stay in the database.

**Do not edit the rest here yet** — grading, standing tiers, the minor, the
profile, bus, cafeteria and places still live twice: in the code and here.
`tests/bracuCampusParity.test.js` rebuilds each of those runtime structures
from these files and fails if any differs from the code. When it does, change
the code as usual and re-export:

```bash
node scripts/export_bracu_campus_data.mjs \
  --feed 20263=<connect.json> --feed 20262=<semester-20262.json>
```

The `--feed` files are CONNECT snapshots (the live feed at
`https://usis-cdn.eniamza.com/connect.json` carries one semester; older ones
come from the semester archive). The export leaves the hand-edited files above
alone, apart from replacing the records a snapshot supplied.

Only `sources.json` and `profile.json` are required; a campus carries whatever
it has data for. Term files are named by term code and calendar system:
`252-trimester.json` is Summer 2025 on the central calendar, and
`252-bisemester.json` the same term for NSU's bi-semester programs (BPharm,
LLB), which run their own calendar alongside it. See `profile.json` →
`termCodes` and `termSystems`.

A course can carry prerequisite rules from several documents (the ECE course
pages and the BBA handbook both state ENG103's), and a curriculum can scope a
rule to its own program, so rules are never merged: each keeps its `source` and
optional `program`. A program with `extends` inherits the requirement groups of
the program it names — every BBA major extends BBA's shared core.

When a source has an obvious printing error, correct it on the record and say
so in its `note` (see ARC273 section 2 in `sections/253-trimester.json`);
never correct silently.

### Courses and sections that belong to a program

Where a campus's course codes repeat across programs with different meanings
(DIU's CSE212; BUBT's GED1105 is *History of the Emergence of Bangladesh* in
English and *Government and Politics* in LL.B), its courses go in
`program-courses.json`, one record per program and code, not in `courses.json`.
A program's own list may hold four-digit subject codes (`ENG1101`) and ISCED
field codes (`0413-111`), and credits in quarters (BUBT's 0.75-credit labs).
`credits` is `null` when no source publishes it (BUBT's routines give titles,
not credits), and `0` only with a `note` saying why.

A section may carry a `program` (BUBT: every program has its own intake-section
`59-1`). Its course is then looked up in that program's list, the program must
run on the file's term system, and the section key is program + course +
section. A file whose source publishes neither section sizes nor seats sets
`"capacityPublished": false` and says so in its `note`; otherwise each section
needs a `capacity` or a `seatsAvailable`. In the database, `sections` and
`meetings` carry `program` (`''` for a campus-wide section), and the `rooms`
view counts a section per program.

## Provenance

Every file, and every block of `profile.json`, cites a `source` id from that
campus's `sources.json`. Each source has a `status`:

| status | meaning |
|---|---|
| `official` | the university's own site or PDF |
| `third-party` | a student tool or calculator site — unverified, don't present as official |
| `derived` | computed by us from an official source |
| `inherited` | carried over from Shohoj's own hand-kept code; the original source was never recorded |
| `placeholder` | a template the code itself marks as unconfirmed (BRACU's cafeteria hours) — never show as fact |

When sources disagree, keep the official value and record the other one under
`conflicts` (see CSE in `nsu/programs.json`). Don't guess a number nobody
publishes — leave it `null` and say why in a `note`. The same goes for lists a
university doesn't publish (DIU has no class divisions) and for a student email
domain nobody has confirmed: empty, with a note. The validator rejects an empty
or null value that has no note.

## Importing a term from RDS

NSU's live offered-course page is behind a Cloudflare challenge, so Shohoj
never reads it; `scripts/import_rds4_sections.mjs` converts a copy someone else
made (a JSON array of the table's rows, or the page's HTML) into a term file,
and adds a catalogue stub (`title` and `credits` null) for each code the
catalogue lacks. RDS shows seats left, not the section size, so a term imported
this way has `capacity: null` and a `seatsAvailable` snapshot — never live.
A TBA time becomes an unscheduled section (days, start, end and room null).
`sections/263-trimester.json` came from RDS4+'s copy (source `rds4plus-263`).

## Importing a BUBT term

BUBT serves routines only for the running term, so each term must be saved
while it runs or it is gone. Since October 2026 the routine pages sit behind a
bot check, so Shohoj never fetches them; a person saves them from their own
browser, once a term (more often if BUBT revises the routines):

1. Open each programme's routine. The *View* links on
   https://bubt.edu.bd/routines cover 13 programmes; three more (LL.M,
   Textile DH, Civil DH) are linked from nowhere, so open them by URL with the
   same `semNo` the other links use:
   `https://annex.bubt.edu.bd/global_file/routine.php?p=014&semNo=<…>`, then
   `p=024` and `p=028`.
2. Save each page (*Save Page As…*, HTML only) into one folder. Check one opens
   as a timetable: a saved "One moment, please…" page holds nothing, and the
   import refuses a folder with no routine in it.
3. Import, naming the source and the day the pages were saved:

```bash
node scripts/import_bubt_routine.mjs --source bubt-routine-271 --retrieved 2027-01-20 <folder>
npm run check:campus-data
```

This writes `sections/<term>-trimester.json` and `<term>-bisemester.json` (Law),
adds any course the routines' legends name that `program-courses.json` lacks
(legend title, credits `null`; existing records are left as they are), and
registers the source. Nothing is written if any check fails: a saved file with
no routine in it (name the file, save it again), a programme the newest term
already held has but the pages lack (save it too, or pass
`--allow-missing CODE,…` if it really has no routine this term), a programme
label it does not know (add it to `PROGRAMME_LABELS` in the script), pages from
two terms, or a course with two teachers in one section. Re-importing a term replaces its files, and
records come out identical when the routines have not changed.

## Validating

```bash
npm run check:campus-data
```

The unit suite runs the same checks (`tests/campusData.test.js`), so CI rejects
a malformed course code, an unknown day code, a section for a course the
catalogue lacks, a citation to an unregistered source, and so on. Warnings (a
prerequisite naming a course not in the catalogue yet) don't fail anything.

## Querying

```bash
npm run db:build     # → dist-data/campus.db and dist-data/campus.sql (gitignored)
npm run db:query -- --tables
npm run db:query -- "SELECT code, title, credits FROM courses WHERE campus='nsu' AND subject='CSE' AND level=300"
npm run db:query -- --csv "SELECT * FROM sections WHERE campus='nsu' AND term='252'" > sections.csv
```

`db:query` rebuilds the database first if any file here is newer than it.
`campus.sql` is the same database as one SQL script, loadable into Cloudflare
D1 with `wrangler d1 execute <db> --file dist-data/campus.sql`.

Some questions it answers:

```sql
-- Rooms free on Sunday 11:20–12:50 in Fall 2025
SELECT room FROM rooms WHERE campus='nsu' AND term='253' AND term_system='trimester'
  AND room NOT IN (SELECT room FROM meetings WHERE campus='nsu' AND term='253'
                   AND term_system='trimester' AND day='S'
                   AND start < '12:50' AND "end" > '11:20' AND room IS NOT NULL);

-- What a faculty member taught, by initials (case matters at NSU: SHA1 ≠ Sha1)
SELECT term, course, section, days, start, room FROM sections
  WHERE campus='nsu' AND faculty = 'NNh' ORDER BY term, course;

-- Everything CSE373 needs, per source, with titles
SELECT p.source, o.requirement, o.requires, c.title FROM prerequisites p
  JOIN prerequisite_options o ON o.campus = p.campus AND o.rule = p.id
  LEFT JOIN courses c ON c.campus = o.campus AND c.code = o.requires
  WHERE p.campus='nsu' AND p.course='CSE373';

-- A CSE student's second year, as the curriculum suggests it
SELECT term, code, title, credits FROM plans
  WHERE campus='nsu' AND program='CSE' AND year=2 ORDER BY position;

-- Everything a BBA Finance major must satisfy (its own groups plus BBA's)
SELECT g.program, g.name, g.rule, g.choose, g.credits,
       group_concat(o.code, ' | ') AS options
  FROM requirement_groups g LEFT JOIN requirement_options o ON o.campus = g.campus AND o.grp = g.id
  WHERE g.campus='nsu' AND g.program IN ('BBA', 'BBA-FIN') GROUP BY g.id;

-- Which facts are not yet official
SELECT b.kind, b.label, b.min_cgpa, s.title FROM cgpa_bands b
  JOIN sources s ON s.campus = b.campus AND s.id = b.source WHERE s.status <> 'official';
```

## Research notes

How each dataset was gathered, what is still unknown, and the questions for
each registrar: [`docs/campuses/nsu-research.md`](../../docs/campuses/nsu-research.md)
and [`docs/campuses/diu-research.md`](../../docs/campuses/diu-research.md).
