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

export default defineConfig({
  root: resolve(import.meta.dirname, 'app'),
  base: process.env.SHELL_BASE || '/',
  plugins: [react(), shellRuntimeConfig()],
  server: {
    port: 5174,
    fs: { allow: [resolve(import.meta.dirname)] },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-shell'),
    emptyOutDir: true,
  },
});
