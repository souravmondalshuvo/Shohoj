# Architecture

Shohoj is a mostly static web app served from GitHub Pages, with Firebase Auth,
Firestore, and one maintained Cloudflare Worker for R2 paper files. There is no
traditional app server; the Worker is the only backend code in this repo.

```
Browser
  ↓
GitHub Pages (HTML, CSS, bundled JS)
  ↓                                ↓
Firebase Auth (Google sign-in)   Cloudflare Worker → R2 (past papers)
  ↓
Firestore (user data, reviews, app feedback, paper metadata)
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
| Charts | Chart.js | Admin dashboard analytics |
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
│   ├── admin-entry.js             Entry point for the admin bundle
│   ├── config/
│   │   ├── runtime-config.template.js   __PLACEHOLDER__ tokens replaced at build
│   │   └── runtime-config.js     (gitignored) Generated from .env.local / GH secrets
│   ├── auth/firebase.js           Firebase init, Google sign-in, sync, App Check
│   ├── core/
│   │   ├── grades.js              BRACU grading scale
│   │   ├── helpers.js             escHtml, escAttr, sanitizers
│   │   ├── state.js               In-memory state + localStorage persistence
│   │   ├── departments.js         16 department definitions
│   │   ├── catalog.js             Course database (851 courses)
│   │   ├── calculator.js          GPA/CGPA engine
│   │   ├── dispatch.js            Delegated UI action registry
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
│   │   ├── previewModal.js        Shared paper preview modal
│   │   ├── tracker.js             Degree progress tracker
│   │   ├── adminDashboard.js      Admin-only moderation dashboard
│   │   ├── feedback.js            Feedback form + board
│   │   └── modals.js              Transcript import + PDF export
│   ├── animations/
│   │   ├── cursor.js              Custom animated cursor
│   │   ├── dotmatrix.js           Spring-physics canvas background
│   │   └── reveal.js              IntersectionObserver scroll reveal
│   └── import/parser.js           BRACU transcript PDF parser
├── data/                          Seed JSONL datasets injected by build3.py
├── scripts/
│   ├── generate_runtime_config.js Generate local runtime-config.js
│   ├── rename_faculty_initials.py Faculty seed-data maintenance helper
│   ├── set_admin_claim.js         Grant/revoke Firebase admin custom claim
│   ├── seed_faculty.py            Bulk-import faculty profiles
│   └── seed_reviews.py            Bulk-import LLM-processed reviews
├── tests/
│   ├── calculator.test.js
│   ├── parser.test.js
│   ├── planner.test.js
│   ├── render.test.js
│   ├── tracker.test.js
│   ├── reviews.test.js
│   ├── adminDashboard.test.js
│   └── firestore.rules.test.js    Emulator-driven security rules tests
├── worker/                        Cloudflare Worker for past-paper uploads
│   └── test/worker.test.js        Worker validation tests
├── firestore.rules                Firestore security rules
├── firebase.json                  Emulator config
├── build3.py                      Build script
└── .github/workflows/             ci.yml, cd.yml, deploy-worker.yml
```

## Module boundaries

- **core/** — pure logic, no DOM, no Firebase. Tested directly with Node.
- **ui/** — DOM rendering. Calls into core/ for logic.
- **auth/firebase.js** — only file that touches Firebase SDK. Exposes hooks via `window._shohoj_*` so other modules don't import Firebase directly.
- **animations/** — visual sugar, isolated from app state.
- **import/** — PDF parsing, isolated.

Cross-module calls use `window._shohoj_*` where direct imports would create circular dependencies or cross-bundle coupling. UI event handlers use delegated `data-action` callbacks via `js/core/dispatch.js`. Most ES module imports are stripped by `build3.py`; `firebase.js` remains a real module because it imports Firebase SDKs from CDN.

## Data flow

1. Browser loads `runtime-config.js` (generated from `.env.local` locally or GitHub Actions secrets in CI), then the bundled `shohoj.html`.
2. Firebase App Check obtains a reCAPTCHA v3 attestation. Every Firestore call is gated by App Check.
3. User signs in with `@g.bracu.ac.bd` Google account. firebase.js receives the auth state, reads the ID token (carries `admin: true` claim if granted), and starts a Firestore snapshot listener on `users/{uid}`.
4. Local edits update the state object → debounced write to Firestore + localStorage.
5. Remote changes from another device come through the snapshot listener and rebuild the UI.
6. Past-paper uploads/downloads go through the Cloudflare Worker, which verifies the Firebase ID token (BRACU email or `admin: true`) before touching R2. New uploads are stored under `papers/{COURSE}/{UPLOADER_UID}/{filename}` and restricted to PDF/PNG/JPEG/WebP/GIF. Paper metadata is in Firestore (`papers/{paperId}`); the file body is in R2.
7. Admin actions (approve/delete papers, delete reported reviews, dismiss reports, delete feedback) are written to `adminLogs/{id}` for auditability.

## Sync model

The cloud sync is **last-write-wins with same-tab suppression**:

- Every local edit fingerprints the data and writes through with a short debounce.
- The Firestore snapshot listener compares incoming data fingerprints to the local one. If they match, nothing happens. If they differ AND the change didn't originate in this tab (`_localWriteAt` grace window), the listener overwrites localStorage and reloads the page with a toast.
- This is good enough for one user across devices: phone edits propagate to laptop within seconds.
- It is **not** a CRDT — two simultaneous edits from two devices will resolve to whichever Firestore commit arrives last. For an app where the user is always the same person, this hasn't been a problem in practice. If real conflicts surface, the next iteration is to chunk the user document into sub-collections (e.g. `users/{uid}/semesters/{semesterId}`) so device-level edits target different documents.

## Build pipeline

`build3.py` reads each JS file in dependency order, strips `import`/`export` syntax, inlines into a single `<script>` block, inlines CSS, keeps `firebase.js` as a separate `<script type="module">` (because it imports from CDN), and writes self-contained `shohoj.html` and `admin.html`. CD deploys those as `index.html` and `admin/index.html` on GitHub Pages.

The `runtime-config.js` file is generated fresh from `.env.local` (locally) or GitHub Actions secrets (in CI) before every build, so the bundled HTML carries Firebase config without it sitting in source.

## See also

- [SECURITY.md](SECURITY.md) — auth, authorization, App Check, threat model
- [PRIVACY.md](PRIVACY.md) — what's collected, where it lives, how to delete it
- [DEPLOYMENT.md](DEPLOYMENT.md) — required secrets, CD pipeline, local dev, Worker deploy, admin claim grant/revoke
