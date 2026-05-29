# v0.4.0 — TypeScript Logic Migration

Released: 2026-05-29

## Highlights

- Ported the CGPA calculator, semester planner, and BRACU transcript parser cores to TypeScript under `src/core/`, completing the migration foundation laid in v0.3.0.
- The live app still ships vanilla JS: each typed core has an auto-generated bridge in `js/core/` and `js/import/`, so there is no user-facing behavior change.
- Added `tests/typedCoreParity.test.js`, which transpiles the typed core at test time and asserts identical output to the shipped JS modules, guarding against drift between the TypeScript source and the generated bridges.
- Main CGPA recalculation now consumes the shared GPA totals helper instead of a duplicated aggregation loop, keeping the calculator and recalc paths in lockstep.

## Fixes

- Restored grade point values are sanitized and HTML-escaped on render, preventing malformed or hostile values from breaking the calculator UI.
- Worker uploads generate unique storage paths so concurrent uploads to the same course/filename no longer overwrite each other in R2.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `python3 build3.py` and `npm run test:bundle`

## Notes

- This release intentionally keeps the vanilla JS UI live; wiring the UI directly to the typed core is deferred to a later milestone (see `docs/REACT_VITE_MIGRATION.md`).
- The public demo video / GIF (#9) is deferred to v0.4.1 so the logic-migration release can land cleanly first.
