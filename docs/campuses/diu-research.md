# DIU — what Shohoj needs, and what we know

The data itself lives in [`data/campuses/diu/`](../../data/campuses/diu/) (see its
[README](../../data/campuses/README.md)); this file is how it was found, what was
left out, and what is still unknown.

Research for adding **Daffodil International University** (not Dhaka University) as a
real campus in Shohoj, not a "coming soon" row. Gathered 2026-09-28. Every claim is
tagged with where it came from:

- **[official]** — daffodilvarsity.edu.bd, its public content API
  (`webbackend.daffodilvarsity.edu.bd/api/…`, the same one the site itself calls), or a
  file DIU posted there
- **[3rd-party]** — a student tool, app or calculator site; treat as unverified
- **[derived]** — computed by us from an official source
- **[unknown]** — looked for, not found; ask DIU

Primary sources:
- *Rules and Regulation* (the academic rules page) —
  https://daffodilvarsity.edu.bd/article/rules-and-regulation, content served by
  `…/api/v1/public/article-details?slug=rules-and-regulation`
- Student FAQ — https://webbackend.daffodilvarsity.edu.bd/faq
- Registrar academic calendars (2026, BI + TRI) — `…/api/v1/public/registrar-office/academic-calendar`
- Undergraduate programmes + credit totals — `…/api/v1/public/programs?tuition_category_id=1&program_type_id=1`
- Transport — `…/api/v2/public/transport`
- Department notices (routines, course offers) — `…/api/v1/public/notice`
- CSE Class Routine V3.1, Fall 2026 —
  https://webbackend.daffodilvarsity.edu.bd/noticeFile/cse-class-routine-v31-f4f0af7da9.pdf
- Fall 2026 course offers — SWE, EEE, Civil, Architecture (URLs in §8)

Not reachable, and left alone: the student portal (`studentportal.diu.edu.bd`, Cloudflare
managed challenge), the DIU forum (AWS firewall 403), and the faculty handbook (DIU
Google sign-in). No bot protection was worked around.

**⚠ DIU's own documents contradict each other in four places** — repeat eligibility
(§2), probation length (§3), attendance and add/drop timing (§5). Most are collected in
§16. None blocks the calculator; where two disagree the registry follows the Rules
page, and says so. The **student email domain** (§9) was the blocker for sign-in: it is
now settled from students' own projects, not from DIU.

**Status (2026-10-09):** DIU is in the registry and signs in on the legacy site with the
calculator, the playground, the degree tracker, profile and feedback. What it took, and
what is still off, is in §15.

---

## 1. Grading (`src/core/university.ts`, `js/core/grades.js`)

DIU uses the **UGC uniform grading system** [official, Rules and Regulation]:

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

- **No C-, D+ or D-** [official]. Every letter DIU awards already exists in the
  `GradeLetter` union, so no type change is needed.
- **The same letter is worth different points than at BRACU.** A is 3.75 (BRACU 4.0),
  A- is 3.50 (BRACU 3.7), D is 2.00 (BRACU 1.0). `GradePoint` is a plain `number`, so
  the scale fits, but any code that still reads the module-level BRACU `GRADES` instead
  of the active profile will silently mis-score a DIU transcript by up to 0.25 per course.
- **Marks are far more lenient than BRACU's or NSU's**: A+ at 80 (BRACU 97, NSU has no
  A+), a pass at 40 (BRACU 52, NSU 60). A "what do I need on the final" answer computed
  on another campus's cutoffs would be wrong by whole letters.
- **I (Incomplete)** — only when everything but the final is done; becomes **F**
  automatically if not made up within 3 weeks of the next semester [official].
- **W** — not mentioned in the rules; "only A+ … D and F are used to determine credits
  attempted" [official]. Whether a W grade exists at all: [unknown]. There is a
  whole-semester drop through the Dean [official, FAQ].
- **P** — not mentioned [unknown].
- Scholaro's credential registry lists the same table letter for letter [3rd-party,
  consistent with official].

## 2. Retake, repeat, improvement

- **The last attempt counts**: "GPA and CGPA will be calculated on the basis of the
  grades obtained at the last attempt" and "the previous grade will be automatically
  cancelled" [official]. That is `retake: { kind: 'latest' }` — the opposite of NSU's
  `best`, with no start-term cutoff like BRACU's.
  - ⚠ **Third-party DIU calculators say the opposite in spirit**: "the improved grade
    replaces the old one" [3rd-party, calculator sites]. The two only diverge when a
    retake scores *worse* — which is exactly when Shohoj would show a wrong CGPA. The
    rules page is also undated and its own semester section still describes a
    two-semester year, so parts of it are old. Keep `latest` (it's the only official
    statement) but confirm before shipping — question 12 in §16.
- **Repeat eligibility: "A course passed with a grade less than B"** [official, Rules] →
  `repeat: { threshold: 3.0, inclusive: false }`, same boundary as BRACU.
  - ⚠ **Contradiction:** the FAQ says students "who got Grade B or less may apply for
    improvement" [official, FAQ]. That is inclusive. The two may describe different
    things (below), but a B student is told yes by one page and no by the other.
- **Failed courses may be repeated "twice at the most"** [official]. A cap exists, but
  it is stated for *failed* courses only; no cap is stated for improving a passed grade.
  `maxRetakes: 2` would over-apply it — see §14.
- **Improvement is also an exam, not only a course.** DIU runs **mid-term and final
  improvement exams**: fill a form, pay 40% (mid) or 60% (final) of the course fee, and
  re-sit that exam without re-taking the course [official, FAQ]. An exam clash gives a
  free improvement sitting [official]. Shohoj's retake model has no concept of
  re-sitting one component; the marks tracker could model it later.

## 3. Standing, probation, honours (`js/core/milestones.js`)

Legacy tiers are BRACU's (Perfect 3.97 / Higher Distinction 3.65 / … —
`js/core/milestones.js:13`). DIU's:

- **Good standing: CGPA ≥ 2.00** [official].
- **Probation: CGPA and/or GPA below 2.00**; three semesters to recover, then dropped
  from the program [official, "Academic Probation"].
  *(See also §2's retake caveat — the rules page is undated and parts of it are old.)*
  - ⚠ **Contradiction:** "Student Dismissal" on the same page says students "failing to
    maintain the required CGPA (2.0) in **two consecutive semesters** will be dropped."
    Two semesters or three? Ask the registrar. Don't surface a countdown until then.
- **Minimum CGPA to graduate: 2.50** [official, FAQ] — higher than BRACU/NSU's 2.00.
  The same 2.50 is required to start an internship [official, FAQ]. A student can
  therefore be in good standing (≥2.00) and still not on track to graduate — the
  milestone UI must show both lines, not one.
- **Dean's Honor List:** full-time student with **semester GPA 3.75** in a regular
  semester [official].
- **VC's Honor List:** CGPA 3.75 maintained in successive 3rd and 4th semesters
  [official].
- **Chancellor award:** "Students with 3.9" [official; wording doesn't say GPA or CGPA].
- **Latin honours / class divisions:** none published [unknown].

## 4. Credit load

- **Full-time = 9 credits or more**; below 9 is part-time [official].
- **More than 15 credits needs the advisor's written consent** [official, Rules]; the
  FAQ routes "extra courses" to the Dean through the Head [official, FAQ].
- **No absolute maximum is published** [unknown]. `CreditLoadRules` requires `max`, so
  DIU can't be expressed as-is — see §14.

## 5. Other academic rules that affect planning

- **Assessment weights** [official] — the whole course is 100:
  attendance 7 · assignment 5 · presentation 8 · 3 quizzes 15 · mid-term 25 · final 40.
  This is what the marks tracker needs as DIU's default breakdown. Individual
  departments/teachers may vary it (the THM department had its own marks-distribution
  page, since removed) [3rd-party search snippets].
- **Attendance:** expected 90%; below **75%** may be debarred from the final
  [official, Rules].
  - ⚠ **Contradiction:** the FAQ says "Minimum of **60%** of the classes you must
    attend" [official, FAQ]. Affects nothing Shohoj computes today; note it.
- **Registration is done for the student.** The student pays, gets clearance, and the
  **batch coordinator** registers their courses [official, FAQ]. Add/drop within 7 days
  after registration closes [official, FAQ] (the Rules page says the first week of the
  semester).
- **Degree deadline:** extending past **six years** needs Registrar approval [official, FAQ].
- **Dropping out:** 3+ unannounced dropped semesters → re-admission process [official, FAQ].
- **Major** chosen no later than the 2nd semester of 3rd year [official].
- **Dual major:** 1 elective + 7 courses from the first major + 5 from the second
  [official, FAQ].
- **Course waiver** (foundation courses only) for a B / 50%+ from another recognised
  university [official].
- **Old syllabus:** a student on a previous syllabus may keep registering under the old
  course codes, on application [official, FAQ]. So two code sets are live at once — see §8.

## 6. Calendar and terms (`departments.js` `seasons`, `semesterIdentity.js`)

DIU runs **two calendars at once**, split by faculty [official, semester-schedule +
registrar calendars]:

- **Tri-semester (TRI)** — Science & IT, Business & Entrepreneurship, Humanities &
  Social Sciences, Health & Life Sciences: **Spring Jan–May, Summer May–Aug,
  Fall Sep–Dec**.
- **Bi-semester (BI)** — **Spring Jan–Jun, Fall Jul–Dec**. Which programmes use it
  isn't stated [unknown]. It is **not** simply "Engineering": the EEE and Civil Fall
  2026 course offers run three terms a year (EEE level-terms 1-1/1-2/1-3, batches
  `263`/`262`/`261` admitted Fall, Summer and Spring 2026; Civil `L4-T3`) [official].
  Architecture's offer uses "First Year: 1st Semester", which may be BI [unknown].
  (Corrected by the 2026-09-28 cross-check — an earlier draft said Engineering was BI.)
  ⚠ "Fall" means a different half-year in each: TRI Fall starts 9 Sep, BI Fall started
  11 Jul. A semester label alone doesn't identify dates — the profile (or the program)
  has to carry which system it's on, the same problem NSU's BPharm/LLB have.
- **Fall 2026 (now):**
  - TRI: classes began **9 Sep**; mid-term 28 Oct–4 Nov; finals **17–24 Dec**; results
    29 Dec [official].
  - BI: classes began **11 Jul**; mid-term 8–21 Sep; finals **10–24 Dec**; results
    29 Dec [official].
- All five 2026 calendars are in `data/campuses/diu/calendar/` as `261-bisemester`,
  `263-bisemester`, `261-trimester`, `262-trimester`, `263-trimester` [official].
- **Term codes:** `YY` + `1|2|3` — `263` is Fall 2026. The EEE course offer labels its
  newest batch `263` and the next `262` [official], matching the `semesterId` the old
  result service used (`213` = Fall 2021) [3rd-party]. Which digit a BI Fall gets is
  [unknown].

## 7. Programs and total credits (`departments.js`)

33 undergraduate programmes from the fee calculator's API [official] — full list in
`data/campuses/diu/programs.json`. Selected:

| Program | Credits |
|---|---|
| B.Sc. CSE | **154.5** |
| B.Sc. Software Engineering (+ Cyber Security / Data Science / Robotics majors) | 147 / 145 / 147 / 147 |
| B.Sc. EEE | 144 |
| B.Sc. Civil Engineering | 147 |
| B.Sc. Textile Engineering | 154 |
| B.Arch. (5 years) | **194** |
| B.Pharm | 165 |
| LL.B. (Hons) | 144 |
| BBA (and majors) | 130 / 133 |
| B.A. English | 130 |

- ⚠ **DIU's two fee tables disagree on four programmes** (cross-check 2026-09-28):
  the international-student table gives B.A. English **140** (local 130), EEE **145**
  (local 144), B.Pharm **162** (local 165), BBA in Management **130** (local 133). The
  other 21 programmes both tables list agree. `data/campuses/diu/programs.json` carries
  the local figures, with the international one under `conflicts`; don't ship a degree total for these four until the department
  confirms.
- CSE's **154.5** means half-credit courses exist; the routine confirms **1.5-credit**
  labs [derived]. Credit values seen so far: 1, 1.5, 2, 3, 5 (architecture studios)
  [official + derived].
- Degree tracker: totals run far above BRACU's (CSE 136) — a hard-coded 136 anywhere
  would show a DIU CSE student as finished 18.5 credits early.
- **Semester-by-semester presets** are not published as text; course offers list them
  per batch, per term (§8) [official, partial].

## 8. Course codes, catalogue and prerequisites (`catalog.js`, `prereq.js`) — ⚠ blocker

**Course codes are not one format.** Fall 2026 official documents use at least five:

| Department | Example | Source |
|---|---|---|
| CSE | `CSE228` | routine V3.1 |
| Software Eng. | `SE 111`, and pairs `ENG 114/ ENG 101` | SWE course offer |
| Civil | `CE 413`, electives as `CE ***` | CE course offer |
| Architecture | `ARCH-102`, `MATH-101` | ARCH course offer |
| **EEE** | **`0713-111`** (an ISCED field code + number) | EEE course offer |

Legacy hard-codes `/^[A-Z]{2,4}\d{3}[A-Z]?$/` in **five files**:
`js/core/prereq.js:26`, `js/core/catalog.js:896`, `js/core/gpa-core.js:51`,
`js/core/minorProgress.js:26-44`, and **`js/core/helpers.js:169`, which silently drops
any saved `planCourses` entry that doesn't match**. Stripping spaces/hyphens rescues
`SE111`, `CE413` and `ARCH102`; nothing rescues `0713-111`. EEE students would lose
planned courses with no error. Course-code normalisation has to become per-campus
before DIU ships anything that stores codes.

- Old and new codes are **both live**: the SWE offer prints `ENG 114/ ENG 101`,
  `GE 314/ BNS 101`, `MAT 124/ MAT 101` [official], and old-syllabus students keep the
  old codes (§5). A catalogue needs an equivalence table, not one code per course.
- **CSE's curriculum changed** between Spring 2022 and now: in 2022, Programming and
  Problem Solving was `CSE122` [official, 2022 offering form]; in the Fall 2026 routine
  `CSE122` meets in the *Electrical Circuits* lab for batch 71, while batch 72 takes
  `CSE113` [official routine]. That suggests **codes were reused for different courses**
  across curricula [derived — confirm], so a code alone may not identify a course.
  Whether `CSE113` is now Programming and Problem Solving is [3rd-party]. The 2022 form
  (https://webbackend.daffodilvarsity.edu.bd/download-file/1069) has titles *and*
  prerequisites; which batches it still applies to is [unknown].
- **Fall 2026 course offers with titles and credits** [official]:
  - SWE — https://webbackend.daffodilvarsity.edu.bd/noticeFile/course-offer-fall-2026-dept-of-swe-1-1-52e6099525.pdf
  - EEE — https://webbackend.daffodilvarsity.edu.bd/noticeFile/course-offer-fall2026-b60f2d3289.pdf
  - Civil — https://webbackend.daffodilvarsity.edu.bd/noticeFile/course-offer-of-fall-2026-ddf0107cf0.pdf
  - Architecture — https://webbackend.daffodilvarsity.edu.bd/noticeFile/14072026-updated-course-offer-students-0eb157ca0e.pdf
  - **No CSE course offer in the last 300 notices** [unknown]. Retake sections in the
    CSE routine carry credit tags like `RE_A(3C)` / `RE_A1(1.5C)` [official] — a partial
    credit source for 67 of the 79 retake course-sections (10 of those tags are
    malformed, e.g. `RE_A(2C`, `RE_A (3C.)`), not a catalogue.
- **Prerequisites:** only in the stale 2022 CSE form [official, outdated]. No current
  prerequisite list for any department [unknown].
- No catalogue JSON is committed here yet: each department's offer is a different table
  layout, and a mixed-format catalogue built before normalisation is decided would just
  encode the problem.

## 9. Sign-in and identity (`js/auth/firebase.js`, `emailDomains`)

- **DIU runs Google Workspace for Education** [official, DIU IT Section], so the
  existing Google sign-in works.
- "Every student, faculty member and employee has an individual email ID in university
  domain" [official, DIU site search] — so students do have one, but **no public DIU
  page names it**. Checked again 2026-10-09: site search, IT section, the FAQ (which
  says only "your DIU email account"), the BLC login page and the public notice feed.
  The DIU forum thread titled "Our Email address (@diu.edu.bd)" exists but answers 403.
- **Students sign in from `diu.edu.bd` and `s.diu.edu.bd`** [3rd-party, students' own
  projects, read 2026-10-09]. Four separate projects accept exactly these two:
  - the **DIU Computer Programming Club's server** (`kazikhalednur/cpc-server`,
    `accounts/helpers.py`) — Google sign-in, then it matches the digits in the address
    against the student ID;
  - **OurDIU** (`SourovCodes/OurDIU`, "DIU addresses (staff and students)");
  - **DIU Lens** (`jishanws/diu-lens`, "Use your official DIU email address");
  - `0xdevabir/contest`, which marks `s.diu.edu.bd` as **students only** and
    `diu.edu.bd` as either.
  Nine more student projects check `@diu.edu.bd` alone, several calling it the "DIU
  student email". Which students got which domain is not stated anywhere read here
  (by batch is the likely split, and is a guess).
- All three DIU subdomains still have Google mail (MX) records — `diu.edu.bd`,
  `s.diu.edu.bd`, `student.diu.edu.bd` [derived, DNS, re-queried 2026-10-09].
  `student.diu.edu.bd` is named by **one** project only (as the student domain, with
  `diu.edu.bd` as staff) and by none of the four above, so it is **not admitted**. A
  student on it is told their address is not served — the signal to add it.
- ⚠ `diu.edu.bd` is also what staff use, so a lecturer can sign in — the same exposure
  NSU has, and the reason DIU gets no Reviews tab until that is thought through.
  Offices use `daffodilvarsity.edu.bd` (`itsupport@`, `registraroffice2@`) [official],
  which is not admitted.
- **Applied:** `emailDomains: ['diu.edu.bd', 's.diu.edu.bd']` in
  `src/core/university.ts`, its twin, `js/core/universityDirectory.js`, and — generated
  by `npm run generate:campus-map` — `worker/campus.generated.js` and `firestore.rules`.
  **The rules must be deployed** before a DIU student's reads and writes are allowed.
- **Student ID format** [unknown] — not confirmed from any source read here; the
  routine's batch numbers (`63`–`73`) are not IDs.
- Legacy admits whoever `campusOfEmail` in `js/core/universityDirectory.js` resolves, so
  the directory entry is the whole of DIU's sign-in on that page.

## 10. Transcript import (`js/import/transcript-core.js`)

- The student portal is behind a Cloudflare challenge, so its page format couldn't be
  inspected [unknown]. Official transcripts are requested and paid for through the
  portal [official, FAQ].
- The portal's result data has these fields [3rd-party, open-source DIU result app
  model]: `semesterId`, `semesterName`, `semesterYear`, `customCourseId`,
  `courseTitle`, `totalCredit`, `gradeLetter`, `pointEquivalent`, `cgpa`.
- **⚠ Do not build on the old result service.** `software.diu.edu.bd:8006/result`
  returns *any* student's results from a student ID alone, with an empty reCAPTCHA
  field [3rd-party, many public repos]; one public project uses it to build an
  "academic leaderboard" of other students. The FAQ's "Virtual University" lookup ("enter
  your ID … your results will be displayed") is the same idea [official]. Shohoj must
  never call it with an ID — that would expose other students' grades. It also refused
  connections from here (port closed or Bangladesh-only).
- The safe model is the one Routine uses for CONNECT: **the student pastes their own
  portal page**. The parser needs a real sample from a DIU student [unknown].

## 11. Faculty initials (`js/core/faculty.js`, `reviews.js`)

- Routines identify teachers by **initials**: 204 distinct in the CSE routine alone
  [derived]. Mostly uppercase letters (`MIS`, `SMTS`, `DMAK`).
- **Placeholders look like initials**: `NT-1` … `NT-9`, `EEE-1` / `EEE_1`, `ENT_4`
  (unassigned teachers, or teachers lent by another department) [derived]. Under legacy
  `normalizeInitials` (`js/core/faculty.js:13`, uppercase + strip non-letters) all nine
  `NT-n` merge into one "NT", and reviews would attach to a slot, not a person. They
  must be excluded from reviews, not normalised.
- Unlike NSU, no two real initials differ only by case in the CSE routine [derived] —
  but only one department was checked.
- **No public initials → name list** [unknown]. DIU's teacher directory
  (https://faculty.daffodilvarsity.edu.bd/teachers/cse.html) lists names and ranks, not
  initials [official].

## 12. Sections, routine, free rooms, seats (`connectFeed*.js`, `routine*.js`, `freeRooms.js`, `seatStatus.js`)

- **There is no seat market.** Sections are **batch sections**: `68_D` = batch 68,
  section D; lab sub-groups `69_C1` / `69_C2`; retake sections `RE_A(3C)` [official].
  The batch coordinator registers students (§5). **Seats has nothing to show at DIU**,
  and a clash-free *builder* is the wrong shape: a DIU student's routine is mostly their
  batch section's. The Routine tab should become "pick batch + section → your week",
  plus retake sections.
- **Source: official per-department routine files**, posted as notices on the public
  notice API [official]. Fall 2026 examples: CSE V3.1 (PDF), Civil "Batch Wise Class
  Routine V1.3" (PDF), Agriculture V-3 (PDF), English V-0.4 and V3 (**XLSX**).
  - **Re-versioned mid-term:** CSE was on V3.1 (effective 26 Sep) two and a half weeks
    after classes began [official]. A cron can poll the notice API; it must treat a new
    version as replacing the old, not adding to it.
  - Every department lays its file out differently, so each needs its own parser.
    CSE's is a Google Sheets export with a real text layer: room / course(section) /
    teacher per slot, labs across two slots, lab room names wrapped across lines.
- **CSE sections (not committed yet — see §17)** — **1,922 class slots, 75 courses, 957
  course-sections, batches 63–73**, parsed from the official CSE V3.1 PDF [derived].
  Checks: 0 unparsed cells, no room double-booked, no teacher in two rooms at once.
  Section strings are hand-typed and inconsistent (`RE_A (3C.)`, `RE_A(2C` missing a
  bracket) — normalise before keying anything on them.
- **Day and slot pattern:** Saturday–Thursday, Friday off for CSE day classes. Six
  **90-minute slots with no gaps**: 08:30, 10:00, 11:30, 13:00, 14:30, 16:00 → 17:30.
  The PDF prints 12-hour times without AM/PM (`01:00-02:30` is 13:00) [derived]. Labs
  are two consecutive slots (3 hours).
- **Rooms:** 76 rooms the CSE routine books
  [derived]. Codes: `KT-201`, `G1-001`, `ANX1-101`, `SH-103`, `KT-318(A)`/`(B)` split
  rooms, `LAB-KT-301`. What the building prefixes stand for is [unknown].
  - ⚠ **Free Rooms can't ship from one department's routine.** Other departments book
    the same buildings; a CSE-only dataset would show rooms as free that aren't. Free
    Rooms needs every department's routine first.

## 13. Campus life (`bus`, `cafeteria`, `campus`, `lostFound`)

- **Bus — the strongest data DIU has** [official]: a structured public JSON feed with
  **10 regular routes, 5 shuttles and 5 Friday routes**, named stops in order, times in
  each direction, and off-days. Loaded as `data/campuses/diu/bus.json`.
  - Regular: e.g. Dhanmondi ↔ DSC, 12 stops, to campus 07:00 / 10:00, from campus
    13:30 / 16:20 / 18:10. Routes also from Uttara (via metro rail centre), Tongi,
    Mirpur (ECB Chattar), Baipail, Dhamrai, Savar, Narayanganj, Mugda, Konabari.
  - ⚠ The feed is still titled "Special Transport Schedule for Exam-2026 / Summer-2026"
    on 28 Sep, after Fall classes began — a cron must not assume it's current.
  - ⚠ Friday return times read `02:20` / `06:30` — 12-hour values in a 24-hour field,
    almost certainly 14:20 / 18:30 [derived].
  - Transport policy PDF linked from the feed [official].
  - This beats BRACU's hand-collected bus data: a Worker cron could keep it fresh.
- **Campus:** Daffodil Smart City (DSC) [official — course offers and every bus
  route end there]. The FAQ
  mentions changing campus via the Registrar [official], so another campus may still
  host some programs [unknown].
- **Lost & Found:** room codes (`KT-201`) are stable and short — fit for keys once the
  room list covers all departments.
- **Cafeteria:** nothing official found [unknown].
- **Campus 3D model:** none; `campus` stays off.

## 14. Profile in `src/core/university.ts` (applied 2026-10-09)

```ts
const DIU_SCALE: GradeScale = {
  points: { 'A+': 4.0, A: 3.75, 'A-': 3.5, 'B+': 3.25, B: 3.0, 'B-': 2.75,
            'C+': 2.5, C: 2.25, D: 2.0, F: 0.0, I: null },
  pointsToGrade: [[4.0,'A+'],[3.75,'A'],[3.5,'A-'],[3.25,'B+'],[3.0,'B'],
                  [2.75,'B-'],[2.5,'C+'],[2.25,'C'],[2.0,'D'],[0.0,'F']],
  max: 4.0,
  marks: [{letter:'A+',min:80},{letter:'A',min:75},{letter:'A-',min:70},
          {letter:'B+',min:65},{letter:'B',min:60},{letter:'B-',min:55},
          {letter:'C+',min:50},{letter:'C',min:45},{letter:'D',min:40},
          {letter:'F',min:0}],
};
const DIU: UniversityProfile = {
  id: 'diu', name: 'Daffodil International University', shortName: 'DIU',
  emailDomains: ['diu.edu.bd', 's.diu.edu.bd'],   // §9
  grades: DIU_SCALE,
  retake: { kind: 'latest' },
  repeat: { threshold: 3.0, inclusive: false },   // Rules page; FAQ disagrees (§2)
  // maxRetakes: leave unset — the "twice" cap is for failed courses only (§2).
  // creditLoad: leave unset — min 9 and advisor consent above 15 are published,
  //   but no hard max, and CreditLoadRules requires one (§4).
  features: [ /* see §15 */ ],
};
```

Things the profile type can't say yet, that DIU needs:
1. **Graduation CGPA (2.50) separate from good standing (2.00).**
2. **A failed-course retake cap** distinct from an improvement cap.
3. **A credit load with a consent threshold but no hard max.**
4. **Two calendars (BI/TRI) chosen by programme**, not by campus.
5. **A campus-specific course-code pattern** (§8).
6. **A default assessment breakdown** for the marks tracker (§5).

## 15. What DIU has switched on

On the legacy site, as of 2026-10-09:

| Feature | State | Why |
|---|---|---|
| calculator, playground, degree, profile, feedback | ✅ on | Pure rules; the scale is official. The student types each course **and its credits** — with no catalogue the legacy calculator had nowhere to read credits from, so on a campus with none the credits cell is a field (`campusTypesCredits`, `js/ui/render.js`). A named course starts at 3. |
| program picker | ✅ on | 33 programs and totals, generated into `js/core/catalogDiu.generated.js`. A program whose calendar DIU does not state is offered all three seasons. |
| planner | ❌ | Lists a catalogue's courses and prerequisites; DIU publishes neither (§8). |
| groups, papers, reviews | ❌ | Each names a course, and the page and the Worker both check it against the campus's catalogue. Needs §8 first; reviews also need §11 and an answer to staff sharing `diu.edu.bd` (§9). |
| **bus** | 🔶 next | Official structured feed, already in `bus.json` (§13) — needs a DIU page beside NSU's (`src/app/routes/BusRouteNsu.tsx`). |
| routine | 🔶 | Official files exist; needs a per-department parser and a batch-section UI (§12) |
| transcript | ❌ | Paste import needs a real portal sample (§10). The "Import Transcript" button is hidden. |
| rooms | ❌ for now | Needs every department's routine, not CSE's alone (§12) |
| seats | ❌ | No seat market, no seat data (§12) |
| tasks | ❌ | Needs a DIU catalogue and code normalisation (§8) |
| lostFound | 🔶 | Room codes fit; needs the full room list |
| cafeteria, campus, difficulty, assistant | ❌ | No data / no model / no review volume / BRACU-only tools |

Still BRAC University's on a DIU student's screen, and not yet DIU's:
- the playground's **milestones** (Distinction 3.50, Higher Distinction 3.65, …) are
  BRACU's tiers — NSU sees them too. DIU's own are in `profile.json`
  (`honours`, `classStanding`);
- the hero and feature copy above the calculator names BRACU.
BRACU's **minors** card was shown to every campus; it is now BRACU's alone.

The React shell at `/app/` reads the same registry, so it lists DIU too, but its
calculator has no typed-credits field — DIU is built for the legacy site.

Compared with NSU, DIU has a real path to **bus** and **routine**. It is behind
NSU on the catalogue (§8), which is what holds back everything course-shaped.

## 16. Questions for DIU (Registrar / IT)

1. **IT:** Students' own projects say `diu.edu.bd` and `s.diu.edu.bd` (§9) — is that
   right, which batches got which, and does any student have `student.diu.edu.bd`?
   Is `diu.edu.bd` also used by faculty/staff?
2. Probation: dropped after **two** consecutive semesters below 2.00, or after **three**?
3. Repeat/improvement: is a **B** eligible ("less than B" vs "B or less")?
4. Is there a **W** grade? A **P** grade?
5. Is there a hard **maximum credit load**?
6. Is the "repeat twice at most" cap for failed courses only?
7. Chancellor award: **3.9 GPA or CGPA**?
8. Attendance: is the debar threshold **75%** or **60%**?
9. Can Shohoj get the **current CSE curriculum** (codes, titles, credits,
   prerequisites) and the **old ↔ new course-code equivalences**?
10. Is there an official **initials → faculty name** list?
11. Is a BI Fall semester coded `…3` like a TRI Fall? Which programmes are BI?
12. When a retake scores **worse** than the original, which grade counts — the last
    attempt (Rules page) or the better one (what student calculators assume)?
13. Programme totals where the local and international fee tables disagree: English
    130/140, EEE 144/145, B.Pharm 165/162, BBA in Management 133/130.
14. Was `CSE122` reused for a different course in the new CSE curriculum?

## Data files

In `data/campuses/diu/` (validated by `npm run check:campus-data`):

| File | What | Tag |
|---|---|---|
| `sources.json` | Every DIU source cited below | — |
| `profile.json` | Grading, retake, standing, honours, credit load, rules, term systems, day codes | [official]; empty lists and null fields carry a note saying what DIU doesn't publish |
| `profile.json` → `identity` | The two student email domains | [3rd-party] — students' projects, §9 |
| `programs.json` | 33 undergraduate programmes and total credits; four `conflicts` | [official] |
| `calendar/*.json` | All five 2026 calendars (bi-semester and trimester) | [official]; bi-semester Fall's term code assumed |
| `bus.json` | 20 routes: stops, times, off-days | [official]; five Friday return times corrected, each with a note |

Retrieved 2026-09-28 (identity: 2026-10-09). The routine and transport data change
during a term; re-pull before relying on them — the notice feed already lists a CSE
routine **V4.1** for Fall 2026, newer than the V3.1 parsed here.

## 17. Not loaded yet, and why

- **Sections (CSE Fall 2026, 1,922 class slots)** — parsed and verified (below), but
  the campus schema can't hold DIU's shape: sections are strings (`68_D`,
  `RE_A(3C)`), a section meets at different times on different days, there is no
  capacity, and the routine gives course codes without titles, which `courses.json`
  requires. Needs a schema change of its own.
- **Course catalogue** — only per-department Fall 2026 offers with four layouts and
  EEE's numeric codes (§8); needs per-campus code handling first.
- **School per program** — no public DIU page maps programs to faculties, so
  `school` is omitted rather than guessed.

## Cross-check (2026-09-28)

Every file and quoted rule above was checked again, against a fresh fetch and, where
one exists, an independent second source:

| What | Check | Result |
|---|---|---|
| Calendars, programmes, transport | Re-fetched live, diffed field by field | ✅ identical |
| Programme credits | Local vs international fee table (separately maintained) | ⚠ 21/25 agree; 4 conflicts (§7) |
| 49 quoted rules (grading, retake, probation, honours, load, attendance, weights, FAQ) | Exact text search in fresh copies of the Rules page and FAQ | ✅ all 49 present |
| Grade table | Rules page vs Scholaro registry vs UGC uniform scale | ✅ agree |
| Retake rule | Rules page vs third-party calculators | ⚠ conflict when a retake scores worse (§2) |
| CSE routine — day of every cell | PDF text coordinates, not text order | ✅ 1,922/1,922 |
| CSE routine — slot, room, course, section, teacher | Separate coordinate-based extractor | ✅ 1,922/1,922 on all six fields |
| CSE routine vs student-made parse | Different version (pre-V3.1, 8 Sep) | Only 834 slots identical — timetables change heavily between versions; always use the latest notice |
| Rooms file | Rebuilt from sections | ✅ identical (76 rooms, 1,922 slots) |
| Course-code formats | Every code extracted from the four Fall 2026 offers | ✅ ARCH/SWE/CE fit legacy after stripping spaces/hyphens; all 53 EEE codes don't |
| Code references (file:line) | Read each line | ✅ all current |
| Email-domain MX records | Re-queried | ✅ unchanged |

Corrections made by this pass: §6 (Engineering is not simply BI — EEE and Civil are
tri), §7 (fee-table conflicts), §2 (retake-rule conflict), §8 (possible code reuse;
an unsourced batch cutoff removed), §16 (questions 12–14).

### Second pass (2026-09-28)

| What | Check | Result |
|---|---|---|
| Freshness | Latest 150 notices, calendars, transport, programmes, rules page (hash) | ✅ nothing newer; V3.1 still the current CSE routine |
| Parser, same version | My parser on **V1.1** vs the independent student parse (also V1.1) | ✅ 1,813/1,813 identical — the earlier gap was version drift, not parsing |
| Parser on other versions | V1.1 and V2.2 | 1 and 5 cells flagged, all defects in DIU's files (`#ERROR!`, truncated `CSE114(RE_A1(1.`, `BOOKRKR`) — flagged, never guessed |
| Every figure in this README | Recomputed from the data files (37 figures) | ✅ 36 · ❌ 1 fixed: credit-tagged retake sections are **67**, not 57 (10 tags malformed) |
| §14 proposed profile | `tsc --strict` against the real `GradeScale`/`UniversityProfile`/`FeatureId` types | ✅ type-checks (with `id` pending `UniversityId`) |
| §14 behaviour | Run through `gradePointOn` / `isRepeatableGrade` + mark cutoffs | ✅ A=3.75, C-/D+ not awarded, I=null, B not repeatable, B- repeatable, 80→A+, 79.9→A, 40→D, 39.9→F |
| Student email domain | DIU site search, IT section, FAQ, BLC login | Still unnamed publicly — the one open blocker |
