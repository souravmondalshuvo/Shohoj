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
// nested base the entry pathname matched only the NotFound route. The bootstrap
// modules (router, routes, features) live in src/, a sibling of root, so
// server.fs.allow grants the dev server access across the root boundary.

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'app'),
  base: '/',
  plugins: [react()],
  server: {
    port: 5174,
    fs: { allow: [resolve(import.meta.dirname)] },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-shell'),
    emptyOutDir: true,
  },
});
