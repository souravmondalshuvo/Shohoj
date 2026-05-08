# Architecture

Shohoj is a static web app served from GitHub Pages, with Firebase Auth, Firestore, and a Cloudflare Worker for files. There is no server-side code we maintain.

```
Browser
  ↓
GitHub Pages (HTML, CSS, bundled JS)
  ↓                                ↓
Firebase Auth (Google sign-in)   Cloudflare Worker → R2 (past papers)
  ↓
Firestore (user data, reviews, feedback, paper metadata)
```

## Tech stack

| Layer | What | Why |
|-------|------|-----|
| Frontend | HTML, CSS, vanilla JS | Zero deps, fast to load, easy to host |
| Auth | Firebase Auth (Google sign-in, BRACU domain gate) | Free tier, popular Google account integration |
| Database | Firestore | Free tier, real-time sync, fine-grained rules |
| App Check | reCAPTCHA v3 | Blocks scripted abuse without user friction |
| File storage | Cloudflare R2 via Worker | Cheaper than Firebase Storage, full control |
| PDF read | pdf.js | Parses BRACU transcripts |
| PDF write | jsPDF | Exports grade reports |
| Build | Python (`build3.py`) | Bundles JS modules into one HTML file per page |
| Hosting | GitHub Pages | Free, static, fast |
| CI/CD | GitHub Actions | Tests on every push, deploys on push to main |

## Source layout

```
Shohoj/
├── index.html                     Landing page shell (CSP, runtime config, modal markup)
├── admin/index.html               Admin shell (separate small bundle)
├── css/style.css                  All styles
├── js/
│   ├── main.js                    Entry point — wires modules together
│   ├── config/
│   │   ├── runtime-config.template.js   __PLACEHOLDER__ tokens replaced at build
│   │   └── runtime-config.js     (gitignored) Generated from .env / GH secrets
│   ├── auth/firebase.js           Firebase init, Google sign-in, sync, App Check
│   ├── core/
│   │   ├── grades.js              BRACU grading scale
│   │   ├── helpers.js             escHtml, escAttr, sanitizers
│   │   ├── state.js               In-memory state + localStorage persistence
│   │   ├── departments.js         16 department definitions
│   │   ├── catalog.js             Course database (851 courses)
│   │   ├── calculator.js          GPA/CGPA engine
│   │   ├── faculty.js             Faculty initials utilities
│   │   ├── reviews.js             Review submit/fetch + aggregation
│   │   └── papers.js              Past papers library
│   ├── ui/
│   │   ├── render.js              Semester rendering
│   │   ├── suggestions.js         Course autocomplete
│   │   ├── charts.js              GPA trend chart
│   │   ├── simulator.js           CGPA goal simulator
│   │   ├── playground.js          Grade changer + reverse solver
│   │   ├── planner.js             Semester planner (prereqs, plan builder)
│   │   ├── reviews.js             Review modals
│   │   ├── reviewsTab.js          Reviews directory
│   │   ├── difficultyMap.js       Course difficulty map
│   │   ├── papersTab.js           Past papers tab
│   │   ├── tracker.js             Degree progress tracker
│   │   ├── adminDashboard.js      Admin-only moderation dashboard
│   │   ├── feedback.js            Feedback form + board
│   │   └── modals.js              Transcript import + PDF export
│   ├── animations/
│   │   ├── cursor.js              Custom animated cursor
│   │   ├── dotmatrix.js           Spring-physics canvas background
│   │   └── reveal.js              IntersectionObserver scroll reveal
│   └── import/parser.js           BRACU transcript PDF parser
├── scripts/
│   ├── set_admin_claim.js         Grant/revoke Firebase admin custom claim
│   └── seed_reviews.py            Bulk-import LLM-processed reviews
├── tests/
│   ├── calculator.test.js
│   ├── parser.test.js
│   ├── planner.test.js
│   ├── render.test.js
│   ├── tracker.test.js
│   ├── reviews.test.js
│   └── firestore.rules.test.js    Emulator-driven security rules tests
├── worker/                        Cloudflare Worker for past-paper uploads
├── firestore.rules                Firestore security rules
├── firebase.json                  Emulator config
├── build3.py                      Build script
└── .github/workflows/             ci.yml, cd.yml
```

## Module boundaries

- **core/** — pure logic, no DOM, no Firebase. Tested directly with Node.
- **ui/** — DOM rendering. Calls into core/ for logic.
- **auth/firebase.js** — only file that touches Firebase SDK. Exposes hooks via `window._shohoj_*` so other modules don't import Firebase directly.
- **animations/** — visual sugar, isolated from app state.
- **import/** — PDF parsing, isolated.

Cross-module calls use `window._shohoj_*` because the Phase-1 build is non-module bundled. ES module imports are stripped by `build3.py`.

## Data flow

1. User signs in with `@g.bracu.ac.bd` Google account.
2. firebase.js receives the auth state, reads the ID token (carries `admin: true` claim if granted), and starts a Firestore snapshot listener on `users/{uid}`.
3. Local edits update the state object → debounced write to Firestore + localStorage.
4. Remote changes from another device come through the snapshot listener and rebuild the UI.

## Build pipeline

`build3.py` reads each JS file in dependency order, strips `import`/`export` syntax, inlines into a single `<script>` block, inlines CSS, keeps `firebase.js` as a separate `<script type="module">` (because it imports from CDN), and writes self-contained `shohoj.html` and `admin.html`. Those go to GitHub Pages.

The `runtime-config.js` file is generated fresh from `.env` (locally) or GitHub Actions secrets (in CI) before every build, so the bundled HTML carries Firebase config without it sitting in source.
