// Shared determinism helpers for the visual parity harness.
//
// The legacy page is deliberately animated: a pointer-reactive canvas, three
// drifting orbs, a custom cursor, IntersectionObserver reveal cascades with
// accumulating transition delays, and a 900ms rAF stat counter. None of that is
// pixel-stable, so both the baseline run and the shell run put the page into the
// same forced end state before capturing.

/** Decorative layers that are animated, pointer-driven, or scroll-driven. */
export const DECORATIVE = [
  '#dot-matrix', // full-viewport canvas, rAF + mousemove
  '#cursor-dot',
  '#cursor-ring',
  '#cursor-glow',
  '.orb', // three CSS-animated gradient blobs
  '#scroll-progress',
  // Legacy-only chrome, not animation: the nav's "✦ New app · beta" link exists
  // solely to advertise the shell. Once the shell replaces legacy at the root
  // there is no separate new app to link to, so it has no counterpart to match
  // and is excluded rather than faked.
  '.nav-beta',
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
  await page.addStyleTag({
    content: `
      ${DECORATIVE.join(',')} { display: none !important; }
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { transition-delay: 0ms !important; }
    `,
  });

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
 * Pin an element to the viewport origin so its element screenshot is a stable
 * size across both projects.
 *
 * The admin pill is 93.4375px wide on BOTH pages — identical padding, gap, font
 * and border. But an element screenshot is snapped to whole device pixels, and
 * where a fractional width lands depends on the element's x-origin. That origin
 * legitimately differs between the two navs: legacy carries `.nav-beta` and its
 * signed-out auth pill to the left of the link, the shell's admin capture
 * carries neither. Same pill, different offset, so the bitmaps came out 95px
 * and 94px and Playwright rejected the pair on size before comparing a single
 * colour.
 *
 * Pinning to (0,0) gives both sides the same origin, so the snap is identical
 * and the diff is left comparing what it is meant to compare: the pill's fill,
 * border, radius, typography and internal spacing. Nothing about the element's
 * own box is overridden — `position: fixed` blockifies `inline-flex` to `flex`,
 * which both pages already compute, and the width stays shrink-to-fit.
 */
export async function pinForCapture(page, selector) {
  await page.addStyleTag({
    content: `${selector} { position: fixed !important; left: 0 !important; top: 0 !important; margin: 0 !important; }`,
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
