// Shared navigation helper for the grouped calculator tab bar.
//
// The bar has two single top-level tabs (Calculator, Groups) plus three dropdown
// groups (Plan / Courses / Campus). Tabs that live inside a group are hidden
// until the group is opened, so a plain `.calc-tab[data-tab=X]` click no longer
// reaches them.
//
// This helper just needs to *land specs on a tab* deterministically, so it opens
// the owning group and fires the item's click handler directly. A direct element
// click is immune to two things that otherwise make grouped tabs flaky in tests:
// the menu's CSS reveal transition (frozen whenever a spec installs page.clock),
// and the hover/leave timing while the pointer travels to the item. The genuine
// user interaction — hover/click to open, pointer travel, click to select — is
// exercised with real Playwright clicks in e2e/tab-groups.spec.js.

/**
 * Select a calculator tab by its data-tab id, opening its dropdown group first
 * if the tab lives inside one.
 * @param {import('@playwright/test').Page} page
 * @param {string} tab - data-tab value, e.g. "seats", "routine", "calculator".
 */
export async function selectCalcTab(page, tab) {
  const item = page.locator(`#calcTabs [data-tab="${tab}"]`);
  await item.waitFor({ state: 'attached' });
  await item.evaluate(el => {
    el.closest('.calc-tab-group')?.classList.add('open');
    el.click();
  });
}
