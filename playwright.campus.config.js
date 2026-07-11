import { defineConfig, devices } from '@playwright/test';

// E2E for the standalone campus-map page build (dist-campus/, #383) — the
// CampusRoute published at /campus/ on the Pages site ahead of the shell
// cutover. Serves the built page with `vite preview` — build:campus must have
// run first (the test:e2e:campus npm script chains it). Separate from
// playwright.shell.config.js: the shell suite covers the route's behavior in
// the shell; this suite covers the standalone mount (relative base, no
// basename, single-page serve).
const PORT = process.env.PLAYWRIGHT_CAMPUS_PORT || 4176;

export default defineConfig({
  testDir: './e2e-campus',
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
    command: `npm run preview:campus -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
