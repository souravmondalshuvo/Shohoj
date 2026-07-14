# Risk Register

> Date: 2026-07-14 (DevOps-hardening reassessment). Severity × Probability → Priority. Reassess each phase.
> S/P scale: H/M/L. Priority P1 (act now) … P4 (watch).

| # | Risk | S | P | Pri | Mitigation | Phase |
|---|---|---|---|---|---|---|
| R1 | **Bundle identifier collisions** — `build3.py` flat scope, last-wins silently drops an implementation (8 confirmed in MAIN; live bugs in Difficulty Map, Groups, Reviews) | H | H | **P1** | `check:collisions` guard in CI; namespace module-private helpers; allowlist only identical bodies | 1 |
| R2 | **Production-only defects invisible to tests** — source-mode/dev-e2e run un-bundled ESM, so flat-scope bugs never reproduce | H | H | **P1** | Detector operates on build3's real file lists; keep `test:bundle` smoke on built page; build3 before e2e in CI | 1, 11 |
| R3 | **Silent user academic-data loss** — typed storage migration not wired live; cloud/local conflict + first-sign-in guards must be preserved | H | M | **P1** | Pre-migration backup; versioned migrate; corrupt-state recovery; never overwrite; preserve unknown fields | 4 |
| R4 | **CSP regression** — prod CSP hashes only `<script>` blocks and drops `unsafe-inline`; inline `on*` handlers are blocked live but pass dev/e2e | H | M | P2 | Wire via addEventListener/data-action; CI verifies no `unsafe-inline` in script-src; audit before any template change | 3, 10 |
| R5 | **React/legacy duality drift** — calculator exists twice (legacy `js/ui/render.js` ships; React `src/features/calculator` opt-in); editing one silently diverges | M | H | P2 | Keep in sync until Phase 5 cutover; typed-core parity tests; cut over only after full parity + rollback | 5 |
| R6 | **Firestore rule / auth weakening during migration** — deterministic IDs, review immutability, paper owner paths, admin claims, App Check | H | L | P2 | Server re-verifies authz; rules tests in CI; never weaken to simplify; typed Firestore repos behind ports | 7 |
| R7 | **Worker business-rule duplication** — old `worker/index.js` vs new Worker paths during Cloudflare transition | M | M | P2 | Single source of domain logic; keep current Worker deployable; contract tests | 8 |
| R8 | **Seat-alert cron regression** — scheduled email delivery is stateful (advance only on success) | M | M | P2 | Preserve cron + state semantics; existing unit coverage; don't advance state on Resend failure | 8 |
| R9 | **npm lock drift on dep bumps** — incremental install corrupts package-lock (@rolldown/@emnapi) → `npm ci` fails | M | M | P3 | Clean reinstall + `npm ci --dry-run`; delete + regenerate lock on drift; Dependabot now runs a **monthly grouped** low-noise policy (alerts always on) and every update PR must pass the full CI gate | all |
| R10 | **Runtime-config injection fragility** — build-time string injection; fork/PR placeholders must stay safe | M | M | P3 | Typed validated config module; parity tests before removing injection | 9 |
| R11 | **Bundle size / perf** — ~3.1 MB single-file `shohoj.html`; PDF.js/charts/QR eagerly available | M | M | P3 | Route splitting + lazy heavy libs + budgets in Vite path | 10 |
| R12 | **Automation moves HEAD/main mid-task** — concurrent automation merges PRs / cuts releases | M | M | P3 | Fetch before rewrite/force-push; feature branch / worktree; never push to main | all |
| R13 | **Stale/contradictory docs** — README + migration docs drift from code | L | H | P3 | This `docs/architecture/` set is canonical; superseded banners on old docs | 0, 14 |
| R14 | **Allowlist rot** — `normalizeCourseCode`/`isKnownCourseCode` copies silently diverge | M | L | P4 | Detector flags stale allowlist entries; extract shared module in Phase 6 | 6 |
| R15 | **Accessibility regressions** during UI moves | M | M | P3 | axe on critical routes; focus trap; keyboard/contrast/reduced-motion checks | 10 |
| R16 | **No automated Firestore user-data backup** — git versions code/rules/indexes, not user data; loss of the Firestore DB or R2 bucket is unrecoverable from source control | H | L | P2 | Scheduled Firestore export + R2 versioning (setup guide in `BACKUP_AND_RESTORE.md`); restore into staging first; RPO ≤24h / RTO ≤1d — **automation still needs GCP creds an admin must provision** | DevOps |
| R17 | **Firestore/Cloudflare deploy auth is external** — `deploy-firestore` skips safely without `FIREBASE_SERVICE_ACCOUNT`; production env protection + branch ruleset live in the GitHub UI, not in repo | M | M | P3 | Fail-safe skip (never a false-green deploy); exact required settings enumerated in `GITHUB_SECURITY_SETTINGS.md`; SHA-pinned third-party actions | DevOps |

## Top 5 right now

1. **R1** bundle collisions (live bugs) — fixed in Phase 1 PR.
2. **R2** prod-only defects invisible to tests — addressed by the CI collision guard.
3. **R3** academic-data loss — gates Phase 4; do not wire migration without backup + recovery.
4. **R4** CSP inline-handler breakage — audit before any template edits.
5. **R5** calculator duality drift — keep both paths in sync until Phase 5 cutover.
