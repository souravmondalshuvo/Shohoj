// e2e-shell/lost-found.spec.js
//
// Lost & found board (#371) over the injected seams — no Firebase, no network:
//   window.__shohojLostFoundRepo     — in-memory repo fake
//   window.__shohojLostFoundIdentity — signed-in BRACU identity stand-in
// Claims are recorded on window.__lfClaims so tests can assert the exact
// payload the real repo would write to the queue.

import { expect, test, anonymousTest } from '../e2e-support/authFixture.js';

const DAY = 24 * 60 * 60 * 1000;

async function openBoard(page, { identity = true } = {}) {
  await page.addInitScript(({ withIdentity, day }) => {
    const now = Date.now();
    const posts = [
      { id: 'mine1', type: 'lost', title: 'My scientific calculator', status: 'open', creatorUid: 'u_me', createdAtMs: now - 60_000 },
      { id: 'p1', type: 'lost', title: 'Black umbrella', description: 'Wooden handle', locationHint: 'lift lobby', roomCode: '09G-31T', status: 'open', creatorUid: 'u_other', createdAtMs: now - 2 * 3_600_000 },
      { id: 'p2', type: 'found', title: 'Student ID card', status: 'open', creatorUid: 'u_other', createdAtMs: now - 3 * 3_600_000 },
      { id: 'p3', type: 'lost', title: 'Resolved thing', status: 'resolved', creatorUid: 'u_other', createdAtMs: now - 3_600_000 },
      { id: 'p4', type: 'found', title: 'Ancient wallet', status: 'open', creatorUid: 'u_other', createdAtMs: now - 31 * day },
    ];
    window.__lfClaims = [];
    if (withIdentity) {
      window.__shohojLostFoundIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    }
    window.__shohojLostFoundRepo = {
      async listRecent() { return posts.slice(); },
      async createPost(draft, uid) {
        const id = `new${posts.length}`;
        posts.unshift({ ...draft, id, status: 'open', creatorUid: uid, createdAtMs: Date.now() });
        return id;
      },
      async resolvePost(id) {
        const p = posts.find((x) => x.id === id);
        if (p) p.status = 'resolved';
      },
      async deletePost(id) {
        const i = posts.findIndex((x) => x.id === id);
        if (i >= 0) posts.splice(i, 1);
      },
      async createClaim(postId, uid, email, note) {
        window.__lfClaims.push({ postId, uid, email, note });
      },
    };
  }, { withIdentity: identity, day: DAY });
  await page.goto('/lost-found', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('lostfound-page')).toBeVisible();
}

test('board lists open unexpired posts; resolved and 30d+ posts stay hidden', async ({ page }) => {
  await openBoard(page);
  const items = page.getByTestId('lostfound-item');
  await expect(items).toHaveCount(3);
  await expect(page.getByText('Black umbrella')).toBeVisible();
  await expect(page.getByText('Resolved thing')).toHaveCount(0);
  await expect(page.getByText('Ancient wallet')).toHaveCount(0);

  await page.getByRole('button', { name: 'Found', exact: true }).click();
  await expect(items).toHaveCount(1);
  await expect(page.getByText('Student ID card')).toBeVisible();
});

test('posting: validation blocks junk, a valid draft lands on top of the board', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Report an item' }).click();
  const form = page.getByTestId('lostfound-form');
  await expect(form).toBeVisible();

  await form.getByLabel(/What is it/).fill('ab');
  await form.getByRole('button', { name: 'Post to the board' }).click();
  await expect(form.getByText(/at least 3 characters/)).toBeVisible();

  await form.getByLabel(/What is it/).fill('Blue water bottle');
  await form.getByLabel(/Room code/).fill('07a-08c');
  await form.getByRole('button', { name: 'Post to the board' }).click();

  await expect(page.getByTestId('lostfound-form')).toHaveCount(0);
  const first = page.getByTestId('lostfound-item').first();
  await expect(first).toContainText('Blue water bottle');
  await expect(first).toContainText('07A-08C');
});

test('claiming someone else’s post queues exactly one claim with the note', async ({ page }) => {
  await openBoard(page);
  const umbrella = page.getByTestId('lostfound-item').filter({ hasText: 'Black umbrella' });
  await umbrella.getByRole('button', { name: 'I found this' }).click();

  const box = page.getByTestId('lostfound-claim-box');
  await expect(box).toContainText('they never see it on the board');
  await box.getByLabel(/Message to the poster/).fill('Red sticker on the handle?');
  await box.getByRole('button', { name: 'Notify the poster' }).click();

  await expect(umbrella.getByText('Sent — the poster will get an email.')).toBeVisible();
  const claims = await page.evaluate(() => window.__lfClaims);
  expect(claims).toEqual([{
    postId: 'p1',
    uid: 'u_me',
    email: 'me@g.bracu.ac.bd',
    note: 'Red sticker on the handle?',
  }]);
});

test('own posts offer resolve/delete instead of a claim button', async ({ page }) => {
  await openBoard(page);
  const mine = page.getByTestId('lostfound-item').filter({ hasText: 'My scientific calculator' });
  await expect(mine.getByRole('button', { name: 'I found this' })).toHaveCount(0);

  await mine.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByTestId('lostfound-item')).toHaveCount(2);

  const umbrella = page.getByTestId('lostfound-item').filter({ hasText: 'Black umbrella' });
  await expect(umbrella.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0);
});

test('deleting an own post asks for confirmation first', async ({ page }) => {
  await openBoard(page);
  const mine = page.getByTestId('lostfound-item').filter({ hasText: 'My scientific calculator' });
  await mine.getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this post?');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('lostfound-item')).toHaveCount(2);
  await expect(page.getByText('My scientific calculator')).toHaveCount(0);
});

test('room codes deep-link into the campus map', async ({ page }) => {
  await openBoard(page);
  const link = page.getByRole('link', { name: /09G-31T on the campus map/ });
  await expect(link).toHaveAttribute('href', '/campus?room=09G-31T');
});

anonymousTest('without a signed-in identity the gate stands in for the board', async ({ page }) => {
  // Not openBoard(): it waits for lostfound-page, which the gate never renders.
  await page.goto('/lost-found', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('signin-portal')).toBeVisible();
  await expect(page.getByTestId('lostfound-page')).toHaveCount(0);
  await expect(page.getByTestId('lostfound-item')).toHaveCount(0);
});

test('without any repo (offline shell) the board explains itself', async ({ page }) => {
  await page.goto('/lost-found', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('lostfound-offline')).toBeVisible();
});
