# Campus reference data

The source of truth for what Shohoj knows about each university: grading rules,
programs, courses, prerequisites, a term's sections, calendars, bus routes.
Everything else — the SQLite database, and later the legacy bundle and the
Worker — is compiled from these files. Edit here, never downstream.

```
data/campuses/<campus>/
  sources.json          where every fact came from (required)
  profile.json          grading, retakes, standing, terms, days, buildings (required)
  programs.json         degree programs and total credits
  courses.json          course catalogue
  prerequisites.json    prerequisite rules
  sections/<term>.json  one term's sections (course, section, faculty, days, time, room, capacity)
  calendar/<term>.json  one term's academic calendar
  bus.json              bus routes, stops and times
```

Only `sources.json` and `profile.json` are required; a campus carries whatever
it has data for. Term files are named by term code (`252` is Summer 2025 — see
`profile.json` → `termCodes`).

## Provenance

Every file, and every block of `profile.json`, cites a `source` id from that
campus's `sources.json`. Each source has a `status`:

| status | meaning |
|---|---|
| `official` | the university's own site or PDF |
| `third-party` | a student tool or calculator site — unverified, don't present as official |
| `derived` | computed by us from an official source |

When sources disagree, keep the official value and record the other one under
`conflicts` (see CSE in `nsu/programs.json`). Don't guess a number nobody
publishes — leave it `null` and say why in a `note`.

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
-- Rooms free on Sunday 11:20–12:50 in Summer 2025
SELECT room FROM rooms WHERE campus='nsu' AND term='252'
  AND room NOT IN (SELECT room FROM meetings WHERE campus='nsu' AND term='252'
                   AND day='S' AND start < '12:50' AND "end" > '11:20' AND room IS NOT NULL);

-- What a faculty member taught, by initials (case matters at NSU: SHA1 ≠ Sha1)
SELECT course, section, days, start, room FROM sections
  WHERE campus='nsu' AND term='252' AND faculty = 'NNh';

-- Everything CSE373 needs, with titles
SELECT o.requirement, o.requires, c.title FROM prerequisite_options o
  LEFT JOIN courses c ON c.campus = o.campus AND c.code = o.requires
  WHERE o.campus='nsu' AND o.course='CSE373';

-- Which facts are not yet official
SELECT b.kind, b.label, b.min_cgpa, s.title FROM cgpa_bands b
  JOIN sources s ON s.campus = b.campus AND s.id = b.source WHERE s.status <> 'official';
```

## Research notes

How each NSU dataset was gathered, what is still unknown, and the questions
for the registrar: [`docs/campuses/nsu-research.md`](../../docs/campuses/nsu-research.md).
