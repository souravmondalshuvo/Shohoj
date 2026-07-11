// e2e-pages/bus.spec.js
//
// The standalone bus-timetable page (#372) — served from the multi-page
// dist-pages/ build at its production path, /bus/. The data is static and
// bundled, so no stubbing is needed; the specs pin the standalone mount, the
// ?route= deep link, and the staleness-honesty furniture (effective date,
// Transport Office contacts).

import { expect, test } from '@playwright/test';

test('boots standalone with the default route and the effective-date note', async ({ page }) => {
  await page.goto('/bus/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-page')).toBeVisible();
  await expect(page.getByTestId('bus-effective')).toContainText('9 June 2026');
  // Default selection is the first variant.
  await expect(page.getByTestId('bus-detail')).toContainText('Route-01: Abdullahpur-A');
  await expect(page.getByTestId('bus-stops')).toContainText('BRAC University (arrival time)');
});

test('?route= deep link selects a variant and clicking another updates the URL', async ({ page }) => {
  await page.goto('/bus/?route=narayanganj', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-detail')).toContainText('Route-07: Narayanganj');
  await expect(page.getByTestId('bus-fare')).toContainText('BDT 160');
  // Narayanganj runs once — no 2nd trip column, no 1st outbound.
  await expect(page.getByTestId('bus-stops').locator('th', { hasText: '2nd trip' })).toHaveCount(0);
  await expect(page.getByTestId('bus-outbound')).not.toContainText('1st outbound');

  await page.getByRole('button', { name: /Bashundhara/ }).click();
  await expect(page).toHaveURL(/route=bashundhara/);
  await expect(page.getByTestId('bus-fare')).toContainText('BDT 50');
});

test('transport office contacts are one tap away', async ({ page }) => {
  await page.goto('/bus/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bus-contacts').locator('summary').click();
  await expect(page.getByRole('link', { name: 'rahman@bracu.ac.bd' })).toBeVisible();
});

test('top bar links back to the main site', async ({ page }) => {
  await page.goto('/bus/', { waitUntil: 'domcontentloaded' });
  const back = page.getByRole('link', { name: '← Shohoj' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '../');
});
