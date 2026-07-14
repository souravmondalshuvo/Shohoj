# Shohoj Release Checklist

Use this checklist for every Shohoj v0.x release. The goal is to ship only after the app, documentation, security posture, and deployment path are all verified.

## 1. Scope

- Confirm the release goal and version number.
- Review open issues and pull requests.
- Move unfinished work out of the release scope.
- Confirm the changelog/release notes match what actually shipped.
- Check that screenshots and recruiter-facing README sections are current.

## 2. Local Validation

Run the same gates CI enforces:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test              # unit + Firestore rules (needs Java 21+)
npm run test:worker
```

Run browser and bundle checks:

```bash
npx playwright install --with-deps chromium
npm run check:collisions
python3 build3.py
npm run test:bundle
npm run test:csp
npm run test:e2e
npm run test:e2e:pages
npm run test:e2e:shell
```

> These mirror the validation jobs in `.github/workflows/ci.yml`. CI runs them on
> every PR/push and is the authoritative gate — the deploy jobs `needs:` all of
> them, so a red suite means production cannot deploy.

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
- Confirm the **CI / CD** pipeline is green on `main` (validation jobs **and** the deploy jobs — the deploy jobs only run after validation passes).
- Create a GitHub release with:
  - Version tag
  - Release title
  - Summary of user-facing changes
  - Testing and deployment notes
  - Known limitations or next steps

## 7. Deployment Verification

The pipeline's post-deploy smoke test (`scripts/smoke-production.mjs`) already verifies routes, markers, and `version.json` automatically; a failed smoke test fails the deploy and means the release needs investigation or rollback ([ROLLBACK.md](ROLLBACK.md)). Then manually confirm:

- `https://souravmondalshuvo.github.io/Shohoj/version.json` reports the released commit SHA and version.
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
