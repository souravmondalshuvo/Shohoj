import { defineConfig, devices } from '@playwright/test';

// E2E for the React Router shell build (dist-shell/). Serves the built shell
// statically — build:shell must have run first (the test:e2e:shell npm script
// chains it). Separate from playwright.config.js (un-bundled legacy source) and
// playwright.vite.config.js (the island dist/).
//
// NOTE: the shell entry is built to dist-shell/app/index.html with base './',
// while the router uses absolute paths and no basename, so a deep link like
// /calculator 404s on a plain static server. Specs therefore load the index and
// navigate in-app (client-side), which is how the shell is reached today. Fixing
// the initial-load base/basename mismatch is tracked separately.
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
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist-shell`,
    url: `http://127.0.0.1:${PORT}/app/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
