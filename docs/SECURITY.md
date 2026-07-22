# Security

This document describes how Shohoj protects user data and what its threat model looks like.

## Authentication

- **Google sign-in only.** Email/password flows are not supported, so there is no password to phish, leak, or rotate.
- **BRACU domain gate.** The frontend rejects any account whose email is not `@g.bracu.ac.bd` unless the Firebase ID token carries the `admin: true` custom claim.
- **30-day session expiry.** Sessions are auto-terminated after 30 days; the user signs in again.
- **Firestore enforces the same checks** in security rules so a forged client cannot bypass them.

## Authorization

Firestore rules in `firestore.rules` are the trust boundary. Important guarantees:

- A user can read/write **only** their own `users/{uid}` document.
- Faculty reviews are **append-only**; no client can update or delete an existing review (even the author).
- Review reports, paper reports, admin logs, and moderation reads are admin-only.
- Paper upload metadata is created only by the Cloudflare Worker and starts with `approved: false`; only admins can flip the flag.
- Pending paper metadata is readable only by the uploader or an admin; other BRACU users see papers only after approval.
- New paper files must use an owner-scoped storage path: `papers/{COURSE_CODE}/{UPLOADER_UID}/{filename}`.
- Feedback upvote documents are readable only by the voter or an admin.
- Admin status is granted via a Firebase custom claim (`admin: true`) and set out-of-band via `scripts/set_admin_claim.js`. UID and email are no longer trusted by rules.

The rules suite (`tests/firestore.rules.test.js`) runs in CI against the Firestore emulator and asserts these guarantees.

## App Check

The client initializes Firebase App Check with a reCAPTCHA v3 provider
(`src/platform/firebase/firebaseClient.ts`), so Firestore calls from a real
browser session attach an attestation token. Three things are worth stating
precisely, because they are often conflated:

- **Client initialization** is in the code and best-effort: if App Check fails
  to initialize, auth and the Firestore calls still proceed (offline tools must
  keep working). So the presence of App Check in the client does not, by itself,
  reject anything.
- **Monitor mode** (the current expected state) records attestation results in
  the Firebase console but **does not reject** un-attested traffic. A scripted
  client with a valid ID token is still served.
- **Enforce mode** is what actually rejects un-attested requests, and it is a
  **Firebase console setting**, not something this repo can turn on or verify.

We therefore do **not** claim that scripted traffic is currently rejected by App
Check. Enabling and confirming enforcement is tracked as an external action in
[`GITHUB_SECURITY_SETTINGS.md`](GITHUB_SECURITY_SETTINGS.md). Until enforcement
is verified in the console, the real authorization boundary is the Firestore
rules plus the Worker's token verification — not App Check.

## XSS prevention

- All user-sourced strings (course titles, semester labels, transcript-imported data, error messages) are escaped via `escHtml()` and `escAttr()` in `js/core/helpers.js` before any `innerHTML` insertion.
- The transcript import flow does not serialize parsed PDF data into `onclick` attributes; it stores it in a JS-side slot.
- `sanitizeRestoredState()` strips legacy HTML from anything restored from localStorage on load.

## CDN integrity

jsPDF, pdf.js, and Chart.js load from cdnjs with `integrity` and `crossorigin="anonymous"`, so a compromised CDN cannot inject altered code without breaking the hash check.

## Content Security Policy

`index.html` and `admin/index.html` define a CSP that whitelists only the Google/Firebase/cdnjs/Worker origins Shohoj actually needs. During the production build, `build3.py` replaces `script-src 'unsafe-inline'` with SHA-256 hashes for the inlined scripts in `shohoj.html` and `admin.html`. `style-src 'unsafe-inline'` remains because the templates still rely on inline `style="..."` attributes; tightening that is tracked as future hardening.

## Faculty review pseudonymity

Reviews are pseudonymous to other users:

- The review document body contains no UID or email.
- The Firestore doc ID is a **deterministic, unsalted** SHA-256 of
  `uid | facultyInitials | courseCode`. There is no secret salt — the term was
  removed from this document and the code because it was inaccurate. The hash is
  reproducible by anyone who knows the exact inputs. What it does buy: the same
  user's reviews for different courses produce different, uncorrelated doc IDs,
  so a third-party reader cannot trivially group all of one user's reviews
  together, and the raw UID never appears in a public doc.

Why unsalted, and why that is acceptable here: the determinism is load-bearing.
It is exactly what enforces one-review-per-(user, faculty, course) — the Worker
writes to that computed ID, and a duplicate collides (HTTP 409). A random or
secret-salted ID could not do that without storing a uid→id mapping somewhere,
which would reintroduce the very identifier we are trying to keep out of the
data.

What pseudonymity does **not** cover:

- Firebase project administrators (and anyone with admin SDK access) can audit Firestore logs and correlate writes back to the authenticated session. "Pseudonymous to other users" ≠ "anonymous to the service operator".
- Because the ID is unsalted and deterministic, an adversary who **already knows your UID** can reconstruct your doc ID for any (faculty, course) pair and confirm whether you reviewed it. Guessing a UID you do not know remains infeasible (Firebase UIDs are 28 random characters), but this is confirmation-of-a-known-guess resistance, not anonymity.

Review submissions are already mediated by the Cloudflare Worker (`POST /reviews`), which verifies the Firebase ID token and writes the Firestore review document through a service account. The public review body still contains no UID or email. Stronger operator-level anonymity would require a more advanced backend design with blind tokens or another unlinkable submission protocol.

## Past-paper uploads

Files go through a Cloudflare Worker (`worker/index.js`) before landing in R2:

- Verifies a Firebase ID token against Google's JWKS.
- Rejects non-BRACU emails unless the token carries `admin: true`.
- Stores new uploads under `papers/{COURSE_CODE}/{UPLOADER_UID}/{filename}`.
- Accepts legacy `papers/{COURSE_CODE}/{filename}` paths for download/delete only, so older files remain accessible.
- Caps uploads at 10 MB.
- Restricts MIME to PDF, PNG, JPEG, WebP, and GIF. SVG and other active formats are rejected.
- Sniffs file magic bytes so the body must match the declared MIME type.
- Writes the Firestore paper metadata via a service account only after the R2 write succeeds, and deletes the R2 object if metadata creation fails.
- Origin-locked CORS.

Firestore denies direct client creates for paper metadata. Clients can read
pending metadata only when they uploaded it, and other BRACU users see papers
only after an admin approves them.

## Public Firebase config

The Firebase web config (API key, project ID, etc.) is public by design — Firebase apps must ship it to the browser. It does not grant access on its own; access is gated by Firestore rules (and, once console enforcement is verified, App Check). The config lives in `js/config/runtime-config.js`, which is gitignored and generated from `.env` (locally) or GitHub Actions secrets (CI).

## Rate limiting

Three layers, in order of how much they actually stop:

1. **Worker per-UID rate limits.** The Cloudflare Worker keys Cloudflare's
   Rate Limiting binding on the verified Firebase UID (not the IP), so abuse is
   bounded per account. This is real, code-level enforcement on the privileged
   write and paid endpoints:
   - `/upload` and `/reviews` — namespaced `upload:` / `review:` per UID.
   - `/api/assistant` — namespaced `assistant:` per UID (this endpoint spends
     metered Anthropic tokens, so it is limited independently).

   **Failure policy is explicit and differs by endpoint** (`rateLimit()` in
   `worker/index.js`):
   - `/api/assistant` **fails closed** — if the limiter binding throws, the
     request is denied (429) rather than handed unmetered paid capacity.
   - `/upload` and `/reviews` **fail open** — they are already behind a verified
     BRACU account and hard size/shape limits, and a limiter blip must not block
     legitimate coursework. A limiter *exception* is logged (safe metadata only);
     a *missing* binding is a deploy-time fault surfaced by `GET /ready`, not a
     silent outage.
2. **Firebase App Check (reCAPTCHA v3).** In monitor mode this records but does
   not reject (see the App Check section). Treat it as telemetry today, and as a
   second enforcement layer only once console enforcement is verified.
3. **Schema constraints.** Firestore rules enforce one review per
   `(user, faculty, course)` pair, one report per `(user, target)` pair, private
   per-user feedback upvote reads, approved/uploader/admin paper visibility, and
   max 500 chars in review text. The Worker additionally validates upload size,
   owner-scoped paths, MIME allow-listing + magic-byte sniffing, and — new in
   this pass — **course codes against an authoritative catalogue** (not just a
   shape regex), and rejects (rather than truncates) over-length review text.

What is **not** in place: per-user *daily* write quotas (e.g. "max 5 feedback per
day"). Pure Firestore rules can't aggregate writes across documents, so this
would need a Cloud Function; the Worker's per-request rate limits are the
current mitigation.

### Faculty-initials validation (known limitation)

The Worker validates review **course codes** against the authoritative catalogue
but validates **faculty initials by shape only** (`^[A-Z]{2,6}$`). This is
deliberate: the authoritative set of teaching faculty is the live CONNECT feed,
and `data/faculty_profiles.jsonl` is an explicitly partial seed, so gating on it
would reject legitimate reviews for most professors. The consequence is that a
review can be filed against well-formed initials that no current faculty member
uses. Closing this cleanly needs a server-side faculty roster synced from
CONNECT; tracked as future work.

## What is *not* in scope

- **Per-user write quotas.** See "Rate limiting" above.
- **Anonymity from project admins.** As above, server-operator-level anonymity requires a backend rewrite.
- **Section availability and time conflict checks** in the planner (these are correctness, not security).

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.** A public issue discloses the flaw to everyone
before it can be fixed.

Report privately through one of:

1. **GitHub Private Vulnerability Reporting** — the repository's **Security** tab
   → *Report a vulnerability* (GitHub Security Advisories). This is the preferred
   channel; it keeps the report and discussion private until a fix ships.
2. **Email** — `admin.shohoj@gmail.com`.

Please include steps to reproduce and the impact you observed. We'll acknowledge,
investigate, and coordinate a fix and disclosure timeline with you; please keep
the details private until a patch is released.

> Enabling Private Vulnerability Reporting is a one-time repository setting — see
> [GITHUB_SECURITY_SETTINGS.md](GITHUB_SECURITY_SETTINGS.md).
