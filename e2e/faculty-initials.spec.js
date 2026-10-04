// Faculty initials on the Reviews tab follow the campus (js/core/faculty.js):
// NSU tells lecturers apart with a closing number (MMS1, MMS3 and MMS4 are
// three people), so there the number is part of who a review is about.
//
// Legacy sign-in still admits BRACU accounts only; the specs stand in for an
// NSU student through the seams the auth layer publishes identity on.

import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';

async function boot(page, hash) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    window.Chart = window.Chart || class { destroy() {} };
    // Auth is settled from the start, so the sign-in gate reveals the
    // calculator at once rather than on its four-second fallback.
    window._shohoj_isAuthReady = () => true;
  });
  await unlockCalculator(page);
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#calcTabs')).toBeVisible();
}

async function signInAs(page, email) {
  await page.evaluate(address => {
    window._shohoj_userProfile = () => ({ signedIn: true, email: address });
    window._shohoj_currentUid = () => 'e2e-student';
    window.dispatchEvent(new Event('shohoj:auth-changed'));
  }, email);
}

const crumb = page => page.locator('#tabReviews .rv-tab-crumb-active');

test('an NSU lecturer\'s page keeps the number in their initials', async ({ page }) => {
  await boot(page, '#calculator/reviews/mms4');
  await signInAs(page, 'first.last@northsouth.edu');
  await expect(page.locator('#tabReviews')).toHaveClass(/active/);
  await expect(crumb(page)).toHaveText('MMS4');

  // A different number is a different lecturer, with their own page.
  await page.evaluate(() => { window.location.hash = '#calculator/reviews/MMS1'; });
  await expect(crumb(page)).toHaveText('MMS1');

  // However the source happened to capitalise them, it is one person.
  await page.evaluate(() => { window.location.hash = '#calculator/reviews/ABq1'; });
  await expect(crumb(page)).toHaveText('ABQ1');
});

test('at BRACU a digit is still not part of anyone\'s initials', async ({ page }) => {
  await boot(page, '#calculator/reviews/MAK');
  await signInAs(page, '21301234@g.bracu.ac.bd');
  await expect(crumb(page)).toHaveText('MAK');

  await page.evaluate(() => { window.location.hash = '#calculator/reviews/MAK2'; });
  await expect(crumb(page)).toHaveText('MAK');
});
