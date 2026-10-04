import { expect } from '@playwright/test';

const messageBox = page => page.getByRole('textbox', { name: 'Message the assistant' });
const send = async (page, content) => {
  await messageBox(page).fill(content);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
};
const open = async page => {
  if (await page.getByRole('dialog', { name: 'Shohoj Assistant' }).count() === 0) {
    await page.getByRole('button', { name: 'Open Shohoj Assistant' }).click();
  }
};
const record = page => page.evaluate(() => new Promise((resolve, reject) => {
  const opening = indexedDB.open('shohoj_assistant', 1);
  opening.onerror = () => reject(opening.error);
  opening.onsuccess = () => {
    const db = opening.result;
    if (!db.objectStoreNames.contains('transcripts')) { db.close(); resolve(null); return; }
    const reading = db.transaction('transcripts').objectStore('transcripts').get('current');
    reading.onsuccess = () => { db.close(); resolve(reading.result ?? null); };
    reading.onerror = () => reject(reading.error);
  };
}));
const answer = (route, reply, remaining = 20) => route.fulfill({
  json: { reply, quota: { remaining, limit: 40, resetsAt: '2099-01-01T00:00:00Z' } },
});
const accountB = page => page.evaluate(() => window.__switchAssistantUser('privacy-b'));

// Exercise identical privacy guarantees in the two frontends. All model
// traffic is mocked; the tests use the browser's real IndexedDB.
export function assistantPrivacyTests(test, boot) {
  test('assistant privacy: direct UID switch resets transcript, draft and quota', async ({ page }) => {
    await boot(page);
    await page.route('**/api/assistant', route => answer(route, 'Private A answer', 0));
    await open(page);
    await send(page, 'Private A question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('Private A answer');
    await messageBox(page).fill('Private A draft');
    await accountB(page);
    await open(page);
    await expect(messageBox(page)).toHaveValue('');
    await expect(page.locator('.assistant-bubble')).toHaveCount(0);
    const turns = [];
    await page.route('**/api/assistant', route => {
      turns.push(route.request().postDataJSON().messages);
      return answer(route, 'B answer');
    });
    await send(page, 'B question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('B answer');
    expect(turns).toEqual([[{ role: 'user', content: 'B question' }]]);
    await expect.poll(() => record(page)).toMatchObject({ owner: 'privacy-b', messages: [
      { role: 'user', content: 'B question' }, { role: 'assistant', content: 'B answer' },
    ] });
  });

  test('assistant privacy: old replies cannot enter the next account', async ({ page }) => {
    await boot(page);
    let heldRoute;
    await page.route('**/api/assistant', route => {
      const question = route.request().postDataJSON().messages.at(-1).content;
      if (question === 'Private A question') { heldRoute = route; return; }
      return answer(route, 'B answer');
    });
    await open(page);
    await send(page, 'Private A question');
    await expect.poll(() => !!heldRoute).toBe(true);
    await accountB(page);
    await open(page);
    await send(page, 'B question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('B answer');
    const response = page.waitForResponse(r => r.url().endsWith('/api/assistant'));
    await answer(heldRoute, 'Private delayed A answer', 0);
    await response;
    await expect.poll(() => record(page)).toMatchObject({ owner: 'privacy-b', messages: [
      { role: 'user', content: 'B question' }, { role: 'assistant', content: 'B answer' },
    ] });
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('B answer');
    await messageBox(page).fill('B followup');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  });

  test('assistant privacy: Clear chat invalidates a pending reply', async ({ page }) => {
    await boot(page);
    let heldRoute;
    await page.route('**/api/assistant', route => {
      if (route.request().postDataJSON().messages.at(-1).content === 'Erase me') {
        heldRoute = route; return;
      }
      return answer(route, 'New answer');
    });
    await open(page);
    await send(page, 'Erase me');
    await expect.poll(() => !!heldRoute).toBe(true);
    await page.getByRole('button', { name: 'Clear chat history' }).click();
    await send(page, 'New question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('New answer');
    const response = page.waitForResponse(r => r.url().endsWith('/api/assistant'));
    await answer(heldRoute, 'Erased late answer', 0);
    await response;
    await expect.poll(async () => (await record(page))?.messages).toEqual([
      { role: 'user', content: 'New question' }, { role: 'assistant', content: 'New answer' },
    ]);
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('New answer');
  });

  test('assistant privacy: a delayed token cannot send A context as B', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const source = window.__shohojAuthSource;
      const original = source ? source.getIdToken : window._shohoj_idToken;
      let first = true;
      const getter = () => {
        if (!first) return original();
        first = false;
        return new Promise(resolve => { window.__releaseAssistantToken = () => resolve('old-token'); });
      };
      if (source) source.getIdToken = getter;
      else window._shohoj_idToken = getter;
    });
    const turns = [];
    await page.route('**/api/assistant', route => {
      turns.push(route.request().postDataJSON().messages);
      return answer(route, 'B answer');
    });
    await open(page);
    await send(page, 'Private A question');
    await page.waitForFunction(() => typeof window.__releaseAssistantToken === 'function');
    await accountB(page);
    await open(page);
    await page.evaluate(() => window.__releaseAssistantToken());
    await send(page, 'B question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('B answer');
    expect(turns).toEqual([[{ role: 'user', content: 'B question' }]]);
  });

  test('assistant privacy: Clear chat invalidates a delayed history read', async ({ page }) => {
    await boot(page);
    await page.route('**/api/assistant', route => answer(route, 'Saved answer'));
    await open(page);
    await send(page, 'Saved question');
    await expect(page.locator('.assistant-bubble--reply')).toHaveText('Saved answer');
    await expect.poll(async () => (await record(page))?.messages.length).toBe(2);
    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(page.getByRole('dialog', { name: 'Shohoj Assistant' })).toHaveCount(0);
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) {
        const tx = original.apply(this, args);
        if (this.name !== 'shohoj_assistant' || args[1] !== 'readonly') return tx;
        IDBDatabase.prototype.transaction = original;
        return {
          objectStore: name => tx.objectStore(name),
          set oncomplete(callback) {
            tx.oncomplete = event => {
              window.__releaseAssistantHistory = () => callback(event);
            };
          },
          set onerror(callback) { tx.onerror = callback; },
          set onabort(callback) { tx.onabort = callback; },
        };
      };
    });
    await open(page);
    await page.waitForFunction(() => typeof window.__releaseAssistantHistory === 'function');
    await page.getByRole('button', { name: 'Clear chat history' }).click();
    await page.evaluate(() => window.__releaseAssistantHistory());
    await expect.poll(() => record(page)).toBeNull();
    await expect(page.locator('.assistant-bubble')).toHaveCount(0);
  });
}
