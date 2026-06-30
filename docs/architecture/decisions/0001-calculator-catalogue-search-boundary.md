# ADR 0001 — Catalogue source + search boundary for the React calculator (Phase 5C)

> Status: accepted · Date: 2026-07-01 · Phase: 5C (Calculator cutover)

## Context

The React Router shell's `/calculator` route (Phase 5B) renders the reusable
`CalculatorSemesters` component through an injected `CalculatorBridge`. The bridge
supplied placeholder catalogue capabilities (`catalog: []`, `isKnownCode: () => false`),
so the course-name field had no suggestions and no canonical-course recognition.

Phase 5C wires the **real BRACU catalogue** and a **production-quality, accessible
autocomplete** into that route. Two architectural questions had consequential
alternatives and are recorded here.

The catalogue DATA (≈850 courses) is authored in the legacy vanilla-JS module
`js/core/catalog.js` (`ALL_COURSES`), which the production `build3.py` bundle ships and
the legacy/island path reads via `window._shohoj_courseCatalog`. The React Router shell
loads none of the legacy bundle, so it needs its own access to the same data.

## Decision

**1. One catalogue, imported through a typed boundary — not duplicated.**
The shell imports `ALL_COURSES` from `js/core/catalog.js` through a hand-written
declaration `js/core/catalog.d.ts`, adapted in a single module
`src/features/calculator/catalog.ts` into the feature's `CourseSuggestion` shape:
validated once, deduplicated, and `Object.freeze`d at module load. There is exactly one
authored catalogue; the typed layer consumes it, it does not copy it.

**2. The catalogue crosses the bridge as data; search stays a pure domain function.**
The bridge continues to expose `catalog` (and `isKnownCode`) rather than gaining a
`searchCourses` port. Search (`src/features/calculator/courseSearch.ts`) is a pure,
deterministic function over a prepared, immutable catalogue view; the React
`CourseNameInput` prepares the view once (`useMemo`) and ranks per keystroke. Course
identity rules live in pure `courseSelection.ts`, not in the bridge or JSX.

## Alternatives considered

- **Duplicate the catalogue into a typed `src/` data file.** Rejected: 850 hand-kept
  rows would drift from the shipping source and is explicitly a maintenance hazard.
- **Move the catalogue data into `src/` now and have legacy import it.** This is the
  target-direction dependency, but it requires restructuring the production `build3.py`
  bundle (new `MAIN_JS_FILES` module, top-level identifier-collision risk) for a change
  whose only consumer today is the isolated shell. Deferred to the Phase 6 / cutover
  bundle work; see Migration impact.
- **Add a `searchCourses`/`resolveCourse` port to the bridge.** Rejected for now: it
  would move a pure function behind an interface with one real implementation
  (abstraction theatre). Passing `catalog` as data keeps the boundary minimal and lets
  the same pure search run in the shell, the island, unit tests, and Node.

## Consequences

- **Positive:** single source of catalogue truth; zero change to `build3.py`, the legacy
  modules, CSP, or the island path; search/selection are pure and fully unit-tested; the
  `catalog.ts` adapter is the one place legacy data is validated/adapted.
- **Negative / trade-off:** a backward (new `src/` → legacy `js/`) dependency, confined to
  `catalog.ts` + `catalog.d.ts`. The `.d.ts` lives outside the tsconfig `include` and is
  pulled in as an import dependency; it is not linted (no matching ESLint config) by design.
- The `CourseSuggestion` shape (`{ code, name, full, credits }`) remains the feature's
  course model; it intentionally differs from `core/types.CourseCatalogEntry`
  (`{ code, name, credits }`) because the autocomplete needs the legacy `full` display
  string. The adapter is the single conversion point.

## Migration impact

When the calculator cuts over (Phase 5/6) and the production host moves off `build3.py`,
the dependency should be **reversed**: the catalogue data moves into the typed layer and
the legacy module (until retired in Phase 14) imports from it. Until then this ADR keeps
the coupling explicit, one-directional, and located in a single adapter so the reversal is
a contained edit, not a sprawling refactor.
