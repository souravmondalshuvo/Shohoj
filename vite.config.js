// vite.config.js
//
// Vite build path that runs *beside* build3.py (see docs/REACT_VITE_MIGRATION.md,
// Step 3). It consumes the existing index.html and admin/index.html as native ES
// modules — the same execution model the E2E suite already uses by serving the
// un-bundled source. build3.py and the gh-pages deploy remain the live path until
// the Vite output reaches behavior parity (Steps 6-7).
//
// Seed data (SEEDED_REVIEWS / SEEDED_FACULTY_PROFILES) is injected by the
// seed-injection plugin, mirroring build3.py.

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import copyGlobals from './vite/copy-globals.js';
import reactIsland from './vite/react-island.js';
import seedInjection from './vite/seed-injection.js';

export default defineConfig({
  root: '.',
  // Relative asset URLs so the build works under the GitHub Pages project path.
  base: './',
  plugins: [react(), reactIsland(), seedInjection(), copyGlobals()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
