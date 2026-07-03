# Migration Roadmap

> Date: 2026-06-28. Incremental **strangler** migration — never a big-bang rewrite.
> `build3.py` + GitHub Pages remain the rollback path until the Vite/React app passes
> full parity. One branch / one PR per coherent phase. Reconciles (does not replace)
> `docs/FULL_REACT_TYPESCRIPT_MIGRATION.md`.

| Phase | Goal | Exit criteria | Status |
|---|---|---|---|
| **0** | Audit & reconciliation | This doc set exists; current state verified | ✅ done (2026-06-28) |
| **1** | Stabilize the production build | Collision guard in CI; all unsafe collisions fixed; bundle regression coverage | 🟡 **in progress** (this PR) |
| 2 | Shared foundations | Strict TS config; error/result/schema/logging/flags/config-boundary primitives; dependency-boundary lint; small UI primitives (no CSS rewrite) | ✅ **done** — dependency-boundary lint, zod→Result validation, structured logger, typed feature flags, typed runtime-config boundary, stricter TS flags (noFallthroughCasesInSwitch / forceConsistentCasingInFileNames / noImplicitOverride), and the React-semesters island opt-in wired through the flag registry. Deferred (with rationale): **UI primitives → Phase 3** (no real consumers until the React shell exists); **stricter flags** exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noUncheckedIndexedAccess → land with Phase 5/6 (fixes touch React prop contracts + the feed client) |
| 3 | React app shell | RR Framework Mode; layouts; route error boundaries; auth/theme/notification/modal/config providers; nav; protected admin; lazy routes; **small UI primitives** (deferred from Phase 2 — build alongside their first real consumers) | 🟡 **in progress** — SPA React Router shell skeleton landed: isolated `vite.shell.config.js` → `dist-shell/` (never touches build3.py or the islands), root layout + provider stack + nav + skip link, route-level error element, lazy/code-split routes (Home, Calculator placeholder, 404). Added: typed AuthProvider (useSyncExternalStore + injectable source port; pure snapshot normalization, unit-tested), RequireAdmin client-side guard (server-side authz stays the real boundary), full route map (14 routes, placeholders for unmigrated features) + nav. Added: ModalProvider (typed, promise-based `useConfirm`, focus-trapped + Escape/backdrop, aria-modal), RuntimeConfigProvider (`useRuntimeConfig`/`useCapabilities` over the Phase 2 config boundary; offline degradation, unit-tested), first `shared/ui` primitive (Button) consumed by the dialog + Home. Provider stack complete. Notification viewport landed (#311, this PR): `NotificationViewport` in the root layout renders the provider's items as accessible toasts (always-mounted live region; status role for success/info/warning, alert for sticky errors; labelled dismiss) — first consumer is the demo-mode success toast. Remaining: RR Framework-Mode (loaders/actions) per route — lands with real data routes in Phase 5/6 |
| 4 | State & persistence | Wire versioned local-data migration into the live path; pre-migration backup; corrupt-state recovery; preserve cloud/local conflict + first-sign-in guards; never overwrite academic data | 🟡 **in progress** — safe persistence engine built + heavily tested: guarded `localStorage` adapter (degrades to memory), composed `loadAcademicState`/`saveAcademicState` over the existing backup + versioned-migrate + validate pieces, encoding the safety policy (backup-once before migrate; corrupt/unusable → recover to empty but NEVER overwrite the stored raw; load never writes; save stamps the schema version). Reuses the existing forward-compat (unknown-field-preserving) migrate/sync-decision/backup modules. Pending (needs a live consumer + sign-off): wiring into the calculator route at Phase 5 cutover, multi-device/cloud-conflict end-to-end, and not touching the live legacy JS until then |
| 5 | Calculator cutover | Full parity (semesters, summary, edit, autocomplete, retakes, statuses, import, planner, demo, PDF, cloud restore, mobile, a11y); drop legacy globals; default only after unit+component+vite-e2e+bundle pass and rollback intact | 🟡 **in progress** — **5A/5B** landed: pure reducer + mutations + Phase-4 persistence wired into the shell `/calculator` route; `CalculatorSemesters` renders through an injected `CalculatorBridge` (island keeps the legacy window bridge). **5C** landed: real typed BRACU catalogue + accessible WAI-ARIA combobox autocomplete on the shell route — see Phase 5C detail. **5D** landed: pure CGPA results model + bridge-driven results section (headline, meter, standing, incomplete warning, credit totals) on the shell route; the three results islands now share the same model — see Phase 5D detail. **Add-semester controls** (#307) landed: footer + Add Semester / 🎯 Running Semester on the shell via the bridge, calendar-aware naming in pure `semesterNaming.ts` (clock injected at dispatch; single-running reducer guard; documented deviation — no department picker yet, so default Spring/Summer/Fall calendar and Semester-N / Current-Semester fallbacks without a start). **Demo mode** (#309) landed: Try Demo Mode fills the typed legacy-parity dataset (`demoData.ts` — Fall 2024/Spring 2025, start Fall 2024) through the reducer's `replace`, confirming via the shell modal before overwriting existing data; the success toast landed with the notification viewport (#311). **Dept/start setup** (#313) landed: typed department boundary (`js/core/departments.d.ts` + `departments.ts` adapter over the single legacy `DEPARTMENTS` source), setup controls on the route (dept select + credits chip + calendar-scoped season/year), `currentDept` in reducer state + persistence, naming honours the department calendar (PHR/LAW two-season math), demo pre-selects CSE, and the persist path now spreads the loaded snapshot first so fields the route does not own (planCourses, semesterCounter, forward-compat keys) survive a save. **Dashboard parity** (#315) landed: pure `degreeProgress.ts` (tracker.js parity — visibility, per-semester credits, summary estimation, pace, graduation walk, projected labels + more-count, complete state; injected clock) + pure `gpaTrend.ts` (recalc trend parity + drawTrendChart geometry) rendered as the bridge-driven `DegreeTracker` and the SVG `GpaTrendChart` (typed replacement for the canvas) in the results section; `CalculatorInputs` gains `currentDept`. **Simulator + retake strategy** (#317, this PR): pure `simulator.ts` mirrors runSimulator + buildRetakeSuggestions (validation order, secured/no-credits split, needed-GPA formula, difficulty/insight tiers, 7-tier letter map, 9/12/15 plan rows, all-A ceiling, retake/repeat candidates top-6 by boost-to-B, stacked-selection impact); `CgpaSimulator` renders it below the results with the legacy dataset.auto + activeElement rule for the dept-driven remaining-credits auto-fill; summary-only data gets the nudge (transcript-import button deferred with that slice). Remaining: faculty-rating flow, transcript import, PDF export, planner integration, cloud restore/conflict parity, full mobile + final a11y parity, then production cutover |
| 6 | Feature migration (risk order) | transcript → planner/degree-progress → simulator/playground → routine → seats/watchlist → free-rooms → reviews/difficulty → papers → groups → feedback → profile → admin | ⬜ |
| 7 | Firebase & server boundaries | Typed init/Auth adapter/Firestore repos; server token verification; preserve App Check, rules, deterministic review IDs, review immutability, paper owner paths, admin claims; Firebase failure can't break offline calculator | ⬜ |
| 8 | Cloudflare full-stack | Cloudflare Vite integration; sensitive ops behind Worker routes/actions; preserve R2 + seat-alert cron; typed env bindings; local Worker dev/tests; keep current Worker deployable; no duplicated business rules | ⬜ |
| 9 | Runtime config & seed data | Typed validated config module; safe fork/PR placeholders; Vite-native typed injection; faculty/review seed parity; lazy-load big datasets; parity tests before removing injection | ⬜ |
| 10 | Security / perf / a11y | Audit dynamic HTML; remove unsafe innerHTML; preserve CSP + upload limits; URL/redirect validation; rate limits; server admin checks; route splitting + lazy heavy libs; budgets; axe on critical routes | ⬜ |
| 11 | Testing & observability | TS/lint/domain/RTL/user-event/jest-dom/emulator/Worker/contract/Playwright/a11y/bundle-smoke; request+correlation IDs; structured logs; user-safe codes; queue/Worker/upload/auth metrics; frontend error reporting | ⬜ |
| 12 | Vite production deploy | Verified multi-file `dist/`; entry points + asset paths + Firebase chunk isolation + runtime config + R2/Worker routes; GH Actions deploy; Cloudflare preview env; full E2E on preview; manual mobile/desktop; rollback verified | ⬜ |
| 13 | Production cutover | Legacy-vs-new parity; all flows + existing localStorage + cloud restore + signed in/out + Firebase-down + corrupt-state + mobile + prod CSP + admin + cron; rollback tag + documented rollback command; switch to Cloudflare; monitor; keep legacy recoverable | ⬜ |
| 14 | Legacy retirement | After a stable period: remove build3.py, legacy modules, unused `window._shohoj_*`, island flags, old plugins; dead-code analysis; update docs/README/CHANGELOG | ⬜ |

## Phase 1 detail (this PR)

**Priorities (in order):** production-bundle identifier-collision detection → fix confirmed
unsafe collisions → production-bundle regression coverage → migration-document reconciliation.

1. `scripts/check_bundle_collisions.py` — imports `build3.py`'s canonical file lists +
   strip logic, finds top-level (column-0) declarations duplicated across a page's modules,
   fails on any not in a documented `ALLOWLIST` (intentionally-identical helpers only).
2. Fix the 8 unsafe `MAIN` collisions by namespacing module-private helpers:
   `js/ui/groupsTab.js` → `_grp*`, `js/ui/reviewsTab.js` → `_rvt*`. No cross-file or
   `window.*` references touched (verified). `normalizeCourseCode` / `isKnownCourseCode`
   allowlisted (identical bodies) pending shared-module extraction in Phase 6.
3. Regression coverage: `npm run check:collisions` wired into CI before `build3.py`; the
   existing `test:bundle` smoke continues to exercise the built page at runtime.
4. Docs: this `docs/architecture/` set; superseded banners added to stale docs.

**Out of scope for Phase 1:** any React/Vite cutover, state rewiring, new features, CSS, or
Firestore/Worker changes. Those are Phases 2+.

## Phase 5C detail — typed catalogue + accessible autocomplete

**Scope:** replace ONLY the course-catalogue placeholders on the shell `/calculator`
route (`catalog: []`, `isKnownCode: () => false`) and ship a production-quality,
accessible autocomplete. No other Phase 5 work.

1. **One catalogue, no duplication.** `src/features/calculator/catalog.ts` imports the
   shipping `ALL_COURSES` from `js/core/catalog.js` through `js/core/catalog.d.ts`,
   validates + dedupes + freezes it once at module load. The bridge now supplies the real
   `BRACU_COURSE_CATALOG` + `isKnownCourseCode`. See
   `docs/architecture/decisions/0001-calculator-catalogue-search-boundary.md`.
2. **Pure deterministic search.** `courseSearch.ts` ranks matches in a fixed,
   locale-independent order (exact-code → code-prefix → code-substring → exact-title →
   title-prefix → title-substring), over a precomputed immutable view (`prepareCatalog`)
   so per-keystroke search never re-normalises the catalogue. De-duped, capped, no mutation.
3. **Pure selection invariants.** `courseSelection.ts` owns the grade-reset-on-identity-
   change rules (selecting a course fills canonical identity + official credits; an
   identity change clears stale grade/grade-point; re-picking the same course preserves
   grades; unknown free text never inherits credits) — lifted out of the JSX.
4. **Accessible combobox.** `CourseNameInput.tsx` implements the WAI-ARIA combobox/listbox
   pattern (`role`, `aria-expanded/controls/activedescendant`, `aria-selected`, keyboard
   nav, mouse-down selection, Escape, blur safety). Suggestion UI state never enters
   academic state; persistence stays on the Phase 4 engine.
5. **Tests:** pure units (search ranking/normalisation/dedupe/limit/mutation-safety,
   selection invariants, catalogue adapter) + shell E2E (search/select by mouse and
   keyboard, Escape, reload-restore, unknown-input safety, axe).

**Out of scope (still ⬜ in Phase 5):** demo mode, faculty-rating flow, full GPA/CGPA
results UI, summary/dashboard parity, simulator, grade changer, reverse solver, retake
strategy, transcript import, PDF export, planner integration, cloud restore/conflict
parity, full mobile parity, final a11y parity, production cutover. No `build3.py`, legacy,
CSP, island, or Firestore changes.

## Phase 5D detail (this PR) — pure results model + bridge-driven results UI

**Scope:** compute and render the CGPA results on the shell `/calculator` route —
headline, meter, academic standing, incomplete-grades warning, credit totals — from the
injected bridge only. No other Phase 5 work.

1. **One results model.** `src/features/calculator/results.ts` mirrors every computation
   `recalc()` (js/main.js) makes before touching the DOM: projected/completed CGPA,
   headline label, meter percent + status kind (including the recovery status's
   projected-figure quirk, mirrored deliberately), standing cutoffs (BRACU Summer 2022+
   probation policy), incomplete-semester counting, credit totals. Pure, presentation-free,
   node-testable.
2. **Three consumers, one definition.** The composed shell section
   (`CalculatorResults.tsx`) renders from the model over `useCalculatorBridge()`; the
   existing `CgpaSummary` / `CgpaMeter` / `CgpaCreditTotals` islands were refactored onto
   the same model via the default `legacyWindowBridge`, deleting their duplicated
   threshold logic while keeping rendered output identical. Meter/standing wording lives
   once, in `CalculatorResults.tsx`; headline colors reuse `gpaBadgeColors`.
3. **Core resolvability.** `src/core/gpa.ts`/`types.ts` imports gained explicit `.ts`
   extensions (the node-runner convention) so unit tests can traverse the GPA core; the
   typed-core parity transpiler maps them.
4. **Tests:** model units (every meter/standing threshold at exact boundaries, headline
   label, incomplete counting, credit formatting) + shell E2E (empty invite state, live
   results after grading, reload-recompute, incomplete warning, axe scan).

**Out of scope (still ⬜ in Phase 5):** demo mode, faculty-rating flow,
add-semester/running-semester controls on the shell, degree tracker, GPA trend chart,
simulator, grade changer, reverse solver, retake strategy, transcript import, PDF export,
planner integration, cloud restore/conflict parity, full mobile parity, final a11y parity
(shell still ships no visual system — color-contrast lands with it), production cutover.
No `build3.py`, legacy, CSP, or Firestore changes.

## Guardrails (every phase)

No push to `main`; no force-push without fetch; no giant migration commit; no deleting
working legacy code before parity; no silent Firestore/user-data changes; no secrets in
client bundles; no trusting client role checks; no unsafe raw HTML; no weakening rules/CSP;
never commit generated `dist/`/`shohoj.html`/`admin.html`; atomic one-file-per-commit;
explicit staging; no AI attribution trailers; "Part of #N" not auto-closing keywords.
