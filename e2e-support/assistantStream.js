// e2e-support/assistantStream.js
//
// Drives a streamed Assistant turn frame by frame (#924), for both panels —
// legacy js/ui/assistantFab.js and the shell's AssistantDrawer.tsx — so the
// twins are held to one behaviour by one set of checks.
//
// page.route() can only fulfil a body whole, which would show the finished
// reply and none of the states in between. So the Worker endpoint is stood in
// for one level up: window.fetch is wrapped before the app loads, and a call to
// /api/assistant gets a Response whose body the TEST writes into, one event at
// a time. Nothing reaches the network, so neither CSP nor the routed mocks are
// involved for this one URL.

import { expect } from '@playwright/test';

export async function installControlledStream(page, workerUrl) {
  await page.addInitScript((worker) => {
    const realFetch = window.fetch.bind(window);
    window.__assistantSse = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url !== `${worker.replace(/\/$/, '')}/api/assistant`) return realFetch(input, init);
      const encoder = new TextEncoder();
      let controller;
      const body = new ReadableStream({ start(c) { controller = c; } });
      window.__assistantSse = {
        request: JSON.parse(init.body),
        send: (event, data) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
        // The client stops reading at done/error and cancels; closing a
        // stream it already cancelled is expected, not a failure.
        end: () => {
          try {
            controller.close();
          } catch {
            /* already cancelled by the reader */
          }
        },
      };
      return Promise.resolve(
        new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      );
    };
  }, workerUrl);
}

const send = (page, event, data) =>
  page.evaluate(([e, d]) => window.__assistantSse.send(e, d), [event, data]);

async function streamOpened(page) {
  await expect.poll(() => page.evaluate(() => window.__assistantSse !== null)).toBe(true);
}

/**
 * The whole life of a streamed answer: dots, first words, more words in the
 * SAME bubble, a reset back to dots, and the final reply kept. `ask` sends the
 * question through the panel's own input.
 */
export async function expectStreamedTurn(page, ask) {
  const log = page.locator('.assistant-log');
  const streaming = page.locator('.assistant-bubble--streaming');
  await ask();
  await streamOpened(page);
  expect(await page.evaluate(() => window.__assistantSse.request.stream)).toBe(true);
  await expect(page.locator('.assistant-bubble--pending')).toBeVisible();

  await send(page, 'delta', { text: 'Your CGPA ' });
  await expect(streaming).toHaveText('Your CGPA');
  await expect(page.locator('.assistant-bubble--pending')).toHaveCount(0);
  // A screen reader waits for the finished reply instead of every fragment.
  await expect(log).toHaveAttribute('aria-busy', 'true');
  await streaming.evaluate((el) => { el.dataset.e2eSame = 'yes'; });

  await send(page, 'delta', { text: 'is **3.42**.' });
  await expect(streaming).toHaveText('Your CGPA is 3.42.');
  await expect(streaming.locator('strong')).toHaveText('3.42');
  // Rewritten in place, not rebuilt: the bubble is the one the test marked.
  await expect(streaming).toHaveAttribute('data-e2e-same', 'yes');

  // The round asked for a tool after all: what was shown goes, the dots return.
  await send(page, 'reset', {});
  await expect(streaming).toHaveCount(0);
  await expect(page.locator('.assistant-bubble--pending')).toBeVisible();
  await expect(log).not.toHaveAttribute('aria-busy', 'true');

  await send(page, 'delta', { text: 'Your CGPA is 3.41' });
  await send(page, 'done', {
    // The final reply is what is kept, whatever the fragments said.
    reply: 'Your CGPA is **3.42**.',
    quota: { remaining: 39, limit: 40, resetsAt: '2030-01-01T00:00:00.000Z' },
  });
  await page.evaluate(() => window.__assistantSse.end());
  await expect(streaming).toHaveCount(0);
  await expect(page.locator('.assistant-bubble--pending')).toHaveCount(0);
  await expect(page.locator('.assistant-bubble--reply').last()).toHaveText('Your CGPA is 3.42.');
  await expect(log).not.toHaveAttribute('aria-busy', 'true');
}

/** A turn that fails after the stream opened: the half answer is not kept. */
export async function expectStreamFailure(page, ask) {
  await ask();
  await streamOpened(page);
  await send(page, 'delta', { text: 'Half an answ' });
  await expect(page.locator('.assistant-bubble--streaming')).toHaveText('Half an answ');
  await send(page, 'error', { error: 'assistant_unavailable' });
  await page.evaluate(() => window.__assistantSse.end());
  await expect(page.locator('.assistant-error')).toHaveText(
    'The assistant is temporarily unavailable. Please try again in a bit.',
  );
  await expect(page.locator('.assistant-bubble--streaming')).toHaveCount(0);
  await expect(page.locator('.assistant-bubble--reply')).toHaveCount(0);
}
