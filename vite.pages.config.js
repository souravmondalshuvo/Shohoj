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
// Every standalone page is retired at the shell cutover.

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  server: {
    port: 5175,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-pages'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        campus: resolve(import.meta.dirname, 'campus/index.html'),
      },
    },
  },
});
