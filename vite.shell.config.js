// vite.shell.config.js
//
// Dedicated Vite config for the React Router shell (Phase 3), kept SEPARATE from
// vite.config.js on purpose: the main config's island/firebase transform plugins
// auto-apply to any non-admin page, which would pollute the shell. This config is
// plain @vitejs/plugin-react only, builds the shell into dist-shell/, and touches
// neither the legacy build3.py path nor the existing islands.
//
//   npm run build:shell    — build the shell into dist-shell/
//   npm run dev:shell      — dev server for the shell
//   npm run preview:shell  — serve the built shell with SPA fallback
//
// `root` is the app/ directory so its index.html builds to dist-shell/index.html
// (the served root), not dist-shell/app/index.html. With `base: '/'` the router's
// absolute paths ('/', '/calculator', …) then resolve on initial load — at a
// nested base the entry pathname matched only the NotFound route; the router now
// derives its basename from the Vite base, so a nested base works too. The
// bootstrap modules (router, routes, features) live in src/, a sibling of root,
// so server.fs.allow grants the dev server access across the root boundary.
//
// SHELL_BASE (#449) overrides the base for subpath deploys — the CI deploy job
// builds with SHELL_BASE=/Shohoj/app/ to publish the shell beta on GitHub Pages
// next to the legacy site. Unset (dev, e2e-shell, local builds) it stays '/'.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const RUNTIME_CONFIG_PATH = resolve(import.meta.dirname, 'js/config/runtime-config.js');
const RUNTIME_CONFIG_STUB =
  '// No generated runtime config (js/config/runtime-config.js missing at build '
  + 'time) — the shell runs offline. Run `npm run config:local` and rebuild for '
  + 'cloud capabilities.\n';

// Serve (dev) and emit (build) the generated, gitignored runtime config as
// /runtime-config.js — the same file the legacy index.html loads (#329). When
// it hasn't been generated (fresh clone, CI) a comment stub ships instead, so
// app/index.html's script tag always resolves and the shell degrades to the
// offline capability set with no boot noise.
function shellRuntimeConfig() {
  const source = () =>
    existsSync(RUNTIME_CONFIG_PATH) ? readFileSync(RUNTIME_CONFIG_PATH, 'utf8') : RUNTIME_CONFIG_STUB;
  let base = '/';
  return {
    name: 'shohoj:shell-runtime-config',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use('/runtime-config.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(source());
      });
    },
    // Vite only rebases URLs it resolves to real files, and runtime-config.js
    // exists solely as an emitted asset — so at a nested base (SHELL_BASE) the
    // index.html reference must be rebased here or it 404s at the site root
    // and the shell silently boots offline (#449).
    transformIndexHtml(html) {
      return html.replace('src="/runtime-config.js"', `src="${base}runtime-config.js"`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'runtime-config.js', source: source() });
    },
  };
}

// The shell's CSP meta (#460 follow-up) forbids inline script, but index.html
// needs two synchronous inline blocks before the router boots (pre-paint theme,
// deep-link decode). Rather than weaken script-src with 'unsafe-inline', hash
// them the way build3.py hashes the legacy page: on build, replace the
// __CSP_SCRIPT_HASHES__ placeholder with the sha256 of every inline <script> in
// the FINAL html (order 'post', so Vite's injected tags are already in). In dev
// the meta is dropped entirely — @vitejs/plugin-react's refresh preamble and HMR
// would otherwise need their own hashes on every edit.
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const CSP_META_RE = /\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/i;
const CSP_PLACEHOLDER = '__CSP_SCRIPT_HASHES__';
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function shellCspHashes() {
  let isBuild = false;
  return {
    name: 'shohoj:shell-csp-hashes',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!isBuild) return html.replace(CSP_META_RE, '');
        // Fail the build rather than ship a CSP that silently blocks the shell's
        // own inline scripts (a stray second mention of the token would other-
        // wise swallow the replacement and leave the real directive unfilled).
        const occurrences = html.split(CSP_PLACEHOLDER).length - 1;
        if (occurrences !== 1) {
          throw new Error(
            `shohoj:shell-csp-hashes — expected exactly 1 ${CSP_PLACEHOLDER} in index.html, found ${occurrences}`,
          );
        }
        // Scan with comments stripped: a comment mentioning a script tag would
        // otherwise open a bogus match that swallows the next real block, and the
        // genuine script would ship unhashed (i.e. blocked at runtime).
        const hashes = [];
        for (const [, body] of html.replace(HTML_COMMENT_RE, '').matchAll(INLINE_SCRIPT_RE)) {
          hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
        }
        if (!hashes.length) throw new Error('shohoj:shell-csp-hashes — no inline scripts found to hash');
        return html.replace(CSP_PLACEHOLDER, hashes.join(' '));
      },
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'app'),
  base: process.env.SHELL_BASE || '/',
  plugins: [react(), shellRuntimeConfig(), shellCspHashes()],
  server: {
    port: 5174,
    fs: { allow: [resolve(import.meta.dirname)] },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-shell'),
    emptyOutDir: true,
  },
});
