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
  <img src="https://img.shields.io/badge/Status-Phase%201%20Live-2ECC71?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/Stack-HTML%20·%20CSS%20·%20JS%20·%20Firebase-3498DB?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/University-BRAC%20University-F39C12?style=flat-square" alt="University" />
  <img src="https://img.shields.io/badge/License-MIT-2ECC71?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Departments-16%20Supported-9B59B6?style=flat-square" alt="Departments" />
  <img src="https://img.shields.io/badge/Courses-774%20in%20Catalog-E67E22?style=flat-square" alt="Courses" />
  <img src="https://img.shields.io/badge/Tests-55%20passing-2ECC71?style=flat-square" alt="Tests" />
</p>

---

<p align="center">
  <img src="assets/screenshots/hero-preview.png" alt="Shohoj — CGPA Calculator Preview" width="800" />
</p>

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

### 📅 Semester Planner (New)

Plan your next semester with prerequisite-aware recommendations. Shohoj reads your completed courses and surfaces what you can take now, what is still locked behind missing prerequisites, and what will unlock the most downstream courses if you take it next.

- **Prerequisite checker** — validates every planned course against BRACU's prereq rules, flags hard-prereq misses as blockers and soft-prereq misses as warnings
- **Prereq tree view** — expandable dependency graph for any course, so you can see exactly what you need to clear before it
- **Relevance ranking** — available courses are sorted by department relevance, then by how many future courses they unlock
- **Credit load validation** — enforces the 9/12/15-credit BRACU policy and flags chairman-permission zones
- **CGPA impact preview** — see the projected CGPA if your plan lands a given grade across the board
- **Start Semester** — promote a finished plan directly into a running semester in the Calculator with one click

### ⭐ Faculty Reviews (New)

Pseudonymous faculty ratings from real BRACU students — stored in Firestore, gated behind BRACU G-Suite sign-in.

- **5-dimension ratings** — Teaching Quality, Marking Fairness, Behavior & Attitude, Course Difficulty, Workload
- **Pseudonymous to other users** — the review document body contains no user identifier. Each review's Firestore doc ID is derived from a salted SHA-256 of `uid + facultyInitials + courseCode`, so the same user's reviews for different courses don't share a visible hash
- **One immutable review per user per faculty-course pair** — deterministic doc IDs enforce one public review slot per user and pair. Once submitted, the client cannot edit or overwrite it; duplicate attempts are rejected and the existing review is shown read-only.
- **Per-course panel** — click the ⭐ on any planner course row to see aggregate ratings for every faculty who taught that course, plus sample review text
- **Reviews directory** — search by course code or faculty initials to browse the review corpus (paginated)
- **In-transcript rating** — rate your faculty directly from the course row in the Calculator tab, no separate flow
- **Report for moderation** — every review surfaces a "Report" action that writes to an admin-only `reviewReports` collection, capped at one report per user per review
- **LLM-assisted seeding** — the `scripts/seed_reviews.py` pipeline bulk-imports LLM-processed community posts so the directory isn't empty on day one

#### Anonymity — what we do and don't claim

Because Shohoj is a client-only app (no Cloud Functions today), the review write happens from the browser. That means:

- ✅ Your raw Firebase UID and email are **never** written into the review document.
- ✅ Reviews for different (faculty, course) pairs produce different hashes, so a third party who reads the collection **cannot trivially group all of your reviews together** by looking at a single field.
- ⚠️ Firebase **project administrators** (and anyone with admin SDK access) can audit Firestore logs and in principle correlate a write back to the authenticated session. "Anonymous to the public" ≠ "anonymous to the service operator."
- ⚠️ A determined adversary who already knows your UID could reconstruct your review hash for any (faculty, course) pair.

For stronger guarantees we would need to move review writes behind a Cloud Function that strips the caller's identity before committing — tracked as a future hardening.

### ☁ Cloud Sync

Sign in with your BRACU G-Suite account (`@g.bracu.ac.bd`) and your data syncs automatically across all your devices via Firebase. Your CGPA, semesters, and grades are always with you — whether you're on your phone, laptop, or a friend's computer.

- **Google Sign-In** — custom modal with BRACU domain restriction, no browser dialogs
- **Automatic sync** — data saves to Firestore every time you make a change
- **Real-time updates** — if you edit on another device, this one reloads automatically
- **Offline support** — changes save locally and sync when you reconnect
- **Migration flow** — if you already have local data, a modal lets you choose which to keep
- **Data deletion** — delete your cloud data any time from the sign-out modal

### 🎓 Smart CGPA Calculator

Full semester-based GPA and CGPA calculation using BRACU's exact grading scale. Supports all grade types — A through F, F(NT) (no transfer), Pass/Fail, and Incomplete. Handles retake and repeat detection automatically with both **best-grade** policy (students starting Spring 2024 or earlier) and **latest-grade** policy (Fall 2024 onwards).

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

### 🔄 Smart Retake & Repeat Strategy

Select courses to retake or repeat and see exactly how your CGPA changes — individually per course and cumulatively. Each course is tagged with its improvement mechanism:

- **Retake** — for F grades. Re-enroll in the course for a full semester (allowed up to twice).
- **Repeat** — for grades below B (B- through D-). Sit a special exam once, within 2 semesters of the initial enrollment. No grade cap — the latest grade counts.

Both mechanisms follow the same intake-based CGPA policy (best grade for Spring 2024 and earlier intakes; latest grade for Fall 2024 onwards).

### 📊 GPA Trend Chart

A visual timeline of your GPA across semesters. Spot patterns, track improvement, and see your academic journey at a glance.

<p align="center">
  <img src="assets/screenshots/trend-chart.png" alt="GPA Trend Chart" width="700" />
</p>

### 🎓 Degree Progress Tracker

Visual timeline of your degree journey — credits earned vs total required, semester-by-semester progress nodes, estimated graduation date based on your current pace, and a running credit pace indicator.

### 🔍 Course Autocomplete

Start typing a course code or name and get instant suggestions from a complete BRACU course catalog with **774 courses** across all **16 departments**. Credits auto-fill when you pick a course.

<p align="center">
  <img src="assets/screenshots/autocomplete.png" alt="Course Autocomplete" width="700" />
</p>

### 📥 PDF Export

Export a professionally designed grade report — color-coded grade badges, per-semester GPA breakdown, academic stats, and a clean white-and-green layout ready for print or sharing.

<p align="center">
  <img src="assets/screenshots/pdf-export.png" alt="PDF Export" width="700" />
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

Full dark and light mode with smooth transitions, persisted across sessions.

---

## Design & Experience

Shohoj is built to feel like a real product, not a student project.

- **Liquid glass UI** — glassmorphism panels with layered depth and shine
- **Animated dot matrix background** — spring-physics canvas with mouse-reactive particles
- **Custom cursor system** — animated dot + ring + glow with hover/click states, circle-to-I-beam morphing with spring easing
- **Scroll reveal animations** — IntersectionObserver-powered entrance effects with staggered timing
- **Responsive layout** — works on desktop and mobile with 6 breakpoints (480px → 1920px)

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

**Total: 774 courses in catalog** (including GED/common courses shared across departments)

---

## Tech Stack

| Layer       | Technology                                            | Purpose                                                |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Frontend    | HTML, CSS, Vanilla JavaScript                         | Zero-dependency, fast, portable                        |
| Auth & Sync | Firebase Auth + Firestore (Spark plan)                | Google Sign-In, cloud data sync, real-time updates     |
| PDF Import  | [pdf.js](https://mozilla.github.io/pdf.js/) v3.11.174 | Reading BRACU transcript PDFs                          |
| PDF Export  | [jsPDF](https://github.com/parallax/jsPDF) v2.5.1     | Generating grade report PDFs                           |
| Build       | Python (`build3.py`)                                  | Bundles all modules into a single deployable HTML file |
| Hosting     | GitHub Pages                                          | Free, fast, always available                           |
| Testing     | Node.js (zero dependencies)                           | 55 tests across calculator and parser logic            |
| CI          | GitHub Actions                                        | Runs test suite on every push and pull request         |
| CD          | GitHub Actions + GitHub Pages                         | Builds and deploys automatically on every push to main |

Both CDN scripts are loaded with **SRI integrity hashes** (`sha384-...`) to prevent supply-chain tampering.

**Deployment pipeline:** every push to `main` triggers CI (tests) followed by CD (build + deploy). If tests fail, the live site is never touched. The built `shohoj.html` is deployed to the `gh-pages` branch as `index.html` and served by GitHub Pages.

**Phase 2+** will migrate to React.js, Tailwind CSS, and Vercel as the platform scales beyond academic tools.

---

## Security

Shohoj has been through a security audit and the following protections are in place across the codebase:

- **XSS prevention** — all user-sourced strings (course names, semester labels, PDF-imported data, error messages) are escaped via `escHtml()` and `escAttr()` helpers in `helpers.js` before any `innerHTML` insertion.
- **Safe transcript import** — `applyImport()` no longer serialises parsed PDF data into an `onclick` attribute. Parsed data is held in a JS-side `_pendingImport` slot and consumed directly, eliminating attribute-injection risk.
- **localStorage sanitisation** — `sanitizeRestoredState()` validates and strips malformed or legacy data on every load, including stripping legacy `<sup>` HTML from semester names.
- **CDN subresource integrity** — both `jsPDF` and `pdf.js` are loaded with `integrity="sha384-..."` and `crossorigin="anonymous"` attributes in `index.html`.
- **BRACU domain restriction** — Google Sign-In is restricted to `@g.bracu.ac.bd` accounts only, enforced both client-side after the popup and server-side via Firestore security rules.
- **Firestore security rules** — users can only read and write their own document (`users/{uid}`), and only if their token email matches `.*@g\.bracu\.ac\.bd`. Faculty reviews (`facultyReviews/{reviewId}`) accept creates from BRACU accounts only, require server timestamps, are readable by BRACU accounts, and are **immutable** once written — no client-side updates or deletes. The UI now treats duplicates as read-only instead of attempting edits. Review reports (`reviewReports/{uid_reviewId}`) are write-only from the client, must point at a real review, and are capped at one report per user per review. `facultyProfiles` is read-only for all clients; only admin-side seed scripts can write to it. No other access is permitted.
- **Anonymous faculty reviews** — the public review document body stores no UID, email, or other user identifier. The Firestore doc ID is a salted SHA-256 of `uid + facultyInitials + courseCode`, which reduces cross-review linkage compared with a single reusable user hash.
- **Firebase config exposure** — the Firebase config is stored in `index.html` as `window._shohoj_firebase_config` rather than inside JS source files, keeping it out of the GitHub secret scanner's path. The API key is safe to expose as Firestore rules enforce all access control.

---

## Roadmap

### Phase 1 — Academic Core _(Current)_

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
| Advising Week Checklist             | 🔜 Planned  |
| Freshman Survival Guide             | 🔜 Planned  |

### Phase 2 — Community Layer

Review corpus seeding, past papers & notes library, interview experience board, study group finder. Faculty reviews shipped with Phase 1; Phase 2 focuses on growing the review corpus and layering resource-sharing on top.

### Phase 3 — Campus Life

Interactive campus map, cafeteria guide, bus routes & timings, lost & found board.

### Phase 4 — Career & Opportunities

Internship listings, alumni directory, resume review board, company hiring history.

### Phase 5 — Marketplace

Secondhand textbook market, carpooling board, student discount directory.

### Phase 6 — Intelligence Layer

Smart semester recommendations, burnout warning system, graduation timeline predictor.

---

## Multi-University Vision

Shohoj is designed from Day 1 to scale beyond BRAC University. The architecture supports university-scoped data — a student logs in with their university email, and the system loads their university's entire ecosystem automatically.

| Stage | Scope                                  |
| ----- | -------------------------------------- |
| v1.0  | BRAC University                        |
| v2.0  | NSU, IUB, EWU                          |
| v3.0  | All private universities in Bangladesh |
| v4.0  | Public universities (BUET, DU, CUET)   |
| v5.0  | South Asia                             |

---

## Project Structure

```
Shohoj/
├── assets/
│   ├── shohoj-logo.png
│   └── screenshots/
├── css/
│   └── style.css                 All styles — themes, animations, glassmorphism, auth UI
├── js/
│   ├── main.js                   Entry point — wires all modules together
│   ├── auth/
│   │   └── firebase.js           Firebase Auth + Firestore cloud sync
│   ├── core/
│   │   ├── grades.js             BRACU grading scale & grade detection
│   │   ├── helpers.js            Semester utilities, escHtml/escAttr, sanitizers
│   │   ├── state.js              Shared state object, localStorage persistence
│   │   ├── departments.js        16 department definitions with preset semesters
│   │   ├── catalog.js            Full BRACU course database (774 courses)
│   │   ├── calculator.js         GPA/CGPA engine, retake/repeat policy, credit warnings
│   │   ├── faculty.js            Faculty directory cache, initials normalization
│   │   └── reviews.js            Review submission & fetch layer, aggregation helpers
│   ├── ui/
│   │   ├── render.js             Semester rendering, drag-drop reorder, faculty input
│   │   ├── suggestions.js        Course autocomplete suggestion portal
│   │   ├── charts.js             Canvas GPA trend chart
│   │   ├── simulator.js          CGPA Goal Simulator & Smart Retake & Repeat Strategy
│   │   ├── playground.js         CGPA Playground — Grade Changer & Reverse Solver
│   │   ├── planner.js            Semester Planner — prereq checks, plan builder, tree view
│   │   ├── reviews.js            Review modal, per-course panel, reviews directory
│   │   ├── tracker.js            Degree Progress Tracker with timeline
│   │   └── modals.js             Transcript import modal, PDF export
│   ├── animations/
│   │   ├── cursor.js             Custom animated cursor with event delegation
│   │   ├── dotmatrix.js          Spring-physics dot matrix canvas background
│   │   └── reveal.js             IntersectionObserver scroll reveal system
│   └── import/
│       └── parser.js             BRACU transcript PDF parser (dual-strategy)
├── scripts/
│   └── seed_reviews.py           Bulk-import LLM-processed faculty reviews into Firestore
├── firestore.rules               Firestore security rules (users, facultyReviews, facultyProfiles)
├── tests/
│   ├── calculator.test.js        40 tests — GPA engine, retake/repeat policies, grade detection
│   └── parser.test.js            15 tests — department detection, semester parsing, blob parser
├── .github/
│   └── workflows/
│       ├── ci.yml                Runs full test suite on push and pull request
│       └── cd.yml                Builds and deploys to GitHub Pages on push to main
├── index.html                    Main HTML shell
├── package.json                  Test runner scripts (no dependencies)
├── README.md
├── LICENSE
└── build3.py                     Build script — bundles into single shohoj.html
```

---

## Getting Started

**Use it online:**
Visit **[souravmondalshuvo.github.io/Shohoj](https://souravmondalshuvo.github.io/Shohoj)** — no installation needed.

**Run locally:**

```bash
git clone https://github.com/souravmondalshuvo/Shohoj.git
cd Shohoj
```

Open `index.html` in your browser, or use a local server:

```bash
python3 -m http.server 8000
# Visit http://localhost:8000
```

**Run tests:**

```bash
npm test
# Results: 55 passed, 0 failed, 55 total
```

**Build the bundled version:**

```bash
python3 build3.py
# Outputs shohoj.html — single file, ready to deploy
```

> **Note:** You don't need to run the build manually before pushing — the CD pipeline does it automatically on every push to `main`. Run it locally only if you want to preview the bundled output.

> **Cloud sync:** requires a Firebase project. The live site uses the production Firebase config already embedded in `index.html`. For local development, cloud sync features will work as long as `localhost` is added as an authorized domain in your Firebase console.

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
- Pass (P) and Incomplete (I) grades are excluded from GPA calculations entirely.
- F(NT) grades count the credits in the denominator but contribute 0 grade points.
- Running semester courses are included in **projected CGPA** but excluded from **earned credits**.

### Cloud Sync

- Requires a `@g.bracu.ac.bd` Google account. Other email addresses are rejected both client-side and by Firestore security rules.
- Firestore document limit: **512KB per user**. A typical full transcript is well under 50KB, so this limit is unlikely to be reached in practice.
- Offline changes are saved to `localStorage` and synced automatically when reconnected.
- Real-time sync: if you edit data on two devices simultaneously, last-write-wins. No merge conflict resolution is performed.

### Semester Planner

- Prerequisite data currently covers **CSE, EEE, ECE, MAT, PHY, BBA, ECO, and ENG** departments (approx. 300 prerequisite rules).
- Departments not yet in the prereq database (ARC, ANT, PHR, LAW, MIC, BIO, APE) will show courses as unlocked by default — not because they have no prerequisites, but because the data hasn't been added yet.
- The planner does not check time conflicts or section availability — that requires integration with BRACU CONNECT, which is planned for a future phase.

### Faculty Reviews

- Reading and submitting reviews requires sign-in with a `@g.bracu.ac.bd` account — enforced both client-side and by Firestore security rules.
- Reviews are **immutable once submitted**. There is no edit or delete flow from the client; if you try to rate the same faculty-course pair again, Shohoj shows your existing review in read-only mode instead. If a review needs to be removed (e.g. abuse), it has to be handled server-side by an admin.
- Faculty are keyed by **initials only** (2–6 uppercase letters). The full faculty directory with names/departments will be seeded over time via `scripts/seed_reviews.py` and the `facultyProfiles` collection.
- The review corpus starts empty. A panel showing "no reviews yet" for a course is not a bug — it simply means nobody has rated any faculty for that course yet. Early users carry the cost of seeding.
- Aggregates use simple averages across all reviews for a faculty-course pair. No recency weighting, no outlier filtering, no minimum-sample gating — this will be tuned once the corpus grows.

### Degree Progress Tracker

- Graduation estimate assumes your **current credit-per-semester pace** remains constant. One unusually light or heavy semester will skew the estimate temporarily.
- Credit requirements are sourced from BRACU's published program structure. If your program has been updated recently, the total may differ by a few credits.

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

Touch devices: the custom cursor and dot-matrix animation are automatically disabled on touch devices.

### Data Storage

| Key                | Location     | Contents                                      |
| ------------------ | ------------ | --------------------------------------------- |
| `shohoj_cgpa_v1`          | localStorage | All semesters, grades, department, settings                            |
| `shohoj_theme`            | localStorage | `"dark"` or `"light"`                                                  |
| `shohoj_last_sync`        | localStorage | Timestamp of last successful cloud sync                                |
| `users/{uid}`             | Firestore    | Same shape as localStorage value, JSON string                          |
| `facultyReviews/{faculty_course_hash}` | Firestore | Immutable review docs — faculty initials, course code, 5 ratings, text, server timestamp; duplicate writes are rejected |
| `reviewReports/{uid_reviewId}` | Firestore | Admin-only moderation reports, deduplicated per user per review |
| `facultyProfiles/{init}`  | Firestore    | Read-only faculty directory seeded by admin scripts                    |

Data is never sent to any server other than Firestore. There are no ads, no analytics on your grade data, and no third-party data sharing. Google Analytics (GA4) tracks page views only — no grade or personal data is included.

### What's Production-Ready

| Feature                                         | Status                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| CGPA Calculator                                 | ✅ Production-ready                                     |
| PDF Transcript Import                           | ✅ Production-ready                                     |
| PDF Grade Report Export                         | ✅ Production-ready                                     |
| Course Autocomplete (774 courses)               | ✅ Production-ready                                     |
| Cloud Sync (Firebase)                           | ✅ Production-ready                                     |
| CGPA Playground (Grade Changer, Reverse Solver) | ✅ Production-ready                                     |
| CGPA Goal Simulator                             | ✅ Production-ready                                     |
| Retake & Repeat Strategy Analyzer               | ✅ Production-ready                                     |
| Degree Progress Tracker                         | ✅ Stable — graduation estimate is an approximation     |
| Semester Planner                                | 🔶 Stable — prereq data incomplete for some departments |
| Faculty Reviews                                 | 🔶 Live — corpus seeding in progress                    |

---

## Contributing

Shohoj is built for students, by students. Contributions are welcome.

### How to Contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** — follow the existing code style (vanilla JS, no frameworks in Phase 1)
4. **Test** — run `npm test` and verify all 55 tests pass
5. **Build** — run `python3 build3.py` to regenerate the bundled file
6. **Submit a pull request** with a clear description of what you changed and why

### Ways to Help

- **Developers** — pick an open issue or build a planned feature from the roadmap
- **Designers** — improve UI/UX, suggest layout changes, create assets
- **BRACU Students** — test the transcript import with your own grade sheet, report bugs
- **Students from Other Universities** — help adapt Shohoj for your university's grading system
- **Campus Ambassadors** — spread the word at your university when Shohoj expands

### Code Guidelines

- Phase 1 is **vanilla HTML/CSS/JS** — no frameworks, no build tools beyond `build3.py`
- All cross-module calls use `window._shohoj_*` to avoid circular imports
- Functions called from HTML `onclick`/`onchange` are assigned to `window.*` in `main.js`
- **Escape all user-sourced strings** with `escHtml()` / `escAttr()` from `helpers.js` before any `innerHTML` insertion — do not bypass this for convenience
- **All new logic must have tests** in `tests/calculator.test.js` or `tests/parser.test.js`
- Test locally with `npm test` before submitting a pull request
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
