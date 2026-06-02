# React/Vite Migration Sequence

Shohoj should move to React and Vite only after the v0.4 TypeScript logic
migration is stable. The goal is to protect the existing working product while
making future UI work easier.

## Current Boundary

- The live app remains the vanilla JS version on GitHub Pages.
- Pure academic logic moves first into `src/core/*.ts`.
- Runtime JS helpers under `js/core/*-core.js` and `js/import/*-core.js` are
  generated from the TypeScript modules and wired into the current UI one slice
  at a time.
- `tests/typedCoreParity.test.js` keeps typed logic aligned with the existing
  JS behavior during the transition.

## Migration Order

1. Finish v0.4 typed core wiring.
   - CGPA/GPA logic
   - Semester planner engine
   - Transcript parser
   - Parity tests for all migrated logic

2. Extract browser-independent logic.
   - Keep calculation, parser, planner, review aggregation, and paper metadata
     helpers free of DOM and Firebase imports.
   - Keep all shared types in `src/core/types.ts` or nearby domain-specific
     files.

3. Introduce Vite without changing the product UI. **(in progress)**
   - Add Vite as a build path beside the current `build3.py` deploy path.
   - Keep the existing GitHub Pages deployment live until the Vite build has
     matching behavior.
   - Reuse the same runtime config values and CI secrets.
   - Done so far: `vite.config.js` builds `index.html` + `admin/index.html` as
     native ESM; `vite/seed-injection.js` injects `SEEDED_REVIEWS` /
     `SEEDED_FACULTY_PROFILES` exactly like `build3.py` (parity guarded by
     `tests/seedInjectionParity.test.js`); `npm run dev|build:vite|preview`
     scripts; a non-deploying CI step runs `vite build`. `build3.py` and the
     gh-pages deploy are unchanged.

4. Add React shell.
   - Start with a small React root around the calculator area.
   - Keep existing CSS tokens and visual language.
   - Avoid redesigning the product during migration.

5. Rebuild features in risk order.
   - CGPA calculator first
   - Semester planner second
   - Transcript import third
   - Faculty reviews and papers after the academic flows are stable
   - Admin dashboard last

6. Run dual verification before switching.
   - Unit tests
   - Typed parity tests
   - Playwright E2E
   - Manual demo mode smoke test
   - Transcript import smoke test
   - Mobile layout check

7. Cut over only when behavior matches.
   - Keep the old static version deployable as a rollback path.
   - Switch GitHub Pages to the Vite output after CI and manual checks are
     consistently green.
   - Remove `build3.py` only after the Vite build fully replaces it.

## What Not To Do Yet

- Do not rewrite Firebase/auth during the first React pass.
- Do not redesign the UI while migrating framework layers.
- Do not move to a Spring Boot backend unless real usage outgrows
  Firebase/Worker limits.
- Do not remove the vanilla JS deployment path until the Vite version is stable.

## Success Criteria

- The public app still supports demo mode, CGPA calculation, planner, transcript
  import, reviews, papers, and admin workflows.
- CI/CD stays green.
- E2E tests pass on the Vite version.
- The typed academic core is shared by React components instead of duplicated.
- The old version can be redeployed quickly if a regression appears.
