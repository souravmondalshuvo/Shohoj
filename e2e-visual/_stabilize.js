// Shared determinism helpers for the visual parity harness.
//
// PANEL_ROUTES is the legacy-panel <-> shell-route correspondence; it lives in
// its own module because scripts/parity_report.mjs consumes it too.
//
// The legacy page is deliberately animated: a pointer-reactive canvas, three
// drifting orbs, a custom cursor, IntersectionObserver reveal cascades with
// accumulating transition delays, and a 900ms rAF stat counter. None of that is
// pixel-stable, so both the baseline run and the shell run put the page into the
// same forced end state before capturing.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PANEL_ROUTES } from './panelRoutes.js';

/** Decorative layers that are animated, pointer-driven, or scroll-driven. */
export const DECORATIVE = [
  '#dot-matrix', // full-viewport canvas, rAF + mousemove
  '#cursor-dot',
  '#cursor-ring',
  '#cursor-glow',
  '.orb', // three CSS-animated gradient blobs
  '#scroll-progress',
];

/** Every element the legacy reveal system toggles `.visible` on. */
const REVEAL_SELECTORS = [
  '.reveal',
  '[data-reveal-hero]',
  '[data-reveal-stat]',
  '[data-reveal-card]',
  '[data-reveal-label]',
  '[data-reveal-title]',
  '[data-reveal-desc]',
  '[data-reveal-calc]',
].join(',');

/**
 * Longest animation chain in js/animations/reveal.js:
 * stat index 2 -> transitionDelay 240ms, counter starts at +220ms, runs 900ms.
 * Rounded up with headroom so the forced end state below is idempotent rather
 * than racing a still-running rAF loop.
 */
const SETTLE_MS = 1800;

/**
 * The live CONNECT feed, and a fixed instant to read it at.
 *
 * Free Rooms answers "which rooms are free NOW", so its panel is a function of
 * the wall clock and of a third-party feed that changes through the day. Both
 * projects captured it against whatever was true at capture time, which made
 * the freerooms baselines rot within hours — four captures failed against
 * baselines authored the same morning.
 *
 * Pinning both makes the panel a pure function again. The fixture is small on
 * purpose: it is not trying to reproduce a real timetable, only to give both
 * sides byte-identical input so the comparison is about layout. Routine and
 * Seats read the same feed and become deterministic for free.
 */
export const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// A Sunday, mid-morning: inside R1's 08:00-09:20 theory class and the
// 08:00-10:50 lab, so the panel has both a busy and a free room to render.
const FIXED_TIME = new Date('2026-08-23T09:00:00+06:00');

function sched(day, start, end) {
  return {
    midExamDate: '2026-07-26',
    midExamStartTime: '11:00:00',
    midExamEndTime: '13:00:00',
    finalExamDate: '2026-09-13',
    finalExamStartTime: '11:00:00',
    finalExamEndTime: '13:00:00',
    classSchedules: [{ day, startTime: start, endTime: end }],
  };
}

const FEED_FIXTURE = [
  {
    courseId: 1,
    sectionType: 'THEORY',
    semesterSessionId: 20262,
    courseCredit: 3,
    sectionId: 1,
    courseCode: 'CSE110',
    courseName: 'Programming Language I',
    sectionName: '01',
    capacity: 30,
    consumedSeat: 10,
    faculties: 'ABC',
    roomName: 'R1',
    sectionSchedule: sched('SUNDAY', '08:00:00', '09:20:00'),
  },
  {
    courseId: 2,
    sectionType: 'THEORY',
    semesterSessionId: 20262,
    courseCredit: 3,
    sectionId: 2,
    courseCode: 'MAT110',
    courseName: 'Mathematics I',
    sectionName: '01',
    capacity: 30,
    consumedSeat: 5,
    faculties: 'DEF',
    roomName: 'R2',
    sectionSchedule: sched('TUESDAY', '10:00:00', '11:20:00'),
  },
];

/**
 * Freeze the clock and serve the feed from a fixture.
 *
 * Only the feed URL is intercepted — the legacy specs abort every other https
 * request, which here would also block Google Fonts and change every glyph in
 * the frame. Must run before goto: the clock has to be fixed before page
 * scripts read it, and the route before the feed is requested.
 */
export async function pinFeedAndClock(page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route(`${FEED_URL}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(FEED_FIXTURE),
    }),
  );
}

/**
 * Append a <style> to the document.
 *
 * Not `page.addStyleTag`: that helper resolves on the injected element's load
 * event, and it rejects if the page reports a CSP problem while it is waiting.
 * Both pages ship their CSP in a <meta>, where `frame-ancestors` is ignored and
 * logged as an error on every load — so the call failed at random with a
 * message about frame-ancestors that had nothing to do with the stylesheet. It
 * cost one capture per CI run, never the same one twice.
 *
 * Appending the node directly has no load handshake to lose the race with.
 * Inline styles are permitted: both CSPs keep 'unsafe-inline' in style-src.
 */
async function injectStyle(page, css) {
  await page.evaluate((text) => {
    const el = document.createElement('style');
    el.textContent = text;
    document.head.append(el);
  }, css);
}

/** Pin the theme before any script runs, so there is no first-paint flash. */
export async function primeTheme(page, theme) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('shohoj_theme', value);
    } catch {
      /* storage unavailable — the pre-paint script falls back to its default */
    }
  }, theme);
}

/**
 * Force the page into its settled visual end state.
 *
 * Decorative layers are HIDDEN rather than passed to Playwright's `mask`
 * option: #dot-matrix is a full-viewport canvas, so masking it would paint a
 * box over the entire screenshot. Every hidden element is position:fixed or
 * absolute, so removing it shifts no layout. The trade-off is that the backdrop
 * itself is not pixel-verified — its presence and geometry are asserted through
 * the DOM instead.
 */
export async function stabilize(page) {
  await injectStyle(
    page,
    `
      ${DECORATIVE.join(',')} { display: none !important; }
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { transition-delay: 0ms !important; }
    `,
  );

  await page.waitForTimeout(SETTLE_MS);

  await page.evaluate((revealSelectors) => {
    document.querySelectorAll(revealSelectors).forEach((el) => {
      el.classList.add('visible');
      el.style.transitionDelay = '0ms';
    });

    // The counter animates 0 -> data-count; the markup already carries the final
    // value, so this restores what a settled page shows.
    document.querySelectorAll('[data-count]').forEach((el) => {
      const numEl = el.querySelector('.stat-num');
      if (!numEl) return;
      numEl.textContent = `${el.dataset.count}${el.dataset.suffix || ''}`;
      numEl.classList.remove('counting');
    });

    const banner = document.getElementById('maintenanceBanner');
    if (banner) banner.hidden = true;
  }, REVEAL_SELECTORS);

  await page.evaluate(() => document.fonts.ready);
}

/** Capture targets, expressed as selectors valid on BOTH legacy and shell. */
export const TARGETS = [
  { name: 'nav', selector: 'nav' },
  { name: 'hero', selector: '.hero' },
  { name: 'features', selector: '#features' },
];

/** Targets that require the page to be in a signed-in ADMIN state first.
 *
 * TARGETS above capture a signed-out page, so every admin-only affordance was
 * invisible to the harness — which is how the shell shipped its Admin link with
 * no `#adminNavBtn` id, falling back to a default blue underlined browser link
 * next to legacy's amber pill.
 *
 * The setup lives in each spec rather than here because the two sides reach the
 * admin state by different means: legacy toggles `.is-admin` on an anchor that
 * is always present in the markup, while the shell mounts the node from an auth
 * snapshot. Only the selector and the shot name are shared.
 *
 * Scoped to the link itself rather than the whole nav on purpose: a nav-wide
 * admin capture would also contain the signed-in account pill, whose text is
 * the fixture's email address, and the baseline would then encode a test
 * fixture instead of a styling contract. Nav layout is already covered
 * signed-out by TARGETS.
 */
export const ADMIN_TARGETS = [{ name: 'admin-link', selector: '#adminNavBtn' }];

/**
 * Per-route capture targets — the ten legacy `.calc-tab-panel` divs and the
 * shell routes they became.
 *
 * TARGETS above covers the landing page only, and docs/ROLLBACK.md names that
 * as the reason the cutover was reverted twice: "e2e-visual asserts
 * nav/hero/features on `/` only, which is how mismatched route interiors
 * reached production last time." These are the interiors.
 *
 * `playground` is dropped rather than captured: js/ui/playground.js has no
 * shell counterpart (only getCurrentTotals was ported out of it), so there is
 * nothing to compare it against. It stays in PANEL_ROUTES with `route: null`
 * so the map remains a complete record of legacy's features.
 */
export const PANEL_TARGETS = PANEL_ROUTES.filter((entry) => entry.route !== null);

/**
 * The shell box that corresponds to a legacy `.calc-tab-panel`.
 *
 * It is `<main>`, NOT `.shell-page`, and the difference is a whole padding box.
 * RootLayout gives `<main>` legacy's `.calc-body` class on purpose — "`<main>`
 * occupies the same slot — panel content — so taking the class gives the shell
 * legacy's exact inset responsively" (RootLayout.tsx:292). So `<main>` INCLUDES
 * the 1.5rem/2rem inset, exactly as legacy's panel does, while `.shell-page`
 * sits INSIDE it.
 *
 * Comparing `.shell-page` against a legacy panel therefore measures two boxes
 * one padding level apart and reports a flat -64px desktop / -24px mobile width
 * gap on every single route — a convincing systematic "bug" that is entirely an
 * artifact of the selector. scripts/parity_report.mjs had exactly that defect.
 *
 * ShellTabs is a SIBLING of <main> (GatedMain), not a child, so this box holds
 * the route and nothing else — no tab bar to make it incomparable.
 */
const SHELL_ROUTE_SELECTOR = 'main#main-content';

/** Resolve the shell's route container, or throw naming what was searched. */
export async function shellRouteContainer(page) {
  const locator = page.locator(SHELL_ROUTE_SELECTOR);
  if ((await locator.count()) === 0) {
    throw new Error(`No shell route container matched: ${SHELL_ROUTE_SELECTOR}`);
  }
  return locator;
}

/**
 * Fail loudly when a route rendered the sign-in portal instead of itself.
 *
 * Without this the failure is silent and convincing: every route reports the
 * same box, which reads as one systemic container bug rather than as nine
 * measurements of the same portal. That is exactly what
 * scripts/parity_report.mjs did before it was taught to sign in.
 */
export async function assertNotGated(page, expectFn, route) {
  await expectFn(
    page.locator('[data-testid="signin-portal"]'),
    `${route} rendered the sign-in portal — the auth seam did not take`,
  ).toHaveCount(0);
}

/**
 * The global calculator header — legacy's `.calc-header`, which sits above the
 * tab bar and is therefore OUTSIDE every panel capture in PANEL_TARGETS.
 *
 * That is how it went missing entirely: both sides capture the panel box below
 * it, so a 137px band legacy shows on every tab was out of frame on both, and
 * the shell simply had no header at all (#586).
 *
 * Captured once per viewport/theme rather than per route — it is chrome, not
 * route content, and renders identically whichever route is open.
 */
export const HEADER_TARGET = { name: 'calc-header', selector: '.calc-header' };

/**
 * Legacy's global footer — the running credit totals, below the tab bar
 * (index.html:593). Outside every panel capture for exactly the same reason the
 * header is, and it went the same way: the shell had the totals inside
 * /calculator only, so every other route lost them and nothing measured it
 * (#616).
 *
 * The STATS are the gated box, not the whole `.calc-footer`: legacy's button
 * group carries a fifth action (🗑 Clear Data) that the shell does not
 * implement — a whole-app reset rather than a calculator action — so the row
 * widths legitimately differ until that is ported.
 */
export const FOOTER_TARGET = { name: 'calc-footer-stats', selector: '.calc-footer-stats' };

/**
 * Pin an element to the viewport origin so its element screenshot is a stable
 * size across both projects.

 *
 * The admin pill is 93.4375px wide on BOTH pages — identical padding, gap, font
 * and border. But an element screenshot is snapped to whole device pixels, and
 * where a fractional width lands depends on the element's x-origin. That origin
 * legitimately differs between the two navs: legacy carries its signed-out auth
 * pill to the left of the link, the shell's admin capture does not. Same pill,
 * different offset, so the bitmaps came out 95px and 94px and Playwright
 * rejected the pair on size before comparing a single colour.
 *
 * Pinning to (0,0) gives both sides the same origin, so the snap is identical
 * and the diff is left comparing what it is meant to compare: the pill's fill,
 * border, radius, typography and internal spacing. Nothing about the element's
 * own box is overridden — `position: fixed` blockifies `inline-flex` to `flex`,
 * which both pages already compute, and the width stays shrink-to-fit.
 */
export async function pinForCapture(page, selector) {
  await injectStyle(
    page,
    `${selector} { position: fixed !important; left: 0 !important; top: 0 !important; margin: 0 !important; }`,
  );
}

/**
 * Screenshot an element by CLIPPING the page to its box, rounded to whole
 * pixels, rather than by taking an element screenshot.
 *
 * An element screenshot is snapped to the device pixel grid wherever the
 * element happens to sit, so a box measuring exactly 140.000px tall captures as
 * 141 rows at y=294.188 and as 140 rows at y=145 — which is precisely the
 * legacy/shell pair for `.calc-header`. Playwright then rejects them on size
 * before comparing a single colour, and the "difference" is arithmetic rather
 * than anything a student could see.
 *
 * pinForCapture solves that for the admin pill by moving the element to the
 * origin, but `position: fixed` only reaches the viewport when no ancestor
 * establishes a containing block — and legacy's calculator sits inside a glass
 * wrapper that does. Clipping needs no such cooperation: both sides round the
 * same box to the same integers and the crops are directly comparable.
 */
export async function captureBox(page, expect, selector, name, { flattenGlass = false } = {}) {
  // `.calc-header.lg-panel` is `background: transparent` with
  // `backdrop-filter: blur(16px) saturate(160%)` (style.css:1062), so its fill
  // IS the blurred page behind it. Legacy's header sits below a hero at y=294
  // and the shell's at y=145, so the two blur different content and every pixel
  // of the panel lands about one RGB unit apart — invisible, but spread over
  // 854x140 it clears the gate's threshold, and it did so on three of the four
  // header captures in CI.
  //
  // That difference is a property of what each page puts ABOVE the header, not
  // of the header. The harness already declines to pixel-verify the backdrop
  // for exactly this reason — DECORATIVE hides the dot matrix and the orbs
  // rather than trying to reproduce them. Flattening the glass to an opaque
  // token extends that: what stays under test is the panel's own gradient
  // overlay, border, radius, typography and layout.
  if (flattenGlass) {
    await injectStyle(
      page,
      `${selector} { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-color: var(--bg2) !important; }`,
    );
  }
  const locator = page.locator(selector).first();
  const raw = await locator.boundingBox();
  if (raw === null) throw new Error(`No box for ${selector} — is it visible?`);

  // Nudge the box onto whole pixels before clipping.
  //
  // Rounding the CLIP is not enough on its own. `.calc-header` is the same
  // 854x140 box at the same x on both pages, but legacy's sits at y=294.188 and
  // the shell's at y=145 — so cropping both at their rounded y captures text
  // rasterised at two different sub-pixel phases. The glyphs land on the same
  // rows but with different antialiasing, which reads as ~1.3% of pixels
  // differing: invisible to a person, over the threshold for the gate, and
  // dependent on the renderer (it never reproduced on macOS, only on CI).
  //
  // Translating by the fractional remainder puts both sides on phase 0. The
  // shift is under one pixel and is applied to whichever side needs it, so it
  // moves nothing a reader could see — it only stops the two pages being
  // sampled off different grids.
  const dx = raw.x - Math.round(raw.x);
  const dy = raw.y - Math.round(raw.y);
  if (dx !== 0 || dy !== 0) {
    await injectStyle(page, `${selector} { transform: translate(${-dx}px, ${-dy}px) !important; }`);
  }

  const box = (await locator.boundingBox()) ?? raw;
  await expect(page).toHaveScreenshot(name, {
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  });
}

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

export const THEMES = ['dark', 'light'];

/** Baseline filename shared by the legacy and shell projects. */
export function shotName(target, viewport, theme) {
  return `${target}-${viewport}-${theme}.png`;
}

/**
 * Width of a checked-in baseline, in CSS pixels.
 *
 * The config sets `scale: 'css'`, so a baseline PNG's pixel width IS the
 * element's CSS width — which makes the legacy baselines a usable width oracle
 * without re-measuring the legacy page.
 *
 * Read from the PNG's IHDR: an 8-byte signature, then a 4-byte length and the
 * 4-byte "IHDR" tag, putting the big-endian uint32 width at byte 16.
 */
export function baselineWidth(name) {
  return baselineSize(name).width;
}

/**
 * Width AND height of a checked-in baseline, in CSS pixels.
 *
 * The PNG's IHDR carries both: an 8-byte signature, then a 4-byte length and
 * the 4-byte "IHDR" tag, putting the big-endian uint32 width at byte 16 and the
 * height at byte 20.
 */
export function baselineSize(name) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const png = readFileSync(path.join(dir, '__screenshots__', name));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Whether to also assert route interiors PIXEL-for-pixel (`VISUAL_ROUTE_PIXELS=1`).
 *
 * Off by default, and that is a finding rather than a cop-out. The shell does
 * not re-render legacy's panels one-for-one; it recomposes them. `/calculator`
 * carries an `h1`, the setup block and `.simulator-box` — and legacy keeps the
 * simulator on a DIFFERENT tab entirely. So the two boxes hold different
 * content by design, every height differs, and Playwright rejects the pair on
 * size before it compares a colour. Demanding pixel equality here would demand
 * the shell give up a deliberate product decision.
 *
 * What IS comparable — and what this spec gates unconditionally — is the box
 * itself: the route must render (not the sign-in portal) and must be legacy's
 * width. That is the half that regressed unnoticed before, and it holds today.
 *
 * Turn the pixels on to work the interior punch list route by route.
 */
export const CAPTURE_ROUTE_PIXELS = !!process.env.VISUAL_ROUTE_PIXELS;
