import { defineConfig, devices } from '@playwright/test';

// Visual parity harness for the shell migration.
//
// Unlike the other Playwright configs, this one runs TWO servers and compares
// their output against ONE set of baseline images:
//
//   legacy project -> python http.server over the repo root (the un-bundled
//                     legacy page, which is the visual reference)
//   shell  project -> vite preview over dist-shell/ (the React/TS build under
//                     migration)
//
// Both projects call toHaveScreenshot() with the SAME explicit snapshot name,
// and snapshotPathTemplate deliberately omits {projectName} and {testFilePath}
// so both resolve to the same file on disk. That is what makes the comparison
// cross-project: the legacy run authors e2e-visual/__screenshots__/<name>.png
// (via --update-snapshots) and the shell run is diffed against it. With the
// default template each project would silently write its own snapshot and the
// two would never be compared at all.
//
// Authoring baselines:   npm run test:visual:baseline
// Checking the shell:    npm run test:visual
const LEGACY_PORT = process.env.PLAYWRIGHT_VISUAL_LEGACY_PORT || 4176;
const SHELL_PORT = process.env.PLAYWRIGHT_VISUAL_SHELL_PORT || 4177;

// Playwright starts every configured webServer regardless of --project, so
// authoring baselines would otherwise require a shell build that the baseline
// run never touches. test:visual:baseline sets this to skip the shell server.
const LEGACY_ONLY = !!process.env.VISUAL_LEGACY_ONLY;

const legacyServer = {
  command: `python3 -m http.server ${LEGACY_PORT} --bind 127.0.0.1`,
  url: `http://127.0.0.1:${LEGACY_PORT}/index.html`,
  reuseExistingServer: !process.env.CI,
  timeout: 15_000,
};

const shellServer = {
  command: `npm run preview:shell -- --host 127.0.0.1 --port ${SHELL_PORT} --strictPort`,
  url: `http://127.0.0.1:${SHELL_PORT}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
};

export default defineConfig({
  testDir: './e2e-visual',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Freezes CSS animations/transitions at their end state, which covers the
      // drifting orbs and the .reveal fade-ins. The mouse-driven canvas is NOT
      // covered by this and is masked per-assertion instead.
      animations: 'disabled',
      caretHidden: true,
      scale: 'css',
      // Font antialiasing differs between machines and CI; tight enough to catch
      // a real layout or colour regression, loose enough not to cry over
      // subpixel text rendering.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  // Baselines are checked in and shared across both projects. {arg} is the
  // explicit name passed to toHaveScreenshot().
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'legacy',
      testMatch: /legacy-baseline\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${LEGACY_PORT}`,
      },
    },
    {
      name: 'shell',
      testMatch: /shell-parity\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${SHELL_PORT}`,
      },
    },
  ],
  webServer: LEGACY_ONLY ? [legacyServer] : [legacyServer, shellServer],
});
