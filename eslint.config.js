// Flat ESLint config (#235). Deliberately scoped to *correctness*, not style —
// this repo has no Prettier pass and we don't want a linter forcing a bulk
// reformat. So we lean on @eslint/js "recommended" (undeclared globals,
// unreachable code, duplicate keys, accidental assignment in conditions, …) and
// keep the noisier-but-non-bug rules (unused vars, empty blocks) at "warn" so
// they surface in output without failing CI.
//
// Source is authored as ES modules per area; build3.py later concatenates the
// browser modules into one scope for the shipped bundle. Generated, vendored and
// build-artifact paths are excluded (see `ignores`).

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Libraries pulled in via <script> tags in the bundled HTML, so they're real
// runtime globals the browser modules reference without importing.
const SCRIPT_TAG_GLOBALS = {
  Chart: 'readonly',
  firebase: 'readonly',
  pdfjsLib: 'readonly',
  qrcode: 'readonly',
  QRCode: 'readonly',
};

// Non-bug rules we want visible but not CI-blocking. allowEmptyCatch matches the
// codebase's `try { … } catch {}` defensive pattern around optional storage.
const SOFT_RULES = {
  'no-unused-vars': 'warn',
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

export default tseslint.config(
  {
    ignores: [
      'js/qr-data.js',        // generated QR payload
      'js/vendor/**',         // third-party
      'js/config/runtime-config.js', // generated from runtime-config.template.js
      'shohoj.html',          // build3.py artifact
      'admin.html',           // build3.py artifact
      'dist/**',              // vite build output
      'dist-shell/**',        // vite shell build output (vite.shell.config.js)
      'dist-pages/**',        // standalone pages build output (vite.pages.config.js)
      'node_modules/**',
      'test-results/**',      // playwright output
      'playwright-report/**',
      '.claude/**',           // local harness tooling, not project source
    ],
  },

  js.configs.recommended,

  // Browser bundle modules.
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...SCRIPT_TAG_GLOBALS },
    },
    rules: SOFT_RULES,
  },

  // Tests and Playwright specs run under Node, but their page.evaluate /
  // addInitScript callbacks (and the bundle-smoke harness) reference browser
  // globals, so both environments are in scope here.
  {
    files: [
      'tests/**/*.js',
      'e2e/**/*.js',
      'e2e-vite/**/*.js',
      'e2e-shell/**/*.js',
      'e2e-pages/**/*.js',
      'e2e-visual/**/*.js',
      // Shared Playwright fixtures. Not specs themselves, but their
      // addInitScript callbacks run in the page and reference window.
      'e2e-support/**/*.js',
      // Lives in scripts/ but is a Playwright driver like the specs above: its
      // measurement callback is evaluated in the page, so it needs the browser
      // globals that the pure-Node scripts block below does not provide.
      'scripts/parity_report.mjs',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: SOFT_RULES,
  },

  // Pure Node tooling: scripts and root config files.
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: SOFT_RULES,
  },

  // Plain-JS entry shims under src/ (e.g. firebase-entry.js) are browser modules.
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: SOFT_RULES,
  },

  // Cloudflare Worker: service-worker style globals plus Node-ish test glue.
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.node },
    },
    rules: SOFT_RULES,
  },

  // TypeScript core + React slice. The TS parser/rules are scoped here so they
  // never touch the plain-JS configs above.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...SOFT_RULES,
      // Defer to the TS-aware unused-vars rule: the base `no-unused-vars`
      // double-reports and false-positives on parameter names inside
      // type-position function signatures (e.g. `fn: (value: T) => U`), which
      // are not runtime bindings.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      // The typed core intentionally uses `any` in a couple of spots for the
      // loosely-shaped restored-state it maps (see src/core/helpers.ts). That's
      // a strictness preference, not a correctness bug — keep it visible, not
      // CI-blocking. Tightening the types is tracked separately from this PR.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ── Clean-architecture boundary (Phase 2) ──────────────────────────────────
  // The domain layer (src/core) must stay pure: no UI framework, no backend
  // SDK, no browser ambient globals. The same academic logic then runs
  // unchanged in Node tests, React, and a Worker. Infrastructure adapters
  // (Firebase, DOM, Cloudflare) belong outside src/core, behind ports. These
  // are correctness boundaries, so they are errors (CI-blocking), unlike the
  // style-leaning SOFT_RULES above.
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'Domain (src/core) must not import React — keep UI in features/*/components.' },
          { name: 'react-dom', message: 'Domain (src/core) must not import react-dom.' },
          { name: 'firebase', message: 'Domain (src/core) must not import Firebase — depend on a repository port; Firestore lives in infrastructure adapters.' },
          { name: 'firebase-admin', message: 'Domain (src/core) must not import firebase-admin.' },
        ],
        patterns: [
          { group: ['firebase/*', '@firebase/*', 'firebase-admin/*'], message: 'Domain (src/core) must not import the Firebase SDK — depend on a repository port.' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'Domain (src/core) must not touch window — pass values in or use a port.' },
        { name: 'document', message: 'Domain (src/core) must not touch the DOM.' },
        { name: 'localStorage', message: 'Domain (src/core) must not touch localStorage — use a storage port (src/services/storage).' },
        { name: 'sessionStorage', message: 'Domain (src/core) must not touch sessionStorage.' },
        { name: 'navigator', message: 'Domain (src/core) must not touch navigator.' },
      ],
    },
  },

  // Documented boundary exception (tech debt): connectFeedClient.ts is an
  // infrastructure-flavored CDN client that currently lives in src/core. Its API
  // is already port-injectable (`options.storage: StorageLike`); it only NAMES
  // `localStorage` as an ambient default. Relocating it to platform/infrastructure
  // is tracked for Phase 6 (seats/free-rooms). Until then, allow localStorage in
  // this one file while keeping every other boundary (React/Firebase/window/DOM)
  // enforced. New domain modules get no such exception.
  {
    files: ['src/core/connectFeedClient.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'window', message: 'Domain (src/core) must not touch window.' },
        { name: 'document', message: 'Domain (src/core) must not touch the DOM.' },
        { name: 'navigator', message: 'Domain (src/core) must not touch navigator.' },
      ],
    },
  },
);
