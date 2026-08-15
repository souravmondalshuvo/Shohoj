// e2e-shell/notifications.spec.js
//
// #311: the notification toast viewport on the React Router shell, against
// the built dist-shell/ output. Covers the real consumer (the demo-mode
// success toast deferred in #309): announcement via a polite status role,
// the success auto-dismiss (3s provider default), and manual dismissal.

import { expect, test } from '../e2e-support/authFixture.js';

const DEMO_TOAST = 'Demo mode loaded. Explore CGPA, planner, and degree progress.';

async function loadDemo(page) {
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await page.locator('#semestersContainer').getByRole('button', { name: 'Try Demo Mode' }).click();
}

test('loading demo data shows the success toast and it auto-dismisses', async ({ page }) => {
  await loadDemo(page);

  const toast = page.getByRole('status').filter({ hasText: DEMO_TOAST });
  await expect(toast).toBeVisible();

  // Success toasts auto-dismiss after the provider's 3s default.
  await expect(toast).toHaveCount(0, { timeout: 5000 });
});

test('the dismiss button removes a toast immediately', async ({ page }) => {
  await loadDemo(page);

  const toast = page.getByRole('status').filter({ hasText: DEMO_TOAST });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toast).toHaveCount(0);
});
