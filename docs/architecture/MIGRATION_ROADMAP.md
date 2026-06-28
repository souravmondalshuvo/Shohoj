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
| 3 | React app shell | RR Framework Mode; layouts; route error boundaries; auth/theme/notification/modal/config providers; nav; protected admin; lazy routes; **small UI primitives** (deferred from Phase 2 — build alongside their first real consumers) | ⬜ |
| 4 | State & persistence | Wire versioned local-data migration into the live path; pre-migration backup; corrupt-state recovery; preserve cloud/local conflict + first-sign-in guards; never overwrite academic data | ⬜ |
| 5 | Calculator cutover | Full parity (semesters, summary, edit, autocomplete, retakes, statuses, import, planner, demo, PDF, cloud restore, mobile, a11y); drop legacy globals; default only after unit+component+vite-e2e+bundle pass and rollback intact | ⬜ |
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

## Guardrails (every phase)

No push to `main`; no force-push without fetch; no giant migration commit; no deleting
working legacy code before parity; no silent Firestore/user-data changes; no secrets in
client bundles; no trusting client role checks; no unsafe raw HTML; no weakening rules/CSP;
never commit generated `dist/`/`shohoj.html`/`admin.html`; atomic one-file-per-commit;
explicit staging; no AI attribution trailers; "Part of #N" not auto-closing keywords.
