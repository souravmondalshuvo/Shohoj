import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated accessibility smoke checks (#238). These scan the key tabs with
// axe-core in the demo / signed-out state and fail ONLY on serious/critical
// violations — moderate/minor findings are surfaced in the report but don't
// block CI, to keep the gate meaningful rather than noisy.
//
// IMPORTANT: this is a smoke test, not a substitute for manual review. axe
// catches roughly a third to a half of WCAG issues; it cannot judge keyboard
// operability, focus order, screen-reader comprehension, or whether labels are
// *meaningful*. Those still need a human pass with a real keyboard + SR.
//
// No axe RULES are globally disabled — DISABLED_RULES stays empty. Prefer fixing
// markup (e.g. the select-name aria-labels added with this spec) over muting a
// rule. If a rule ever must be disabled, add it here WITH a reason.
const DISABLED_RULES = [];

// Nothing is carved out of the scan: the whole page — including the landing
// `.hero` and global `<footer>` chrome — is in scope for every tab.
const EXCLUDED_REGIONS = [];

// Only these impacts fail the build.
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

// Same external-request firewall + benign global stubs the other specs use, so
// the run is deterministic and the tabs render without their network feeds.
async function boot(page) {
  await page.route('https://**/*', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
    window.pdfjsLib = window.pdfjsLib || {};
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#heroDemoBtn')).toBeVisible();
}

// Populate the Calculator/Planner/Routine with realistic demo content so axe
// scans a meaningfully filled UI, not an empty shell.
async function loadDemo(page) {
  await page.locator('#heroDemoBtn').click();
  await expect(page.locator('#cgpaVal')).toHaveText('3.50');
}

async function openTab(page, tab) {
  if (tab === 'profile') {
    // Profile has no tab-strip button (it's reached from the account pill). The
    // page is already loaded here, so a hash-only navigation wouldn't re-run the
    // boot-time tab restore — switch via the exposed API instead. Scroll the
    // panel into view so the scan covers the same state as the click-opened tabs.
    await page.evaluate(() => window.switchCalcTab('profile'));
    await page.locator('#tabProfile').scrollIntoViewIfNeeded();
  } else {
    await page.locator(`.calc-tab[data-tab="${tab}"]`).click();
  }
  await expect(page.locator(`#tab${tab[0].toUpperCase()}${tab.slice(1)}`)).toHaveClass(/active/);
}

// Scan the whole page (axe ignores hidden elements, so this effectively covers
// the active tab + persistent chrome) and return only the blocking violations.
async function blockingViolations(page) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const region of EXCLUDED_REGIONS) builder = builder.exclude(region);
  if (DISABLED_RULES.length) builder = builder.disableRules(DISABLED_RULES);
  const { violations } = await builder.analyze();
  return violations.filter(v => BLOCKING_IMPACTS.has(v.impact));
}

// Compact, readable failure output: rule id, impact, and the first node target.
function formatViolations(violations) {
  return violations
    .map(v => `  • [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('\n      ')}`)
    .join('\n');
}

const TAB_IDS = {
  Calculator: 'calculator',
  Planner: 'planner',
  Routine: 'routine',
  Seats: 'seats',
  Reviews: 'reviews',
  Profile: 'profile',
};

for (const [label, tab] of Object.entries(TAB_IDS)) {
  test(`${label} tab has no serious/critical accessibility violations (demo, signed-out)`, async ({ page }) => {
    await boot(page);
    await loadDemo(page);
    await openTab(page, tab);

    const violations = await blockingViolations(page);
    expect(violations, `serious/critical a11y violations on the ${label} tab:\n${formatViolations(violations)}`).toEqual([]);
  });
}
