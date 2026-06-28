# Test Matrix

> Date: 2026-06-28. What each layer covers, the command, and where the gaps are.
> "Bundle-only" risks (flat-scope collisions) are **not** reachable by source-mode tests —
> that gap is why Phase 1 adds a static collision guard.

## Layers & commands

| Layer | Command | Runner / where | Covers | Reproduces bundle-only bugs? |
|---|---|---|---|---|
| Lint (correctness) | `npm run lint` | ESLint flat config | unused vars, correctness; warnings don't block | no |
| Type check | `npm run typecheck` | `tsc --noEmit` | `src/` TypeScript | no |
| Unit / domain | `npm run test:unit` | `scripts/run-tests.mjs` over `tests/*.test.js` (37 files) | core/domain logic, typed-core parity, seed-injection parity, storage migrate, sync decision, calculator/routine/seats/freeRooms/reviews/papers/groups/profile/render/theme/notifications/errors/result | **no** (un-bundled ESM) |
| Firestore rules | `npm run test:rules` | Firebase emulator + `tests/firestore.rules.test.js` | rule authz: deterministic IDs, immutability, owner paths, admin claims | n/a |
| Worker | `npm run test:worker` | `worker/test/worker.test.js` | upload/download/delete/reviews routes; seat-alert cron orchestration & state advancement | n/a |
| E2E (legacy) | `npm run test:e2e` | Playwright `e2e/` | user flows on built/served pages | partial (needs build3 first) |
| E2E (Vite) | `npm run test:e2e:vite` | Playwright `e2e-vite/` against Vite build | React island flows | no (Vite app) |
| **Bundle smoke** | `npm run test:bundle` | `tests/productionBundleSmoke.test.js` (Chromium on built `shohoj.html`) | demo mode boots, CGPA renders, no uncaught runtime errors | **yes (runtime)** |
| **Collision guard** | `npm run check:collisions` | `scripts/check_bundle_collisions.py` (static, build3 file lists) | duplicate top-level identifiers across a page's bundled modules | **yes (static, Phase 1)** |
| Data validation | `npm run validate:data` | `scripts/validate_data.mjs` | seed jsonl shape/ratings | n/a |
| Accessibility | (in Playwright) `@axe-core/playwright` | E2E | a11y on covered routes | no |

## Coverage map by capability

| Capability | Unit | Rules | Worker | E2E | Bundle | Collision |
|---|---|---|---|---|---|---|
| Calculator / CGPA | ✅ | – | – | ✅ | ✅ | ✅ |
| Transcript import | ✅ (parser) | – | – | ◻ | ◻ | ✅ |
| Planner / degree progress | ✅ | – | – | ◻ | ◻ | ✅ |
| Routine | ✅ (state/grid/faculty/suggestions/export/import) | – | – | ◻ | ◻ | ✅ |
| Seats / watchlist | ✅ | ✅ | ✅ (cron) | ◻ | ◻ | ✅ |
| Free rooms | ✅ | – | – | ◻ | ◻ | ✅ |
| Reviews / difficulty | ✅ | ✅ | ✅ (/reviews) | ◻ | ◻ | ✅ |
| Papers | ✅ (papersTab) | ✅ | ✅ (R2) | ◻ | ◻ | ✅ |
| Study groups | ✅ | ✅ | – | ◻ | ◻ | ✅ |
| Feedback | ◻ | ✅ | – | ◻ | ◻ | ✅ |
| Profile | ✅ (profileTab) | ✅ | – | ◻ | ◻ | ✅ |
| Admin | ✅ (adminDashboard) | ✅ | – | ◻ | n/a (separate page) | ✅ |

✅ covered · ◻ partial/none · – n/a · "Collision ✅" = the module participates in the
Phase-1 collision guard's MAIN/ADMIN/PROFILE scan.

## Known gaps → target phase

- **No runtime tab-render assertions in the bundle smoke** beyond calculator demo. The
  static collision guard now prevents the *class* of bug that motivated this; per-tab
  render smoke can be added as features migrate (Phase 6/11).
- **No component tests** (RTL/user-event/jest-dom) yet — Phase 11.
- **No contract tests** between client repos and Worker — Phase 8/11.
- **No observability assertions** (request IDs, error codes, metrics) — Phase 11.
- **Vite E2E** covers islands only; full-app E2E lands as routes migrate (Phase 5/6/12).

## Phase-gating rule

A feature is "cut over" only when it passes: unit + (rules if Firestore) + (worker if Worker)
+ Vite E2E + bundle/collision checks, **and** legacy parity is documented, **and** rollback
remains available.
