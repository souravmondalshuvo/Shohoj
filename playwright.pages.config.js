import { defineConfig, devices } from '@playwright/test';

// E2E for the standalone public pages build (dist-pages/, see
// vite.pages.config.js) — shell features published on the Pages site ahead of
// the cutover. Serves the whole multi-page output with `vite preview`, so
// specs visit the same paths production uses (/campus/, /bus/, …).
// build:pages must have run first (the test:e2e:pages npm script chains it).
const PORT = process.env.PLAYWRIGHT_PAGES_PORT || 4176;

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
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
