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
  const back = page.getByRole('link', { name: 'Back to Shohoj' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '../');
});

// ── North South University (?campus=nsu) ─────────────────────────────────────
// The page has no session, so the legacy site links an NSU student here with
// the campus in the URL. NSU's only published schedule is a past service
// period, so the specs pin what makes showing it honest: the period is stated
// up front, the portal with today's answer is linked, and nothing on the page
// is derived from the clock.

test('?campus=nsu shows NSU’s service under an old-schedule warning', async ({ page }) => {
  await page.goto('/bus/?campus=nsu', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-page')).toHaveAttribute('data-campus', 'nsu');

  const warning = page.getByTestId('bus-effective');
  await expect(warning).toContainText('old schedule');
  await expect(warning).toContainText('25 Sep 2025 – 24 Dec 2025');
  await expect(warning.getByRole('link', { name: /transport portal/ })).toHaveAttribute(
    'href',
    'https://transport.northsouth.edu/',
  );
  await expect(warning.getByRole('link', { name: /official notice/ })).toHaveAttribute(
    'href',
    /northsouth\.edu\/nsu-announcements\/nsu-bus-service/,
  );

  // Default route, its stops in the notice's order, and the times at campus.
  await expect(page.getByTestId('bus-detail')).toContainText('NSU – Uttara – NSU');
  await expect(page.getByTestId('bus-stops').locator('tbody th')).toHaveText([
    'Abdullahpur', 'House Building', 'Azampur', 'Jashimuddin', 'Airport',
  ]);
  await expect(page.getByTestId('bus-arrivals')).toContainText('7:40 AM · 2:20 PM · 5:45 PM');
  await expect(page.getByTestId('bus-outbound')).toContainText('10:00 AM · 2:40 PM · 6:30 PM');
  await expect(page.getByTestId('bus-fare')).toContainText('BDT 100 one way · BDT 200 round trip');

  // Nothing of BRAC University's, and nothing that reads as live.
  await expect(page.getByTestId('bus-page')).not.toContainText('BRAC University');
  await expect(page.getByTestId('bus-today')).toHaveCount(0);
  await expect(page.getByTestId('bus-contacts')).toHaveCount(0);
});

test('choosing an NSU route keeps the campus in the URL', async ({ page }) => {
  await page.goto('/bus/?campus=nsu', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Mirpur' }).click();
  await expect(page).toHaveURL(/campus=nsu/);
  await expect(page).toHaveURL(/route=mirpur/);
  await expect(page.getByTestId('bus-detail')).toContainText('NSU – Mirpur – NSU');
  // Mirpur has the late departure Uttara does not.
  await expect(page.getByTestId('bus-outbound')).toContainText('10:20 PM');

  // A deep link straight to a route works too.
  await page.goto('/bus/?campus=nsu&route=khilgaon', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-stops')).toContainText('Notre Dame College');
});

test('an unknown campus, or none, is BRAC University’s timetable as before', async ({ page }) => {
  for (const url of ['/bus/', '/bus/?campus=diu', '/bus/?campus=']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bus-effective')).toContainText('9 June 2026');
    await expect(page.getByTestId('bus-detail')).toContainText('Route-01: Abdullahpur-A');
  }
});
