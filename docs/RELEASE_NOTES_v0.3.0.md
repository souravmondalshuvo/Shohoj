# v0.3.0 — Recruiter Demo Release

Released: 2026-05-25

## Highlights

- Added recruiter-friendly demo mode so anyone can try Shohoj without BRACU login.
- Improved the README and case study around the demo path, solo role, architecture, security, and deployment story.
- Added Playwright E2E tests for the main public product flows.
- Polished mobile layouts for calculator tabs, course rows, modals, and papers controls.
- Split Firebase responsibilities into smaller auth, sync, review, paper, admin, and init modules.
- Added the first TypeScript foundation for a careful post-v0.3 migration.

## Verification

- `npm test`
- `npm run test:e2e`
- `npm run typecheck`
- `python3 build3.py`

## Notes

Screenshots and a public demo video are still tracked as separate follow-up work so the code release can land cleanly first.
