<p align="center">
  <img src="assets/shohoj-logo.png" alt="Shohoj Logo" width="80" />
</p>

<h1 align="center">সহজ — Shohoj</h1>
<p align="center"><strong>University life, made simple.</strong></p>

<p align="center">
  <a href="https://souravmondalshuvo.github.io/Shohoj">
    <img src="https://img.shields.io/badge/🔗_Live_Site-Shohoj-2ECC71?style=for-the-badge" alt="Live Site" />
  </a>
</p>

<p align="center">
  <img src="https://github.com/souravmondalshuvo/Shohoj/actions/workflows/ci.yml/badge.svg" alt="CI" />
  <img src="https://img.shields.io/badge/Status-v0.5.0-2ECC71?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/Stack-TypeScript%20·%20React%20·%20Firebase%20·%20Cloudflare-3498DB?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/University-BRAC%20University-F39C12?style=flat-square" alt="University" />
  <img src="https://img.shields.io/badge/License-MIT-2ECC71?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Courses-857%20in%20Catalog-E67E22?style=flat-square" alt="Courses" />
</p>

---

<p align="center">
  <img src="assets/screenshots/hero-preview.png" alt="Shohoj — CGPA Calculator Preview" width="800" />
</p>

---

## Recruiter Demo Path

1. Open the [live site](https://souravmondalshuvo.github.io/Shohoj)
2. Click "Try Demo Mode"
3. Check CGPA Calculator
4. Open Semester Planner
5. View Degree Progress
6. Explore Faculty Reviews / Past Papers
7. Visit the standalone [`/campus/`](https://souravmondalshuvo.github.io/Shohoj/campus/), [`/bus/`](https://souravmondalshuvo.github.io/Shohoj/bus/) and [`/lost-found/`](https://souravmondalshuvo.github.io/Shohoj/lost-found/) pages
8. Review Architecture, Security, and Deployment docs

## My Role

Solo developer. I built and maintain the frontend, the Firebase auth and
Firestore data model, the security rules, the Cloudflare Worker, the CI/CD
pipeline, the test suites, the documentation, and the product design.

## Current status

Shohoj is a live, single-maintainer project. An honest snapshot of what is
shipping versus in progress:

- **Two frontends coexist, on purpose.** The production app people use today is
  a vanilla-JS application bundled by `build3.py` into `shohoj.html`. A typed
  **React + TypeScript + React Router** rewrite lives alongside it under `src/`
  and is deployed to a beta path (`/app/`). The React shell has reached parity
  on every route but is **not yet the default root** — the cutover is a
  deliberate, still-pending step (see [docs/architecture/](docs/architecture/)).
- **Three features are published as standalone pages.** `/campus/`, `/bus/` and
  `/lost-found/` build from the same typed `src/core` logic through
  `vite.pages.config.js` and ship on the public site ahead of the cutover, so
  they are live without waiting on it.
- **The in-app Assistant is live** and runs on Google's free Gemini tier by
  default, with OpenAI and Anthropic wired as fallbacks for whoever wants to
  fund one. It is signed-in only, bounded to degree questions, and hidden
  outright when the Worker reports no provider is configured (`GET /ready`),
  rather than offering a button that cannot answer.
- **Multi-campus works on the shell, not on the shipping root.** The React
  shell resolves a student's campus from their email and applies that campus's
  grading scale, retake/repeat policy and feature set throughout — so an NSU
  transcript is scored on NSU's rules, and tabs a campus has no data for do not
  render. The vanilla app at the site root is still BRACU-only, which is one
  more reason the cutover matters. See [Multi-University Vision](#multi-university-vision).
- **Some features depend on external data feeds** (live seat status, free rooms,
  the campus map's room status) that are third-party and best-effort.
- **No claim of a user base.** This is a portfolio-grade project built for
  BRACU students; adoption numbers are not tracked or advertised.

See [Features — What's Live Today](#features--whats-live-today) and the [Roadmap](#roadmap) below for the per-feature breakdown.

---

## Documentation

| Doc | What's in it |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, source layout, build pipeline, data flow |
| [docs/CASE_STUDY.md](docs/CASE_STUDY.md) | Problem, solution, engineering challenges, decisions, next steps |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentication, authorization, App Check, threat model |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What's collected, where it lives, how to delete it |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Required secrets, CI/CD pipeline, local dev, Worker + Firestore deploy, admin claim |
| [docs/ROLLBACK.md](docs/ROLLBACK.md) | Per-system rollback: Pages, Worker, Firestore rules, and user data |
| [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) | Local / staging / production separation and configuration surface |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | The logging foundation that exists today, and future metrics |
| [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Firestore/R2 backup guidance, restore-into-staging, RPO/RTO |
| [docs/GITHUB_SECURITY_SETTINGS.md](docs/GITHUB_SECURITY_SETTINGS.md) | Admin checklist: private reporting, scanning, branch ruleset, env, secrets |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Step-by-step release process and pre-flight verification |
| [docs/BETA_TEST_PLAN.md](docs/BETA_TEST_PLAN.md) | Structured beta test plan and scenario coverage |
| [docs/FULL_REACT_TYPESCRIPT_MIGRATION.md](docs/FULL_REACT_TYPESCRIPT_MIGRATION.md) | The full React/TypeScript migration plan and phase log |
| [docs/REACT_VITE_MIGRATION.md](docs/REACT_VITE_MIGRATION.md) | The earlier React island / Vite migration notes |
| [docs/architecture/](docs/architecture/) | Migration roadmap, current state, target architecture, risk register, test matrix, ADRs |
| [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md) | Script + shot-by-shot storyboard for the 55-second walkthrough (video pending) |
| [CHANGELOG.md](CHANGELOG.md) | Version history and notable changes |
| Release notes | [v0.3.0](docs/RELEASE_NOTES_v0.3.0.md) · [v0.4.0](docs/RELEASE_NOTES_v0.4.0.md) · [v0.5.0](docs/RELEASE_NOTES_v0.5.0.md) |

---

## Product Screenshots

| Demo Mode | Semester Planner |
|-----------|------------------|
| ![Demo mode](assets/screenshots/demo-mode.png) | ![Semester planner](assets/screenshots/semester-planner.png) |

| Calculator | Transcript Import |
|------------|-------------------|
| ![CGPA calculator](assets/screenshots/calculator.png) | ![Transcript import](assets/screenshots/transcript-import.png) |

| Course Search | Trend Chart |
|---------------|-------------|
| ![Course autocomplete](assets/screenshots/autocomplete.png) | ![Trend chart](assets/screenshots/trend-chart.png) |

| Degree Progress | Faculty Reviews |
|-----------------|-----------------|
| ![Degree progress](assets/screenshots/degree-progress.png) | ![Faculty reviews](assets/screenshots/faculty-reviews.png) |

| Past Papers | Admin Dashboard |
|-------------|-----------------|
| ![Past papers](assets/screenshots/past-papers.png) | ![Admin dashboard](assets/screenshots/admin-dashboard.png) |

<p align="center">
  <strong>Mobile View</strong><br>
  <img src="assets/screenshots/mobile-view.png" alt="Shohoj mobile view" width="320" />
</p>

> Screenshots for the newer features (Assistant, Campus Map, Lost & Found, Bus
> Routes, Next Registration, marks tracker) are not captured yet — the [live
> site](https://souravmondalshuvo.github.io/Shohoj) is the current reference for
> those.

---

## What is Shohoj?

**Shohoj (সহজ)** means _"simple"_ in Bengali.

It is a university life platform built by a BRAC University student, for every university student in Bangladesh. One login. One place. Your entire university life.

Shohoj starts with the tool every student needs most — a **smart CGPA calculator** that understands BRACU's exact grading system, reads your official transcript PDF, syncs your data to the cloud, and helps you plan your path to graduation.

> **[Try it live →](https://souravmondalshuvo.github.io/Shohoj)**

---

## Why This Exists

I am **Sourav Mondal Shuvo**, a CSE undergraduate at BRAC University.

Every semester I watched students — including myself — struggle with the same problems. Manual GPA calculations on phone calculators. No idea how retakes affect CGPA. Going into advising week with no plan. Important information buried in Facebook groups and word of mouth.

Nobody was building a solution. So I decided to build it myself.

---

## Features — What's Live Today

### 🤖 Shohoj Assistant (New)

Ask a question in plain language and get an answer computed from **your own saved data**, using the same grading rules and prerequisite logic the calculator already applies — "what GPA do I need for a 3.5?", "can I take CSE370 next semester?", "are there seats in MAT216?", "which rooms are free right now?"

- **Seven tools, nothing more** — the model can call `get_cgpa_scenario`, `check_prerequisite`, `check_seat_status`, `get_routine`, `get_degree_progress`, `get_faculty_rating` and `find_free_rooms`. It reads your data; it cannot write to it, and it cannot read anyone else's
- **Bounded to what Shohoj is for** — courses, grades, CGPA, prerequisites, registration, seats, routines, free rooms, degree progress, and using the app. Anything else gets a one-line decline rather than an off-topic answer
- **Free-tier by default, with fallbacks** — runs on Google's Gemini free tier so the feature costs nothing to keep on; if that quota runs out, a configured paid provider (OpenAI, then Anthropic) picks the question up. Same system prompt, same tools, same data rules on every provider
- **A spending ceiling** — estimated spend accumulates per calendar month and the assistant declines once it hits the configured cap, rather than quietly running up a bill on one person's key. The estimate is deliberately pessimistic, and a ceiling of zero is a clean off switch
- **Your chat never leaves your browser** — it survives switching tabs, but nothing is stored on any server and closing the tab clears it. Unsaved edits are synced before the first question so it answers on your current grades
- **Signed-out users see no launcher at all**, and neither does anyone when no provider is configured

Available from the launcher on the main site and as a drawer on the React Router shell.

### 🗓️ Routine Builder

Build a clash-free weekly class schedule from the live BRACU section feed, then export or share it.

- **Auto-suggest** — generates valid section combinations for your chosen courses, ranked to prefer **compact days** (a `gapWeight` factor penalizes idle time between same-day classes); each suggestion shows its total gap time
- **Conflict detection** — overlapping sections are split and flagged in a weekly grid; faculty ratings surface inline on each section
- **Calendar export** — download an `.ics` with class + exam reminders, or share a scannable QR / link of your routine
- **Time-of-day & day-off filters** — narrow sections to your availability before building

### 🪑 Seat Status & Seat-Drop Alerts

Live seat availability across every section, with a watchlist that tells you the moment a full section opens.

- **Live seat lookup** — capacity / consumed / room / schedule pulled from the public CONNECT feed (one cached fetch serves the whole app)
- **In-browser alerts** — watch a full section and get a browser notification + in-app toast when a seat frees up while Shohoj is open
- **Email alerts** — a cron-triggered Cloudflare Worker polls the feed centrally and emails you on a real full→open transition, even with Shohoj closed (requires an operator-configured verified email sender; fails safe and logs when unconfigured)

### 🏫 Free Rooms

Find empty classrooms right now or across the week, computed from the live timetable.

- **All-rooms status board** — every room labelled free / in class / in lab, with its room type
- **Weekly availability** — click a room to see its full-week free/busy grid in a modal
- **Feed-aware** — derived purely from the scheduled timetable; no ad-hoc booking data is invented

### 🗺️ Campus Map (New)

A procedural 3D campus tower at [`/campus/`](https://souravmondalshuvo.github.io/Shohoj/campus/) that renders live room free/busy status straight from the class schedule — the same engine behind the Free Rooms tab.

- **Live room status in three dimensions** — floors and rooms light by occupancy, so "where is there a free room right now" is a glance rather than a scan
- **Presentation-only 3D** — the Three.js canvas (light rig, glass envelope, motion) is an enhancement over the accessible underlying room data, never the only way to read it
- **Standalone page** — published on the public site through the consolidated multi-page build, ahead of the shell cutover

### 🧳 Lost & Found (New)

A campus lost-and-found board at [`/lost-found/`](https://souravmondalshuvo.github.io/Shohoj/lost-found/), built on a **no-contact model**.

- **Contact details stay private** — they are never rendered on the board. A claim is relayed to the poster **by email through the Cloudflare Worker**, so neither side has to publish an address to a public page
- **Post lost or found items** with type, title, description, a location hint and a room code
- **Admin moderation** — the admin dashboard has a Lost & Found section for removing abusive or resolved posts

### 🚌 Bus Routes & Timings (New)

Shuttle routes and schedules at [`/bus/`](https://souravmondalshuvo.github.io/Shohoj/bus/), transcribed from the official BRACU transport brochure — available both as a shell route and as a standalone page.

### 🍽️ Cafeteria Guide (New)

A directory of on-campus food outlets on the shell, deliberately conservative about what it claims.

- **No menus, no prices** — those change constantly and a stale price is worse than no price
- **Hours carry a `verified` flag** — until an outlet's hours are confirmed, the open/closed-now badge is suppressed and the card says "Hours not yet confirmed" rather than asserting a status from placeholder data
- **The only live element** is the open/closed-now badge, derived from your device clock — no claimed live feed

### 👤 Profile

A signed-in student's account hub — one home for data otherwise scattered across tabs. Gated on the existing Firebase auth; signed-out users see a sign-in prompt.

- **Account header** — name, BRACU email, safe avatar, sign out
- **Seat watchlist + email-alert toggle** — see what you're watching and arm/pause email alerts independently
- **Semester history** — each semester's GPA charted from the transcript you already imported (nothing re-uploaded), with a semester that has nothing graded saying so rather than being drawn as 0.00
- **Exam crunch** — follows the calendar, opening on whichever exam period is still ahead and leading with the countdown to your next exam; exams already sat read as **done** rather than pending, and dates are compared in campus time
- **Your reviews** — read locally through a privacy-preserving local receipt, so no UID-indexed query can de-anonymize a review
- **Hard non-goal** — Shohoj never collects or stores BRACU CONNECT credentials; there is no such field anywhere

### 🎯 Next Registration (New)

On `/profile/`, what you can actually sign up for next semester — computed by joining the section feed's prerequisite rules against your imported grade sheet, instead of leaving you to cross-reference a transcript with a curriculum PDF.

- **Unlocked now** — everything on offer whose prerequisites you have met
- **One course away** — courses that open the moment you pass one specific course, listed only when that course is itself takeable right now, so it is a real next step rather than a different wall
- **Highest-leverage course** — the single thing you can take that opens the most further courses, ranked **within your own program's curriculum plus the subjects you have actually taken**, so "opens N more" means courses *you* would take (with **Show all departments** to lift the filter)
- **Compound rules read properly** — `(PHY111 AND MAT110) OR (MAT105 AND PHY110)` needs either pair, not all four
- **Grades count the way BRACU counts them** — any passing letter or a P clears a prerequisite; F, F(NT), W and I don't, so a failed course correctly reappears as the thing to retake
- **Never falsely ineligible** — a rule Shohoj can't parse is treated as no prerequisite, the course stays listed, and the page tells you how many it couldn't read so you can check with your advisor

### 📊 Per-Course Marks Tracker (New)

Every other projection in Shohoj is denominated in "GPA across your remaining credits", which is true and not something you can act on in week 9. Running-semester course rows carry a **📊** button that answers the question students actually ask each other.

- **Enter components off your syllabus** — midterm, quizzes, assignment: weight, marks scored, marks available
- **What you're on pace for** — marks in hand, the projected letter, and the honest floor and ceiling (the best and worst letter still arithmetically possible)
- **What you need on what's left** — for every target still reachable, e.g. "A- needs 91.7% of the remaining 60%". A target you hold no matter what is reported as **secured** (meaning secured under a zero on everything remaining); a target that has become impossible disappears rather than showing a number above 100
- **Half-known syllabuses are the normal case** — if your weights don't total 100% you still get every figure, with a note saying which part of the course they describe
- **Opt-in to your CGPA** — a button applies the pace letter to the course when you want it counted, and clearing the last component leaves your data exactly as it was
- Available on both the classic calculator and the React Router shell, computed by one pure, unit-tested model

### 📅 Semester Planner

Plan your next semester with prerequisite-aware recommendations. Shohoj reads your completed courses and surfaces what you can take now, what is still locked behind missing prerequisites, and what will unlock the most downstream courses if you take it next.

- **Prerequisite checker** — validates every planned course against BRACU's prereq rules, flags hard-prereq misses as blockers and soft-prereq misses as warnings
- **Prereq tree view** — expandable dependency graph for any course, so you can see exactly what you need to clear before it
- **Relevance ranking** — available courses are sorted by department relevance, then by how many future courses they unlock
- **Credit load validation** — enforces the 9/12/15-credit BRACU policy and flags chairman-permission zones
- **CGPA impact preview** — see the projected CGPA if your plan lands a given grade across the board
- **Start Semester** — promote a finished plan directly into a running semester in the Calculator with one click

<p align="center">
  <img src="assets/screenshots/semester-planner.png" alt="Semester Planner" width="700" />
</p>

### 🗺️ Course Difficulty Map

A bird's-eye view of how hard each course actually is, based on real student reviews. Aggregates difficulty and workload ratings across the whole review corpus and surfaces them as a sortable, filterable card grid.

- **Aggregate scores** — every course shows mean difficulty and workload pulled from the live review corpus (minimum 3 reviews to appear)
- **Difficulty tags** — courses are auto-labelled Moderate / Challenging / Hard based on their score, with color-coded bars
- **Department filter** — pill-style toggles to narrow the grid to a single department or browse the full catalog
- **Sort by code, difficulty, or workload** — flip between alphabetical course code, hardest-first, or heaviest-workload-first ordering
- **One-click drill-down** — tapping a card jumps straight to the per-course review panel for that course

### ⭐ Faculty Reviews

Pseudonymous faculty ratings from real students — stored in Firestore, gated behind university Google sign-in and scoped to your own campus. The live corpus is BRACU's.

- **5-dimension ratings** — Teaching Quality, Marking Fairness, Behavior & Attitude, Course Difficulty, Workload
- **Pseudonymous to other users** — the review document body contains no user identifier. Each review's Firestore doc ID is derived from a deterministic SHA-256 hash of `uid + faculty + course`, so the same user's reviews for different courses don't share a visible hash
- **One immutable review per user per faculty-course pair** — deterministic doc IDs enforce one public review slot per user and pair. Once submitted, the client cannot edit or overwrite it; duplicate attempts are rejected and the existing review is shown read-only.
- **Per-course panel** — click the ⭐ on any planner course row to see aggregate ratings for every faculty who taught that course, plus sample review text
- **Reviews directory** — search by course code or faculty initials to browse the review corpus (paginated)
- **In-transcript rating** — rate your faculty directly from the course row in the Calculator tab, no separate flow
- **Report for moderation** — every review surfaces a "Report" action that writes to an admin-only `reviewReports` collection, capped at one report per user per review
- **LLM-assisted seeding** — the `scripts/seed_reviews.py` pipeline bulk-imports LLM-processed community posts so the directory isn't empty on day one

<p align="center">
  <img src="assets/screenshots/faculty-reviews.png" alt="Faculty Reviews" width="700" />
</p>

#### Anonymity — what we do and don't claim

Review submissions go through the Cloudflare Worker (`POST /reviews`) before the Firestore document is written. That means:

- ✅ Your raw Firebase UID and email are **never** written into the review document.
- ✅ Reviews for different (faculty, course) pairs produce different hashes, so a third party who reads the collection **cannot trivially group all of your reviews together** by looking at a single field.
- ⚠️ Firebase **project administrators** (and anyone with admin SDK access) can audit Firestore logs and in principle correlate a write back to the authenticated session. "Anonymous to the public" ≠ "anonymous to the service operator."
- ⚠️ A determined adversary who already knows your UID could reconstruct your review hash for any (faculty, course) pair.

The Worker strips identity fields from the public review body before committing. Stronger operator-level anonymity would require a more advanced backend design with blind tokens or another unlinkable submission protocol.

### 📚 Past Papers & Notes

Campus-scoped resource sharing for course papers, notes, assignments, lab reports, and quizzes — BRACU's library today.

- **Course-code browsing** — search by catalog course code or browse recent approved uploads
- **Moderated uploads** — uploads start as `approved: false` and only become public after admin review
- **Secure file proxy** — file bodies live in Cloudflare R2 and are accessed only through a Firebase-token-verified Worker
- **Owner-scoped storage paths** — new uploads are stored under `papers/{COURSE}/{UPLOADER_UID}/{filename}`, and Firestore rules reject metadata that points at another user's upload path
- **Strict file allowlist** — uploads are capped at 10 MB and restricted to PDF, PNG, JPEG, WebP, or GIF
- **Content-type sniffing** — pre-migration R2 objects that lack a stored MIME type are identified by magic bytes in both the Worker and the client, so older PDFs and images still preview instead of rendering blank
- **Report flow** — every paper can be reported once per user for admin review

<p align="center">
  <img src="assets/screenshots/past-papers.png" alt="Past Papers and Notes" width="700" />
</p>

### 💬 Feedback Board

In-app product feedback for bugs, feature ideas, and general comments.

- **BRACU-gated feedback** — only signed-in BRACU users can submit or view feedback
- **Anonymous option** — feedback can omit the public UID field while still being rules-gated by the authenticated session
- **Private upvote state** — upvote documents are readable only by the voter or admins, so the UI shows your own vote state rather than exposing global voter data
- **Admin cleanup** — admin-claim moderators can remove abusive or duplicate feedback

### 🧑‍🤝‍🧑 Study Group Finder

Post a study group for a course, find classmates, and join open groups — all gated behind university Google sign-in, and scoped to your own campus.

- **Post & browse** — create a group with a course code, name, description, meeting mode (online / in-person / hybrid), schedule, capacity, and a group-chat invite link; browse and filter the board by course code or mode
- **Two-tier connect** — the contact link is the public connect path (visible to every BRACU user), while the member email roster is **member-only**: you join to see who's in, and to be seen, so emails stay opt-in
- **Join / leave** — one tap to join or leave; each membership doc pins your own verified BRACU email, so joining can never publish someone else's address
- **Immutable once posted** — group docs can't be edited after creation (no bait-and-switch on a joined roster); creators can delete their own group, admins can delete any
- **Report flow** — every group has a Report action writing to an admin-only `studyGroupReports` queue, capped at one report per user per group
- **Hard non-goal** — Shohoj never collects BRACU CONNECT credentials; the only contact field is a user-supplied public chat link

### 🛡️ Admin Dashboard

A separate admin shell at `/admin/` for moderation and audit work.

- **Custom-claim access** — only Firebase users with `admin: true` can open the dashboard or perform admin actions
- **Moderation queues** — pending papers, paper reports, review reports, feedback, and lost & found posts are handled in one place
- **Safe file deletion** — reported-paper deletion resolves the paper metadata first, then deletes both the R2 object and Firestore metadata
- **Audit logs** — admin actions are written to immutable `adminLogs` documents

<p align="center">
  <img src="assets/screenshots/admin-dashboard.png" alt="Admin Dashboard" width="700" />
</p>

### ☁ Cloud Sync

Sign in with your university Google account (`@g.bracu.ac.bd`, or `@northsouth.edu` on the shell) and your data syncs automatically across all your devices via Firebase. Your CGPA, semesters, and grades are always with you — whether you're on your phone, laptop, or a friend's computer.

- **Google Sign-In** — custom modal with BRACU domain restriction, no browser dialogs
- **Automatic sync** — data saves to Firestore every time you make a change
- **Real-time updates** — if you edit on another device, this one reloads automatically
- **Offline support** — changes save locally and sync when you reconnect
- **Migration flow** — if you already have local data, a modal lets you choose which to keep
- **Conflict resolution by choice, not by clock** — when both this device and your account already hold data, a dialog asks which to keep; it never silently overwrites and never picks "most recent" behind your back
- **Data deletion** — delete your cloud data any time from the sign-out modal

### 🎓 Smart CGPA Calculator

Full semester-based GPA and CGPA calculation using BRACU's exact grading scale. Supports all grade types — A through F, F(NT) (no transfer), Pass/Fail, Withdrawn (W), and Incomplete. Handles retake and repeat detection automatically with both **best-grade** policy (students starting Spring 2024 or earlier) and **latest-grade** policy (Fall 2024 onwards).

<p align="center">
  <img src="assets/screenshots/calculator.png" alt="CGPA Calculator" width="700" />
</p>

### 📄 Transcript PDF Import

Upload your official BRACU grade sheet PDF and Shohoj reads it automatically — every semester, every course, every grade. The parser handles multi-line course titles, zero-credit remedial courses, and auto-detects your department. No manual data entry required.

<p align="center">
  <img src="assets/screenshots/transcript-import.png" alt="Transcript Import" width="700" />
</p>

### 🔮 CGPA Playground

A dedicated panel with two powerful tools for planning your academic future:

**✏️ Grade Changer** — Pick any graded course, set a hypothetical new grade, and see the exact CGPA impact instantly. Stack multiple changes and see the cumulative effect. Each change shows its individual contribution to your CGPA shift.

**🎯 Reverse Solver** — _"What grade do I need in CSE220 to reach 3.0 CGPA?"_ — Enter your target CGPA, pick a course, and Shohoj tells you the minimum grade required. Shows whether it's achievable, impossible, or already reached. Every BRACU student asks this question — now there's a tool that answers it.

### 🎯 CGPA Goal Simulator

Set a target CGPA and see what average GPA you need across your remaining credits. Includes a difficulty assessment, credit-pace breakdown showing how many semesters it'll take at 9/12/15 credits per semester, and a Smart Retake & Repeat Strategy ranked by CGPA impact.

- **Milestone ladder** — before you name a target, the simulator leads with the standing ladder (Perfect Standing, Higher Distinction, Distinction, Good Standing, Satisfactory, and getting off academic probation), marking each as secured, still reachable, or out of reach against your completed CGPA

### 🔄 Smart Retake & Repeat Strategy

Select courses to retake or repeat and see exactly how your CGPA changes — individually per course and cumulatively. Each course is tagged with its improvement mechanism:

- **Retake** — for F grades. Re-enroll in the course for a full semester (allowed up to twice).
- **Repeat** — for grades below B (B- through D-). Sit a special exam once, within 2 semesters of the initial enrollment. No grade cap — the latest grade counts.
- **Withdrawn (W) courses** are offered as candidates too, priced honestly: re-enrolling adds credits rather than replacing a grade, and they're skipped once you have already retaken the course.
- **Two orderings** — **Best value** (CGPA gained per credit re-sat, the default) or **Biggest jump** (largest absolute gain), because a 1-credit D and a 3-credit C are different kinds of opportunity and a single ordering hides one of them.

Both mechanisms follow the same intake-based CGPA policy (best grade for Spring 2024 and earlier intakes; latest grade for Fall 2024 onwards).

### 📊 GPA Trend Chart

A visual timeline of your GPA across semesters. Spot patterns, track improvement, and see your academic journey at a glance.

<p align="center">
  <img src="assets/screenshots/trend-chart.png" alt="GPA Trend Chart" width="700" />
</p>

### 🎓 Degree Progress Tracker

Visual timeline of your degree journey — credits earned vs total required, semester-by-semester progress nodes, and a running credit pace indicator.

- **Graduation as a range, not a false point** — the estimate carries the window around it (earliest and latest), derived from the spread of your own per-semester credit loads: with four or more semesters, the single slowest and single fastest are dropped and the rest set the range. Semesters where you cleared nothing are excluded from the pace but still count on the timeline, and summary blocks — whose semester count is itself an estimate — don't feed the range at all.

<p align="center">
  <img src="assets/screenshots/degree-progress.png" alt="Degree Progress Tracker" width="700" />
</p>

### 🔍 Course Autocomplete

Start typing a course code or name and get instant suggestions from a complete BRACU course catalog with **857 courses** across all **16 departments**. Credits auto-fill when you pick a course.

<p align="center">
  <img src="assets/screenshots/autocomplete.png" alt="Course Autocomplete" width="700" />
</p>

### 📥 PDF Export

Export a professionally designed grade report — color-coded grade badges, per-semester GPA breakdown, academic stats, and a clean white-and-green layout ready for print or sharing.

<p align="center">
  <img src="assets/screenshots/pdf-export.png" alt="PDF Export page 1" width="700" />
</p>

<p align="center">
  <img src="assets/screenshots/pdf-export-page-2.png" alt="PDF Export page 2" width="700" />
</p>

### ⚠️ Credit Load Warnings

Automatic alerts when your semester credit load falls below the 9-credit minimum, exceeds the 15-credit maximum, or enters the 13–15 range that requires chairman's permission.

### 🏅 Academic Standing

Live indicator showing your current academic standing based on BRACU policy — from Perfect Standing (4.0) and Higher Distinction (≥3.65) down to Academic Probation (<2.0). Updates instantly as you enter grades.

### 🎯 Running Semester (Projected CGPA)

Add a "running" semester for your current in-progress courses. See projected CGPA before final grades come in — without affecting your earned credits or official CGPA.

### ↕️ Drag-to-Reorder Semesters

Drag and drop semester blocks to reorder them. Useful if you imported a transcript and want to rearrange the layout.

### 🏛️ 16 Department Presets

Pre-built semester templates for **CSE, CS, ECE, EEE, BBA, Economics, English, Anthropology, Physics, Applied Physics & Electronics, Mathematics, Microbiology, Biotechnology, Architecture, Pharmacy, and Law**. Select your department and get a ready-made course plan to start from. Includes bi/tri-semester support — Pharmacy runs Spring+Summer, Law runs Spring+Fall, all others run all three semesters.

### 🌓 Dark & Light Theme

Full dark and light mode with smooth transitions, persisted across sessions (`shohoj_theme`, defaulting to dark). The theme is tokenized and applies to the classic app, the React Router shell, and the standalone `/campus/`, `/bus/` and `/lost-found/` pages alike.

---

## Design & Experience

Shohoj is built to feel like a real product, not a student project.

- **Liquid glass UI** — glassmorphism panels with layered depth and shine
- **Animated dot matrix background** — spring-physics canvas with mouse-reactive particles
- **Custom cursor system** — animated dot + ring + glow with hover/click states, circle-to-I-beam morphing with spring easing
- **Scroll reveal animations** — IntersectionObserver-powered entrance effects with staggered timing
- **Responsive layout** — works on desktop and mobile with 6 breakpoints (480px → 1920px)
- **Accessibility as a gate, not a wish** — route-level axe smoke tests across every shell content route, focus trap and restore in dialogs, 44px touch targets, and no-horizontal-overflow guards at 360/414px, all enforced in CI

---

## Supported Departments

| Department                          | Code | Credits | Semesters  | Status          |
| ----------------------------------- | ---- | ------- | ---------- | --------------- |
| Computer Science & Engineering      | CSE  | 136     | Tri        | 🟢 Full support |
| Computer Science                    | CS   | 124     | Tri        | 🟢 Full support |
| Electronic & Communication Eng.     | ECE  | 136     | Tri        | 🟢 Full support |
| Electrical & Electronic Engineering | EEE  | 136     | Tri        | 🟢 Full support |
| Business Administration             | BBA  | 130     | Tri        | 🟢 Full support |
| Economics                           | ECO  | 120     | Tri        | 🟢 Full support |
| English                             | ENG  | 120     | Tri        | 🟢 Full support |
| Anthropology                        | ANT  | 120     | Tri        | 🟢 Full support |
| Physics                             | PHY  | 132     | Tri        | 🟢 Full support |
| Applied Physics & Electronics       | APE  | 130     | Tri        | 🟢 Full support |
| Mathematics                         | MAT  | 127     | Tri        | 🟢 Full support |
| Microbiology                        | MIC  | 136     | Tri        | 🟢 Full support |
| Biotechnology                       | BIO  | 136     | Tri        | 🟢 Full support |
| Architecture                        | ARC  | 207     | Tri        | 🟢 Full support |
| Pharmacy                            | PHR  | 164     | Bi (Sp+Su) | 🟢 Full support |
| Law                                 | LLB  | 135     | Bi (Sp+Fa) | 🟢 Full support |

**Total: 857 courses in catalog** (including GED/common courses shared across departments)

---

## Tech Stack

| Layer       | Technology                                            | Purpose                                                |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Shipping frontend | HTML, CSS, vanilla JavaScript (bundled by `build3.py`) | The production app people use today (`shohoj.html`)    |
| Beta frontend | TypeScript, React 19, React Router, Vite            | The typed rewrite under `src/`, deployed to `/app/` (not yet the default root) |
| Standalone pages | Vite multi-page build (`vite.pages.config.js`)     | `/campus/`, `/bus/`, `/lost-found/` — shipped on the public site ahead of the cutover |
| 3D          | [Three.js](https://threejs.org/)                      | The procedural campus tower on `/campus/` (presentation layer only) |
| Validation  | [Zod](https://zod.dev/)                               | Runtime schema validation for imported/restored data   |
| Auth & Sync | Firebase Auth + Firestore (Spark plan)                | Google Sign-In, cloud data sync, real-time updates     |
| PDF Import  | [pdf.js](https://mozilla.github.io/pdf.js/)           | Reading BRACU transcript PDFs                           |
| PDF Export  | [jsPDF](https://github.com/parallax/jsPDF)            | Generating grade report PDFs                            |
| Charts      | [Chart.js](https://www.chartjs.org/)                  | Admin dashboard and analytics visualizations           |
| Files/API   | Cloudflare Worker + R2                                | Auth-gated past-paper upload/download/delete, server-mediated review writes, the Assistant relay, and the seat-alert / lost-&-found cron |
| Assistant   | Google Gemini (free tier) via the Worker, with OpenAI and Anthropic Claude as fallbacks | In-app assistant; every key lives only on the Worker, never in the client, behind a monthly spend ceiling |
| Build       | Python (`build3.py`) + Vite                           | `build3.py` bundles the shipping app; Vite builds the React shell and the standalone pages |
| Hosting     | GitHub Pages                                          | Static hosting for the shipping app, the standalone pages, and the `/app/` beta |
| Testing     | Node.js test runner + Playwright + `@firebase/rules-unit-testing` | Unit tests (app logic + Worker), browser E2E, visual parity, and Firestore rules tests against the emulator |
| CI / CD     | GitHub Actions + GitHub Pages                         | One pipeline: full validation on every PR/push; deploy only after it passes, on push to main |

CDN scripts in the shipping app are loaded with **SRI integrity hashes** (`sha384-...` / `sha512-...`) to prevent supply-chain tampering; the React shell and standalone pages bundle their dependencies through Vite instead.

**Deployment pipeline:** a single workflow (`.github/workflows/ci.yml`) runs the full validation suite (lint, format check, typecheck, data validation, unit + Firestore rules tests, worker tests, build + E2E + bundle/CSP guards) on every pull request and push. The deploy jobs `needs:` all of it and run **only on push to `main`**, so a red suite blocks production deployment. Firestore rules/index deploys **fail closed** — if the rules changed but the deploy credentials are missing, the job errors rather than reporting a green deploy over stale production rules. The frontend deploys to the `gh-pages` branch (served by GitHub Pages), publishes a `version.json` build stamp, and runs a post-deploy smoke test; the Worker deploy runs its own `/health` + `/ready` smoke check. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/ROLLBACK.md](docs/ROLLBACK.md).

> **Note on multi-service deploys.** The frontend, the Worker, and the Firestore
> rules deploy as three independent, path-filtered jobs — this is **not** an
> atomic multi-service release. A push that touches all three can land them at
> slightly different times; each has its own post-deploy check and rollback path.

> **Static analysis / secret scanning** (CodeQL / GitHub code scanning, secret
> scanning, push protection, Dependabot alerts) are **repository settings**, not
> workflow files in this repo, so their status cannot be asserted from the code.
> Dependency review runs as a workflow (`dependency-review.yml`). See
> [docs/GITHUB_SECURITY_SETTINGS.md](docs/GITHUB_SECURITY_SETTINGS.md) for the
> exact enablement checklist.

**On the two frontends:** the vanilla `js/` app is still what `build3.py` bundles
and ships at the site root, so production stays stable while the typed rewrite is
validated. The React shell (`src/`) — a parity-tested typed domain core, feature
slices, and a React Router shell — has migrated every route and is deployed to
`/app/`, but is **not yet the default root**. See [docs/architecture/](docs/architecture/)
for the migration roadmap, target architecture, and decision records.

### Architecture at a glance

```
Browser
  │
  │ loads runtime-config.js (Firebase web config, generated from secrets)
  ▼
GitHub Pages
  ├── /            — bundled HTML/CSS/JS (shohoj.html, admin.html, profile.html)
  ├── /campus/  /bus/  /lost-found/
  │                — standalone Vite pages (dist-pages)
  └── /app/        — React Router shell beta (dist-shell)
  │
  │ Firebase Auth (registered-campus Google sign-in; BRACU-only on the root app)
  │ App Check (reCAPTCHA v3)
  ▼
Firestore (rules-enforced for browser clients; campus-partitioned)
  ├── users/{uid}            — semesters, grades, settings
  ├── facultyReviews/{hash}  — pseudonymous, append-only reviews
  ├── reviewReports/{...}    — moderation queue (admin-read)
  ├── papers/{paperId}       — past-paper metadata
  ├── paperReports/{...}     — paper moderation queue
  ├── appFeedback/{id}       — feedback board
  ├── appFeedbackUpvotes/{feedbackId_uid}
  │                          — private per-user upvote state
  ├── facultyProfiles/{init} — admin-seeded faculty directory
  ├── studyGroups/{groupId}  — study group finder posts (immutable)
  ├── studyGroupMembers/{groupId_uid}
  │                          — member-only roster (own email pinned)
  ├── studyGroupReports/{uid_groupId}
  │                          — study group moderation queue (admin-read)
  ├── lostFoundPosts/{id}    — lost & found board
  ├── lostFoundContacts/{id} — private contact details (never public)
  ├── lostFoundClaims/{id}   — claims, relayed to posters by the cron
  ├── seatAlertWatches/{uid} — per-user watched sections
  ├── seatAlertState/{...}   — cron-side full→open transition state
  └── adminLogs/{id}         — admin action audit trail

Cloudflare Worker (auth-proxy, BRACU email + admin claim)
  ├── GET  /health          — liveness + request-id
  ├── GET  /ready           — capability booleans (never key material)
  ├── POST /upload, GET /download, DELETE /file — R2 past-paper files
  ├── POST /reviews         — service-account review writes
  ├── POST /api/assistant   — Assistant relay (Gemini → OpenAI → Claude)
  └── scheduled()           — seat-drop alert + lost & found claim emails

Firebase custom claim `admin: true`
  ├── set out-of-band via scripts/set_admin_claim.js
  ├── read by Firestore rules
  └── read by the Worker for delete authorization
```

For a deeper breakdown see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); for what to set up to deploy, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Security

Shohoj has been through a self-directed security review (no external audit is claimed), and the following protections are in place across the codebase. For the precise threat model — including what is **not** covered — see [docs/SECURITY.md](docs/SECURITY.md):

- **XSS prevention** — all user-sourced strings (course names, semester labels, PDF-imported data, error messages) are escaped via `escHtml()` and `escAttr()` helpers in `helpers.js` before any `innerHTML` insertion.
- **Safe transcript import** — `applyImport()` no longer serialises parsed PDF data into an `onclick` attribute. Parsed data is held in a JS-side `_pendingImport` slot and consumed directly, eliminating attribute-injection risk.
- **localStorage sanitisation** — `sanitizeRestoredState()` validates and strips malformed or legacy data on every load, including stripping legacy `<sup>` HTML from semester names.
- **CDN subresource integrity** — `jsPDF`, `pdf.js`, and `Chart.js` are loaded with `integrity` and `crossorigin="anonymous"` attributes.
- **Registered-campus restriction** — Google Sign-In is accepted only from a domain a registered campus claims (`g.bracu.ac.bd`, and `northsouth.edu` on the shell), enforced client-side after the popup and server-side via Firestore security rules. The vanilla root app is narrower still: it restricts to `@g.bracu.ac.bd` outright.
- **Firestore security rules** — users can only read and write their own document (`users/{uid}`), and only with a verified Google account on a domain some registered campus claims (`isCampusUser()` — no longer a hardcoded BRACU regex). Faculty reviews (`facultyReviews/{reviewId}`) are readable only by accounts on the review's own campus, and client creates/updates are denied; new reviews are written through the Worker (`POST /reviews`) with deterministic IDs and a public body that stores no UID or email. Only admin-claim moderators can delete abusive reviews. Review reports (`reviewReports/{uid_reviewId}`) are write-only from the client, must point at a real review, and are capped at one report per user per review. Paper metadata is created only by the Worker, then readable only when approved, owned by the uploader, or accessed by an admin. Feedback upvote documents are readable only by their owner or an admin. Study groups (`studyGroups/{groupId}`) are readable only by accounts on the group's own campus, created only with the caller's own `creatorUid`, immutable after creation, and deletable only by the creator or an admin; membership docs (`studyGroupMembers/{groupId_uid}`) pin the joiner's own verified email and are readable only by the member, a fellow member of the same group, or an admin, so the email roster never leaks to non-members. Lost & found contact details live in a separate `lostFoundContacts` collection that no client can read. `facultyProfiles` is read-only for all clients; only admin-side seed scripts can write to it. No other access is permitted.
- **Campus partitioning** — client-created `studyGroups`, `appFeedback` and `lostFoundPosts` documents must carry a `university` field pinned to the campus of the writer's own verified email, so one campus's writes cannot land in another's data. Reads are scoped the same way (`campusMatches`), so a student sees their own campus's boards and reviews, not another's. Documents written before tenancy existed have no field and read as `bracu`, which is what they are by definition; `scripts/backfill_campus.js` stamps them. The Worker mirrors the same registry (`campusOfEmail`) so client and server cannot disagree about who belongs where.
- **Past-paper file controls** — the Cloudflare Worker verifies Firebase ID tokens, rejects accounts on no registered campus, stores new uploads under `papers/{COURSE}/{UPLOADER_UID}/{filename}`, allows legacy downloads/deletes for older files, caps uploads at 10 MB, and accepts only PDF, PNG, JPEG, WebP, or GIF.
- **Assistant key isolation and blast-radius limits** — no model provider key ever reaches the browser; the client talks only to `POST /api/assistant`. The Assistant's tools are read-only and scoped to the caller's own data, and a monthly spend ceiling stops the relay rather than running up an unbounded bill. `GET /ready` reports capability booleans only, never key material.
- **Pseudonymous faculty reviews** — the public review document body stores no UID, email, or other user identifier. The Firestore doc ID is a deterministic, **unsalted** SHA-256 of `uid | faculty | course` (there is no secret salt — the determinism is what enforces one review per user/faculty/course). This is pseudonymity to other users, **not** anonymity: a project admin can correlate writes, and anyone who already knows a UID can reproduce the hash. Full detail in [docs/SECURITY.md](docs/SECURITY.md).
- **Firebase config exposure** — the Firebase web config is public by design. Shohoj keeps it out of committed source by generating `js/config/runtime-config.js` from local `.env` values or GitHub Actions secrets at build time (the generated file is gitignored). Access is protected by Firestore rules (and App Check once console enforcement is verified — see [docs/SECURITY.md](docs/SECURITY.md)), not by hiding the web config.

---

## Roadmap

### Phase 1 — Academic Core _(Complete)_

| Feature                             | Status      |
| ----------------------------------- | ----------- |
| Smart GPA Calculator                | ✅ Complete |
| CGPA Playground (Grade Changer)     | ✅ Complete |
| CGPA Playground (Reverse Solver)    | ✅ Complete |
| CGPA Goal Simulator                 | ✅ Complete |
| GPA Trend Analysis                  | ✅ Complete |
| Transcript PDF Import               | ✅ Complete |
| PDF Grade Report Export             | ✅ Complete |
| Course Catalog & Autocomplete       | ✅ Complete |
| Credit Load Warnings                | ✅ Complete |
| Retake & Repeat Strategy Analyzer   | ✅ Complete |
| Degree Progress Tracker             | ✅ Complete |
| Security audit & XSS hardening      | ✅ Complete |
| Cloud Sync (Firebase Auth)          | ✅ Complete |
| Test suite & CI                     | ✅ Complete |
| Semester Planner with Prerequisites | ✅ Complete |
| Faculty Reviews (anonymous, 5-dim)  | ✅ Complete |
| Course Difficulty Map               | ✅ Complete |
| Per-course marks tracker            | ✅ Complete |
| Next Registration (unlock map)      | ✅ Complete |

### Phase 2 — Community Layer _(Partially Live)_

| Feature                            | Status      |
| ---------------------------------- | ----------- |
| Review corpus growth               | 🔶 Ongoing  |
| Past Papers & Notes library        | ✅ Live     |
| Feedback board                     | ✅ Live     |
| Admin moderation dashboard         | ✅ Live     |
| Study group finder                 | ✅ Live     |

### Phase 3 — Campus Life _(Mostly Live)_

| Feature                            | Status      |
| ---------------------------------- | ----------- |
| Interactive campus map (`/campus/`) | ✅ Live    |
| Lost & found board (`/lost-found/`) | ✅ Live    |
| Bus routes & timings (`/bus/`)      | ✅ Live    |
| Cafeteria guide                     | 🔶 Live — outlet directory only; hours unverified until confirmed, no menus or prices |
| Routine builder / seat status / free rooms | ✅ Live |

### Phase 4 — Career & Opportunities

Internship listings, alumni directory, interview experience board, resume review board, company hiring history.

### Phase 5 — Marketplace

Secondhand textbook market, carpooling board, student discount directory.

### Phase 6 — Intelligence Layer

Smart semester recommendations, burnout warning system, graduation timeline predictor. The [Shohoj Assistant](#-shohoj-assistant-new) is the first piece of this layer to ship.

---

## Multi-University Vision

Shohoj scales beyond BRAC University, and on the React shell that is working
code rather than a plan:

- **A campus registry** (`src/core/university.ts`) holds each university's
  grading scale, mark cutoffs, retake/repeat policy, identifying email domains,
  and which features it has data for. Adding a campus is an entry there, not a
  fork of the calculator. No profile ships on a guessed grade point — the
  numbers come from the registrar or the official student handbook, and a policy
  that could not be confirmed is left absent rather than inherited from BRACU.
- **Campus rules run the whole calculator path** on the shell — results, the
  degree tracker, the GPA trend, the goal simulator, retake shortlisting, the
  marks tracker, planner credit totals and the PDF report all take the active
  campus's scale rather than assuming BRACU's. The same transcript produces
  different, correct answers on different campuses, and that is a test, not a
  claim.
- **Features are declared per campus.** A route a campus has no data for is not
  rendered as an empty shell — NSU's profile turns off seats, routine, free
  rooms and the campus map (they all derive from BRACU's CONNECT feed, and NSU's
  RDS portal has no known public equivalent), plus bus and cafeteria
  (hand-collected Merul Badda data) and lost & found (keyed to BRACU's room
  codes).
- **A sign-in portal** gates the shell: sign-in is what resolves a student to a
  campus, and the campus decides the grading rules, so the shell asks who you
  are before showing a calculator. A confidently wrong CGPA is worse than a
  prompt.
- **Campus-partitioned data** — Firestore rules pin each client-created
  community document to the writer's own campus, and `scripts/backfill_campus.js`
  stamps pre-tenancy documents.

**The catch:** all of this lives on the React shell at `/app/`. The vanilla app
still served at the site root restricts sign-in to `@g.bracu.ac.bd` and computes
on BRACU's scale, so a second campus becomes real for most users at the cutover,
not before.

| Stage | Scope                                  | Status |
| ----- | -------------------------------------- | ------ |
| v1.0  | BRAC University                        | ✅ Live |
| v2.0  | NSU, IUB, EWU                          | 🔶 NSU profile live on the shell (`/app/`); root app still BRACU-only. IUB and EWU not started |
| v3.0  | All private universities in Bangladesh | Planned |
| v4.0  | Public universities (BUET, DU, CUET)   | Planned |
| v5.0  | South Asia                             | Planned |

---

## Project Structure

```
Shohoj/
├── assets/
│   ├── shohoj-logo.png
│   └── screenshots/
├── admin/index.html              Admin shell source
├── profile/index.html            Profile account-hub shell source
├── campus/                       Standalone campus map page (index.html + main.tsx)
├── bus/                          Standalone bus routes page
├── lost-found/                   Standalone lost & found page
├── css/
│   └── style.css                 All styles — themes, animations, glassmorphism, auth UI
├── data/
│   ├── faculty_profiles.jsonl    Seed faculty directory injected by build3.py
│   └── input_reviews.jsonl       Seed faculty reviews injected by build3.py
├── js/                           The shipping vanilla-JS app (bundled by build3.py)
│   ├── main.js                   Entry point — wires all modules together
│   ├── admin-entry.js            Entry point for the admin bundle
│   ├── auth/                     Firebase init, auth orchestration, and the
│   │                             admin / paper / review / assistant service hooks
│   ├── config/
│   │   ├── runtime-config.template.js
│   │   └── runtime-config.js     Generated locally/CI, gitignored
│   ├── core/
│   │   ├── grades.js             BRACU grading scale & grade detection
│   │   ├── helpers.js            Semester utilities, escHtml/escAttr, sanitizers
│   │   ├── state.js              Shared state object, localStorage persistence
│   │   ├── departments.js        16 department definitions with preset semesters
│   │   ├── catalog.js            Full BRACU course database (857 courses)
│   │   ├── calculator.js         GPA/CGPA engine, retake/repeat policy, credit warnings
│   │   ├── courseMarks.js        Per-course marks tracker model
│   │   ├── milestones.js         Academic-standing milestone ladder
│   │   ├── semesterBriefing.js   Exam-crunch / semester briefing model
│   │   ├── prereq.js             Prerequisite rule parsing and evaluation
│   │   ├── connectFeed*.js       Live CONNECT section-feed fetch + parsing
│   │   ├── seatStatus.js         Live seat lookup
│   │   ├── seatWatch.js          Seat watchlist persistence
│   │   ├── freeRooms.js          Empty-room derivation from the timetable
│   │   ├── routine*.js           Routine state, suggestions, grid, faculty, export
│   │   ├── calendarExport.js     .ics generation
│   │   ├── assistantClient.js    Assistant relay client + drawer morph
│   │   ├── dispatch.js           Delegated UI action registry
│   │   ├── faculty.js            Faculty directory cache, initials normalization
│   │   ├── papers.js             Past-paper validation and storage hooks
│   │   ├── reviews.js            Review submission & fetch layer, aggregation helpers
│   │   └── studyGroups.js        Study group validation + Firestore hook wrappers
│   ├── ui/                       Tab and panel rendering — calculator, planner,
│   │                             simulator, playground, reviews, difficulty map,
│   │                             papers, feedback, groups, routine, seats, free
│   │                             rooms, profile, unlock map, assistant FAB,
│   │                             admin dashboard, tracker, modals
│   ├── animations/               Custom cursor, dot-matrix canvas, scroll reveal
│   └── import/parser.js          BRACU transcript PDF parser (dual-strategy)
├── src/                          TypeScript/React rewrite — deployed to /app/, not the default root
│   ├── core/                     Typed domain logic (gpa, grades, catalog, reviews,
│   │                             planner, prereq, routine*, seats, rooms, transcript,
│   │                             busRoutes, cafeteriaOutlets, campusRooms, lostFound,
│   │                             university), parity-tested vs js/ via tests/typedCoreParity.test.js
│   ├── features/
│   │   ├── calculator/           React calculator — semesters, course rows, summary,
│   │   │                         simulator, degree progress, marks tracker
│   │   ├── assistant/            Assistant drawer + relay client
│   │   └── campus/               Three.js campus scene
│   ├── app/                      React Router shell — providers, layout, sign-in portal,
│   │                             and every route (calculator, planner, reviews, routine,
│   │                             seats, rooms, profile, campus, bus, lost & found,
│   │                             cafeteria, papers, groups, feedback, degree, admin)
│   ├── platform/
│   │   ├── auth/                 Typed auth boundary + auth snapshot (incl. campus resolution)
│   │   ├── configuration/        Runtime config, feature flags, capabilities
│   │   ├── firebase/             Typed repositories (users, reviews, papers, feedback,
│   │   │                         study groups, lost & found, seat alerts, campus stamp)
│   │   └── observability/        Logger + global error handlers
│   ├── services/storage/         Versioned typed persistence (keyValueStore, migrate, backup, syncDecision)
│   ├── state/                    Theme + Notification providers
│   ├── react/                    Island entry points + CGPA summary/meter components
│   └── shared/                   Shared UI and validation schema
├── scripts/
│   ├── generate_runtime_config.js  Generate local runtime-config.js
│   ├── generate-version-json.mjs   Build stamp published with each deploy
│   ├── generate_worker_catalog.mjs Generate the Worker's course catalog
│   ├── validate_data.mjs           Data validation gate (CI)
│   ├── check_bundle_collisions.py  Guard against duplicate top-level names in the bundle
│   ├── smoke-production.mjs        Post-deploy production smoke test
│   ├── smoke-worker.mjs            Worker /health + /ready smoke check
│   ├── parity_report.mjs           js/ vs src/ parity reporting
│   ├── run-tests.mjs               Unit test runner
│   ├── backfill_campus.js          Stamp `university` on pre-tenancy documents
│   ├── rename_faculty_initials.py  Faculty seed-data maintenance helper
│   ├── seed_faculty.py             Bulk-import faculty profiles into Firestore
│   ├── seed_reviews.py             Bulk-import LLM-processed faculty reviews into Firestore
│   └── set_admin_claim.js          Grant/revoke Firebase admin custom claim
├── worker/
│   ├── index.js                  Cloudflare Worker — R2 files, review writes, cron
│   ├── assistant.js              Assistant orchestration + the read-only tools
│   ├── assistantProviders.js     Gemini / OpenAI / Claude provider adapters
│   ├── assistantBudget.js        Monthly spend ceiling
│   ├── catalog.generated.js      Generated course catalog for the Worker
│   ├── test/worker.test.js       Worker validation tests
│   └── wrangler.toml             Worker deploy config
├── firestore.rules               Firestore security rules
├── firestore.indexes.json        Required Firestore composite indexes
├── firebase.json                 Firestore emulator config
├── tests/                        106 Node test-runner unit suites (see the CI badge for pass status). Representative:
│   ├── calculator.test.js        GPA engine, retake/repeat policies, grade detection
│   ├── parser.test.js            department detection, semester parsing, blob parser
│   ├── planner.test.js           prereq resolution, plan validation
│   ├── reviews.test.js           review submission, aggregation, faculty grouping
│   ├── courseMarks.test.js       marks tracker — pace, floor/ceiling, needed-mark math
│   ├── studyGroups.test.js       draft validation, mode/course checks, member summary
│   ├── routine*.test.js          routine state, suggestions, grid, faculty, export
│   ├── seatStatus/seatWatch      live seat lookup + watchlist persistence
│   ├── freeRooms.test.js         empty-room derivation from the timetable
│   ├── profileTab.test.js        account hub — header, watchlist, alert toggle
│   ├── university.test.js        campus registry — scales, policies, domain resolution
│   ├── gpaMultiCampus.test.js    the same transcript scored on each campus's rules
│   ├── backfillCampus.test.js    campus backfill — the cases where a mistake is expensive
│   ├── typedCoreParity.test.js   src/ typed core parity vs the legacy js/ logic
│   └── firestore.rules.test.js   84 emulator-driven security rules checks
├── e2e/                          Playwright E2E for the legacy bundled app (15 specs)
├── e2e-shell/                    Playwright E2E for the React Router shell routes (42 specs)
├── e2e-vite/                     Playwright E2E for the Vite island build (3 specs)
├── e2e-pages/                    Playwright E2E for the built standalone pages (3 specs)
├── e2e-visual/                   Visual parity: legacy baseline vs shell (2 specs)
├── docs/
│   └── architecture/             Migration roadmap, current state, target architecture, risk register, test matrix, ADRs
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                One CI/CD pipeline: full validation, then gated deploy of frontend + Worker + Firestore on push to main
│   │   └── dependency-review.yml Blocks PRs adding vulnerable dependencies
│   └── dependabot.yml            Monthly grouped dependency-update policy
│                                 (CodeQL runs via GitHub's default setup, configured in the UI)
├── index.html                    Main HTML shell
├── playwright.config.js          Legacy bundled app E2E
├── playwright.shell.config.js    React Router shell E2E
├── playwright.vite.config.js     Vite island build E2E
├── playwright.pages.config.js    Standalone pages E2E
├── playwright.visual.config.js   Visual parity E2E
├── vite.config.js                Vite multi-entry island build config
├── vite.shell.config.js          Vite config for the React Router shell
├── vite.pages.config.js          Vite config for the standalone /campus/, /bus/, /lost-found/ pages
├── eslint.config.js              Flat ESLint config (correctness-only)
├── tsconfig.json                 Strict no-emit TypeScript check config
├── package.json                  Unit, rules, E2E, typecheck, build, and local config scripts
├── README.md
├── LICENSE
└── build3.py                     Build script — outputs shohoj.html, admin.html, and profile.html
```

---

## Getting Started

**Use it online:**
Visit **[souravmondalshuvo.github.io/Shohoj](https://souravmondalshuvo.github.io/Shohoj)** — no installation needed.

**Run locally:**

```bash
git clone https://github.com/souravmondalshuvo/Shohoj.git
cd Shohoj
npm ci
```

Open `index.html` in your browser, or use a local server:

```bash
python3 -m http.server 8000
# Visit http://localhost:8000
```

**Run the React shell or the standalone pages:**

```bash
npm run dev:shell
# React Router shell (the /app/ beta)
```

```bash
npm run dev:pages
# Standalone pages — open /campus/, /bus/, /lost-found/
```

**Run tests:**

```bash
npm test
# Runs app, Worker, and Firestore rules tests

npm run test:rules
# Runs only Firestore rules tests (requires Java 21+)
```

```bash
npm run test:e2e:shell
# Playwright E2E for the React Router shell
```

**Build the bundled version:**

```bash
python3 build3.py
# Outputs shohoj.html, admin.html, and profile.html — ready to deploy
```

> **Note:** You don't need to run the build manually before pushing — the CD pipeline does it automatically on every push to `main`. Run it locally only if you want to preview the bundled output.

> **Cloud sync:** requires a Firebase project. The live site loads its config from `js/config/runtime-config.js`, which is generated at build time from GitHub Actions secrets and is gitignored. For local development, copy `.env.example` to `.env.local`, fill in your Firebase web config, run `npm run config:local` to generate `runtime-config.js`, and make sure `localhost` is added as an authorized domain in your Firebase console.

> **The Assistant** needs at least one model provider key set on the deployed Worker. Without one, `GET /ready` reports the capability as unavailable and the launcher never renders — the feature is hidden rather than shown-and-broken.

---

## Known Limitations & Assumptions

This section documents the boundaries of what Shohoj reliably handles. If something behaves unexpectedly, check here first.

### Transcript Import

- **Format:** Tested against BRACU official digital grade sheet PDFs exported from CONNECT. Scanned or photographed PDFs are not supported — the parser requires selectable text.
- **Multi-page transcripts:** Supported. The parser reads all pages before processing.
- **Mobile Safari / Chrome:** PDF.js renders text items at slightly different y-coordinates on mobile. A 6px threshold patch is applied; most transcripts work, but some edge-case layouts may misparse.
- **Course titles:** Multi-line course names (titles that wrap across two lines in the PDF) are reconstructed by the parser. Rarely, a long title may be truncated or attached to the wrong course code.
- **F(NT) grades:** Some older BRACU transcripts render this as `F (NT)` (with a space) rather than `F(NT)`. Both formats are handled.
- **Handwritten annotations** on printed transcripts are ignored.

### Retake & Repeat Policy

BRACU has two distinct grade improvement mechanisms, both governed by the same intake-based CGPA rule:

| Mechanism | Eligibility        | How                                         | Limit                        |
| --------- | ------------------ | ------------------------------------------- | ---------------------------- |
| Retake    | F grade only       | Re-enroll in the course for a full semester | Up to twice (3 attempts max) |
| Repeat    | Grade below B (B-) | Sit a special exam (no full re-enrolment)   | Once, within 2 semesters     |

**Which grade counts in CGPA** depends on the student's intake:

| Intake                  | Policy                              |
| ----------------------- | ----------------------------------- |
| Spring 2024 and earlier | **Best grade** counts toward CGPA   |
| Fall 2024 onwards       | **Latest grade** counts toward CGPA |

This applies equally to both retakes and repeats. Shohoj auto-detects which policy applies based on your starting semester. If your starting semester is set incorrectly, retake and repeat calculations will use the wrong policy.

Additional notes on Repeat:

- There is **no grade cap** on a repeated course — the student can earn any grade up to A.
- The repeat must happen **within 2 semesters** of the initial enrollment. Shohoj does not enforce this deadline automatically — it is the student's responsibility to check eligibility with their department.
- Repeated courses appear in the transcript as a second attempt, just like retakes. The CGPA engine treats them identically.

### CGPA Calculation

- Grade points follow BRACU's official scale (A/A+ = 4.0, D- = 0.70, F = 0.00).
- Pass (P), Withdrawn (W) and Incomplete (I) grades are excluded from GPA calculations entirely.
- F(NT) grades count the credits in the denominator but contribute 0 grade points.
- Running semester courses are included in **projected CGPA** but excluded from **earned credits**.

### Shohoj Assistant

- **Signed-in only.** Signed out there is no launcher — the Assistant has no data to reason about and won't guess.
- **Requires a configured provider.** With no provider key set on the Worker, the launcher does not render at all.
- **Bounded scope.** It answers about your courses, grades, CGPA, prerequisites, registration, seats, routines, free rooms, degree progress, and using Shohoj. Other questions — including coursework it could technically do — get a one-line decline. This is a product decision, not a capability limit.
- **It is an LLM.** The tools are deterministic and the numbers they return come from the same engines the calculator uses, but the prose around them is model-generated. Treat advising-critical answers as a starting point, not as your department's word.
- **A monthly ceiling can stop it.** Once estimated spend reaches the configured cap, the Assistant declines until the month rolls over. The estimate is deliberately pessimistic, so it trips early rather than late.
- **Chat history is browser-only** — never persisted server-side, cleared when you close the tab.

### Live Feed Features (Seats, Free Rooms, Routine, Campus Map)

- All four read the **public CONNECT section feed**, which is third-party and best-effort. If the feed is down or changes shape, these features degrade rather than invent data.
- **Free Rooms and the campus map show scheduled occupancy only.** There is no ad-hoc room booking feed, so a room that is free on the timetable may still be in use by a club, a makeup class, or an event.
- **Seat email alerts** require an operator-configured verified email sender. Unconfigured, the cron logs and sends nothing rather than failing silently in a way that looks like delivery.
- The campus map's 3D rendering is a presentation layer. Room status is readable without it.

### Lost & Found

- **Contact details are never shown on the board.** A claim is relayed to the poster by email through the Worker, which means claims depend on the same operator-configured email sender as seat alerts.
- Shohoj cannot verify that a claimant actually owns an item. The board makes an introduction; the handover is between two people.
- Posts are moderated after the fact, not before — report a bad post and an admin can remove it.

### Cafeteria Guide

- **No menus and no prices**, deliberately — both change too often for a static dataset to be trustworthy.
- Opening hours carry a `verified` flag. An outlet whose hours are unconfirmed shows "Hours not yet confirmed" and no open/closed badge, rather than asserting a status from placeholder data.
- The open/closed-now badge is derived from your device clock, not from a live feed.

### Bus Routes

- Transcribed from the official BRACU transport brochure at a point in time. Routes and timings change; the page reflects the brochure, not a live vehicle feed.

### Next Registration

- Works from **your program's curriculum plus subjects you have actually taken**, so electives outside the standard plan still count. Use **Show all departments** to see the unfiltered list.
- If your program cannot be identified, nothing is filtered rather than guessed.
- A prerequisite rule Shohoj cannot parse is treated as **no prerequisite** — the course stays listed and the page tells you how many rules it couldn't read. It errs toward showing you a course you should check with your advisor, never toward hiding one you're eligible for.
- Requires an imported transcript. Without one you get an invitation to import rather than an empty page.

### Per-Course Marks Tracker

- The components and weights are **yours to enter** — Shohoj has no access to your actual marks or your course outline.
- "Secured" means secured under a **zero on everything remaining**, not under your current average.
- If your weights don't total 100%, every figure is still computed, with a note saying which part of the course it describes.
- Applying the pace letter to a course is an explicit button press; the tracker never changes your CGPA on its own.

### Cloud Sync

- Requires a Google account on a registered campus domain — `@g.bracu.ac.bd` everywhere, plus `@northsouth.edu` on the shell. Anything else is rejected client-side and by Firestore security rules.
- Firestore document limit: **512KB per user**. A typical full transcript is well under 50KB, so this limit is unlikely to be reached in practice.
- Offline changes are saved to `localStorage` and synced automatically when reconnected.
- When both a device and the account hold data, the conflict is resolved by **asking you**, on a data fingerprint — never by "newest wins". Simultaneous edits on two devices are still last-write-wins within a session; no field-level merge is performed.

### Semester Planner

- Prerequisite data fully covers **CSE, EEE, ECE, MAT, PHY, BBA, ECO, and ENG** departments (approx. 300 prerequisite rules).
- **ARC, PHR, APE, MIC, and BIO** have partial coverage: BRACU does not publish an explicit prerequisite table for these lock-step programs, so only the explicit course progressions (Design I→X, Structure I→VI, Pharmacology I→III, Microbiology Lab I→IV, Intro→Advanced sequences, etc.) are encoded as hard prereqs. Non-sequential courses in these departments are intentionally left unlocked rather than inferred.
- **ANT and LAW** have no prerequisite data — their curricula are topical with no published or roman-numeral progressions, so all their courses show as unlocked.
- The planner does not check time conflicts or section availability — for that, use the Routine Builder and Seat Status, which read the live section feed.

### Faculty Reviews

- Reading and submitting reviews requires sign-in with a registered-campus account — enforced both client-side and by Firestore security rules. Reviews are scoped to your own campus: you see your university's corpus, not another's.
- Reviews are **immutable once submitted** for students. There is no edit or self-delete flow from the client; if you try to rate the same faculty-course pair again, Shohoj shows your existing review in read-only mode instead. If a review needs to be removed (e.g. abuse), report it so an admin-claim moderator can remove it from the moderation dashboard.
- Faculty are keyed by **initials only** (2–6 uppercase letters). The full faculty directory with names/departments will be seeded over time via `scripts/seed_reviews.py` and the `facultyProfiles` collection.
- The review corpus starts empty. A panel showing "no reviews yet" for a course is not a bug — it simply means nobody has rated any faculty for that course yet. Early users carry the cost of seeding.
- Aggregates use simple averages across all reviews for a faculty-course pair. No recency weighting, no outlier filtering, no minimum-sample gating — this will be tuned once the corpus grows.

### Past Papers & Notes

- Uploading and downloading files requires sign-in with a registered-campus account. Admins use the same Firebase custom claim as the dashboard.
- New files are stored in Cloudflare R2 through the Worker under `papers/{COURSE}/{UPLOADER_UID}/{filename}`. Older two-segment paths remain readable/deletable for backward compatibility. Firestore metadata is written by the Worker after upload validation succeeds.
- Only PDF, PNG, JPEG, WebP, and GIF files are accepted. SVG and other active or executable formats are rejected.
- Pending paper metadata is visible only to the uploader and admins. Other students can read paper metadata only after approval.
- File previews are best-effort. Objects uploaded before MIME types were stored are identified by magic bytes; if a browser still cannot render a PDF inline, use "Open in new tab."

### Study Group Finder

- Posting, joining, and browsing all require sign-in with a registered-campus account, enforced both client-side and by Firestore security rules, and the board you see is your own campus's.
- **Capacity is advisory.** Firestore rules cannot count members atomically (the same limitation as feedback upvotes), so the joined/capacity figure and the "Full" state are best-effort client-side checks — a group can occasionally exceed its stated capacity under a race.
- **The contact link is public to all BRACU users** and is user-supplied. Rules require an `https://` URL and the UI escapes it, but Shohoj can't vouch for where a link leads — report a bad or malicious link and an admin will remove the group.
- The member email roster is visible only to fellow members; non-members see capacity and the contact link but not who has joined.
- Group posts are **immutable** once created — there is no edit flow. To change details, delete the group and post a new one. Deleting a group does not auto-remove member docs (rules only let each user delete their own membership); orphaned memberships are harmless and simply don't render.

### Degree Progress Tracker

- The graduation estimate is a **range**, derived from the observed spread of your own per-semester credit loads — not a statistical confidence interval. With a handful of semesters to go on, a trimmed observed range is something you can check by eye; a p-value would be false rigour.
- Semesters where you cleared no credits are excluded from the pace calculation but still appear on the timeline. Summary blocks don't feed the range at all, since their semester count is itself an estimate.
- Credit requirements are sourced from BRACU's published program structure. If your program has been updated recently, the total may differ by a few credits.

### Multi-Campus

- Campus rules apply on the **React shell (`/app/`) only**. The vanilla app at the site root restricts sign-in to `@g.bracu.ac.bd` and computes on BRACU's scale — an NSU student needs the shell.
- A campus profile ships only with policy numbers confirmed from the registrar or the official handbook. NSU's per-semester credit minimum and maximum were not confirmed, so **no credit-load warning is shown for NSU at all** — better silent than wrong.
- **Feed-driven features are off for NSU** — seats, routine, free rooms and the campus map all derive from BRACU's CONNECT feed, and no public equivalent is known for NSU's RDS portal. Bus and cafeteria data is hand-collected for Merul Badda, and lost & found is keyed to BRACU room codes. These routes don't render for an NSU account rather than rendering empty.
- Community features (reviews, papers, groups, feedback) work for a new campus from day one — they are simply empty until that campus's students post, and campus partitioning keeps them separate.
- An account on a domain no profile claims is signed in but **campus-unknown**, and sees a notice rather than a calculator applying someone else's grading scale.
- Stored data written before tenancy existed has no campus field and is read as BRACU, which is what it is by definition.

### Browser Support

| Browser                 | Status                                   |
| ----------------------- | ---------------------------------------- |
| Chrome 90+              | ✅ Fully supported                       |
| Firefox 88+             | ✅ Fully supported                       |
| Safari 14+              | ✅ Supported                             |
| Edge 90+                | ✅ Fully supported                       |
| Mobile Chrome (Android) | ✅ Supported                             |
| Mobile Safari (iOS)     | ✅ Supported (y-threshold patch applied) |
| IE / Legacy Edge        | ❌ Not supported                         |

Touch devices: the custom cursor and dot-matrix animation are automatically disabled on touch devices. The `/campus/` 3D scene requires WebGL; the underlying room data remains readable without it.

### Data Storage

| Key                | Location     | Contents                                      |
| ------------------ | ------------ | --------------------------------------------- |
| `shohoj_cgpa_v1`          | localStorage | All semesters, grades, department, settings                            |
| `shohoj_theme`            | localStorage | `"dark"` or `"light"` (defaults to dark)                               |
| `shohoj_last_sync`        | localStorage | Timestamp of last successful cloud sync                                |
| `shohoj_seat_alerts_enabled` | localStorage | Whether seat-drop email alerts are armed                            |
| `users/{uid}`             | Firestore    | Same shape as localStorage value, JSON string                          |
| `facultyReviews/{faculty_course_hash}` | Firestore | Immutable review docs — faculty initials, course code, 5 ratings, text, server timestamp; duplicate writes are rejected |
| `reviewReports/{uid_reviewId}` | Firestore | Admin-only moderation reports, deduplicated per user per review |
| `facultyProfiles/{init}`  | Firestore    | Read-only faculty directory seeded by admin scripts                    |
| `papers/{paperId}`        | Firestore    | Paper metadata — public only after approval; pending docs are uploader/admin only |
| `paperReports/{uid_paperId}` | Firestore | Admin-only paper reports, deduplicated per user per paper              |
| `appFeedback/{id}`        | Firestore    | Feedback board entries (campus-stamped)                                 |
| `appFeedbackUpvotes/{feedbackId_uid}` | Firestore | Private per-user upvote state, readable by owner/admin only       |
| `studyGroups/{groupId}`   | Firestore    | Study group posts — course, mode, schedule, public contact link, capacity; immutable after create (campus-stamped) |
| `studyGroupMembers/{groupId_uid}` | Firestore | Member roster — own BRACU email pinned, readable by fellow members/admin only |
| `studyGroupReports/{uid_groupId}` | Firestore | Admin-only study group reports, deduplicated per user per group |
| `lostFoundPosts/{id}`     | Firestore    | Lost & found board entries (campus-stamped)                             |
| `lostFoundContacts/{id}`  | Firestore    | Poster contact details — never client-readable; used only by the Worker's claim relay |
| `lostFoundClaims/{id}`    | Firestore    | Claims awaiting relay; the cron emails the poster and drops the claim   |
| `seatAlertWatches/{uid}`  | Firestore    | Sections you're watching, for the seat-drop email cron                  |
| `seatAlertState/{...}`    | Firestore    | Cron-side full→open transition state, so an alert fires once            |
| `adminLogs/{id}`          | Firestore    | Immutable admin moderation audit trail                                  |
| Paper files               | Cloudflare R2 | PDF and raster-image uploads, accessed only through the Worker          |

Academic sync and community metadata live in Firestore. Paper file bodies are stored in Cloudflare R2 behind the Worker. Assistant conversations live in `sessionStorage` only, so a chat survives a tab switch and is gone when the tab closes — never localStorage, never Firestore, never the Worker. There are no ads, no analytics on your grade data, and no third-party data sharing. Google Analytics (GA4) tracks page views only — no grade or personal data is included.

### What's Production-Ready

| Feature                                         | Status                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| CGPA Calculator                                 | ✅ Production-ready                                     |
| PDF Transcript Import                           | ✅ Production-ready                                     |
| PDF Grade Report Export                         | ✅ Production-ready                                     |
| Course Autocomplete (857 courses)               | ✅ Production-ready                                     |
| Cloud Sync (Firebase)                           | ✅ Production-ready                                     |
| CGPA Playground (Grade Changer, Reverse Solver) | ✅ Production-ready                                     |
| CGPA Goal Simulator                             | ✅ Production-ready                                     |
| Retake & Repeat Strategy Analyzer               | ✅ Production-ready                                     |
| Per-Course Marks Tracker                        | ✅ Production-ready                                     |
| Degree Progress Tracker                         | ✅ Stable — graduation estimate is a range, not a promise |
| Semester Planner                                | 🔶 Stable — prereq data incomplete for some departments |
| Next Registration                               | 🔶 Live — unparseable prereq rules are reported, not hidden |
| Faculty Reviews                                 | 🔶 Live — corpus seeding in progress                    |
| Course Difficulty Map                           | 🔶 Live — aggregates grow with the review corpus        |
| Past Papers & Notes                             | 🔶 Live — moderated community library                   |
| Feedback Board                                  | ✅ Production-ready                                     |
| Study Group Finder                              | 🔶 Live — capacity is advisory; contact links are user-supplied |
| Routine Builder / Seat Status / Free Rooms      | 🔶 Live — depend on the third-party CONNECT feed        |
| Campus Map                                      | 🔶 Live — scheduled occupancy only, no ad-hoc bookings  |
| Lost & Found                                    | 🔶 Live — claim relay needs a configured email sender   |
| Bus Routes                                      | ✅ Live — static, from the official brochure            |
| Cafeteria Guide                                 | 🔶 Live — outlet directory; hours unverified until confirmed |
| Shohoj Assistant                                | 🔶 Live — free-tier model, monthly spend ceiling, scope-bounded |
| Admin Dashboard                                 | ✅ Production-ready for current moderation flows        |
| React Router shell (`/app/`)                    | 🔶 Beta — full route parity, cutover still pending      |
| Multi-campus tenancy                            | 🔶 Live on the shell (BRACU + NSU); root app still BRACU-only |

---

## Contributing

Shohoj is built for students, by students. Contributions are welcome.

### How to Contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** — match the conventions of whichever frontend you're touching (see below)
4. **Test** — run `npm test`, and `npm run lint` + `npm run typecheck`, before pushing
5. **Build** — run `python3 build3.py` if you changed the shipping app, to check the bundle still builds
6. **Submit a pull request** with a clear description of what you changed and why

### Ways to Help

- **Developers** — pick an open issue or build a planned feature from the roadmap
- **Designers** — improve UI/UX, suggest layout changes, create assets
- **BRACU Students** — test the transcript import with your own grade sheet, report bugs
- **Students from Other Universities** — help adapt Shohoj for your university's grading system (start at `src/core/university.ts`)
- **Campus Ambassadors** — spread the word at your university when Shohoj expands

### Code Guidelines

**The codebase has two frontends.** Which rules apply depends on where you are:

**`js/` — the shipping vanilla-JS app** (bundled by `build3.py`, served at the site root)

- Vanilla HTML/CSS/JS, no framework. Cross-module calls go through `window._shohoj_*` to avoid circular imports
- UI actions use delegated `data-action` handlers registered through `js/core/dispatch.js`. **Never inline `on*` attributes** — the production CSP blocks them, and dev/E2E run un-bundled so CI won't catch it
- **Escape all user-sourced strings** with `escHtml()` / `escAttr()` from `helpers.js` before any `innerHTML` insertion — do not bypass this for convenience
- `build3.py` flattens every module into one scope, so a duplicate top-level name silently breaks the bundle. `npm run check:collisions` guards this in CI
- Adding a tab? Wire it into `build3.py`'s `MAIN_JS_FILES` and the `restoreCalcTab` hash branch, then verify with `python3 build3.py` and `npm run test:bundle`

**`src/` — the TypeScript / React Router shell** (Vite, deployed to `/app/`)

- Strict TypeScript, no emit. `npm run typecheck` is a CI gate
- Domain logic belongs in `src/core/` as pure, framework-free modules, parity-tested against `js/` via `tests/typedCoreParity.test.js`. Keep the two in sync when you change shared behaviour
- Firebase access goes through the typed repositories in `src/platform/firebase/`, never directly from a component
- New routes need a route-level Playwright + axe smoke test in `e2e-shell/`

**Everywhere**

- **All new logic must have tests** in the nearest relevant test file, or a new focused test file if the feature needs one
- **Never commit `shohoj.html`** or any other build artifact — it is generated by `build3.py` in CI
- If you add a `firebase-auth` or `firestore` import, add a matching export to the smoke-test stub in `productionBundleSmoke.test.js` or `npm run test:bundle` fails
- Check that **jsPDF export** doesn't break — only ASCII characters in helvetica font strings

---

## Founder

<p align="center">
  <strong>Sourav Mondal Shuvo</strong><br/>
  CSE Undergraduate, BRAC University<br/><br/>
  <a href="https://www.linkedin.com/in/souravmondalshuvo/">LinkedIn</a> · 
  <a href="https://souravmondalshuvo.github.io/Portfolio">Portfolio</a> · 
  <a href="https://github.com/souravmondalshuvo">GitHub</a>
</p>

---

## License

MIT License — open for the student community.

See [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>"University life, made simple."</em><br/>
  <strong>— Shohoj, সহজ</strong>
</p>
