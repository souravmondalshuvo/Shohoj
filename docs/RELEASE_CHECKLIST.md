# Shohoj Release Checklist

Use this checklist for every Shohoj v0.x release. The goal is to ship only after the app, documentation, security posture, and deployment path are all verified.

## 1. Scope

- Confirm the release goal and version number.
- Review open issues and pull requests.
- Move unfinished work out of the release scope.
- Confirm the changelog/release notes match what actually shipped.
- Check that screenshots and recruiter-facing README sections are current.

## 2. Local Validation

Run the core checks:

```bash
npm run typecheck
npm test
```

Run browser and bundle checks:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
python3 build3.py
npm run test:bundle
```

Confirm generated bundles exist:

```bash
test -s shohoj.html
test -s admin.html
```

## 3. Product Review

- Try Demo Mode from a fresh browser session.
- Check CGPA calculator, transcript import, semester planner, degree progress, reviews, past papers, and admin dashboard.
- Confirm no obvious console errors appear during the main flows.
- Check desktop Chrome/Brave and Safari if available.
- Check one mobile viewport for layout breakage and horizontal scroll.

## 4. Security Review

- Confirm no Firebase service account keys, private config files, or secrets are committed.
- Confirm `js/config/runtime-config.js` is generated only from deployment secrets.
- Review Firestore rules if auth, reviews, papers, admin, or feedback behavior changed.
- Review Worker routes if upload, download, delete, or review-write behavior changed.
- Confirm README/security docs do not overclaim anonymity or privacy guarantees.

## 5. Documentation

- Update `CHANGELOG.md`.
- Update or create release notes under `docs/`.
- Update screenshots when UI changes are visible.
- Confirm README links are valid.
- Confirm setup/test commands still match `package.json`.

## 6. GitHub Release

- Ensure all release work is merged through pull requests.
- Confirm `main` CI is green.
- Confirm `main` CD is green.
- Create a GitHub release with:
  - Version tag
  - Release title
  - Summary of user-facing changes
  - Testing and deployment notes
  - Known limitations or next steps

## 7. Deployment Verification

After CD completes:

- Open the live site.
- Confirm the landing page loads.
- Click Try Demo Mode.
- Confirm CGPA, planner, degree progress, reviews, and papers render.
- Open `/admin/` and confirm the admin shell loads for authorized users.
- Confirm README badges and release links point to the expected version.

## 8. Post-Release

- Close completed release issues.
- Create follow-up issues for known limitations.
- Update the next milestone or project board.
- Share the release link only after live-site verification passes.
