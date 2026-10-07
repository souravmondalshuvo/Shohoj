# BRACU in the campus database

Every BRACU fact Shohoj keeps in code now also lives in
[`data/campuses/bracu/`](../../data/campuses/bracu/), exported by
`scripts/export_bracu_campus_data.mjs` (#792). `tests/bracuCampusParity.test.js`
rebuilds each runtime structure from the database and requires it to equal the
code, so "all of it" is checked, not assumed.

The switch to reading from the database is happening one group of files at a
time. Done so far (#869): the catalogue, prerequisites, department ownership,
programs and presets. `js/core/catalog.js` and `js/core/departments.js` no
longer hold that data; they expand modules generated from the first five rows
of the table below by `npm run generate:legacy-catalog`. Those rows describe
what the files mirrored when they were exported, which is now history: edit
the JSON, not the code.

Everything else is unchanged: the legacy site and the shell still read their
own literals, and the parity test is what will prove each later switch changes
nothing.

## What is in it, and where it came from

| Database file | Code it mirrors | Parity check | Source status |
|---|---|---|---|
| `courses.json` (857 + 41 feed-only) | `js/core/catalog.js` `COURSE_DB` / `ALL_COURSES`, in `_CATALOG`'s written order with its section headings | exact | inherited |
| `prerequisites.json` (286 hand-kept) | `catalog.js` `PREREQS` (required → `allOf`, recommended → `recommended`) | exact | inherited |
| `prerequisites.json` (656 from CONNECT) | the feed's own `prerequisiteCourses`, per course and term; `(A AND B) OR …` kept as `anyOf` | — (no code copy) | third-party mirror |
| `departments.json` | `catalog.js` `PREFIX_DEPT_MAP`, `DEPT_META`, and `getCourseDept`'s CST333 exception | exact | inherited |
| `programs.json` + `plans.json` | `js/core/departments.js` `DEPARTMENTS` (label, credits, seasons, every preset course); also `src/core/transcript.ts` `DEPARTMENT_LABELS` | exact | inherited |
| `profile.json` → grading | `js/core/grades.js` `GRADES`, `POINTS_TO_GRADE`; `js/core/courseMarks.js` `MARK_SCALE`; the registry's scale | exact | inherited — cutoffs unsourced |
| `profile.json` → standingTiers | `js/core/milestones.js` `MILESTONE_TIERS` | exact | inherited |
| `profile.json` → meterBands | the CGPA meter bands in `js/main.js` (Shohoj's messaging, not policy) | every band and label present | inherited |
| `profile.json` → identity, retake, creditLoad, features | `src/core/university.ts` BRACU profile | exact | inherited |
| `profile.json` → termSystems, termCodes, days | `semesterIdentity.js` `SEMESTER_TERM_NAMES`, `routineGrid.js` week order | exact | inherited |
| `profile.json` → location, roomCodes | `campusRooms.ts` coordinates, radius and room-code regex; `freeRooms.js` hours; `semesterBriefing.js` UTC offset | exact / regex present | inherited |
| `profile.json` → transcript | the grade-sheet header words `js/import/transcript-core.js` skips | present in the parser | inherited |
| `minors.json` | `js/core/minors.js` `MINOR_PROGRAMS` | exact | inherited |
| `faculty.json`, `reviews.json` | `data/faculty_profiles.jsonl`, `data/input_reviews.jsonl` | exact | inherited / third-party |
| `bus.json` | `src/core/busRoutes.ts` (brochure effective 9 June 2026) | exact | inherited |
| `cafeteria.json` | `src/core/cafeteriaOutlets.ts` | exact | **placeholder** — every outlet unverified |
| `places.json` | `src/core/campusPlaces.ts` (Campus 360) | exact | official |
| `sections/20262-trimester.json` | the archived Summer 2026 snapshot (`semester-20262.json`, from the gitignored `bracu-section.json` scrape) | — | third-party mirror; seats frozen |
| `sections/20263-trimester.json` | the live CONNECT feed, Fall 2026, fetched 2026-09-28 | — | third-party mirror; seats as of fetch |

BRACU sections carry more than NSU's: the section name exactly as CONNECT
prints it (`04`, `07A`, `04-CLOSED`), seats taken, the lab component with its
own faculty, room and meetings, mid and final exam slots, and class dates.
Sections whose days don't share a time slot store per-day `meetings`.

## Deliberately not in the database

| What | Why |
|---|---|
| The 3D campus model (`src/features/campus/assets/*.glb.gz`) and its scene constants | A binary rendering asset and camera/lighting settings, not facts |
| Semester-briefing heuristics (`MIN_GAP_MINUTES`, `TIGHT_HOP_MINUTES`, …) and Lost & Found text limits | Shohoj's own UX thresholds, not BRACU data |
| The meter's full sentences ("Dean's List territory. Keep it up.") | UI copy; the bands and their labels are stored |
| Firestore content (live reviews, study groups, papers, lost & found posts) and R2 files | Live user data with its own store; only the seed reviews ship in the repo |
| `worker/catalog.generated.js`, `worker/campus.generated.js` | Generated from the code this database mirrors |

## What the export turned up

- **EEE282's credits disagree with themselves.** The EEE preset gives it 3 credits
  (term 5); the catalogue says 1. The export keeps both as they are; the
  validator reports it.
- **Courses the code uses but never catalogues:** `CSE490` (the Math minor's
  electives and a faculty profile) and `CSE422L` (two faculty profiles, three
  seed reviews).
- **52 lab codes** (`CSE101L`, `CSE110L`, …) exist only as lab components in the
  feed, with no credits of their own; they are not added as courses.
- **The feed's prerequisites name 39 codes** (`ECE201`, `EEE201`, `CSE161`, …) that
  neither the catalogue nor either term's sections include.
- **The mark cutoffs are unsourced** — `src/core/university.ts` says so itself.
  NSU's are sourced from its registrar; BRACU's should be confirmed the same way.
- **The cafeteria guide is entirely placeholder data**, as its own code states.
