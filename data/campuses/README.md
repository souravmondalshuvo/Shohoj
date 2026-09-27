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
  prerequisites.json           prerequisite rules, per source and optionally per program
  requirements.json            degree requirement groups (all of / choose n of / free credits)
  plans.json                   suggested semester-by-semester sequence per program
  departments.json             departments and the course subjects each owns
  minors.json                  minor programs (core requirements + elective pool)
  faculty.json                 faculty directory
  reviews.json                 seed faculty reviews
  sections/<term>-<system>.json  one term's sections (course, section, faculty, days, time, room, capacity)
  calendar/<term>-<system>.json  one term's academic calendar
  bus.json                     bus routes, stops, times to and from campus, days off
  cafeteria.json               food outlets and opening hours
  places.json                  named places on campus, by floor
```

Three campuses today: `nsu/` and `diu/` (researched from each university's own
documents — see [`docs/campuses/nsu-research.md`](../../docs/campuses/nsu-research.md)
and [`docs/campuses/diu-research.md`](../../docs/campuses/diu-research.md)) and
`bracu/` (exported from the BRACU literals in Shohoj's own code — see
[`docs/campuses/bracu-data.md`](../../docs/campuses/bracu-data.md)).

### BRACU is exported, not hand-edited (yet)

Until the legacy code reads from this database, BRACU's facts live twice: in
the code and here. `tests/bracuCampusParity.test.js` rebuilds every BRACU
runtime structure from these files and fails if any differs from the code. When
it does, change the code as usual and re-export:

```bash
node scripts/export_bracu_campus_data.mjs \
  --feed 20263=<connect.json> --feed 20262=<semester-20262.json>
```

The `--feed` files are CONNECT snapshots (the live feed at
`https://usis-cdn.eniamza.com/connect.json` carries one semester; older ones
come from the semester archive).

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
