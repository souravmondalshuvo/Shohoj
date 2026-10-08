// vite.pages.config.js
//
// One multi-page Vite build for every STANDALONE public page — shell features
// published on the Pages site ahead of the cutover (#383 campus map first;
// bus routes and lost & found follow the same pattern). Replaces the
// per-feature vite.campus.config.js: pages are added as rollup inputs here
// instead of growing a parallel config/CI stack per feature.
//
//   npm run build:pages    — build every page into dist-pages/
//   npm run dev:pages      — dev server (open /campus/, /bus/, …)
//   npm run preview:pages  — serve the built pages at the production paths
//
// `root` is the repo root so each page keeps its directory in the output
// (campus/index.html → dist-pages/campus/index.html), which is exactly the
// layout CD copies into the Pages deploy folder. `base: './'` keeps asset
// URLs relative because the site lives under a project subpath
// (souravmondalshuvo.github.io/Shohoj/). Only the inputs listed here build —
// the repo-root index.html (legacy build3.py source) is never touched.
// One input is a module, not a page: campus/embed.tsx, which the legacy site
// imports to show the Campus Map inside its own tab.
// Every standalone page is retired at the shell cutover.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const RUNTIME_CONFIG_PATH = resolve(import.meta.dirname, 'js/config/runtime-config.js');
const RUNTIME_CONFIG_STUB =
  '// No generated runtime config (js/config/runtime-config.js missing at build '
  + 'time) — cloud pages run offline. Run `npm run config:local` and rebuild '
  + 'for cloud capabilities.\n';

// Serve (dev) and emit (build) the generated, gitignored runtime config as
// /runtime-config.js for pages that need the cloud stack (lost & found).
// Kept in sync with the same plugin in vite.shell.config.js — duplicated
// rather than shared because both configs are bridge scaffolding retired at
// the cutover. A comment stub ships when the config hasn't been generated
// (fresh clone, fork PRs), so those pages degrade to the signed-out prompt.
function pagesRuntimeConfig() {
  const source = () =>
    existsSync(RUNTIME_CONFIG_PATH) ? readFileSync(RUNTIME_CONFIG_PATH, 'utf8') : RUNTIME_CONFIG_STUB;
  return {
    name: 'shohoj:pages-runtime-config',
    configureServer(server) {
      server.middlewares.use('/runtime-config.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(source());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'runtime-config.js', source: source() });
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react(), pagesRuntimeConfig()],
  server: {
    port: 5175,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-pages'),
    emptyOutDir: true,
    rollupOptions: {
      // Keep a module entry's exports. Without this the embed's one export,
      // mountCampusMap, is shaken out as unused and the legacy page imports
      // an empty module.
      preserveEntrySignatures: 'strict',
      input: {
        campus: resolve(import.meta.dirname, 'campus/index.html'),
        bus: resolve(import.meta.dirname, 'bus/index.html'),
        'lost-found': resolve(import.meta.dirname, 'lost-found/index.html'),
        // Not a page: the Campus Map as a module the legacy site mounts into
        // its own tab (campus/embed.tsx).
        'campus-embed': resolve(import.meta.dirname, 'campus/embed.tsx'),
      },
      output: {
        // The legacy bundle is built by build3.py and never sees this build's
        // manifest, so it cannot know a hashed name. The embed gets a fixed
        // address beside the page it shares its chunks with; everything it
        // imports is still hashed.
        entryFileNames: (chunk) =>
          chunk.name === 'campus-embed' ? 'campus/embed.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
