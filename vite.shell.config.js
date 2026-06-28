// vite.shell.config.js
//
// Dedicated Vite config for the React Router shell (Phase 3), kept SEPARATE from
// vite.config.js on purpose: the main config's island/firebase transform plugins
// auto-apply to any non-admin page, which would pollute the shell. This config is
// plain @vitejs/plugin-react only, builds app/index.html into dist-shell/, and
// touches neither the legacy build3.py path nor the existing islands.
//
//   npm run build:shell   — build the shell into dist-shell/
//   npm run dev:shell      — dev server for the shell

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174 },
  build: {
    outDir: 'dist-shell',
    emptyOutDir: true,
    rollupOptions: {
      input: { shell: resolve(import.meta.dirname, 'app/index.html') },
    },
  },
});
