# Privacy

Shohoj handles academic data — grades, semester layouts, course plans, faculty reviews, feedback. This document explains exactly what is collected, where it lives, and what we do with it.

## What we collect

| Data | Where it lives | When |
|------|---------------|------|
| Email + Google profile (name, avatar) | Firebase Auth | When you sign in |
| Semesters, courses, grades, settings | Firestore (`users/{uid}`) and your browser's localStorage | Every time you edit |
| Faculty reviews you submit | Firestore (`facultyReviews/...`) | When you submit |
| Feedback you submit | Firestore (`appFeedback/...`) | When you submit |
| Past papers you upload | Cloudflare R2 (file) + Firestore (metadata) | When you upload |
| Page-view counts | Google Analytics | On every page load |

## What we don't collect

- **No grade data is sent to Google Analytics.** GA tracks page views only; the events do not carry your CGPA, course list, or any academic content.
- **No raw transcript PDF is stored.** The browser parses the PDF locally; only the extracted course/grade rows go to Firestore.
- **No identifying data lives inside review bodies.** Reviews are pseudonymous to other users — see [SECURITY.md](SECURITY.md#faculty-review-pseudonymity).
- **No third-party data sharing.** Your data goes to Firebase, Cloudflare (papers), and Google Analytics (counts only). Nothing is sold or shared with anyone else.
- **No ads.** Shohoj is not ad-supported.

## Cloud sync

Cloud sync is opt-in. If you don't sign in, your data lives only in localStorage on your browser. Signing in copies your local data to Firestore so you can use Shohoj across devices. Signing out leaves your data in Firestore unless you explicitly delete it (see "Deleting your data" below).

## Faculty reviews

Reviews are visible to all signed-in BRACU students. Once submitted, a review is **immutable** — there is no edit or delete flow from the client. If something needs to be removed (abuse, mistake, regret), file a report via the in-app "Report" action and an admin will handle it.

The review body contains no UID or email. Other users cannot trivially link reviews back to you. Project administrators can, however; see [SECURITY.md](SECURITY.md#what-pseudonymity-does-not-cover) for the threat model.

## Admin access

Admins can read and act on:

- Faculty review reports (`reviewReports`) — for moderation triage.
- Paper reports (`paperReports`) — same.
- Pending paper uploads (`papers` with `approved: false`) — to approve or reject.
- App feedback (`appFeedback`) — to act on bugs and requests.
- Past-paper files in R2 — to delete spam or copyright violations.

Admins cannot read your `users/{uid}` document — Firestore rules forbid it. The admin custom claim does not grant access to private user data.

## Deleting your data

You have two options:

1. **In-app deletion.** From the sign-out modal, choose "Delete cloud data". This removes your `users/{uid}` document. Your reviews stay (because they're append-only and pseudonymous), but the user document goes.
2. **Email request.** Email `souravmondal033@gmail.com` and we will manually purge your reviews and any other identifiable records. Allow up to 7 days.

LocalStorage data is yours — clear it from your browser settings whenever you want. No round-trip needed.

## Cookies

Shohoj does not set first-party cookies. Firebase Auth and Google Analytics may set their own cookies on the Google domains they own; consult Google's privacy policies for details.

## Changes to this policy

If we change what we collect, this file gets updated and the change goes through git. Look at the file's history on GitHub to see what changed and when.

## Contact

Privacy questions: `souravmondal033@gmail.com`.
