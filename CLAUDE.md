# Working in this repo

## `js/config/runtime-config.js` must be ABSENT to run the tests

This file is gitignored, so `git status` will never mention it — but a stale copy
sitting on disk fails the E2E suites loudly and misleadingly, in a way that looks
like a code regression.

**Before `npm run test:e2e` or `npm run test:e2e:shell`, delete it:**

```bash
rm -f js/config/runtime-config.js
```

CI does exactly this before its E2E step (`.github/workflows/ci.yml`, "Shell build
+ E2E"), which is why CI is green while a local run is not.

### Why absent, and not merely correct

The specs inject their own globals with `addInitScript` — the worker URL, a
fake Firebase config. `runtime-config.js` loads *after* that and overwrites them.
And `e2e/campus-gate.spec.js` asserts the **unconfigured** state ("a build with no
Firebase config says so instead of dangling a dead button"), so no value of this
file can satisfy it. The suite is written against a raw dev tree.

Three states, three outcomes — measured 2026-09-07 on the legacy suite:

| State of the file | Result |
| --- | --- |
| Absent | 142 passed |
| Present, unfilled template (`__PAPERS_WORKER_URL__`) | 20 failed |
| Present, real values from `npm run config:local` | 2 failed |

The middle row is the trap: placeholder strings clobber the specs' own values, so
failures land in `routine-archive`, `assistant-fab` and `campus-gate` at once and
none of them names the cause.

### When you *do* want it

`npm run config:local` (reads `.env.local`) — for running the app against real
Firebase via `npm run dev`. Delete it again before testing. See
`docs/ENVIRONMENTS.md` and `docs/DEPLOYMENT.md` for how it is generated in CI.

## Visual baselines are not portable

`npm run test:visual` compares against committed PNGs in
`e2e-visual/__screenshots__/`. Those are authored on the CI runner; re-author
locally before trusting a failure:

```bash
npm run test:visual:baseline   # legacy only, --update-snapshots
npm run test:visual
```

Then `git checkout -- e2e-visual/__screenshots__` — never commit baselines
rendered on your own machine, or CI will start failing for everyone else.
