import { defineConfig, devices } from '@playwright/test';
import { portFor } from './e2e-support/port.js';

// E2E for the standalone public pages build (dist-pages/, see
// vite.pages.config.js) — shell features published on the Pages site ahead of
// the cutover. Serves the whole multi-page output with `vite preview`, so
// specs visit the same paths production uses (/campus/, /bus/, …).
// build:pages must have run first (the test:e2e:pages npm script chains it).
// 4178, not 4176: the visual harness serves LEGACY on 4176, so the two suites
// fought for the port whenever they overlapped — each adopting the other's
// server and testing the wrong document root.
const PORT = portFor(4178, 'PLAYWRIGHT_PAGES_PORT');

export default defineConfig({
  testDir: './e2e-pages',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview:pages -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    // The multi-page build has no root index.html (/ is 404, which the
    // readiness probe rejects) — probe a real page instead.
    url: `http://127.0.0.1:${PORT}/campus/`,
    // Never reuse a server this run did not start.
    //
    // `reuseExistingServer: !process.env.CI` adopts whatever is already
    // listening on the port — including another worktree's preview serving a
    // completely different build. That failure is silent and enormous: the
    // suite runs to completion against the wrong bundle and reports dozens of
    // failures that all pass in isolation. It cost 215, then 137, then 55
    // phantom failures in one afternoon before the stray process was found.
    //
    // Starting our own costs about two seconds. With --strictPort a genuine
    // port clash now fails loudly, at the web server, instead of quietly
    // poisoning every assertion.
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
