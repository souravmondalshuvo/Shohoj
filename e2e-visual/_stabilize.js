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

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

export const THEMES = ['dark', 'light'];

/** Baseline filename shared by the legacy and shell projects. */
export function shotName(target, viewport, theme) {
  return `${target}-${viewport}-${theme}.png`;
}
