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

// ── Daffodil International University (?campus=diu) ──────────────────────────
// DIU's feed is live but still titled for last semester's exam period, so the
// specs pin the same honesty as NSU's: DIU's own title for the schedule and the
// day it was read are stated up front, DIU's transport page is linked, and
// nothing on the page is derived from the clock.

test('?campus=diu shows DIU’s three services under DIU’s own title for the schedule', async ({ page }) => {
  await page.goto('/bus/?campus=diu', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-page')).toHaveAttribute('data-campus', 'diu');

  const warning = page.getByTestId('bus-effective');
  await expect(warning).toContainText('Special Transport Schedule for Exam-2026');
  await expect(warning).toContainText('Summer 2026');
  await expect(warning).toContainText('9 Oct 2026');
  await expect(warning.getByRole('link', { name: /transport page/ })).toHaveAttribute(
    'href',
    'https://daffodilvarsity.edu.bd/transport',
  );

  // Ten regular routes, five shuttles, five on Fridays.
  await expect(page.getByTestId('bus-service-regular').getByRole('button')).toHaveCount(10);
  await expect(page.getByTestId('bus-service-shuttle').getByRole('button')).toHaveCount(5);
  await expect(page.getByTestId('bus-service-friday').getByRole('button')).toHaveCount(5);

  // The default route: its stops in the feed's order, campus last, and its times.
  const detail = page.getByTestId('bus-detail');
  await expect(detail.getByRole('heading', { level: 2 })).toHaveText('Dhanmondi ↔ DSC');
  const stops = page.getByTestId('bus-stops').locator('tbody th');
  await expect(stops).toHaveCount(12);
  await expect(stops.first()).toHaveText('Dhanmondi - Sobhanbag Mosque');
  await expect(stops.last()).toHaveText('Daffodil Smart City-DSC');
  await expect(page.getByTestId('bus-arrivals')).toContainText('7:00 AM · 10:00 AM');
  await expect(page.getByTestId('bus-outbound')).toContainText('1:30 PM · 4:20 PM · 6:10 PM');
  await expect(page.getByTestId('bus-days')).toHaveText('Runs Saturday to Thursday');

  // DIU publishes no fare, and the page invents none.
  await expect(page.getByTestId('bus-fare')).toHaveCount(0);
  await expect(detail).toContainText('publishes no fare');
  // Nothing of another university's, and nothing that reads as live.
  await expect(page.getByTestId('bus-page')).not.toContainText('BRAC University');
  await expect(page.getByTestId('bus-page')).not.toContainText('NSU');
  await expect(page.getByTestId('bus-today')).toHaveCount(0);
});

test('a DIU Friday route says which day it runs and which times were corrected', async ({ page }) => {
  await page.goto('/bus/?campus=diu', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bus-service-friday').getByRole('button', { name: 'Dhanmondi ↔ DSC' }).click();
  await expect(page).toHaveURL(/campus=diu/);
  await expect(page).toHaveURL(/route=friday-dhanmondi/);
  await expect(page.getByTestId('bus-days')).toHaveText('Runs Friday');
  // The feed prints 02:20 and 06:30 for buses leaving campus; they are afternoon times.
  await expect(page.getByTestId('bus-outbound')).toContainText('2:20 PM · 6:30 PM');
  await expect(page.getByTestId('bus-correction')).toContainText('Printed as 02:20, 06:30');

  // A deep link straight to a route works too, and a weekday route has no correction.
  await page.goto('/bus/?campus=diu&route=shuttle-c-b', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bus-detail').getByRole('heading', { level: 2 })).toHaveText('C&B ↔ DSC');
  await expect(page.getByTestId('bus-days')).toHaveText('Runs Sunday to Thursday');
  await expect(page.getByTestId('bus-correction')).toHaveCount(0);
});

test('an unknown campus, or none, is BRAC University’s timetable as before', async ({ page }) => {
  for (const url of ['/bus/', '/bus/?campus=aiub', '/bus/?campus=']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bus-effective')).toContainText('9 June 2026');
    await expect(page.getByTestId('bus-detail')).toContainText('Route-01: Abdullahpur-A');
  }
});
