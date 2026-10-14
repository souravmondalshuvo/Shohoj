// e2e-pages/lost-found.spec.js
//
// The standalone Lost & Found page (#390) — served from the multi-page
// dist-pages/ build at its production path, /lost-found/. Behavior depth
// lives in e2e-shell/lost-found.spec.js (same component over the same
// seams); this suite pins what is unique to the standalone mount: booting
// outside the shell with the recreated provider stack, the derived-basename
// router, and the /campus?room= redirect shim sending the room to the main
// site's Campus Map tab.

import { expect, test } from '@playwright/test';

const FEED_KEY = 'shohoj_connect_feed_v1';

async function openBoard(page, { identity = true } = {}) {
  await page.addInitScript(({ withIdentity, feedKey }) => {
    const now = Date.now();
    const posts = [
      { id: 'p1', type: 'lost', title: 'Black umbrella', description: 'Wooden handle', locationHint: 'lift lobby', roomCode: '09G-31T', status: 'open', creatorUid: 'u_other', createdAtMs: now - 2 * 3_600_000 },
      { id: 'p2', type: 'found', title: 'Student ID card', status: 'open', creatorUid: 'u_other', createdAtMs: now - 3 * 3_600_000 },
    ];
    if (withIdentity) {
      window.__shohojLostFoundIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    }
    window.__shohojLostFoundRepo = {
      async listRecent() { return posts.slice(); },
      async createPost() { return 'new1'; },
      async resolvePost() {},
      async deletePost() {},
      async createClaim() {},
    };
    // Seed the CONNECT cache so the campus page the redirect lands on can
    // resolve the deep-linked room.
    localStorage.setItem(feedKey, JSON.stringify({
      fetchedAt: Date.now(),
      etag: null,
      payload: [{
        sectionId: 1, courseCode: 'CSE220', sectionName: '01', capacity: 40,
        consumedSeat: 10, roomName: '09G-31T',
        sectionSchedule: { classSchedules: [{ day: 'TUESDAY', startTime: '11:00', endTime: '12:20' }] },
      }],
    }));
  }, { withIdentity: identity, feedKey: FEED_KEY });
  await page.goto('/lost-found/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('lostfound-page')).toBeVisible();
}

test('boots standalone with the recreated provider stack and lists posts', async ({ page }) => {
  await openBoard(page);
  await expect(page.getByTestId('lostfound-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Report an item' }).click();
  await expect(page.getByTestId('lostfound-form')).toBeVisible();
});

test('without an identity the board shows the signed-out state, not the form', async ({ page }) => {
  await openBoard(page, { identity: false });
  await expect(page.getByTestId('lostfound-form')).toHaveCount(0);
});

test('room deep link opens the main site\'s Campus Map tab on that room', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('link', { name: /09G-31T on the campus map/ }).click();
  // The site root, with the tab and the room in the hash. This build has no
  // page at the root (the legacy site is built separately), so the address is
  // what is checked here; legacy-campus-tab.spec.js opens the tab on a room
  // from that same hash.
  await page.waitForURL((url) => url.pathname === '/' && url.hash === '#calculator/campus?room=09G-31T');
});

test('top bar links back to the main site', async ({ page }) => {
  await openBoard(page);
  const back = page.getByRole('link', { name: 'Back to Shohoj' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '../');
});
