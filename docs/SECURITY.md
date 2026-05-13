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
- Paper uploads must start with `approved: false`; only admins can flip the flag.
- Pending paper metadata is readable only by the uploader or an admin; other BRACU users see papers only after approval.
- New paper metadata must use an owner-scoped storage path: `papers/{COURSE_CODE}/{UPLOADER_UID}/{filename}`.
- Feedback upvote documents are readable only by the voter or an admin.
- Admin status is granted via a Firebase custom claim (`admin: true`) and set out-of-band via `scripts/set_admin_claim.js`. UID and email are no longer trusted by rules.

The rules suite (`tests/firestore.rules.test.js`) runs in CI against the Firestore emulator and asserts these guarantees.

## App Check

Firestore is fronted by Firebase App Check using reCAPTCHA v3. Every Firestore call from the browser carries an attestation token; scripted abuse without a real browser session is rejected. App Check runs in **monitor** mode while we watch real traffic, then flips to **enforce**.

## XSS prevention

- All user-sourced strings (course titles, semester labels, transcript-imported data, error messages) are escaped via `escHtml()` and `escAttr()` in `js/core/helpers.js` before any `innerHTML` insertion.
- The transcript import flow does not serialize parsed PDF data into `onclick` attributes; it stores it in a JS-side slot.
- `sanitizeRestoredState()` strips legacy HTML from anything restored from localStorage on load.

## CDN integrity

jsPDF, pdf.js, and Chart.js load from cdnjs with `integrity` and `crossorigin="anonymous"`, so a compromised CDN cannot inject altered code without breaking the hash check.

## Content Security Policy

`index.html` and `admin/index.html` ship a strict CSP that whitelists only the Google/Firebase/cdnjs/Worker origins Shohoj actually needs. Currently `'unsafe-inline'` is allowed for `script-src` and `style-src` because the app still has inline bootstrapping scripts and inline style-heavy rendering; tightening this is tracked as a future hardening.

## Faculty review pseudonymity

Reviews are pseudonymous to other users:

- The review document body contains no UID or email.
- The Firestore doc ID is a salted SHA-256 of `uid + facultyInitials + courseCode`, so the same user's reviews for different courses produce different hashes — third-party readers cannot trivially group all of one user's reviews together.

What pseudonymity does **not** cover:

- Firebase project administrators (and anyone with admin SDK access) can audit Firestore logs and correlate writes back to the authenticated session. "Anonymous to the public" ≠ "anonymous to the service operator".
- A determined adversary who already knows your UID can reconstruct your hash for any (faculty, course) pair.

Stronger guarantees would require moving review writes behind a Cloud Function. Tracked as a future hardening.

## Past-paper uploads

Files go through a Cloudflare Worker (`worker/index.js`) before landing in R2:

- Verifies a Firebase ID token against Google's JWKS.
- Rejects non-BRACU emails unless the token carries `admin: true`.
- Stores new uploads under `papers/{COURSE_CODE}/{UPLOADER_UID}/{filename}`.
- Accepts legacy `papers/{COURSE_CODE}/{filename}` paths for download/delete only, so older files remain accessible.
- Caps uploads at 10 MB.
- Restricts MIME to PDF, PNG, JPEG, WebP, and GIF. SVG and other active formats are rejected.
- Origin-locked CORS.

Firestore separately validates paper metadata so a client cannot create a paper
document that points at another user's owner-scoped R2 object.

## Public Firebase config

The Firebase web config (API key, project ID, etc.) is public by design — Firebase apps must ship it to the browser. It does not grant access on its own; access is gated by Firestore rules + App Check. The config lives in `js/config/runtime-config.js`, which is gitignored and generated from `.env` (locally) or GitHub Actions secrets (CI).

## Rate limiting

Two layers are in place:

1. **Firebase App Check (reCAPTCHA v3).** Every Firestore call carries an attestation token. Scripted clients without a real browser session are rejected. This is the primary line of defense against automated abuse.
2. **Schema constraints.** Firestore rules enforce one review per `(user, faculty, course)` pair, one report per `(user, target)` pair, private per-user feedback upvote reads, approved/uploader/admin paper visibility, max 500 chars in review text, max 10 MB on paper uploads, owner-scoped paper paths, and a strict MIME allowlist on file uploads.

What is **not** in place: per-user write-rate quotas (e.g. "max 5 feedback per day"). Pure Firestore rules can't aggregate writes across documents, so this would need a Cloud Function. App Check covers the realistic abuse model for this project; revisit if the corpus grows enough that App Check alone is insufficient.

## What is *not* in scope

- **Per-user write quotas.** See "Rate limiting" above.
- **Anonymity from project admins.** As above, server-operator-level anonymity requires a backend rewrite.
- **Section availability and time conflict checks** in the planner (these are correctness, not security).
- **Splitting `firebase.js` into services.** The file is ~1700 lines, which is a maintainability concern, not a security one. Tracked as a future refactor.

## Reporting an issue

Open a GitHub issue with the `security` label, or email `admin.shohoj@gmail.com`. Please don't disclose security issues publicly until they're patched.
