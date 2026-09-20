# v0.6.0 — Multi-Campus, the Assistant & Campus Life

Released: 2026-09-20

The largest release so far: three months of work, 56 changelog entries. Two of
them change what Shohoj *is* — it is no longer a BRACU-only calculator, and it
can now answer questions in plain language.

## Highlights

- **Shohoj Assistant.** Ask in plain language and get an answer computed from your own saved data, using the grading rules and prerequisite logic the calculator already applies — "what GPA do I need for a 3.5?", "can I take CSE370 next semester?", "is there a room free right now?". Seven read-only tools, scoped to your own data; it cannot write anything and cannot read anyone else's. Bounded to what Shohoj is for, so anything off-topic gets a one-line decline rather than an off-topic answer. It runs on Google's Gemini free tier by default so the feature costs nothing to keep on, with OpenAI and Anthropic wired as fallbacks, and a monthly spend ceiling that declines rather than running up a bill on one person's key. Your chat stays on your device, stamped with your account, and **Clear chat** deletes it for real.
- **Multi-campus: the grading rules are configuration now.** A campus registry holds each university's grading scale, mark cutoffs, retake/repeat policy, identifying email domains, and which features it has data for — so adding a campus is an entry there, not a fork of the calculator. The rules run the whole calculator path, and the same transcript produces different, correct answers on different campuses. **NSU is the first campus added.** No profile ships on a guessed number: anything unconfirmed by the registrar or official handbook is left absent rather than inherited from BRACU, which is why NSU shows no credit-load warning at all.
- **Campus life.** A procedural 3D campus map at `/campus/` rendering live room free/busy status, a Lost & Found board at `/lost-found/` built on a no-contact model (claims are relayed by email through the Worker, contact details never reach the page), bus routes at `/bus/`, and a cafeteria guide that deliberately carries no menus or prices and suppresses its open/closed badge until an outlet's hours are confirmed.
- **Semester archive.** The CONNECT feed is an advising feed: it carries exactly one semester and replaces it wholesale when the next opens. The Worker now snapshots each semester into R2 before the feed forgets it and serves them at `GET /api/semesters`, so Routine, Seat Status and Free Rooms gain a semester switcher and last term's timetable survives. A snapshot says it is one, and says what it cannot tell you.
- **Paste your CONNECT schedule.** The public feed carries no student identity, so nothing in it can say which sections are *yours* — and a credential field is ruled out. Paste the "Class and Exam Schedule" page instead and the grid, clash detection, calendar export and exam briefing all work on it.
- **Signing out clears the device.** Sign-out used to leave a transcript, routine, watchlist and review receipts in the browser — on a shared campus machine, handed to whoever signed in next. Everything is now synced to your account first, then removed from the device, and comes back when you sign in again anywhere.
- **Academic tooling.** A per-course marks tracker that answers "what do I need on the final" instead of only "GPA across remaining credits"; **Next registration**, which joins the feed's prerequisite rules against your imported grade sheet to show what you can actually sign up for; a milestone ladder in the goal simulator; graduation reported as a range rather than a false point; and retake candidates rankable by CGPA gained per credit re-sat.
- **A sign-in portal on both builds.** Signing in resolves a student to a campus and the campus decides the grading rules, so neither build shows a calculator before it knows whose rules to apply. The landing page stays public and Try Demo Mode is exempt.

## React Router shell

The typed rewrite reached **full route parity** this cycle — calculator, planner,
reviews, routine, seats, rooms, profile, transcript, degree progress, papers,
groups, feedback, campus, bus, lost & found, cafeteria and admin are all real
routes, with sign-in, cloud backup/restore, mobile navigation, a dark theme and
route-level axe coverage gated in CI.

It is **still a beta at `/app/` and not the default root.** The cutover is a
deliberate, still-pending step — it has been reverted twice — and the vanilla app
at the site root remains what people use. That also means multi-campus is real on
the shell and not yet at the root, which is one more reason the cutover matters.

## Fixes & hardening

- The assistant's seat lookup crashed on every call and the model covered for it with a vague answer instead of a number; the feed is now read correctly and cached briefly.
- **Next registration** used to rank the whole catalogue, telling a CSE student their highest-leverage course was Basic Biochemistry. It now works from the student's own program plus subjects actually taken.
- Next registration shipped invisible — the module was left out of the profile page's bundle, so it threw at startup while working perfectly in development. A test now loads the *built* pages and fails on any startup error.
- Exam crunch opened on an exam period that was already over; it now follows the calendar and compares dates in campus time.
- Past-paper previews rendered blank for pre-migration files lacking a stored MIME type; a magic-byte sniff now runs in both the Worker and the client.
- Withdrawn (W) courses render as withdrawals rather than an empty grade box, and are offered as retake candidates priced honestly.

## Infrastructure

- CI and CD are one authoritative pipeline: the full validation suite runs on every PR and push, and the deploy jobs `needs:` all of it, so production can only deploy from a fully validated commit.
- A daily production check probes Pages and the Worker's `/health` and `/ready`, filing and closing its own alert issue.
- Bundle size budgets (gzip + raw) now fail CI when a bundle grows past them.
- A blocking shell-vs-legacy visual parity gate, plus an advisory per-route parity report on every PR.

## Security & privacy

- No model provider key ever reaches the browser; the client talks only to the Worker's relay, and `GET /ready` reports capability booleans, never key material. The assistant's tools are read-only and scoped to the caller.
- Client-created community documents are stamped with the writer's own campus and reads are scoped the same way, so one campus's boards and reviews stay separate from another's. The Worker mirrors the same registry, so client and server cannot disagree about who belongs where.
- Lost & Found contact details live in a collection no client can read; claims are relayed by the Worker.
- Assistant conversations are device-local (IndexedDB, uid-stamped) — never Firestore, never the Worker, never any server.
- Faculty review anonymity is unchanged and still described honestly: pseudonymous to other users, **not** anonymous to the service operator.

## Verification

Measured on the release commit, single machine, `js/config/runtime-config.js`
absent (see `CLAUDE.md` for why that matters):

- `npm run lint` — 0 errors, 91 warnings (config is correctness-only; warnings do not gate)
- `npm run typecheck` — clean
- `npm run validate:data` — 0 errors, 0 warnings, 131 info
- `npm run test:unit` — **123 test files** passing
- `npm run test:worker` — **156** passing
- `npm run test:rules` — **83** emulator-driven security-rules checks passing
- `npm run check:collisions` — no unsafe bundle identifier collisions
- `python3 build3.py` — `shohoj.html`, `admin.html`, `profile.html` all built
- `npm run test:bundle` — production bundle smoke passing
- `npm run test:csp` — no inline `on*` handlers in the bundle
- `npm run check:bundle-size` — every bundle within budget

End-to-end tests are verified **in CI, not locally**. The full matrix — legacy,
shell, Vite island, standalone pages and visual parity — passed on this commit in
[run 35491505770](https://github.com/souravmondalshuvo/Shohoj/actions/runs/35491505770).

> **Correction (2026-09-20).** This section first claimed "142 legacy E2E cases
> passing" from a local run. That was wrong. The run had 4 failures, missed
> because the command was piped through `tail`, so the shell reported the
> pipe's exit status (0) rather than Playwright's (1).
>
> Re-measured properly, the local legacy suite is heavily flaky on a developer
> machine: unmodified `main` fails **11 of 146** at `--workers=1`, and a
> different subset fails on each run (two runs of the same tree gave 2 and then
> 4 failures). The specs that fail pass in isolation, so it is cross-test state,
> not broken behaviour. `CLAUDE.md`'s "142 passed" is therefore not a constant
> to check against either.
>
> No local E2E number belongs in a verification section. CI runs on a clean
> runner with `runtime-config.js` deleted, is green on this commit, and is the
> gate that governs deploys.

## Known limitations

- **The React shell is not the default root.** Multi-campus, and everything else shell-only, is not what most users get yet.
- **Feed-driven features depend on a third-party feed.** Seats, routine, free rooms and the campus map read the public CONNECT feed; it is best-effort, and the archive only covers semesters captured since the cron started.
- **NSU is a profile, not a full campus.** Feed-driven features are off for it, and no credit-load warning is shown because those numbers could not be confirmed.
- **The assistant is an LLM.** The tools are deterministic and the numbers come from the same engines the calculator uses, but the prose around them is model-generated.
- **Cafeteria hours are unverified** until confirmed, and are marked as such rather than guessed.
- **Firestore rules deployment is unconfirmed** — `FIREBASE_SERVICE_ACCOUNT` has never been added, so the deployed rules may predate the tenancy work. The repo is not proof of the deployed state.

## Next

The cutover: making the React shell the default root, which is what puts
multi-campus in front of everyone rather than only `/app/` visitors.
