// e2e-shell/sign-out-clears-device.spec.js
//
// #627: signing out used to end the Firebase session and leave everything the
// student had entered sitting in localStorage — the next person on a lab
// machine opened Shohoj to a stranger's transcript. Sign-out now clears the
// device, behind a dialog that says so.
//
// Driven through the real header button and the real ModalProvider dialog, so
// this covers the wiring the unit tests cannot: that the confirm gates the
// wipe, that cancelling changes nothing, and that the keys actually go.
//
// The shell test build ships no Firebase config, so the header controls need a
// cloud-capable shell (same CLOUD_GLOBALS trick as signin-portal.spec.js). The
// SDK never loads — https is unreachable here — which is exactly the "cannot
// confirm the backup" path, so the dialog carries its warning.

import { expect, test } from '../e2e-support/authFixture.js';

const CLOUD_GLOBALS = {
  _shohoj_firebase_config: {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
    measurementId: 'G-XYZ',
  },
  _shohoj_papers_worker_url: 'https://papers.example.com',
  _shohoj_recaptcha_v3_site_key: 'sitekey',
  _shohoj_google_client_id: 'client-id',
};

// What a signed-in student leaves on the device, plus the two things that must
// survive: the theme they picked and the shared public feed cache.
const SEEDED = {
  shohoj_cgpa_v1: JSON.stringify({ semesters: [{ id: 1, name: 'Fall 2024' }] }),
  shohoj_routine_v1: JSON.stringify({ picks: { CSE110: 1 } }),
  shohoj_my_reviews_v1: JSON.stringify({ u_me: [{ facultyInitials: 'ABC' }] }),
  shohoj_seat_watch_v1: JSON.stringify([{ sectionId: 1, courseCode: 'CSE110' }]),
  shohoj_seat_alerts_enabled: '1',
  shohoj_connect_profile_v1: JSON.stringify({ studentId: '20101234' }),
  shohoj_last_sync: '1756200000000',
  shohoj_theme: 'light',
  shohoj_connect_feed_v1: JSON.stringify({ sections: [] }),
};

async function bootSignedInCloud(page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.addInitScript(
    ({ globals, seeded }) => {
      Object.assign(window, globals);
      // addInitScript re-runs on every navigation, and the sign-out handler
      // reloads — unguarded, this would re-seed the very keys the wipe just
      // removed and the assertions would pass or fail on nothing. The guard key
      // is deliberately not one sign-out clears.
      if (!sessionStorage.getItem('__shohoj_signout_spec')) {
        sessionStorage.setItem('__shohoj_signout_spec', '1');
        for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, value);
        sessionStorage.setItem('shohoj_calc_unlocked', '1');
      }
    },
    { globals: CLOUD_GLOBALS, seeded: SEEDED },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

const readLocal = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const signOutButton = (page) => page.getByRole('button', { name: 'Sign out' });

// The dialog waits on the backup check, which here races a Firebase SDK load
// that can never resolve (https is aborted) before answering "cannot confirm".
// That is slower than the 5s default, and it is the path a student on a dead
// connection takes, so it is worth waiting for rather than stubbing away.
const DIALOG_TIMEOUT = 20_000;
const openSignOutDialog = async (page) => {
  await signOutButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT });
  return dialog;
};

test('sign-out asks before erasing, and says what goes', async ({ page }) => {
  await bootSignedInCloud(page);
  const dialog = await openSignOutDialog(page);
  await expect(dialog).toContainText('Sign out and clear this device?');
  // The routine and the review record have no cloud copy to come back from.
  await expect(dialog).toContainText('only exists on this device');
  // Firebase is unreachable here, so the backup cannot be confirmed.
  await expect(dialog).toContainText('does not have your latest changes yet');

  // Nothing has been touched while the dialog is up.
  expect(await readLocal(page, 'shohoj_cgpa_v1')).toBe(SEEDED.shohoj_cgpa_v1);
});

test('cancelling leaves the session and the data alone', async ({ page }) => {
  await bootSignedInCloud(page);
  await openSignOutDialog(page);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(signOutButton(page)).toBeVisible(); // still signed in
  for (const key of Object.keys(SEEDED)) {
    expect(await readLocal(page, key), `${key} should have survived a cancel`).toBe(SEEDED[key]);
  }
});

test('confirming clears every personal key and keeps the theme', async ({ page }) => {
  await bootSignedInCloud(page);
  await openSignOutDialog(page);
  await page.getByRole('button', { name: 'Sign out and clear' }).click();

  // The handler reloads once the wipe is done.
  await page.waitForLoadState('domcontentloaded');
  await expect
    .poll(async () => readLocal(page, 'shohoj_cgpa_v1'), { timeout: 5000 })
    .toBe(null);

  for (const key of [
    'shohoj_routine_v1',
    'shohoj_my_reviews_v1',
    'shohoj_seat_watch_v1',
    'shohoj_seat_alerts_enabled',
    'shohoj_connect_profile_v1',
    'shohoj_last_sync',
  ]) {
    expect(await readLocal(page, key), `${key} was left on the device`).toBe(null);
  }

  // A preference is not a trace of who was here; the feed cache is public bytes.
  expect(await readLocal(page, 'shohoj_theme')).toBe('light');
  expect(await readLocal(page, 'shohoj_connect_feed_v1')).toBe(SEEDED.shohoj_connect_feed_v1);

  // The per-tab gate unlock goes too, so the next person meets the gate.
  expect(await page.evaluate(() => sessionStorage.getItem('shohoj_calc_unlocked'))).toBe(null);
});
