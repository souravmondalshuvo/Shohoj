// e2e-support/questSandbox.js
//
// Shohoj Quest's Java sandbox (#981), for browser tests and the author's tool.
//
// In production the sandbox is three files served by the Cloudflare Worker, on
// an origin that is not the site's (worker/questSandbox.js). A test has no
// Worker. Rather than stand a second server up, this answers requests for the
// sandbox's real address from the Worker's own code, headers and all.
//
// That keeps what matters true in a test: the browser sees a frame on a
// different site from the page, the page's real frame-src has to allow it, and
// the engine's worker gets the policy the Worker would send. Nothing is fetched
// from the deployed Worker, so a test never depends on what is deployed.

import { questSandboxResponse } from '../worker/questSandbox.js';

/** The sandbox's address in production: the Worker's origin, as app/index.html allows it. */
export const QUEST_SANDBOX_URL = 'https://shohoj-papers.souravmondal033.workers.dev/quest-sandbox/';

const SANDBOX_REQUEST = /^https:\/\/shohoj-papers\.souravmondal033\.workers\.dev\/quest-sandbox(\/|$)/;

/**
 * Serve the sandbox to `page`. `embedder` is the origin of the page under test,
 * which the sandbox must name in frame-ancestors or the browser refuses to
 * embed it.
 */
export async function serveQuestSandbox(page, embedder) {
  await page.route(SANDBOX_REQUEST, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = questSandboxResponse(
      new Request(url, { method: request.method() }),
      { ALLOWED_ORIGINS: embedder },
      url,
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
}

/** Tell the app under test where the sandbox is, as the runtime config would. */
export function useQuestSandbox(page, url = QUEST_SANDBOX_URL) {
  return page.addInitScript((address) => {
    window.__shohojQuestSandboxUrl = address;
  }, url);
}
