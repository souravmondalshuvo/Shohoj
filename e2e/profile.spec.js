import { expect, test } from '@playwright/test';

// Browser coverage for the Profile account hub (#196) skeleton. External
// requests (Firebase SDK on gstatic, the CONNECT feed) are aborted for
// determinism — the Profile tab depends on neither. With Firebase blocked the
// identity globals are absent, so the tab falls back to its signed-out gate;
// the signed-in case stubs window._shohoj_userProfile via an init script.

async function boot(page, initScript) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  if (initScript) await page.addInitScript(initScript);
  await page.route('https://**/*', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.calc-tab[data-tab="profile"]').click();
  await expect(page.locator('#tabProfile')).toHaveClass(/active/);
}

test('signed-out users see a sign-in prompt instead of the profile', async ({ page }) => {
  await boot(page);
  const content = page.locator('#profileContent');
  await expect(content).toContainText('Sign in to view your profile');
  await expect(content.locator('[data-action="auth:signin"]')).toBeVisible();
  // Acceptance #4: no CONNECT credential field anywhere.
  await expect(content.locator('input')).toHaveCount(0);
  await expect(content).not.toContainText(/connect/i);
});

test('signed-in users see their account header with a sign-out control', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true,
      uid: 'u1',
      email: 'student@g.bracu.ac.bd',
      displayName: 'Test Student',
      photoURL: null,
    });
  });
  const content = page.locator('#profileContent');
  await expect(content).toContainText('Test Student');
  await expect(content).toContainText('student@g.bracu.ac.bd');
  await expect(content.locator('[data-action="profile:signout"]')).toBeVisible();
  // Acceptance #4 holds in the signed-in view too.
  await expect(content.locator('input')).toHaveCount(0);
});

// A signed-in identity stub used by the seat-alert cases below.
function signedInStub() {
  window._shohoj_userProfile = () => ({
    signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
  });
}

test('the seat-alert card shows the empty watchlist and an armed toggle by default', async ({ page }) => {
  await boot(page, signedInStub);
  const content = page.locator('#profileContent');
  await expect(content).toContainText('Seat alerts');
  await expect(content).toContainText("You're not watching any sections yet");
  // Default preference is armed (the Seats tab restores absent → on).
  await expect(content.locator('.pf-toggle')).toHaveClass(/is-on/);
});

test('toggling the email-alert switch flips and persists the preference', async ({ page }) => {
  await boot(page, signedInStub);
  const toggle = page.locator('#profileContent .pf-toggle');
  await expect(toggle).toHaveClass(/is-on/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#profileContent')).toContainText('(paused)');
  // The Seats tab persisted the off state to localStorage.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shohoj_seat_alerts_enabled'))).toBe('0');

  await toggle.click();
  await expect(toggle).toHaveClass(/is-on/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shohoj_seat_alerts_enabled'))).toBe('1');
});

test('the avatar falls back to the name initial when there is no photo', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'ka@g.bracu.ac.bd', displayName: 'Kazi Anik', photoURL: null,
    });
  });
  const fallback = page.locator('#profileContent .pf-avatar-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText('K');
});
