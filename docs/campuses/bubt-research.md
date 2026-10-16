# BUBT — what Shohoj needs, and what we know

Research for adding **Bangladesh University of Business and Technology** (Rupnagar,
Mirpur-2, Dhaka-1216) as a campus. Gathered 2026-10-16. The data itself lives in
[`data/campuses/bubt/`](../../data/campuses/bubt/) (see [Data files](#data-files));
this file is how it was found, what was left out, and what is still unknown, laid out
like [`diu-research.md`](diu-research.md) so the two can be compared section by section.

Every claim is tagged with where it came from:

- **[official]** — bubt.edu.bd (new site), classic.bubt.edu.bd (the old site, still
  served), a file BUBT posted on either, or the public routine endpoint on
  `annex.bubt.edu.bd`
- **[3rd-party]** — a student tool or outside site; treat as unverified
- **[derived]** — computed by us from an official source
- **[unknown]** — looked for, not found; ask BUBT

Primary sources:
- *Evaluation & Grading System* — https://bubt.edu.bd/page/evaluation-grading-system
- *Rules and Regulations* — https://classic.bubt.edu.bd/Home/page_details/Rules_and_Regulations
  (the new site's copy at `/Home/page_details/…` is a 404; the classic one is live)
- Academic calendars — https://bubt.edu.bd/page/academic-calendar (Fall 2026 trimester
  and Fall 2026 Law bi-semester, embedded as JPEG scans in the page), plus the Spring
  2026 and Summer 2026 PDFs and the Fall 2025 (Revised) PDF
- Programmes and departments — the `window.undergraduateProgramsList`,
  `window.departments` and `window.academicHierarchy` JSON every bubt.edu.bd page embeds
- Class routines — https://bubt.edu.bd/routines, which links 13 programmes to
  `https://annex.bubt.edu.bd/global_file/routine.php?p=<programme>&semNo=068,502,614,902`
  (public HTML, no login) and the rest to PDFs
- Notices — 1,514 notices (2015-06-27 → 2026-10-15) embedded in https://bubt.edu.bd/notice
- *Course Offer – Fall 2026 – CSE [Day]* — https://bubt.edu.bd/storage/notices/iM4YVPW8Eq4Qz8uZ58wCQW20c6dvOfDpGIlHUy6z.pdf
- Credit-limit and student-email notices (2021) —
  `https://classic.bubt.edu.bd/assets/frontend/media/1618300925Notice_on_Credit_Limitations.png`,
  `…/1632242831Noitce_for_BUBT_Email_for_Students.jpg`

Not reached, and left alone: the student portal itself (annex login, BUBT-NX). No bot
protection was met; none was worked around. The annex routine pages are linked from
the public routines page and need no account.

**Headline:** BUBT is the easiest non-BRACU campus to give a **routine and free rooms**:
one public endpoint gives every programme's timetable as clean HTML, with faculty
initials resolved to names. It is the hardest on **terms**: BUBT has changed between a
trimester and a bi-semester calendar twice since 2023 (§6). Like DIU, **sign-in is
blocked on the student email domain** (§9).

---

## 1. Grading (`src/core/university.ts`, `js/core/grades.js`)

BUBT uses the **UGC uniform grading system**. Its table is identical to DIU's, letter
for letter and cutoff for cutoff [official, grading page]:

| Letter | Points | Marks |
|---|---|---|
| A+ | 4.00 | 80+ |
| A | 3.75 | 75–79 |
| A- | 3.50 | 70–74 |
| B+ | 3.25 | 65–69 |
| B | 3.00 | 60–64 |
| B- | 2.75 | 55–59 |
| C+ | 2.50 | 50–54 |
| C | 2.25 | 45–49 |
| D | 2.00 | 40–44 |
| F | 0.00 | <40 |

- **No C-, D+ or D-** [official]. `DIU_SCALE` can be shared as-is, ideally renamed to
  something like `UGC_SCALE`.
- **R** — marks every superseded attempt; "has no effect on GPA or CGPA" [official].
  The transcript importer must skip R rows, not score them as 0 (§10).
- **I** — exists: every calendar has a deadline for "Grade Submission of Incomplete
  Grades" of the previous term [official, calendars]. How long it stays open, and what
  it lapses to: [unknown].
- **W** — a course may be withdrawn within 15 days of the term starting [official];
  whether that leaves a W on the transcript: [unknown]. Students who neither attend nor
  withdraw get **F in every course** of the term [official].
- **P** — not mentioned [unknown].
- The transcript shows letter, points and CGPA, **never marks** [official].
- **Credit hours:** a theory course's credits equal its weekly contact hours; a lab's
  are **half** its contact hours [official]. Real offers carry **0.75 and 1.50** credit
  labs and a **0.00**-credit course (`CSE 490`) [official, CSE course offer]. The
  calculator must accept quarter credits and zero-credit rows.

### Assessment breakdown (marks tracker)

[official, grading page]

| Component | Most programmes | LL.B / LL.M |
|---|---|---|
| Attendance | 5 | 10 |
| Quizzes | 5 | — |
| Class tests & tutorials | 10 | 10 |
| Assignment / presentation / lab / project | 10 | 10 |
| Mid-term | 30 | 30 |
| Final | 40 | 40 |

Attendance marks are banded [official, Rules page]: 70–75% → 1, 76–80 → 2, 81–85 → 3,
86–90 → 4, 91–100 → 5 (LL.B/LL.M double each). **Below 70% is not allowed** to sit.

## 2. Retake, repeat, improvement

Two paragraphs on BUBT's own pages, and they read differently:

- *Policy for Semester Promotion* (grading page **and** Rules page): "The improved grade
  will be computed in the final transcript and the previous grade/s … will be marked
  with 'R' grade … which has no effect on GPA or CGPA" [official].
- *Repeating Courses* (Rules page only): "Both the original and the repeat grades are
  recorded in the transcript, but CGPA is calculated on the basis of the **better of
  the two grades**. A course can be repeated **once only**" [official].

They agree whenever the retake scores higher, because the first paragraph only speaks
of an *improved* grade. Only the second says what happens when a retake scores
**worse**: the better grade counts. That makes `retake: { kind: 'best' }` the reading
consistent with both [derived]. It is not `latest` (DIU's rule), even though the R
mechanism looks like it. Confirm with the registrar (question 2 in §16).

- **Who may improve:** "grade lower than A" [official]. A+ and A are locked; A- and
  below may retake. That is `repeat: { threshold: 3.75, inclusive: false }`. Every other
  campus in the registry uses 3.0, so a copied default would wrongly tell a B+ or A-
  student they can't improve.
- **F must be retaken** within the **next three consecutive semesters**, prerequisites
  first, and passed with at least a D [official].
- **Fees:** retaking an F costs full tuition; improving a passed course costs half
  [official].
- **Application window:** within 2 weeks of the result being published [official].
- **"Once only"** — whether that caps F-retakes or only improvements, and whether a
  failed retake can be taken again: [unknown]. Leave `maxRetakes` unset.
- **Improvement after finishing every course** needs notice to the department chair
  within a week of the final term's results, or the new grade is ignored [official,
  notice 2019-06-29].

## 3. Standing, probation, honours (`js/core/milestones.js`)

- **Degree CGPA:** 2.00 for undergraduates, **2.50 for graduate programmes**, on BUBT
  credits only [official, Rules page → Degree Requirements].
- **Internship / research:** at least **C** where the degree requires one [official].
- **Probation:** not published anywhere on either site [unknown]. The Rules page only
  reserves the right to dismiss a student "whenever … necessary".
- **Time limit:** 4-year bachelor's in 7 years; 3-year programmes in 6; 2-year in 4;
  1-year in 2 [official, "Disqualification"].
- **Dean's Award:** given every term (2 Feb 2026, 16 Jun 2026, 13 Oct 2026)
  [official, calendars]; the criteria are [unknown].
- **Class divisions / Latin honours:** none published [unknown]. Like DIU, the
  playground's BRACU milestone tiers must not be shown to a BUBT student as BUBT's.

## 4. Credit load

- **Normal load: 12 credits** (4 courses), "more or a smaller number … with necessary
  permission" [official, Rules page].
- **Trimester cap:** a student "can register maximum 16 credits"; **16–18** needs the
  department chairman; **above 18** needs the VC or Pro-VC [official, notice
  BUBT-Reg-566-04-21, 13 Apr 2021].
  ⚠ That notice dates from the *earlier* trimester era (§6). Whether it binds again
  under the 2026 trimester: [unknown].
- Real Fall 2026 CSE bundles are **10.50–14.25 credits** per intake [official, course
  offer], consistent with the 16 cap.
- `CreditLoadRules` treats `max` as a hard stop, but BUBT's 18 has a VC exception.
  Proposed once confirmed: `{ min: 12, max: 18, warnAbove: 16 }`. Until then leave
  `creditLoad` unset, as for NSU and DIU.

## 5. Other academic rules that affect planning

- **Course sequence:** all prerequisites (foundation, support, core) before major
  courses; **English requirements by the 4th semester** [official].
- **Lock-step intakes:** students are admitted in numbered **intakes**, split into
  sections, and each intake takes a fixed bundle per term ("Intake 57 (1-6) Sections —
  1st Year 3rd Semester") [official, CSE course offer]. A student usually *is* an
  intake-section, not a free set of sections. This is closer to DIU's batches than to
  BRACU's open registration.
- **Majors** are declared late and shown in the routine's intake label: `52 - 1 (Major:
  Finance )`, `(Major: Power )`, `(Major: Garments )` [official, routines]. CSE's
  Intake 52 runs as "Major in Data Science & Minor in Communications and Networking".
- **Credit transfer:** prior CGPA ≥ 2.50, only grades **B and above** transfer, and at
  least **60%** of credits plus the internship must be earned at BUBT [official].
- **Course withdrawal:** within 15 days of the term starting [official]. The 2026
  calendars put add/drop at 9 days (Fall 2026: 5 → 14 Sep) [official].
- **Supplementary exams:** both mid-term and final have a paid supplementary sitting
  (Tk 1,000 / Tk 2,000 per course) [official, calendars]. A missed exam is not
  automatically an F.

## 6. Calendar and terms (`departments.js` `seasons`, `semesterIdentity.js`)

### Now (2026)

**Most programmes: trimester** [official, calendars, all signed by the Registrar on
7 Dec 2025]:

| Term | Classes begin | Mid-term | Last class | Finals | Results |
|---|---|---|---|---|---|
| Spring 2026 | 1 Jan | 13–20 Feb | 21 Apr | 23–30 Apr | 4 May |
| Summer 2026 | 6 May | 25 Jun–3 Jul | 20 Aug | 22–30 Aug | 3 Sep |
| Fall 2026 | 5 Sep | 24–31 Oct | 15 Dec | 17–24 Dec | 28 Dec |
| Spring 2027 | 2 Jan 2027 | | | | |

14 weeks, a 3-credit theory course = 14 × 2 × 90 min.

**Law (LL.B, LL.M): bi-semester** [official, *Academic Calendar Fall 2026 (Bi-Semester)*]:
Fall runs **5 Jul → 29 Dec 2026** (mid-term 6–20 Sep, finals 1–15 Dec), Spring 2027
from 3 Jan. ⚠ So **"Fall 2026" means Sep–Dec for a CSE student and Jul–Dec for a law
student.** This is the same trap as NSU's BPharm/LLB, in reverse.

### History — why old transcripts won't parse with one rule

From notice titles [official, notice archive]:

| Period | System | How terms are named |
|---|---|---|
| ≤ 2022 | Mostly **trimester** (bi-semester for some programmes) | `Spring 2022`, `Summer 2022`, **`Fall 2022-23`**, `Fall' 2020-2021`; Fall spanned two calendar years |
| Spring 2023 → Fall 2025 | **Bi-semester**, a migration announced in "Trimester to Bi-semester" notices (Mar–Jul 2023) | `Spring` Jan–Jun, `Fall` Jul–Dec. Fall 2025: classes 15 Jul, 17 weeks, 75-min classes |
| Spring 2026 → | **Trimester** again (Law stays bi-semester) | `Spring` Jan–Apr, `Summer` May–Aug, `Fall` Sep–Dec |

The classic site's *Semester Policy* page still says "two semesters in a year …
Spring January–June, Fall July–December" [official, stale]. Do not build from it.

Consequences for `semesterIdentity.js`:
- a term label alone doesn't fix the months, which depend on year and programme;
- `Fall 2022-23` must parse, and it is the Fall that **started in 2022**;
- a student who joined in 2024 has bi-semester terms followed by trimester terms on
  one transcript, so a planner's "terms per year" changes mid-degree.

**Typos to correct, with a note, never silently:** the Fall 2026 and Summer 2026
calendars both open with "commencement of classes of **Spring** – 2026", and the Law
calendar has "Pre-Registration for Spring **2026**" (means 2027) and "22 **Non**".

**Term codes:** the routine endpoint takes `semNo=068,502,614,902`, four opaque internal
ids (likely one per calendar stream or shift). Their meaning: [unknown]. Don't key
Shohoj's terms on them.

## 7. Programmes and total credits (`departments.js`)

From the JSON every bubt.edu.bd page embeds [official]:

| Code | Programme | Credits | Duration |
|---|---|---|---|
| ACT | BBA in Accounting | 132 | 4 yrs |
| MKT | BBA in Marketing | 132 | 4 yrs |
| FIN | BBA in Finance | 132 | 4 yrs |
| MAN | BBA in Management | 132 | 4 yrs |
| CSE | B.Sc. in CSE | 154 | 4 yrs |
| DSE | B.Sc. in Data Science and Engineering | 138 | 4 yrs |
| EEE | B.Sc. in EEE | 142 | 4 yrs |
| CE | B.Sc. in Civil Engineering | 150 | 4 yrs |
| TEX | B.Sc. in Textile Engineering | 147 | 4 yrs |
| ENG | BA (Hons) in English | 130 | 4 yrs |
| Economics | B.Sc. in Economics | 130 | 4 yrs |
| LLB | LL.B (Hons) | 147 | 4 yrs |

Graduate: MBA 66, LL.M 41, M.Sc. CSE 40, M.Sc. Economics 40, MA in ELT 40 [official].

- **DH (diploma-holder) tracks** exist for CSE, EEE, Civil and Textile and are labelled
  "(Evening)" on the routines page [official]. Their credit totals aren't published
  separately [unknown].
- **5 faculties, 15 departments/offices** (CSE and Data Science sit in the Faculty of
  Computer Science & AI) [official]. That gives the `school` per programme which DIU
  couldn't publish.
- ⚠ The programme JSON's `curriculum` and `semester_breakdown` are **CMS template
  filler**: BBA in Accounting's "Foundation Courses" are "Introduction to Programming,
  Mathematics I". Use only `credits`, `duration`, `code`, `name` and `original_name`.
- The "BBA" routine (programme `001`) covers all four BBA majors; majors appear in the
  intake label (§5).

## 8. Course codes, catalogue and prerequisites (`catalog.js`, `prereq.js`)

- **No public curriculum or prerequisite list** for any programme [unknown]. The
  programme pages carry only the template (§7).
- **Codes are `SUBJ NNN` or `SUBJ NNNN` with a space** [official, routines]: 1,298
  meetings use 3 digits and 1,070 use 4. They follow the curriculum generation:
  - **3-digit:** CSE, CSE (DH), EEE, EEE (DH), Textile, DSE (e.g. `CSE 101`).
  - **4-digit:** BBA, English, LL.B, Economics, Civil, MA ELT, M.Sc Econ (e.g.
    `ENG 1101`, `GED 1105`).
  - Oddities to normalise, not guess: `Law 101` and `ICTs 3102` (mixed case),
    `CSE 498B` (letter suffix).
- ⚠ **The same code means different courses in different programmes** [derived,
  routine legends]. `CSE 209` is *Operating Systems* (CSE) and *Data Communication*
  (DH); `EEE 301` is *Modern Control System* and *Fundamentals of Electrical
  Engineering*; `ENG 103`/`ENG 104` are *Speaking & Listening* / *Communication Lab* in
  one programme and *Introduction to Poetry* / *Prose* in English. **The catalogue must
  be keyed by (programme, code)**, which the current `courses.json` shape does not do.
- **Course titles are inconsistent** even within one code (`Data Structure` vs
  `Data Structures`, `Furrier`, `Liner Algbras`) — 33 codes carry 2–4 titles. Pick per
  programme and keep variants as aliases.
- **Best catalogue source today:** per-department **course offers** (CSE Day + Evening
  for Fall 2026 found; BBA, MBA, EMBA offers appear in older notices) — each gives
  code, title and **credits** per intake [official]. CSE Day Fall 2026 alone gives ~75
  courses with credits.
  Printing errors to correct with a note: `CSE 483` printed for both *Introduction to
  Blockchain* and its lab; Intake 51 AI's *Machine Learning* code (`CSE 465`) is
  missing from the text layer but present in the rendered table.

## 9. Sign-in and identity (`js/auth/firebase.js`, `emailDomains`)

- BUBT gives every student a **Google Workspace (G Suite) account "from its domain"**,
  since at least May 2021; the address and a one-time password appear in the student's
  annex profile [official, notices BUBT-Reg-619-05-21 and BUBT-Reg-1029-09-21].
- **The student domain is not named publicly** [unknown]. Staff use `@bubt.edu.bd`,
  and some departments use a subdomain for faculty (`@management.bubt.edu.bd`)
  [official, staff listings]. So `bubt.edu.bd` probably is not student-only: the same
  staff-sharing question DIU has (§9 there).
- The account is **deleted after two consecutive semesters without registration**
  [official, G Suite guideline]. A graduate or dropped student loses the address that
  signed them into Shohoj.
- **Student IDs are numeric**: the annex login rejects non-numeric usernames for
  students, and non-numeric ones are employees [official, annex login page script].
  The ID's structure: [unknown].

This is the one blocker, as it was for DIU. Settle it with BUBT IT or a real student
before adding `emailDomains`.

## 10. Transcript import (`js/import/transcript-core.js`)

- Results are only in the student's annex account; the public site says "Please check
  your results in your Annex Account" [official]. No sample transcript or grade-sheet
  layout is public [unknown].
- Expect: letter + grade point + CGPA, no marks; **R** rows for superseded attempts
  (skip them, §1); term labels in all three historical styles (§6), including
  `Fall 2022-23`.
- Needs a real pasted grade sheet before anything is built.

## 11. Faculty initials (`js/core/faculty.js`, `reviews.js`)

- **The routine pages publish an initials → full name table for every course**
  [official]. That gives **292 faculty codes**, each mapping to exactly one name
  [derived]. No other campus gives Shohoj this officially.
- Codes are 2–6 letters, mostly upper case, with exceptions to keep as-is: `ShS`,
  `DMFIa`, `GCMa`, `MDIH01`, `texn5`. The lower-case suffixes look like disambiguators
  for two people with the same initials [derived].
- Department is not in the legend; it can be inferred from which programmes a code
  teaches [derived].

## 12. Sections, routine, free rooms, seats (`routine*.js`, `freeRooms.js`, `seatStatus.js`)

**The annex routine endpoint** (`routine.php?p=<id>&semNo=068,502,614,902`) returns one
HTML timetable per intake-section: programme, intake, semester, a day × slot grid whose
cells read `CSE 101 / FC: ZAK / R: 2316`, and a legend (code, title, faculty code,
faculty name) [official].

Parsed for Fall 2026 on 2026-10-16 [derived]:

| | |
|---|---|
| Programmes | 13 (BBA, CSE, CSE-DH, DSE, English, MA ELT, LL.B, Economics, M.Sc Econ, EEE, EEE-DH, Textile, Civil) |
| Intake-sections | **343** |
| Class meetings | **2,452**, 0 unparsed cells |
| Course codes | 427 |
| Faculty codes | 292 |
| Rooms | 114 |
| Room double-bookings | **0** |
| Teacher in two rooms at once | **0** |

Programme ids used by the endpoint: 001 BBA, 006 CSE, 007 English, 009 LL.B,
013 M.Sc Econ, 016 MA ELT, 019 CSE-DH, 020 Economics, 021 EEE, 022 Textile,
023 EEE-DH, 027 Civil, 029 DSE.

- **Two slot grids** [official]:
  - **Day** — six 90-minute slots, 08:15–09:45, 09:45–11:15, 11:15–12:45,
    **13:15**–14:45, 14:45–16:15, 16:15–17:45 (a 30-minute break 12:45–13:15). Labs take
    two consecutive slots.
  - **DH / evening / M.Sc Econ** — nine 75-minute slots, 08:00 → **21:30**, with a gap
    13:00–15:15.
- **Days:** day programmes meet **Sunday–Thursday only**; DH programmes add **Friday**
  (123 meetings); M.Sc Economics meets on **Saturday** [derived].
- **Rooms:** 4-digit codes, "the first digit represent[s] the building"; Building 2 =
  *Martyr Sujan Mahmud Building*, Building 3 = *Martyr Tahmid Abdullah Building*
  [official, routine header]. Rooms by building: 1 → 23, 2 → 37, 3 → 23, 4 → 24,
  5 → 7. Two exceptions: `41101` (Building 4, floor 11?) and `1504-B`. The remaining
  digits read like floor + room (`2316` = Building 2, floor 3, room 16) [derived,
  unconfirmed].
- **Intake numbers are per programme**, not global: BBA is at Intake 68, CSE 59,
  Civil 14, DSE 3. A section key is `(programme, intake, section)`.
- **Not in the endpoint (PDF only):** M.Sc CSE, LL.M (two intakes), MBA/EMBA, Textile
  (Evening), Civil (Evening/DH), Economics Intake 52, two extra LL.B intakes. These
  also book rooms, so Free Rooms built from the 13 HTML programmes **overstates
  vacancy** in those rooms. Measure how many rooms the PDFs add before switching Rooms
  on.
- **Seats:** no seat or capacity data anywhere [unknown]. `seats` stays off.
- **Etiquette for a cron:** 13 requests per refresh, spaced. Neither host serves a
  `robots.txt` (both 404 on 2026-10-16), but ask BUBT IT before polling (question 9).

This is enough for **routine** (pick your intake-section) and, with the PDF caveat,
**free rooms**. Both need the schema change DIU already needs (§17 there): sections that
meet at different times on different days, no capacity, and string section keys.

## 13. Campus life (`bus`, `cafeteria`, `campus`, `lostFound`)

- **Campus:** permanent campus at Plot 77–78, Main Road, Rupnagar, Mirpur-2,
  Dhaka-1216 [official]. The classic *Campus* page says "three spacious buildings", the
  routines use five building numbers, and the classic cafeteria and classroom pages
  still say "both the campuses" [official, contradictory]. The current building list:
  [unknown].
- **Bus:** BUBT runs named buses — **Padma, Meghna, Jamuna, Buriganga, Brahmaputra**,
  plus **R01–R03** — with "regular morning trips", a **9:30 PM** trip and a **Shuttle
  Service** [official, notice BUBT-Reg-1917-09-26, 16 Sep 2026]. The new site's
  *Transport Services* page has only a paragraph. **No routes, stops or timetable are
  published** [unknown]. `bus` stays off.
- **Cafeteria:** open **08:30–21:00**, AC, Wi-Fi, breakfast and lunch [official, classic
  *Cafeteria* page, undated]. That is one line, too thin for a `cafeteria.json` beyond
  hours.
- **Lost & Found:** room codes are short and stable, and the routine gives a 114-room
  list. Fit for keys once the PDF-only programmes' rooms are added.
- **Campus 3D model:** none; `campus` stays off.

## 14. Proposed profile in `src/core/university.ts`

Not applied: `emailDomains` is the blocker (§9).

```ts
// Same table as DIU's — both follow the UGC uniform scale. Share one constant.
const BUBT: UniversityProfile = {
  id: 'bubt',                       // add to UniversityId
  name: 'Bangladesh University of Business and Technology',
  shortName: 'BUBT',
  emailDomains: [],                 // §9 — unknown; do not guess bubt.edu.bd (staff use it)
  grades: UGC_SCALE,                // = DIU_SCALE
  retake: { kind: 'best' },         // §2 — "better of the two grades"; confirm (Q2)
  repeat: { threshold: 3.75, inclusive: false },  // "grade lower than A"
  // maxRetakes: unset — "repeated once only" vs mandatory F retakes (§2, Q3).
  // creditLoad: unset until the 2021 16/18 cap is confirmed for 2026 (§4, Q5);
  //   then { min: 12, max: 18, warnAbove: 16 }.
  features: ['feedback', 'profile'],
};
```

What the profile type can't say yet, that BUBT needs:
1. **A repeat threshold above 3.0** works as is, but the simulator's retake shortlist
   copy may assume "below B". Check the copy, not just the number.
2. **Graduate vs undergraduate graduation CGPA** (2.50 vs 2.00).
3. **A term system that changes by date**, not just by programme (§6).
4. **Catalogue keyed by programme** (§8).
5. **Quarter-credit and zero-credit courses** (§1).
6. **Default assessment breakdown**, with a law-specific variant (§1).

## 15. What BUBT could switch on, in order

| Feature | Ready? | Why |
|---|---|---|
| calculator, playground, degree, profile, feedback | 🔶 after §9 | Scale official, identical to DIU's; typed credits (as DIU) until a catalogue exists. Degree tracker gets 12 programme totals. |
| **routine** | 🔶 strong | All 13 annex programmes parse cleanly (§12); needs the intake-section schema DIU also needs |
| **rooms** | 🔶 | Same data; 0 clashes; PDF-only programmes must be added or flagged first |
| faculty directory / reviews | 🔶 | 292 official initials → names (§11); reviews also need §8 and §9 |
| course autocomplete | 🔶 partial | CSE Day/Evening offers give codes + credits; other departments need their offers |
| planner, tasks, groups, papers | ❌ | Need a per-programme catalogue + prerequisites (§8) |
| transcript | ❌ | Needs a real annex grade sheet (§10) |
| bus | ❌ | Bus names only; no routes or times (§13) |
| seats | ❌ | No seat data |
| cafeteria, campus, difficulty, assistant | ❌ | No data / no model / no review volume / BRACU-only tools |

## 16. Questions for BUBT (Registrar / IT / Controller of Examinations)

1. **IT:** What is the student Google Workspace domain? Is it `bubt.edu.bd` for staff
   and students alike?
2. When an improvement retake scores **worse**, does the better grade count (Rules
   page, *Repeating Courses*) or the latest (the R-grade paragraph)?
3. Does "a course can be repeated once only" apply to failed courses, or only to
   improvement?
4. Is there a **probation** rule? What CGPA, and what happens after it?
5. Does the 2021 **16 / 18-credit** trimester cap apply again from Spring 2026?
6. **Dean's Award** criteria? Any class divisions or honours on the certificate?
7. Is there a **W** grade? How long does an **I** stay open?
8. Can Shohoj get each programme's **current curriculum** (codes, titles, credits,
   prerequisites) and the old ↔ new course-code equivalences (3-digit → 4-digit)?
9. May Shohoj read `annex.bubt.edu.bd/global_file/routine.php` on a schedule? What do
   `semNo` values `068, 502, 614, 902` stand for, and do older ones return past terms?
10. Bus routes, stops and times? Is there a public schedule?
11. Which buildings exist now (the routines use 1–5), and what do the room digits after
    the first encode?
12. How long do the DH (evening) programmes take, and in how many credits?

## Data files

In `data/campuses/bubt/` (validated by `npm run check:campus-data`: 0 errors, no BUBT
warnings):

| File | What | Tag |
|---|---|---|
| `sources.json` | 17 sources | — |
| `profile.json` | Grading (+ R and I), retake (`best`, A- and below), credit load (warn above 16, no hard max), 18 academic rules, both term systems with their history, day codes, buildings 2 and 3, room-code pattern | [official]; `emailDomains` empty with a note (§9); class divisions, honours, class standing empty with notes |
| `programs.json` | 12 undergraduate programmes, credits, faculty, term system | [official] |
| `calendar/261-trimester.json`, `262-trimester.json`, `263-trimester.json` | Spring, Summer, Fall 2026 | [official]; the "Spring – 2026" header slips recorded as the term they belong to, with a note |
| `calendar/263-bisemester.json` | Fall 2026, Law | [official]; "Spring 2026" pre-registration and "22 Non" slips noted |
| `calendar/253-bisemester.json` | Fall 2025, the last university-wide bi-semester term | [official]; its 7 Jan Spring start conflicts with the Spring calendar's 1 Jan (noted) |
| `faculty.json` | 292 initials → names | [derived] from the routine legends; `dept` is the subject taught most, `courses` empty (see the file's note) |

Retrieved 2026-10-16. Calendar rows for clubs, wellbeing, census, parents', sports and
research-showcase days are left out. `classes-pause` marks the last class before the
mid-term, so the feed's class-end date (latest `last-class`) is unaffected.

Not loaded, because the schema can't hold them yet:
- **Course offers and course credits.** `credits` must be a multiple of 0.5, and BUBT
  has 0.75-credit labs (`CSE 100`, `CSE 324`); course codes must be 3-digit, and half
  of BUBT's are 4-digit (`ENG 1101`).
- **Sections (Fall 2026, 2,452 meetings).** Same shape problem as DIU's (§12): the key
  is (programme, intake, section), a section meets at different times on different
  days, and there is no capacity.

## 17. Next steps for Shohoj

1. **Get the email domain** (Q1); without it nothing ships. Same path DIU took.
2. Register `bubt` in `UniversityId` and `src/core/university.ts` (§14) once Q1 is
   settled, plus `tests/universityData.test.js` parity against `profile.json`.
3. Widen the campus schema for 4-digit codes and quarter credits, then load the CSE
   course offers (§8).
4. Commit the routine snapshot once the intake-section schema exists. The parser that
   produced §12's numbers is ~60 lines over the annex HTML (scratch, not in the repo).
5. Ask BUBT the §16 questions, starting with 1, 2, 5 and 9.
