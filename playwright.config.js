import { defineConfig, devices } from '@playwright/test';
import { portFor } from './e2e-support/port.js';

const PORT = portFor(4173, 'PLAYWRIGHT_PORT');

export default defineConfig({
  testDir: './e2e',
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
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
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
