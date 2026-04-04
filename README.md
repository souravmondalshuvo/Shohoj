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
  <img src="https://img.shields.io/badge/Status-Phase%201%20Live-2ECC71?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/Stack-HTML%20·%20CSS%20·%20JS-3498DB?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/University-BRAC%20University-F39C12?style=flat-square" alt="University" />
  <img src="https://img.shields.io/badge/License-MIT-2ECC71?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Departments-16%20Supported-9B59B6?style=flat-square" alt="Departments" />
  <img src="https://img.shields.io/badge/Courses-774%20in%20Catalog-E67E22?style=flat-square" alt="Courses" />
</p>

---

<p align="center">
  <img src="assets/screenshots/hero-preview.png" alt="Shohoj — CGPA Calculator Preview" width="800" />
</p>

---

## What is Shohoj?

**Shohoj (সহজ)** means _"simple"_ in Bengali.

It is a university life platform built by a BRAC University student, for every university student in Bangladesh. One login. One place. Your entire university life.

Shohoj starts with the tool every student needs most — a **smart CGPA calculator** that understands BRACU's exact grading system, reads your official transcript PDF, and helps you plan your path to graduation.

> **[Try it live →](https://souravmondalshuvo.github.io/Shohoj)**

---

## Why This Exists

I am **Sourav Mondal Shuvo**, a CSE undergraduate at BRAC University.

Every semester I watched students — including myself — struggle with the same problems. Manual GPA calculations on phone calculators. No idea how retakes affect CGPA. Going into advising week with no plan. Important information buried in Facebook groups and word of mouth.

Nobody was building a solution. So I decided to build it myself.

---

## Features — What's Live Today

### 🎓 Smart CGPA Calculator

Full semester-based GPA and CGPA calculation using BRACU's exact grading scale. Supports all grade types — A through F, F(NT) (no transfer), Pass/Fail, and Incomplete. Handles retake detection automatically with both **best-grade** policy (students starting Spring 2024 or earlier) and **latest-grade** policy (Fall 2024 onwards).

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

Set a target CGPA and see what average GPA you need across your remaining credits. Includes a difficulty assessment, credit-pace breakdown showing how many semesters it'll take at 9/12/15 credits per semester, and smart retake suggestions ranked by CGPA impact.

### 🔄 Retake Impact Analyzer

Select courses to retake and see exactly how your CGPA changes — individually per course and cumulatively. Includes target grade selection with live CGPA preview, so you can plan the most efficient retake strategy.

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

**Total: 758 courses in catalog** (including GED/common courses shared across departments)

---

## Tech Stack

| Layer      | Technology                                            | Purpose                                                |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Frontend   | HTML, CSS, Vanilla JavaScript                         | Zero-dependency, fast, portable                        |
| PDF Import | [pdf.js](https://mozilla.github.io/pdf.js/) v3.11.174 | Reading BRACU transcript PDFs                          |
| PDF Export | [jsPDF](https://github.com/parallax/jsPDF) v2.5.1     | Generating grade report PDFs                           |
| Build      | Python (`build3.py`)                                  | Bundles all modules into a single deployable HTML file |
| Hosting    | GitHub Pages                                          | Free, fast, always available                           |

Both CDN scripts are loaded with **SRI integrity hashes** (`sha384-...`) to prevent supply-chain tampering.

**Phase 2+** will migrate to React.js, Tailwind CSS, Firebase, and Vercel as the platform scales beyond academic tools.

---

## Security

Shohoj has been through a security audit and the following protections are in place across the codebase:

- **XSS prevention** — all user-sourced strings (course names, semester labels, PDF-imported data, error messages) are escaped via `escHtml()` and `escAttr()` helpers in `helpers.js` before any `innerHTML` insertion.
- **Safe transcript import** — `applyImport()` no longer serialises parsed PDF data into an `onclick` attribute. Parsed data is held in a JS-side `_pendingImport` slot and consumed directly, eliminating attribute-injection risk.
- **localStorage sanitisation** — `sanitizeRestoredState()` validates and strips malformed or legacy data on every load, including stripping legacy `<sup>` HTML from semester names.
- **CDN subresource integrity** — both `jsPDF` and `pdf.js` are loaded with `integrity="sha384-..."` and `crossorigin="anonymous"` attributes in `index.html`.

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
| Retake Impact Analyzer              | ✅ Complete |
| Degree Progress Tracker             | ✅ Complete |
| Security audit & XSS hardening      | ✅ Complete |
| Semester Planner with Prerequisites | 🔜 Planned  |
| Course Difficulty Map               | 🔜 Planned  |
| Advising Week Checklist             | 🔜 Planned  |
| Freshman Survival Guide             | 🔜 Planned  |

### Phase 2 — Community Layer

Course & faculty reviews, past papers & notes library, interview experience board, study group finder.

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
│       ├── hero-preview.png
│       ├── calculator.png
│       ├── transcript-import.png
│       ├── trend-chart.png
│       ├── autocomplete.png
│       └── pdf-export.png
├── css/
│   └── style.css                 All styles — themes, animations, glassmorphism
├── js/
│   ├── main.js                   Entry point — wires all modules together
│   ├── core/
│   │   ├── grades.js             BRACU grading scale & grade detection
│   │   ├── helpers.js            Semester utilities, escHtml/escAttr, sanitizers
│   │   ├── state.js              Shared state object, localStorage persistence
│   │   ├── departments.js        16 department definitions with preset semesters
│   │   ├── catalog.js            Full BRACU course database (758 courses)
│   │   └── calculator.js         GPA/CGPA engine, retake policy, credit warnings
│   ├── ui/
│   │   ├── render.js             Semester rendering, drag-drop reorder
│   │   ├── suggestions.js        Course autocomplete suggestion portal
│   │   ├── charts.js             Canvas GPA trend chart
│   │   ├── simulator.js          CGPA Goal Simulator & Smart Retake Strategy
│   │   ├── playground.js         CGPA Playground — Grade Changer & Reverse Solver
│   │   ├── tracker.js            Degree Progress Tracker with timeline
│   │   └── modals.js             Transcript import modal, PDF export
│   ├── animations/
│   │   ├── cursor.js             Custom animated cursor with event delegation
│   │   ├── dotmatrix.js          Spring-physics dot matrix canvas background
│   │   └── reveal.js             IntersectionObserver scroll reveal system
│   └── import/
│       └── parser.js             BRACU transcript PDF parser (dual-strategy)
├── index.html                    Main HTML shell
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

**Build the bundled version:**

```bash
python3 build3.py
# Outputs shohoj.html — single file, ready to deploy
```

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
4. **Test** — open `index.html` locally, verify your changes work in both dark and light themes
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
- Test in both **dark and light themes**
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
