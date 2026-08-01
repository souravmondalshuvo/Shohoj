#!/usr/bin/env node
// Post-deployment production smoke test.
//
// Verifies a LIVE Shohoj deployment is healthy without touching user data — it
// only issues GETs. It is designed to run right after the gh-pages publish step
// and fail the deploy job if the release is broken, so a bad deploy is caught
// automatically (see docs/ROLLBACK.md for what to do when it fails).
//
// GitHub Pages can take a moment to serve a freshly-pushed commit, so we poll
// version.json until it reports the expected commit SHA (bounded retries with a
// short delay) before running the rest of the checks.
//
// Usage:
//   BASE_URL=https://souravmondalshuvo.github.io/Shohoj/ \
//   EXPECTED_SHA=<git sha> \
//   node scripts/smoke-production.mjs
//
// Env:
//   BASE_URL      Base site URL (default: the project's GitHub Pages URL).
//   EXPECTED_SHA  Commit that was just deployed; version.json must match it.
//                 If unset, we only require version.json to be reachable.
//   SMOKE_MAX_ATTEMPTS  Propagation poll attempts (default 20).
//   SMOKE_DELAY_MS      Delay between attempts (default 6000).

const BASE_URL = (process.env.BASE_URL || 'https://souravmondalshuvo.github.io/Shohoj/').replace(
  /\/?$/,
  '/',
);
const EXPECTED_SHA = process.env.EXPECTED_SHA || '';
const MAX_ATTEMPTS = Number(process.env.SMOKE_MAX_ATTEMPTS || 20);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 6000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (path) => new URL(path, BASE_URL).toString();

// GitHub Pages serves a recognizable 404 body when a path is missing; treat that
// as a deployment-path error even if the CDN returns 200 for the SPA fallback.
const GH_PAGES_404_MARKERS = [
  "There isn't a GitHub Pages site here",
  'For root URLs (like http://example.com/) you must provide an index.html file',
];

async function get(path) {
  const res = await fetch(url(path), { redirect: 'follow' });
  const body = await res.text();
  return { status: res.status, body, contentType: res.headers.get('content-type') || '' };
}

function looksLike404(body) {
  return GH_PAGES_404_MARKERS.some((m) => body.includes(m));
}

// ---- Step 1: wait for the new build to propagate via version.json ----
async function waitForPropagation() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { status, body } = await get('version.json');
      if (status === 200) {
        const meta = JSON.parse(body);
        if (!EXPECTED_SHA || meta.commit === EXPECTED_SHA) {
          console.log(`✓ version.json live (commit=${meta.commit}, version=${meta.version})`);
          return meta;
        }
        console.log(
          `… version.json commit ${meta.commit} != expected ${EXPECTED_SHA} (attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
      } else {
        console.log(`… version.json HTTP ${status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      }
    } catch (err) {
      console.log(`… version.json not ready: ${err.message} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
  }
  throw new Error(`version.json did not report expected commit within ${MAX_ATTEMPTS} attempts`);
}

// ---- Step 2: check every critical route returns real HTML ----
// Only paths backed by a real file are asserted here.
//
// The cutover is reverted (docs/ROLLBACK.md Option C): the vanilla build3.py
// site is the root again and the React shell is opt-in at /app/. So the static
// pages are back at their own top-level paths, and there is no /legacy/ tree —
// asserting one would fail every deploy.
//
// Shell CLIENT routes (/app/calculator and friends) are deliberately absent:
// static hosting has no file for them, so a plain GET sees the 404 that
// 404.html only recovers in the browser.
const ROUTES = [
  '', // vanilla build3.py site (site root)
  'admin/', // standalone moderation dashboard
  'app/', // the React shell (opt-in beta)
  'profile/',
  'campus/',
  'bus/',
  'lost-found/',
];

async function checkRoutes(failures) {
  for (const route of ROUTES) {
    try {
      const { status, body, contentType } = await get(route);
      if (status !== 200) {
        failures.push(`route /${route} returned HTTP ${status}`);
        continue;
      }
      if (looksLike404(body)) {
        failures.push(`route /${route} served the GitHub Pages 404 page`);
        continue;
      }
      if (!/text\/html/i.test(contentType)) {
        failures.push(
          `route /${route} content-type is ${contentType || 'unknown'} (expected text/html)`,
        );
        continue;
      }
      console.log(`✓ /${route} OK (${body.length} bytes)`);
    } catch (err) {
      failures.push(`route /${route} fetch failed: ${err.message}`);
    }
  }
}

// ---- Step 3: main HTML contains expected Shohoj markers ----
async function checkMarkers(failures) {
  try {
    const { body } = await get('');
    if (!/shohoj/i.test(body)) failures.push('main HTML is missing the "Shohoj" marker');
    if (!/content-security-policy/i.test(body)) {
      failures.push('main HTML is missing its Content-Security-Policy meta tag');
    }
    if (!failures.length) console.log('✓ main HTML markers present (Shohoj + CSP)');
    return body;
  } catch (err) {
    failures.push(`could not fetch main HTML for marker check: ${err.message}`);
    return '';
  }
}

// ---- Step 4: a hashed static asset referenced by a page is fetchable ----
async function checkStaticAsset(failures) {
  try {
    // The standalone pages reference hashed files under assets/. Parse one out
    // of the campus page so we don't hard-code a hash that changes every build.
    const { body } = await get('campus/');
    const m = body.match(/(?:src|href)="([^"]*assets\/[^"]+\.(?:js|css))"/i);
    if (!m) {
      console.log('… no hashed asset reference found on /campus/ — skipping asset check');
      return;
    }
    // Resolve the reference (typically "../assets/…") against the page URL so
    // the URL constructor handles the relative ".." segment correctly.
    const assetUrl = new URL(m[1], url('campus/')).toString();
    const res = await fetch(assetUrl);
    if (res.status !== 200) {
      failures.push(`static asset ${assetUrl} returned HTTP ${res.status}`);
    } else {
      console.log(`✓ static asset reachable (${m[1]})`);
    }
  } catch (err) {
    failures.push(`static asset check failed: ${err.message}`);
  }
}

async function main() {
  console.log(`Smoke-testing ${BASE_URL}`);
  if (EXPECTED_SHA) console.log(`Expecting commit ${EXPECTED_SHA}`);

  await waitForPropagation();

  const failures = [];
  await checkRoutes(failures);
  await checkMarkers(failures);
  await checkStaticAsset(failures);

  if (failures.length) {
    console.error('\n✗ Smoke test FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      '\nThe deployment is live but unhealthy. Investigate or roll back (docs/ROLLBACK.md).',
    );
    process.exit(1);
  }

  console.log('\n✓ All production smoke checks passed.');
}

main().catch((err) => {
  console.error(`\n✗ Smoke test error: ${err.message}`);
  console.error('Deployment could not be verified. Investigate or roll back (docs/ROLLBACK.md).');
  process.exit(1);
});
