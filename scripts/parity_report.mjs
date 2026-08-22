// Per-route parity report for the JS -> TS migration.
//
// The visual harness (e2e-visual/) gates the LANDING page only — nav, hero and
// features. Every route interior is unverified, which is why drift is found by
// eye instead of by CI. This script walks the legacy-panel <-> shell-route map
// and reports, for each pair, the geometry and container styling of the box the
// feature actually renders into.
//
// It is a measuring instrument, not a gate: it prints a punch list and always
// exits 0. Findings get closed by real work, then promoted into the blocking
// harness once a route is actually at parity.
//
// Usage (both servers must be up):
//   python3 -m http.server 4186 --bind 127.0.0.1
//   npm run build:shell && npm run preview:shell -- --port 4187 --strictPort
//   node scripts/parity_report.mjs
//
// The legacy server MUST be rooted at a checkout that has node_modules: the
// un-bundled legacy page resolves bare imports through /node_modules/ (see the
// import map in index.html), and without it main.js dies partway through init.
// The landing page still renders because it is static markup, but restoreCalcTab
// never runs, so every panel stays inactive and measures 0x0 — a silent,
// convincing "everything is empty" result rather than an error. Run this from a
// worktree only after linking node_modules into it.

import { chromium } from '@playwright/test';
import { PANEL_ROUTES } from '../e2e-visual/panelRoutes.js';

const LEGACY = process.env.PARITY_LEGACY_URL || 'http://127.0.0.1:4186';
const SHELL = process.env.PARITY_SHELL_URL || 'http://127.0.0.1:4187';
const SETTLE_MS = 900;

/** Geometry + the container properties that decide whether two boxes read as
 *  the same surface. Returned for whichever element the feature renders into. */
// Selectors are tried IN ORDER and the first one that matches wins. A single
// comma-joined selector cannot express that: querySelector returns the first
// match in DOCUMENT order, so `main` would always beat `main .shell-page`.
const MEASURE = (selectors) => {
  let el = null;
  for (const sel of selectors) {
    el = document.querySelector(sel);
    if (el) break;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    width: Math.round(r.width),
    height: Math.round(r.height),
    maxWidth: cs.maxWidth,
    padding: cs.paddingTop + ' ' + cs.paddingRight,
    background: cs.backgroundColor,
    border: cs.borderTopWidth + ' ' + cs.borderTopColor,
    radius: cs.borderTopLeftRadius,
  };
};

async function measure(page, url, selectors) {
  // Legacy selects its panel in restoreCalcTab, which runs once at init. Two
  // consecutive gotos that differ only by hash are a same-document navigation —
  // no reload, no init, so the page would keep showing the previous panel and
  // every later measurement would read 0x0. Clearing to about:blank forces a
  // real load each time.
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  // Force the reveal end state before measuring, exactly as e2e-visual's
  // stabilize() does. Without it every legacy number comes out 1.8% small:
  // .calc-wrapper[data-reveal-calc] sits at scale(0.982) until the observer
  // adds .visible (style.css:743-753), and getBoundingClientRect returns the
  // TRANSFORMED box. That silently reported legacy's panels as 839px when
  // their real layout width is 854 (838.63 / 0.982) — a wrong target to
  // migrate toward, and wrong in a direction that looks plausible.
  await page.evaluate(() => {
    document
      .querySelectorAll('.reveal,[data-reveal-calc]')
      .forEach((el) => el.classList.add('visible'));
  });
  await page.waitForTimeout(400);
  return page.evaluate(MEASURE, selectors);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('shohoj_theme', 'dark');
  } catch {
    /* storage unavailable */
  }
});

// The shell gates every route behind sign-in (GatedMain in RootLayout), so an
// unauthenticated run measures the SIGN-IN PORTAL on every route instead of the
// route. That failure is silent and convincing: each route reports the same
// 544x435 box with `max-width: 544px`, which reads as one systemic container
// bug across nine routes rather than nine measurements of the same portal.
//
// Same seam and same student as e2e-support/authFixture.js. The snapshot
// crosses into page scope once so `get()` returns a stable reference —
// useSyncExternalStore compares by identity and a fresh object per call
// re-renders forever.
await ctx.addInitScript(() => {
  const snapshot = {
    status: 'authenticated',
    uid: 'u_me',
    email: 'me@g.bracu.ac.bd',
    isAdmin: false,
    university: 'bracu',
  };
  window.__shohojAuthSource = {
    get: () => snapshot,
    subscribe: () => () => {},
    getIdToken: async () => 'test-token',
  };
});
const page = await ctx.newPage();

const rows = [];
for (const entry of PANEL_ROUTES) {
  const legacy = await measure(page, `${LEGACY}/index.html${entry.hash}`, [`#${entry.panel}`]);

  if (!entry.route) {
    rows.push({ name: entry.name, status: 'MISSING', legacy, shell: null });
    continue;
  }

  // `<main>`, not `.shell-page`. RootLayout gives <main> legacy's `.calc-body`
  // class so it carries the same 1.5rem/2rem inset the legacy panel does
  // (RootLayout.tsx:292); `.shell-page` sits INSIDE that inset. Measuring
  // `.shell-page` against a legacy panel compares two boxes one padding level
  // apart and reports a flat -64px desktop / -24px mobile gap on every route —
  // a systematic "container bug" that is purely an artifact of the selector.
  //
  // The portal also carries `.shell-page`, which is the other half of the same
  // trap: an unauthenticated run measured it and reported it as the route.
  const shell = await measure(page, `${SHELL}${entry.route}`, ['main#main-content']);
  const gated = await page.evaluate(
    () => document.querySelector('[data-testid="signin-portal"]') !== null,
  );
  rows.push({
    name: entry.name,
    status: gated ? 'GATED' : shell ? 'present' : 'NO CONTENT',
    legacy,
    shell: gated ? null : shell,
  });
}

await browser.close();

const fmt = (m) => (m ? `${m.width}x${m.height}` : '—');
console.log('\n## Per-route container parity\n');
console.log('| feature | status | legacy panel | shell container | legacy max-w | shell max-w |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.status} | ${fmt(r.legacy)} | ${fmt(r.shell)} | ` +
      `${r.legacy?.maxWidth ?? '—'} | ${r.shell?.maxWidth ?? '—'} |`,
  );
}

console.log('\n## Container styling\n');
for (const r of rows) {
  if (!r.shell || !r.legacy) continue;
  const diffs = [];
  for (const key of ['maxWidth', 'padding', 'background', 'border', 'radius']) {
    if (r.legacy[key] !== r.shell[key])
      diffs.push(`${key}: legacy \`${r.legacy[key]}\` vs shell \`${r.shell[key]}\``);
  }
  console.log(`- **${r.name}** — ${diffs.length ? diffs.join('; ') : 'container matches'}`);
}
