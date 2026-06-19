# v0.5.0 — Live-Data Tools & Account Hub

Released: 2026-06-19

## Highlights

- **Routine Builder** — assemble a clash-free weekly schedule from the live CONNECT section feed, with an overlap-split grid, inline faculty ratings, time-of-day / day-off filters, `.ics` calendar export (class + exam reminders), and QR / link sharing. Auto-suggest ranks combinations to prefer **compact days**.
- **Seat Status & seat-drop alerts** — live seat availability across every section, an in-browser watchlist with notifications, and a cron-triggered Worker that emails you on a real full→open transition even with Shohoj closed.
- **Free Rooms** — an all-rooms status board (free / in class / in lab + room type) computed from the scheduled timetable, with a per-room full-week availability modal.
- **Profile account hub (#196)** — an auth-gated tab that brings a signed-in student's scattered data into one place: account header, seat watchlist + independent email-alert toggle, saved-routine / semester-plan snapshot, and the student's own reviews. Signed-out users see a sign-in prompt.

## Fixes & hardening

- Seat-alert (and admin-upload) emails no longer silently fall back to the Resend test sender, which only delivers to the Resend account owner. The Worker now treats a missing or test `EMAIL_FROM` as *not configured*, skips sends, and logs a loud operational error instead of reporting success.
- A temporary Resend failure no longer advances a user's seat-alert transition state, so a failed full→open email is retried on the next cron tick rather than being lost.
- Cron logging is privacy-safe and richer (`users / watches / transitions / emailed / failed`; no UIDs or emails).

## Security & privacy

- The Profile tab has **no BRACU CONNECT credential field** anywhere — Shohoj never collects, stores, or replays CONNECT credentials.
- The "your reviews" list reads a privacy-preserving per-uid **local receipt**; public review docs still store no UID, so no UID-indexed query can de-anonymize a review.
- No Firestore rules were weakened. The `seatAlertWatches/{uid}` collection is owner-scoped; `seatAlertState` remains closed to all clients.

## Verification

- `npm run typecheck` — clean
- `npm test` (unit + worker + Firestore rules) — **480 unit/worker + 54 rules** passing
- `npm run test:e2e` — **41** Playwright cases passing
- `python3 build3.py` && `npm run test:bundle` — production bundle smoke passing
- `npm run build:vite` — Vite build passing

## Deployment / action required

- **Seat-alert email delivery is not active until an operator configures a verified sender.** Verify a domain in Resend (SPF + DKIM), set `EMAIL_FROM` to a sender on that domain (`worker/wrangler.toml` or a secret), set `RESEND_API_KEY`, and redeploy the Worker. Until then the cron runs but safely skips sends. See `worker/README.md`.
- The vanilla `build3.py` output remains the live deployment path; the Vite/React migration continues in parallel (`docs/REACT_VITE_MIGRATION.md`).

## Known limitations

- "Your reviews" only lists reviews written from the current browser (no server-side my-reviews index, by design — see Security & privacy).
- The seat / rooms / routine tools depend on the external CONNECT feed; they surface a clear unavailable state when the feed can't be reached.
- The public demo video / GIF (#9) is still pending.

## Rollback

- Code: revert the v0.5.0 release range and redeploy `main` (CD republishes the prior `build3.py` bundle to GitHub Pages).
- Worker: `wrangler rollback` (or redeploy the previous `worker/index.js`) restores the prior handler; no data migration is involved (the `seatAlertState` documents are forward-compatible).
