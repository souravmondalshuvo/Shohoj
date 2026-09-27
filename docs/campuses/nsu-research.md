# NSU — what the legacy site needs, and what we know

Research for bringing North South University into the legacy (vanilla JS) site.
Gathered 2026-09-27. The structured result lives in
[`data/campuses/nsu/`](../../data/campuses/nsu/) — this file is the narrative:
how it was found, what it means for the code, and what is still unknown.

Every claim is tagged with where it came from:

- **[official]** — northsouth.edu, an NSU department site, or an NSU PDF
- **[3rd-party]** — a student tool or calculator site; treat as unverified
- **[derived]** — computed by us from an official dataset in `data/campuses/nsu/`
- **[unknown]** — looked for, not found; ask the registrar

Primary sources:
- *Academic Information and Policies 2026* (updated 19 Jul 2026) —
  https://www.northsouth.edu/newassets/images/Registrs%20Office/updated-19-07-2026-academic-information-and-policies.pdf
- Grading policy — https://www.northsouth.edu/academic/grading-policy.html
- Undergraduate programs — https://www.northsouth.edu/undergraduate-programs.html
- Fall 2026 academic calendar —
  https://www.northsouth.edu/newassets/images/Registrs%20Office/academic-calendar-fall-2026-16-sep-2026-1.pdf
- Bi-semester (BPharm / LLB) calendar —
  https://www.northsouth.edu/newassets/images/law/bi-semester-spring-2026.pdf
- Summer 2025 offered-course list (last public PDF) —
  https://www.northsouth.edu/newassets/images/IT/252-offered-courses-list-120525.pdf
- ECE department course pages — https://ece.northsouth.edu/courses-sitemap.xml

---

## 1. Grading (`js/core/grades.js`, `gpa-core.js`)

| Letter | Points | Marks |
|---|---|---|
| A | 4.0 | 93+ |
| A- | 3.7 | 90–92 |
| B+ | 3.3 | 87–89 |
| B | 3.0 | 83–86 |
| B- | 2.7 | 80–82 |
| C+ | 2.3 | 77–79 |
| C | 2.0 | 73–76 |
| C- | 1.7 | 70–72 |
| D+ | 1.3 | 67–69 |
| D | 1.0 | 60–66 |
| F | 0.0 | <60 |

- **No A+ and no D-** [official]. Legacy `grades.js` has both (`A+`=4.00,
  `D-`=0.70) and must not offer them to an NSU student.
- **I** — must be replaced within one semester [official].
- **W** — does not affect GPA [official]. Whether it consumes an attempt: [unknown].
- **P** — not mentioned on the grading page or in the 2026 policy book [unknown].
- **F** — earns no graduation credit [official].
- Only A…F letters count toward credits attempted [3rd-party, consistent with official].
- Transferred credits and grades are **not** included in the NSU CGPA [official].

Matches `src/core/university.ts` NSU profile already — see §14 for what to change there.

## 2. Retake / repeat

- May retake a course graded **B or lower** (B inclusive) [official].
- **Best grade counts**, unconditionally — no start-term cutoff like BRACU's [official].
- **Up to 3 retakes normally; a 4th needs Vice-Chancellor approval** [official, 2026
  policy §"Retake Policy"]. This resolves the open `maxRetakes` question in
  `university.ts` — it is university-wide, not ECE-only.
- On the transcript the earlier attempt stays visible and scores 0.0 in the CGPA
  [3rd-party].

## 3. Standing, probation, honours (`js/core/milestones.js`)

Legacy tiers are BRACU's (Perfect 3.97 / Higher Distinction 3.65 / Distinction 3.50 /
Good 3.00 / Satisfactory 2.50 / Needs Improvement 2.00). NSU's are different:

- **Good standing: CGPA ≥ 2.00** [official].
- **Probation: CGPA < 2.00.** Three terms to get back to 2.00; dismissed ("excluded")
  in the fourth. No fresh start, no readmission after exclusion [official].
- **Minimum CGPA to graduate: 2.00** [3rd-party, consistent with good standing].
- **Class division** on the grading page: First ≥ 3.00, Second 2.50–2.99,
  Third 2.00–2.49 [official].
- **Latin honours:** Summa ≥ 3.80, Magna 3.65–3.79, Cum Laude 3.50–3.64, undergrad
  only [3rd-party — calculator sites and the RDS Chrome extension agree, but no NSU
  page found]. Needs registrar confirmation before shipping.
- **Dean's list** criteria [unknown].
- **Class standing by credits earned:** Freshman 0–30, Sophomore 31–60, Junior 61–90,
  Senior 90+ [official].

## 4. Credit load

- **Full-time = at least 12 credits per trimester** (15 per semester for bi-semester
  programs) [official].
- A normal 120-credit program is designed for 4 years at that load [official].
- **Overload** needs written permission, but **no university-wide maximum is
  published** [unknown]. Keep `creditLoad` absent, as `university.ts` does today.
- **BBA only:** 2 to 5 courses (6 to 15 credits) per term, from the December 2025
  BBA handbook [official]. Stored on the BBA program, not the campus.

## 5. Other academic rules that affect planning

- All required **100-level courses must be passed by the 3rd term**, or no
  higher-level registration (English excepted). A required 100-level course failed
  twice blocks all other registration except English [official].
- **ENG105 must be passed by the 4th term** [official].
- **Course exclusion:** after completing 80% of required credits, a student may
  exclude non-core courses from the record, but not to escape probation, change
  department or get financial aid [official]. A planner/simulator could model this.
- **Change of program:** normally CGPA 3.00 within 3 terms and 27 credits
  completed [official].
- **Internship:** at least 100 credits completed [official].
- **Degree deadline:** 6 years from enrolment [official].
- **Credit transfer:** up to 50%, only grades C or above, not in the CGPA [official].

## 6. Calendar and terms (`departments.js` `seasons`, `semesterIdentity.js`)

- **Trimester programs (most):** Spring Jan–Apr, Summer May–Aug, Fall Sep–Dec [official].
- **Bi-semester programs: BPharm, MPharm, LLB, LLM** — Spring Jan–Jun,
  **Summer Jul–Dec** [official]. Their GED courses still follow the trimester calendar.
  ⚠ "Summer" means a different half-year here, so it can't share BRACU's
  PHR/LAW two-season arithmetic unchanged.
- **Term codes:** `YY` + `1|2|3` → 252 = Summer 2025, 261 = Spring 2026,
  263 = Fall 2026 [derived from NSU URLs].
- **Fall 2026 (now):** classes began 20 Sep; W deadline 3 Nov; last class days
  15 Dec (ST), 19 Dec (RA), 20 Dec (MW); finals 22–28 Dec; grades due 31 Dec [official].

## 7. Programs and total credits (`departments.js`)

From the official undergraduate-programs index [official]:

| School | Program | Credits |
|---|---|---|
| Engineering & Physical Sciences | Architecture (BArch) | 170 |
| | Civil & Environmental Eng. (CEE) | 149 |
| | Computer Science & Eng. (CSE) | 130 |
| | Electrical & Electronic Eng. (EEE) | 130 |
| | Electronic & Telecom Eng. (ETE) | 130 |
| Health & Life Sciences | Biochemistry & Biotechnology | 120 |
| | Environmental Science & Management | 130 |
| | Microbiology | 120 |
| | Public Health | 130 |
| | BPharm Professional | 160 |
| Business & Economics | BBA (General + majors) | 130 ⚠ (index: 120) |
| | BS Economics | 120 |
| Humanities & Social Sciences | BA English | 123 |
| | LLB (Hons) | 130 |
| | BSS Media, Communication & Journalism | 129 |

**CSE — resolved, 130.** The university's CSE page still shows the September 2012
flowchart for a 134-credit curriculum; the ECE department's own program page
describes the 130-credit curriculum (UGC-approved March 2015, effective Spring
2018), matching the index. The 134 is kept as a recorded conflict.

⚠ **BBA — 130, not 120.** The December 2025 BBA handbook requires 130 credits (127
or 124 when ENG102/BUS112 were waived at admission; 139 for a dual major) and
lists nine majors — ACT, ECO, FIN, HRM, INB, MGT, MIS, MKT, SCM. The index's 120
and its Entrepreneurship major are kept as recorded conflicts. Graduation also
needs a GPA of 2.0 in the School and BBA cores and 2.5 in the major [official].

**Semester-by-semester plans** (what `departments.js` `presets` holds for BRACU)
are now loaded for **CSE, EEE, CEE, BPharm and LLB** — each one totals its
program's published credits exactly [official]. See §16 for the rest.

**Minors:** CSE's trail list names minors in BBA, Economics, English, Environmental
Studies and Mathematics; their requirements are not published [unknown].

## 8. Course catalogue and prerequisites (`catalog.js`, `prereq.js`)

- `data/campuses/nsu/courses.json` — **1,018 courses** with title and credits, from
  the Summer and Fall 2025 offered lists, the bi-semester list, the BBA handbook,
  the BPharm, LLB, CSE and CEE curricula and the ECE course pages; the newest
  offered list wins, and each record cites its source [derived]. Fall 2025 also
  names the offering department, stored when only one department offers a course.
  It is courses *offered or documented*, not yet the full catalogue.
- Codes fit legacy's `/^[A-Z]{2,4}\d{3}[A-Z]?$/`; labs use an `L` suffix
  (`CSE115L`), two-part projects use `A`/`B` (`CSE499A`). Graduate codes can have
  four digits (`CE6207`) and don't match, which is fine for undergrads.
- **Credit values the calculator must accept:** 0, 1, 1.5, 2, 3, 4, 4.5, 6. Several
  labs are **0 credits** (credit bundled into the lecture, e.g. `CSE311L`) and
  architecture studios are 4.5 / 6.
- **Credits depend on the program for a few courses.** MAT116 is 3 credits on the
  offered lists but non-credit in the CSE, EEE and CEE curricula (like BRACU's
  MAT092); CEE also takes CEE100 and ENG102 non-credit; CSE225L, EEE312L and
  EEE362L are "integrated" 0-credit labs in their curricula but 1 credit on the
  Fall 2025 list. The plans record each with a note [official].
- `data/campuses/nsu/prerequisites.json` — **318 rules** from four sources: the ECE
  course pages (CSE/EEE/ETE side), the BBA handbook, the BPharm curriculum and the
  CEE course mapping [official]. A course can have rules from several sources,
  and curricula scope theirs to their program; nothing is merged. Rules include
  credit thresholds ("Completion of 100 credits"), a CGPA threshold (BUS499 needs
  3.30), "or consent of instructor" and alternatives (`EEE 141/ETE 141`). Check
  whether `prereq.js` can express these. The ECE site's credits are partly stale
  (PHY107/108 and CHE101 listed as 4, offered as 3 + a separate 1-credit lab).
- **Degree requirement groups** (`requirements.json`) for BBA (shared core plus
  each of nine majors), LLB, CSE and BPharm total their programs exactly; CEE has
  only its elective group [official].
- The only university-wide catalogue is 2015–16 (Google Drive, linked from
  https://www.northsouth.edu/newsletter/nsu-catalog.html) — too old to use.

## 9. Sign-in and identity (`js/auth/firebase.js`)

- Domain is **`northsouth.edu`** for students **and** faculty/staff, both
  `firstname.lastname@` [official, NSU email request form]. **There is no student
  subdomain**, so sign-in can't tell a student from a lecturer. That matters for
  reviews: a faculty member could sign in and review themselves or colleagues.
- Legacy currently hard-rejects anything but `@g.bracu.ac.bd`, in three places
  (`js/auth/firebase.js:467`, `:762` Google `hd` hint, `:819`). NSU needs all three.
- Student IDs are 10-digit numbers (e.g. RDS pages say "Grade History of `<id>`")
  [3rd-party].

## 10. Transcript import (`js/import/transcript-core.js`)

Legacy parses BRACU's PDF grade sheet (`skipRe` matches "BRAC University", "Kha 224",
"Merul"…). NSU won't parse with it.

The NSU equivalent is the RDS **grade history page** (`rds3.northsouth.edu/students/grade_history`),
an HTML table with columns [3rd-party, from the MIT-licensed
https://github.com/Shadhin-f/what-if-cgpa-planner]:

`Semester Name | Semester Year | Course Code | Course Credit | Course Title | Course Grade | Cr.Count`

- A semester's first row carries the name/year; following rows leave them blank.
- A `summary-row` after each semester holds `TGPA: x.xx` and `CGPA: x.xx`.
- `Cr.Count` is the credit that counts (a superseded retake shows reduced credit).

This behind-login page fits the **paste-import model** Routine already uses for
CONNECT: the student copies their own page and pastes it, and we never touch their
credentials. Official transcripts are printed on security paper and aren't a
student-downloadable PDF.

## 11. Faculty initials (`js/core/faculty.js`, `reviews.js`) — ⚠ bug for NSU

NSU initials are **case-sensitive and can contain digits**: `NvA`, `MhMR`, `SHA1`,
`MMS4`. Summer 2025 had 759 distinct initials [derived].

Legacy `normalizeInitials` does `toUpperCase().replace(/[^A-Z]/g,'')`
(`js/core/faculty.js:15`), and `reviews.js:15` uppercases too. Under that rule
**72 groups / 152 different NSU faculty merge into one** — e.g. `MMS1`/`MMS3`/`MMS4`/`MMs1`,
`HMM`/`HMM1`/`Hmm`, `SNE`/`Sne` [derived]. NSU needs case- and digit-preserving
initials (or campus-prefixed keys) before reviews can go live.

No public list maps NSU initials to names [unknown]. The per-term section list is
the only public source of which initials teach which course.

## 12. Sections, seats, routine, free rooms (`connectFeed*.js`, `seatStatus.js`, `freeRooms.js`, `routine*.js`)

- **Live offered-course page** (section, faculty, time, room, seats available):
  https://rds4.northsouth.ac.bd/offered_courses. It is behind a **Cloudflare managed
  challenge** (`403 Just a moment…` to non-browser clients), so a Worker cron
  **cannot** read it, and bypassing bot protection is off the table.
- The old public `rds2…/showofferedcourses` now just redirects to a notice.
- NSU published the list as a **PDF each term up to Fall 2025** (the Fall 2025 file
  is misleadingly named `252-offered-courses-list-100925.pdf`; every row says term
  253). Since Spring 2026 the notice pages only link to `rds4`.
- So: no public feed today. Options, in order of realism:
  1. **Student paste** of the rds4 page, as CONNECT paste works for BRACU.
  2. Ask NSU IT for an official feed or permission.
  3. A static per-term snapshot — timetables and free rooms work, **live seat counts don't**.
- **Format** (from the PDF, same columns rds4 shows):
  `Course Code | Title | Credit | Section | Faculty | Time | Room | Seat Capacity`
  → `sections/252-trimester.json` (Summer 2025, 2,845 undergraduate sections),
  `sections/253-trimester.json` (Fall 2025, 3,212, with the offering department per
  row; 262 internships and theses have no fixed schedule) and
  `sections/252-bisemester.json` (BPharm, LLB and LLM, 363) [derived]. One Fall 2025
  row had an impossible time (ARC273 section 2, "11:40 AM - 01:40 AM"); it is
  corrected to 13:40 with a note saying what was printed.
- **Day codes** [official, printed on every calendar]: `ST` = Sun+Tue, `MW` = Mon+Wed,
  `RA` = Thu+Sat; singles `S M T W R A F` (F = Friday, grad/evening only).
  Combos `STR`, `STWR` exist. Legacy's week (Sat…Fri) already covers it.
- **Standard slots:** 08:00–09:30, 09:40–11:10, 11:20–12:50, 13:00–14:30,
  14:40–16:10, 16:20–17:50, 18:00–19:30; labs/studios run 3-hour blocks; evening
  grad classes 19:00–22:10 [derived].
- **Rooms:** 206 in Summer 2025 and 196 in Fall 2025 — the `rooms` view in the campus database. Buildings:
  **NAC** (North Academic, business/arts), **SAC** (South Academic,
  engineering/life sciences), **LIB** (library), **OAT** (lecture hall / Open Air
  Theatre block), plus named rooms (`TV STUDIO`, `Upper Plaza`) [official + derived].
  Room codes look like `NAC206`, `SAC313` — fine for Lost & Found keys.

## 13. Campus life (`bus`, `cafeteria`)

- **Bus** [official, Fall 2025 — re-check for Fall 2026]: portal
  https://transport.northsouth.edu/, Tk 100 one-way / Tk 200 round trip. 6 routes —
  Uttara, Mirpur, Mohammadpur, Dhanmondi, Azimpur, Khilgaon — with named stops.
  Arrive NSU 07:40 and 14:20 (all routes), 17:45 (Uttara/Mirpur/Mohammadpur/Dhanmondi),
  18:45 (Azimpur/Khilgaon). Depart NSU 10:00 and 14:40 (all), 18:30 (Uttara/Mirpur/
  Mohammadpur/Dhanmondi), 22:20 (Mirpur/Mohammadpur). Source:
  https://www.northsouth.edu/nsu-announcements/nsu-bus-service.html
- **Cafeteria:** one large cafeteria (Bangladeshi, Chinese, fast food); no hours or
  menu published [official / unknown].
- Campus: Bashundhara R/A, 5.5 acres; medical centre SAC 4th floor [official].

## 14. What to change in `src/core/university.ts` (NSU profile)

- `maxRetakes: 3` — now confirmed university-wide (4th needs VC approval).
- Comments on P and W stay open; the rest of the scale is confirmed again by the 2026 book.
- `features` can't gain seats/routine/rooms (no feed); `bus` could, from §13.

## 15. Questions for the NSU registrar / ECE

1. Is there a **P** grade? Does a **W** use up one of the 3 retake attempts?
2. Maximum credits per trimester before an overload is needed (outside BBA's 15)?
3. BBA: is the programs index's **120 credits** and **Entrepreneurship major** out of
   date, as the December 2025 handbook suggests?
4. Official **Latin honours** thresholds and **Dean's list** criteria?
5. Can Shohoj get **read access to the offered-course data** (or permission to use it)?
6. Is there an official **initials → faculty name** list?
7. Current curricula for ARC, ETE, BBT, ESM, MIC, PBH, ECO, ENG and MCJ (see §16)?

## 16. Coverage of the campus database (updated 2026-09-28)

**Loaded** (each from a current, official source):

| Data | What |
|---|---|
| Sections | Summer 2025, Fall 2025, bi-semester Summer 2025 |
| Calendars | Spring, Summer and Fall 2026 (trimester); Spring and Summer 2026 (bi-semester) |
| Semester plans | CSE, EEE (130, effective Spring 2018), CEE (149), BPharm (160), LLB (130, from Spring 2025) |
| Requirement groups | BBA + nine majors (Dec 2025 handbook), LLB, CSE, BPharm; CEE electives only |
| Prerequisites | ECE course pages, BBA handbook, BPharm curriculum, CEE course mapping |

**Found but left out on purpose** — each is undated or predates the current
curriculum, and loading it as a plan would steer students wrong:

| Source | Why not |
|---|---|
| BS Economics sequence (`BS_ECO_Sequence-of-Courses.pdf`) | Undated; totals 125 credits against the index's 120 and uses retired codes (MIS105 "Int. to Computers") |
| BA English flow chart (`BA-ENG-Flow-chart.pdf`) | Undated; totals 120 against the index's 123 |
| Environmental Management major map (`DESM_-Course-sequence_BS_ENV_Mgt..pdf`) | Undated major map for the older "Environmental Management" degree |
| Biochemistry & Biotechnology sequences (`BS-in-Biochemistry-and-Biotechnology(1).pdf`, `BBT ONLY V2 .pdf`) | Undated / 2012–2017; retired codes (STA172, MIS105) |
| BS Microbiology curriculum (`BS_MIC_.pdf`) | Undated course descriptions; only five prerequisite statements |
| EEE and ETE 2015 curriculum PDFs | Superseded by the ECE department's Spring 2018 plans |
| CEE curriculum approved in 2004 (`CEED-Course-Mapping.pdf`) | Superseded by the 149-credit mapping |
| BSCSE September 2012 flowchart (134 credits) | Superseded; kept only as the recorded CSE conflict |
| MPharm courses (`PHR5001`…) on the bi-semester list | Graduate, four-digit codes |

**Still missing, and no public source found:** plans and requirement groups for
ARC, ETE, BBT, ESM, MIC, PBH, ECO, ENG and MCJ; prerequisites outside ECE, BBA,
BPharm and CEE; minors; any Spring 2026 or later section list (rds4 only); live
seat counts; faculty names for initials.
