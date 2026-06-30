import { defineConfig, devices } from '@playwright/test';

// E2E for the React Router shell build (dist-shell/). Serves the built shell with
// `vite preview` — build:shell must have run first (the test:e2e:shell npm script
// chains it). Separate from playwright.config.js (un-bundled legacy source) and
// playwright.vite.config.js (the island dist/).
//
// The shell builds to dist-shell/index.html (the served root) with base '/', so
// the router's absolute paths resolve on initial load and deep links work:
// `vite preview` is an SPA server, falling back to index.html for /calculator and
// the other client routes. (A plain static file server has no such fallback, so
// it would 404 those deep links.)
const PORT = process.env.PLAYWRIGHT_SHELL_PORT || 4175;

export default defineConfig({
  testDir: './e2e-shell',
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
    command: `npm run preview:shell -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
