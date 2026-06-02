import { defineConfig, devices } from '@playwright/test';

// E2E for the Vite build output (React island). Serves dist/ statically —
// build:vite must have run first (the test:e2e:vite npm script chains it).
// Separate from playwright.config.js, which tests the un-bundled source.
const PORT = process.env.PLAYWRIGHT_VITE_PORT || 4174;

export default defineConfig({
  testDir: './e2e-vite',
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
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
