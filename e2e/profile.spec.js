import { expect, test } from '@playwright/test';

// Browser coverage for the Profile account hub (#196) skeleton. External
// requests (Firebase SDK on gstatic, the CONNECT feed) are aborted for
// determinism — the Profile tab depends on neither. With Firebase blocked the
// identity globals are absent, so the tab falls back to its signed-out gate;
// the signed-in case stubs window._shohoj_userProfile via an init script.

async function boot(page, initScript, initArg) {
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  if (initScript) await page.addInitScript(initScript, initArg);
  await page.route('https://**/*', route => route.abort());
  // Profile was removed from the tab strip — it's reached from the account pill
  // or the #calculator/profile hash route. Open it via the hash route, which
  // lands directly on the Profile tab.
  await page.goto('/#calculator/profile', { waitUntil: 'domcontentloaded' });
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

test('the routine and reviews cards render the student\'s saved data', async ({ page }) => {
  await boot(page, () => {
    window._shohoj_userProfile = () => ({
      signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
    });
    // Firebase is blocked, so the identity global is otherwise absent — stub the
    // uid the reviews receipt is keyed on, and preseed the local data sources.
    window._shohoj_currentUid = () => 'u1';
    localStorage.setItem('shohoj_routine_v1', JSON.stringify({ picks: { CSE220: 12345, MAT110: 678 } }));
    localStorage.setItem('shohoj_my_reviews_v1', JSON.stringify({
      u1: [{ facultyInitials: 'ABC', courseCode: 'CSE220', semester: 'Spring 2026' }],
    }));
  });
  const content = page.locator('#profileContent');
  await expect(content).toContainText('🗓️ Routine');
  await expect(content.locator('.pf-chip', { hasText: 'CSE220' })).toBeVisible();
  await expect(content.locator('.pf-chip', { hasText: 'MAT110' })).toBeVisible();
  await expect(content).toContainText('✍️ Your reviews');
  await expect(content).toContainText('ABC');
  await expect(content).toContainText('Spring 2026');
  // The stub stays a single home — still no credential field.
  await expect(content.locator('input')).toHaveCount(0);
});

test('opening #calculator/profile restores the Profile tab directly', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.route('https://**/*', route => route.abort());
  await page.goto('/#calculator/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tabProfile')).toHaveClass(/active/);
  await expect(page.locator('#profileContent')).toContainText('Sign in to view your profile');
});

// ── Danger zone (#232) ────────────────────────────────────────────────────────
// Stub the globals the delete handler reaches for: a confirm modal whose verdict
// we control, a delete that records it was called, and a toast we can read. The
// handler must only call delete when the confirm resolves truthy. The verdict +
// delete result are passed as a serializable arg (closures don't cross initScript).
function dangerStub(arg) {
  window._shohoj_userProfile = () => ({
    signedIn: true, uid: 'u1', email: 'student@g.bracu.ac.bd', displayName: 'Test Student', photoURL: null,
  });
  window.__deleteCalls = 0;
  window.__lastToast = null;
  window._shohoj_confirmModal = () => Promise.resolve(arg.confirmVerdict);
  window._shohoj_deleteCloudData = () => { window.__deleteCalls++; return Promise.resolve(arg.deleteResult); };
  window._shohoj_showToast = (msg, isErr) => { window.__lastToast = { msg, isErr: !!isErr }; };
}

test('the signed-in view shows a Danger zone with a delete-cloud control', async ({ page }) => {
  await boot(page, signedInStub);
  const content = page.locator('#profileContent');
  await expect(content).toContainText('Danger zone');
  await expect(content.locator('[data-action="profile:deleteCloud"]')).toBeVisible();
  // Still a credential-free surface.
  await expect(content.locator('input')).toHaveCount(0);
});

test('confirming the delete calls _shohoj_deleteCloudData exactly once and toasts success', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: true, deleteResult: true });
  await page.locator('#profileContent [data-action="profile:deleteCloud"]').click();
  await expect.poll(() => page.evaluate(() => window.__deleteCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__lastToast && window.__lastToast.isErr)).toBe(false);
});

test('dismissing the confirm fires nothing — no delete, no toast', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: false, deleteResult: true });
  await page.locator('#profileContent [data-action="profile:deleteCloud"]').click();
  // Give the async handler a tick; it must short-circuit before the delete call.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__deleteCalls)).toBe(0);
  expect(await page.evaluate(() => window.__lastToast)).toBeNull();
});

test('a failed delete surfaces a generic error toast with no backend detail', async ({ page }) => {
  await boot(page, dangerStub, { confirmVerdict: true, deleteResult: false });
  await page.locator('#profileContent [data-action="profile:deleteCloud"]').click();
  await expect.poll(() => page.evaluate(() => window.__lastToast && window.__lastToast.isErr)).toBe(true);
  const msg = await page.evaluate(() => window.__lastToast.msg);
  expect(msg).not.toMatch(/firestore|firebase|permission|network|undefined|null/i);
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
