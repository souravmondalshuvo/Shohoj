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
    files: ['tests/**/*.js', 'e2e/**/*.js', 'e2e-vite/**/*.js'],
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
      '@typescript-eslint/no-unused-vars': 'warn',
      // The typed core intentionally uses `any` in a couple of spots for the
      // loosely-shaped restored-state it maps (see src/core/helpers.ts). That's
      // a strictness preference, not a correctness bug — keep it visible, not
      // CI-blocking. Tightening the types is tracked separately from this PR.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
