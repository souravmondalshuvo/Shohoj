// vite.campus.config.js
//
// Dedicated Vite config for the standalone campus-map page (#383), kept
// separate from vite.config.js (island/firebase transforms) and
// vite.shell.config.js (whole shell) on purpose: this build publishes ONE
// route — the campus map — to /campus/ on the Pages site ahead of the shell
// cutover, without exposing the unfinished shell.
//
//   npm run build:campus    — build the page into dist-campus/
//   npm run dev:campus      — dev server for the page
//   npm run preview:campus  — serve the built page
//
// `root` is the campus/ directory so its index.html builds to
// dist-campus/index.html. `base: './'` keeps asset URLs relative because the
// deployed page lives under a project-site subpath
// (souravmondalshuvo.github.io/Shohoj/campus/). The entry imports the campus
// route from src/, a sibling of root, so server.fs.allow spans the repo root.
// No runtime-config plugin: the map reads only the public CONNECT CDN feed —
// no Firebase, no secrets.

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'campus'),
  base: './',
  plugins: [react()],
  server: {
    port: 5175,
    fs: { allow: [resolve(import.meta.dirname)] },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-campus'),
    emptyOutDir: true,
  },
});
