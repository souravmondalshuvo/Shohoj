// vite/copy-globals.js
//
// index.html / admin/index.html load two plain (non-module) global-var scripts
// via <script src>: js/config/runtime-config.js and js/qr-data.js. Vite leaves
// non-module scripts unbundled AND does not copy them, so the built HTML would
// 404 on them. This build-only plugin copies them verbatim into the output dir
// at the same relative paths. (The dev server serves them from root directly,
// so no copy is needed there.)
//
// build3.py handles these differently — it inlines runtime-config and strips
// qr-data — so this plugin only affects the Vite path.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const GLOBAL_SCRIPTS = ['js/config/runtime-config.js', 'js/qr-data.js'];

export default function copyGlobals() {
  let outDir = 'dist';
  return {
    name: 'shohoj-copy-globals',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const rel of GLOBAL_SCRIPTS) {
        const src = resolve(repoRoot, rel);
        if (!existsSync(src)) continue; // runtime-config.js is generated; skip if absent
        const dest = resolve(repoRoot, outDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
      }
    },
  };
}
