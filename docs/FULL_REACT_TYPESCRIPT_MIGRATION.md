# Full React + TypeScript + Vite Migration — Audit & Plan

> **Status:** Phase 0 (audit + baseline) complete. No application behavior changed.
> **Branch:** `refactor/full-react-typescript-vite-migration`
> **Date:** 2026-06-21
> **Scope note:** This is a multi-phase program, not a single change. The legacy
> `build3.py` single-file deploy path stays the live production path until Vite
> reaches verified parity (Phase 13) and is retired only at Phase 14.

This document supersedes the high-level sketch in
[`REACT_VITE_MIGRATION.md`](REACT_VITE_MIGRATION.md) by recording the *actual*
current state of the repository and a phase-by-phase checklist. The older doc
remains the historical record of how the typed-core/React-island work began.

---

## 1. Baseline test results (recorded 2026-06-21)

Environment: macOS (darwin 25.5.0), Node **v25.1.0**, Java (OpenJDK) 21.0.5,
Playwright Chromium 1228 cached. Run on branch
`refactor/full-react-typescript-vite-migration` **before any edits** other than
this document.

| Command | Result | Notes |
|---|---|---|
| `npm ci` (`--dry-run`) | ✅ green | Lockfile in sync; full destructive reinstall not run because existing install already produced green suites and dry-run confirms lock integrity (memory: lock-drift risk is from incremental `npm install`, not `npm ci`). |
| `npm run lint` | ✅ 0 errors, 77 warnings | Warnings are pre-existing and correctness-only (do not block CI per repo policy). |
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 | Clean. |
| `npm run test:unit` | ✅ 24 files, all pass | Pure core + worker-cron unit tests. |
| `npm run test:worker` | ✅ 62 passed, 0 failed | Worker/cron suite. |
| `npm run test:rules` (Firestore emulator) | ✅ 54 passed, 0 failed | Emulator boots via `firebase emulators:exec`. |
| `npm run test:e2e` (legacy un-bundled source) | ✅ 51 passed | Playwright against raw `js/` ESM. |
| `npm run test:e2e:vite` (Vite build) | ✅ 3 passed | React-island + firebase-isolation specs. |
| `npm run build:vite` | ✅ exit 0 | Warns: `main` chunk 795.71 kB (gzip 229.31 kB) > 500 kB. |
| `python3 build3.py` | ✅ exit 0 | Builds `shohoj.html` (3120 KB) + `admin.html` (444 KB). |
| `npm run test:bundle` | ✅ pass | Production bundle smoke (against build3.py output). |

**Conclusion: the baseline is fully green.** Every failure encountered later in
the migration is therefore attributable to migration work, not a pre-existing
break. The only standing warnings are (a) 77 lint warnings and (b) the >500 kB
Vite `main` chunk — both pre-existing, both tracked below.

The 77 lint warnings break down as: 2 `no-explicit-any` in `src/core/helpers.ts`,
3 `no-unused-vars` in typed routine core, and the rest unused-vars in test files
and `worker/index.js`. None block CI.

---

## 2. Existing architecture inventory

Shohoj currently ships **two parallel frontend build paths**:

### Path A — legacy production (`build3.py`, LIVE)
`build3.py` inlines everything into two self-contained HTML files and is what
GitHub Pages actually serves today:

- Inlines **53 main JS files** + **11 admin JS files** into `shohoj.html` /
  `admin.html`.
- Inlines CSS from `css/style.css`.
- Inlines **7 Firebase module files** (`js/auth/*`).
- Injects **116 faculty profiles** + **579 seed reviews** from
  `data/faculty_profiles.jsonl` / `data/input_reviews.jsonl` into placeholder
  arrays (`SEEDED_REVIEWS`, `SEEDED_FACULTY_PROFILES`).
- **Hardens CSP**: replaces `unsafe-inline` in `script-src` with sha256 hashes
  (7 for main, 4 for admin) and drops `unsafe-inline`.
- Output: `shohoj.html` (~3.12 MB), `admin.html` (~444 KB). Both are
  **gitignored build artifacts** (`shohoj.html`, `admin.html`, `dist` are in
  `.gitignore`) — never committed (see memory: "Do not push shohoj.html").

### Path B — Vite (in progress, NOT yet live)
`vite.config.js` builds the same `index.html` + `admin/index.html` as native
ESM plus a standalone firebase chunk, into a multi-file `dist/`. Four custom
plugins under `vite/` keep it behaviorally aligned with build3.py:

| Plugin | Responsibility |
|---|---|
| `vite/seed-injection.js` | Injects `SEEDED_REVIEWS` / `SEEDED_FACULTY_PROFILES` exactly like build3.py. Parity: `tests/seedInjectionParity.test.js`. |
| `vite/react-island.js` | Injects the React CGPA-summary island entry (`src/react/cgpa-summary-entry.tsx`) into `index.html` at transform time only. |
| `vite/firebase-isolation.js` | Strips inline firebase `<script type=module>` and points the page at the standalone firebase chunk so a blocked gstatic import can't take the calculator down. Parity: `e2e-vite/firebase-isolation.spec.js`. |
| `vite/copy-globals.js` | Copies non-module globals (`js/qr-data.js`, `js/config/runtime-config.js`) into the build. |

### Typed-core migration already underway
A v0.4 effort moved **browser-independent academic logic** to `src/core/*.ts`
(25 TS/TSX files exist), keeping the legacy `js/core/*.js` modules as the live
implementation and guarding equivalence with `tests/typedCoreParity.test.js`.
React work so far is **four CGPA "islands"** (`src/react/*.tsx`) injected only in
the Vite build.

### Code size
- `js/` first-party runtime: **~21,525 LOC** across 64 `.js` files (excludes the
  1.8 MB generated `js/qr-data.js`).
- `src/`: 25 `.ts`/`.tsx` files (typed core + 4 React islands) + 1 `.js`
  (firebase entry).

---

## 3. Entry points

| Entry | File | Notes |
|---|---|---|
| Main app (legacy) | `index.html` → `js/main.js` | Script tags inlined by build3.py. |
| Admin app (legacy) | `admin/index.html` → `js/admin-entry.js` | Separate page. |
| Main app (Vite) | `index.html` + `src/react/cgpa-summary-entry.tsx` island | Plus `js/qr-data.js` + `js/config/runtime-config.js` as globals. |
| Firebase (Vite chunk) | `src/firebase/firebase-entry.js` | Dedicated rollup input → isolated chunk. |
| Runtime config | `js/config/runtime-config.js` | Generated from `runtime-config.template.js` by `scripts/generate_runtime_config.js`. |

---

## 4. Window globals (to be retired as features migrate)

The legacy architecture is a **single shared mutable `state` object**
(`js/core/state.js`) plus **~70 `window._shohoj_*` globals** used as the
cross-module dispatch mechanism. Full inventory (assigned in `js/`):

**React island handshake:** `__SHOHOJ_REACT_SUMMARY__`, `__SHOHOJ_REACT_METER__`,
`__SHOHOJ_REACT_CREDIT_TOTALS__` (presence flags so the vanilla path skips DOM
writes the island now owns).

**Vendor:** `window.Chart`.

**Calculator/state:** `_shohoj_recalc`, `_shohoj_renderAndRecalc`,
`_shohoj_getCgpaInputs`, `_shohoj_applyState`, `_shohoj_resetAppState`,
`_shohoj_onSave`, `_shohoj_registerAction`, `_shohoj_getPlanCourses`,
`_shohoj_confirmSummaryForm`, `_shohoj_editSummary`, `_shohoj_showSummaryForm`,
`_shohoj_hideSummaryForm`, `_shohoj_updateSetupWizard`, `_shohoj_doSubmit`.

**UI/modals/toasts:** `_shohoj_showToast`, `_shohoj_confirmModal`, `_shohoj_onSave`.

**Auth/identity:** `_shohoj_signIn`, `_shohoj_signOut`, `_shohoj_currentUid`,
`_shohoj_currentEmail`, `_shohoj_userProfile`, `_shohoj_isAdmin`,
`_shohoj_isPaperAdmin`, `_shohoj_isAuthReady`, `_shohoj_firebase_config`,
`_shohoj_recaptcha_v3_site_key`, `_shohoj_deleteCloudData`, `_shohoj_loadDemoMode`.

**Reviews:** `_shohoj_submitReview`, `_shohoj_fetchReviews`,
`_shohoj_fetchReviewsByCourse`, `_shohoj_fetchRecentReviews`,
`_shohoj_fetchReviewById`, `_shohoj_reportReview`, `_shohoj_fetchReviewReports`,
`_shohoj_deleteReviewReport`, `_shohoj_deleteReviewByReport`,
`_shohoj_fetchFacultyProfiles`.

**Papers:** `_shohoj_uploadPaper`, `_shohoj_fetchMyPapers`,
`_shohoj_fetchPapersByCourse`, `_shohoj_fetchRecentPapers`,
`_shohoj_fetchUnapprovedPapers`, `_shohoj_approvePaper`, `_shohoj_deletePaper`,
`_shohoj_reportPaper`, `_shohoj_fetchPaperReports`, `_shohoj_deletePaperReport`,
`_shohoj_deletePaperByReport`, `_shohoj_paperDownloadUrl`,
`_shohoj_papers_worker_url`.

**Feedback:** `_shohoj_submitFeedback`, `_shohoj_fetchAllFeedback`,
`_shohoj_fbTab`, `_shohoj_fbFilter`, `_shohoj_fbSelectType`,
`_shohoj_fbToggleAnon`, `_shohoj_fbUpvote`, `_shohoj_toggleUpvote`,
`_shohoj_fetchAllUpvotes`, `_shohoj_fbAdminDel`, `_shohoj_adminDeleteFeedback`.

**Seats:** `_shohoj_getSeatWatches`, `_shohoj_seatAlertsEnabled`,
`_shohoj_setSeatAlertsEnabled`, `_shohoj_seatAlertIdentity`,
`_shohoj_syncSeatAlerts`.

**Admin:** `_shohoj_openAdminDashboard`, `_shohoj_closeAdminDashboard`,
`_shohoj_fetchAdminStats`, `_shohoj_fbAdminDel`.

**Difficulty map:** `_dm_goToCourse`, `_dm_setDept`, `_dm_setSort`.

**Payment QR:** `_shohoj_bkash_qr`, `_shohoj_rocket_qr`.

Each global must be removed only after the corresponding React feature is live
and no consumer remains (Phase 5/14).

---

## 5. Direct DOM manipulation

Pervasive. The render layer (`js/ui/render.js`, `js/ui/*Tab.js`) builds HTML
strings and assigns `innerHTML`, reads form values via
`document.getElementById(...).value` (e.g. `saveState()` reads `#startSeason` /
`#startYear` directly), and dispatches a `shohoj:recalc` custom event that the
React islands subscribe to. User-controlled text is escaped via `escHtml` /
`escAttr` (ported to `src/core/helpers.ts`); `innerHTML` writes of dynamic data
carry `nosemgrep` markers (see memory: new-tab checklist). **Security invariant
to preserve:** no `innerHTML` of unescaped user data.

---

## 6. localStorage keys

| Key | Owner | Shape / purpose |
|---|---|---|
| `shohoj_cgpa_v1` | `js/core/state.js` (`STORAGE_KEY`) | Main state snapshot: `{ currentDept, semesterCounter, semesters, startSeason, startYear, planCourses }`. |
| `shohoj_theme` | theme toggle | `'light'` / `'dark'`. |
| `shohoj_active_tab` | tab shell | Last active tab id. |
| `shohoj_cloud_applied` | user-sync | Cloud-sync applied marker. |
| `shohoj_skip_first_save` | user-sync | Guards first-save overwrite race. |
| `shohoj_pdfjs_preview` | preview modal | PDF.js preview opt-in. |

**Phase 2 must version this** (`StoredShohojStateV1` → `V2`) with pure migration
functions, a pre-migration backup, and validation — never silently discarding
unknown/malformed data.

---

## 7. Firestore collections

Collections referenced in `js/auth/*` and guarded by `firestore.rules`:

| Collection | Purpose / invariants to preserve |
|---|---|
| `users/{uid}` | Per-user cloud state mirror + `seatAlertWatches` (capped at 50 sections; email must match auth). |
| `facultyReviews` | Faculty reviews. **Deterministic IDs**, public pseudonymity, immutability after submit. |
| `facultyProfiles` | Aggregated faculty rating profiles. |
| `reviewReports` | Reports against reviews (moderation). |
| `papers` | Past-papers/notes metadata. **Owner-path checks**; admin approval. |
| `paperReports` | Reports against papers. |
| `appFeedback` | Feedback board posts. |
| `appFeedbackUpvotes` | Upvote records. |
| `adminLogs` | Admin action audit log. |
| `seatAlertState` | **Server-only** (client read+write denied); driven by Worker cron. |

Exact document shapes are defined implicitly by `firestore.rules` + the
service modules; Phase 6 must preserve them or add explicit data migrations.

---

## 8. Worker endpoints (Cloudflare, `worker/index.js`)

| Method + path | Handler | Purpose |
|---|---|---|
| `POST /upload` | `handleUpload` | R2 upload of papers (type/size validation). |
| `GET /download` | `handleDownload` | R2 download. |
| `DELETE /file` | `handleDelete` | R2 delete (moderation). |
| `POST /reviews` | `handleReview` | Review submission relay. |
| `scheduled()` cron | seat-alert orchestration | Watches `seatAlertState`, emails on full→open transitions via Resend (verified sender only). |

Worker auth/validation, R2 behavior, and Resend sender gating must be preserved.
Worker business logic must **not** move into the React bundle.

---

## 9. Runtime-config generation

- `js/config/runtime-config.template.js` → `js/config/runtime-config.js` via
  `scripts/generate_runtime_config.js` (npm `config:local`).
- Sets `window._shohoj_firebase_config`, `window._shohoj_recaptcha_v3_site_key`,
  `window._shohoj_papers_worker_url`.
- Real values injected from GitHub Actions env at deploy; fork PRs get safe
  placeholders. Firebase web config is **public** and not an authz boundary.
- Phase 7 replaces this with a **typed runtime-config module** validated at
  startup, while preserving fork-PR placeholder behavior.

---

## 10. Legacy JS module → new TS/TSX destination map

Pure domain logic (Phase 3) lands under `src/core/`; UI (Phase 5) under
`src/features/`. ✅ = already typed in `src/core/`.

| Legacy module | New destination | Status |
|---|---|---|
| `js/core/gpa-core.js` | `src/core/gpa.ts` | ✅ |
| `js/core/grades.js` | `src/core/grades.ts` | ✅ |
| `js/core/catalog.js` (logic) | `src/core/catalog.ts` | ✅ (data stays in JS, passed as params) |
| `js/core/helpers.js` (browser-free) | `src/core/helpers.ts` | ✅ (DOM helpers stay in JS) |
| `js/core/planner-core.js` | `src/core/planner.ts` | ✅ |
| `js/import/transcript-core.js` | `src/core/transcript.ts` | ✅ |
| `js/core/reviews.js` (aggregation) | `src/core/reviews.ts` | ✅ |
| `js/core/papers.js` (validation) | `src/core/papers.ts` | ✅ |
| `js/core/connectFeed.js` | `src/core/connectFeed.ts` | ✅ |
| `js/core/connectFeedClient.js` | `src/core/connectFeedClient.ts` | ✅ |
| `js/core/freeRooms.js` | `src/core/freeRooms.ts` | ✅ |
| `js/core/seatStatus.js` | `src/core/seatStatus.ts` | ✅ |
| `js/core/seatWatch.js` | `src/core/seatWatch.ts` | ✅ |
| `js/core/routineState.js` | `src/core/routineState.ts` | ✅ |
| `js/core/routineGrid.js` | `src/core/routineGrid.ts` | ✅ |
| `js/core/routineSuggestions.js` | `src/core/routineSuggestions.ts` | ✅ |
| `js/core/routineFaculty.js` | `src/core/routineFaculty.ts` | ✅ |
| `js/core/routinePlannerImport.js` | `src/core/routinePlannerImport.ts` | ✅ |
| `js/core/routineExport.js` | `src/core/routineExport.ts` | ✅ |
| `js/core/calendarExport.js` | `src/core/calendarExport.ts` | ✅ |
| `js/core/departments.js` | (data) → consumed by `src/core/catalog.ts` | data stays JS |
| `js/core/faculty.js` | `src/core/faculty.ts` | ✅ |
| `js/core/calculator.js` | `src/core/gpa.ts` consumers | ✅ pure surface in `gpa.ts`; remaining DOM handlers (`autoDetectGrade`, `onGradePointBlur`, `onPFChange`) are Phase 5B |
| `js/core/state.js` | `src/state/` + `src/services/storage/` | ⬜ Phase 2 |
| `js/core/dispatch.js` | retire (replace globals w/ typed events/context) | ⬜ Phase 5 |
| `js/vendor/qrcode.js` | installed `qrcode-generator` pkg | ✅ removed; both build paths use the pkg |
| `js/qr-data.js` | (data) payment QR images (`_shohoj_bkash_qr` / `_shohoj_rocket_qr`) | data stays JS — not the QR generator |
| `js/ui/render.js` | `src/features/calculator/*` | ⬜ Phase 5B |
| `js/ui/planner.js` | `src/features/planner/*` | ⬜ Phase 5D |
| `js/ui/simulator.js` | `src/features/simulator/*` | ⬜ Phase 5D |
| `js/ui/playground.js` | `src/features/playground/*` | ⬜ Phase 5D |
| `js/ui/routineTab.js` | `src/features/routine/*` | ⬜ Phase 5E |
| `js/ui/freeRoomsTab.js` | `src/features/free-rooms/*` | ⬜ Phase 5E |
| `js/ui/seatsTab.js` | `src/features/seats/*` | ⬜ Phase 5E |
| `js/ui/feedLive.js` | `src/features/routine/` live-feed | ⬜ Phase 5E |
| `js/ui/reviews.js` / `reviewsTab.js` | `src/features/reviews/*` | ⬜ Phase 5F |
| `js/ui/difficultyMap.js` | `src/features/difficulty-map/*` | ⬜ Phase 5F |
| `js/ui/papersTab.js` | `src/features/papers/*` | ⬜ Phase 5F |
| `js/ui/feedback.js` | `src/features/feedback/*` | ⬜ Phase 5F |
| `js/ui/profileTab.js` | `src/features/profile/*` | ⬜ Phase 5F |
| `js/ui/modal.js` / `modals.js` | `src/components/modals/*` | ⬜ Phase 5A |
| `js/ui/previewModal*.js` | `src/features/papers/preview/*` | ⬜ Phase 5F |
| `js/ui/charts.js` | `src/components/feedback/` or features | ⬜ Phase 5 |
| `js/ui/tracker.js` | `src/features/degree-progress/*` | ⬜ Phase 5D |
| `js/ui/suggestions.js` | `src/features/planner/` | ⬜ Phase 5D |
| `js/ui/adminDashboard.js` | `src/features/admin/*` | ⬜ Phase 5H |
| `js/auth/firebase-init.js` | `src/services/firebase/init.ts` | ⬜ Phase 6 |
| `js/auth/auth-service.js` | `src/services/firebase/auth.ts` | ⬜ Phase 6 |
| `js/auth/admin-service.js` | `src/services/firebase/admin.ts` | ⬜ Phase 6 |
| `js/auth/paper-service.js` | `src/services/firebase/papers.ts` | ⬜ Phase 6 |
| `js/auth/review-service.js` | `src/services/firebase/reviews.ts` | ⬜ Phase 6 |
| `js/auth/user-sync-service.js` | `src/services/firebase/userSync.ts` | ⬜ Phase 6 / Phase 2 |
| `js/auth/firebase.js` | `src/services/firebase/index.ts` | ⬜ Phase 6 |
| `js/main.js` | `src/app/entries/main.tsx` + `src/app/App.tsx` | ⬜ Phase 4 |
| `js/admin-entry.js` | `src/app/entries/admin.tsx` + `src/app/AdminApp.tsx` | ⬜ Phase 4 |
| `js/config/runtime-config.js` | `src/config/runtime.ts` (typed) | ⬜ Phase 7 |
| `js/animations/*` | `src/styles/` / component-local | ⬜ Phase 5 |

---

## 11. Feature inventory & migration mapping

Every current feature, mapped to its Phase-5 migration group:

- **5A — Core shell / common UI:** navigation, tabs, theme, toasts, modals,
  demo mode, empty/error/loading states.
- **5B — CGPA Calculator:** semester list, course rows, course autocomplete,
  grade input, semester GPA, CGPA summary, attempted/earned credits, CGPA meter,
  credit warnings, add/edit/delete semester & course, drag/reorder,
  retake/repeat handling, PDF report export.
- **5C — Transcript Import:** file selection, PDF parsing, preview, validation,
  import confirmation, duplicate/merge, error handling.
- **5D — Academic Planning:** semester planner, prerequisite checker + tree,
  unlock ranking, credit-load validation, projected CGPA, Start Semester,
  degree progress, graduation estimate, goal simulator, grade changer, reverse
  solver, retake/repeat strategy.
- **5E — Campus Schedule:** routine builder (course/section select, conflict
  detection, auto-suggest, gap ranking, day-off/time filters, faculty-rating
  display, ICS export, QR/share, planner import, live feed status), free rooms,
  seat status, seat watchlist, browser notifications, email-alert state.
- **5F — Community:** faculty reviews (submission, immutability, directory,
  report), difficulty map, past papers & notes (upload, preview, download,
  report), feedback board, profile (cloud-data deletion, last-synced).
- **5G — Auth & Cloud Sync:** Firebase Auth, BRACU-domain checks, App Check,
  cloud state sync, realtime updates, sign-in/out, profile identity, admin
  claims, failure isolation.
- **5H — Admin App:** auth gate, review reports, paper moderation, feedback
  moderation, statistics, preview, delete/approve/reject, error/loading states.

---

## 12. Risks

1. **User-data corruption** — `shohoj_cgpa_v1` + Firestore mirror hold real user
   academic data. Versioned migration + backup + validation (Phase 2) before any
   write. **Highest risk.**
2. **Cloud-sync regressions** — must not overwrite newer local data with older
   cloud data; `shohoj_skip_first_save` / `shohoj_cloud_applied` guards must be
   reproduced exactly.
3. **Security regression** — CSP hardening (sha256 hashes, no `unsafe-inline`),
   Firestore rules, App Check, review anonymity/immutability, paper owner-path
   checks, admin custom-claim authz, Worker validation, file type/size limits.
4. **Firebase isolation** — a blocked gstatic import must never break the offline
   calculator (already guarded by `e2e-vite/firebase-isolation.spec.js`).
5. **Bundle bloat** — `main` chunk already 795 kB; lazy-load tabs + data.
6. **GitHub Pages paths** — `base: './'` relative assets; no browser-history
   routes that 404 on Pages (use hash/tab model).
7. **Context loss across long migration** — each phase must be self-contained,
   committed, and re-verified.
8. **Parity drift** — keep `typedCoreParity` + add per-feature parity tests
   while both implementations exist.

---

## 13. Rollback plan

- `build3.py` + the gitignored `shohoj.html` / `admin.html` artifacts remain the
  live production path through Phase 13. CD keeps invoking build3.py until the
  Phase-12 cutover.
- Before cutover, tag a rollback reference (`legacy-single-file-build`).
- `build:legacy` script retained temporarily; `build3.py` deleted only at
  Phase 14 after acceptance checks pass.
- If a Vite regression appears post-cutover, redeploy the legacy tag.

---

## 14. Files that MUST NOT be deleted until final cutover (Phase 14)

- `build3.py`
- `index.html`, `admin/index.html` (legacy script-tag entries — converted, not
  deleted, until React entries are live)
- `js/main.js`, `js/admin-entry.js`
- All `js/core/*.js`, `js/ui/*.js`, `js/auth/*.js`, `js/import/*.js` whose
  consumers have not yet moved to TS/TSX
- `js/config/runtime-config.template.js`, `scripts/generate_runtime_config.js`
- `vite/seed-injection.js` (until Vite-native seed strategy is live + tested)
- `css/style.css` (until confirmed no React component needs a rule)
- `tests/typedCoreParity.test.js`, `tests/seedInjectionParity.test.js`,
  `tests/productionBundleSmoke.test.js`
- `data/faculty_profiles.jsonl`, `data/input_reviews.jsonl`
- Python data scripts: `scripts/seed_reviews.py`, `scripts/seed_faculty.py`,
  `scripts/rename_faculty_initials.py` (legitimate data tooling — **keep**)

---

## 15. Phase checklist

> Tick a box only when its work is committed AND the relevant test suite is green.

### Phase 0 — Audit & baseline
- [x] Branch `refactor/full-react-typescript-vite-migration` created
- [x] Repository inspected (docs, configs, `js/`, `src/`, `tests/`, `e2e/`, `worker/`, workflows)
- [x] This document produced
- [x] Baseline recorded (all suites green — §1)
- [x] Phase committed separately

### Phase 1 — Final architecture
- [~] Target `src/` structure — `core/`, `state/`, `app/` established; `components/features/services/hooks/config/styles/test` materialise as later phases fill them (empty dirs intentionally not committed)
- [x] Strict TS config retained (`strict: true` already on). **Variation:** path aliases deferred to Phase 4/5 so the bare-Node `.ts` test runner keeps working without a resolver; added when feature code benefits
- [ ] `vite.config.js` → `vite.config.ts` — **deferred to Phase 10** (natural place during the final Vite build restructure; converting now adds risk with no parity benefit)
- [ ] Playwright config → TS — **deferred to Phase 11** (alongside the CI E2E rework)
- [x] Typed Result/error classes; React error boundary; typed toast/notification model — `src/core/result.ts`, `src/core/errors.ts`, `src/app/ErrorBoundary.tsx`, `src/state/notifications.ts` (React provider + auto-dismiss timers land in Phase 4)
- [x] No circular deps; domain primitives free of React/Firebase/DOM (Result/errors/notifications are pure; only ErrorBoundary imports React)

### Phase 2 — Versioned user-data & state migration
- [x] Inventory all localStorage + Firestore-backed state (§6/§7 of this doc)
- [x] `StoredShohojStateV1`/`V2` typed schemas + version field — `src/core/types/storage.ts`
- [x] Pure migration functions; pre-migration backup; validation — `src/services/storage/{migrate,backup,keyValueStore}.ts`
- [x] Cloud-sync conflict protections preserved — `src/services/storage/syncDecision.ts` (faithful pure extraction of `js/auth/firebase.js`, line-cited)
- [x] Tests: first sign-in, same-data, newer-local, newer-cloud, pending save, offline, multi-device, corrupt, legacy migration — `tests/{storageMigrate,syncDecision}.test.js` (33 tests)

  **Scope note:** The synced "main state" doc (`shohoj_cgpa_v1` → Firestore `users/{uid}.data`) holds only calculator + planner state (`semesters`, `currentDept`, `startSeason/Year`, `planCourses`). Theme (`shohoj_theme`), active tab, seat watchlist (Firestore `seatAlertWatches/{uid}`), and profile/review receipts (`shohoj_my_reviews_v1`) are persisted **separately** by their own modules and are not part of the `shohoj_cgpa_v1` snapshot. Those keys are untouched by this migration and get typed persistence when their features migrate in Phase 5. **Wiring:** the pure migration + decision functions are not yet called by the live `firebase.js`/`state.js` (which keep working unchanged); they are wired in during Phase 5G/6 alongside the typed Firebase boundary. **Behavior preserved exactly:** conflicts still resolve by fingerprint + the user's migration-modal choice, never an automatic newest-wins rule.

### Phase 3 — Pure domain logic → TS
- [x] Remaining pure `js/core` logic typed — `src/core/faculty.ts` was the last pure module; `calculator.js`'s pure surface already lives in `gpa.ts` (its leftover handlers are DOM-bound → Phase 5B), and `dispatch.js` retirement is Phase 5
- [x] Replace vendored QR runtime with `qrcode-generator` pkg — `js/vendor/qrcode.js` removed; `routineTab.js` + `build3.py` use the package directly (verified via build3.py, `test:bundle`, and `build:vite`). Note: `js/qr-data.js` is unrelated payment-QR image data, not the generator
- [x] Parity tests for migrated module — `tests/typedCoreParity.test.js` covers `faculty.ts`; legacy `js/core/faculty.js` retained as the live module until its consumers migrate (Phase 5)

### Phase 4 — React application shell
- [ ] Main + admin React entries, providers, typed central state, theme/auth/firebase/toast/modal providers, error boundaries, tab shell, mobile nav, demo mode, signed-in/out states

### Phase 5 — Feature migration (A→H, risk order)
- [ ] 5A shell/common · [ ] 5B calculator · [ ] 5C transcript · [ ] 5D planning · [ ] 5E schedule · [ ] 5F community · [ ] 5G auth/sync · [ ] 5H admin

### Phase 6 — Firebase/Worker/external
- [ ] Typed Firebase boundary, isolated chunk, safe failure reporting, App Check, collection shapes preserved, deterministic review IDs, paper owner checks, admin claims, Worker→TS (if clean), Worker tests green

### Phase 7 — Runtime config & seed data
- [ ] Typed runtime-config module + startup validation + fork placeholders
- [ ] Vite-native seed strategy (typed import / lazy fetch), parity tests, remove `vite/seed-injection.js` only after replacement tested

### Phase 8 — Testing toolchain
- [ ] Vitest + jsdom + RTL + user-event + jest-dom
- [ ] Scripts: test:unit/component/rules/worker/e2e/a11y + `verify`
- [ ] Issue #238 axe smoke: calculator, planner, routine, seats, reviews, profile; fail CI on serious/critical

### Phase 9 — Security & performance
- [ ] Audit innerHTML/dangerouslySetInnerHTML/URL/upload/UGC; CSP without `unsafe-inline`; lazy-load large tabs/data; bundle inspection; dep audit (no risky auto-fixes)

### Phase 10 — Final Vite build
- [ ] Multi-file dist; `base: './'`; main+admin entries; firebase split; verify dist/index.html + dist/admin/index.html + assets; rename `build:vite`→`build`; temporary `build:legacy`

### Phase 11 — CI migration
- [ ] CI runs lint/typecheck/unit/component/rules/worker/e2e(vite)/a11y/build + dist verification; legacy build in temporary job; remove Python when no task needs it

### Phase 12 — CD / Pages migration
- [ ] Deploy `./dist`; stop copying shohoj.html/admin.html; stop build3.py; preserve concurrency/permissions/secrets; verify deployed main+admin

### Phase 13 — Parity & cutover
- [ ] Full legacy vs Vite behavior comparison across all features; mobile; demo; localStorage + cloud restore; seeded content; firebase-unavailable; security; rollback tag `legacy-single-file-build`

### Phase 14 — Retire build3.py & legacy frontend
- [ ] Remove build3.py + legacy artifacts/tests; remove unused JS modules + window globals + island injection + obsolete plugins; dead-code audit; full verify; docs + CHANGELOG updated

### Phase 15 — Academic Decision Advisor V1
- [ ] Deterministic explainable engine + typed contracts + React explanation UI (see §11 of task)

### Phase 16 — Future ML/LLM foundation
- [ ] `docs/ACADEMIC_ADVISOR_ML_ROADMAP.md`; provider-independent interface behind feature flag; no fake ML claims

### Phase 17 — Advisor testing
- [ ] 26 advisor test scenarios (policy override, determinism, explanation fidelity, no-PII logs, works without Firebase/LLM)

---

## 16. Commit strategy

Atomic, coherent commits — one logical step each, each compiling or clearly
isolated. Honor repo conventions: **one file per commit by default** (stage by
explicit path, never `git add .`), **no Claude attribution trailers**, never
push to main, never force-push, never commit `shohoj.html`/`admin.html`/`dist`.
Suggested sequence mirrors the task's 23-step list.
