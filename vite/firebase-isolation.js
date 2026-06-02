// vite/firebase-isolation.js
//
// Isolates the Firebase auth boot into its own chunk on the main calculator
// page — Vite only. index.html on disk ships an inline <script type="module">
// that imports js/auth/firebase.js (which transitively imports the Firebase SDK
// from https://www.gstatic.com/...). If Vite folds that into the page's `main`
// entry chunk, a blocked/failed gstatic import takes the whole chunk — and the
// CGPA calculator — down with it.
//
// build3.py avoids this by inlining firebase as a SEPARATE module script. This
// plugin reproduces that for Vite:
//   1. transformIndexHtml (pre): strip the inline firebase script BEFORE Vite's
//      entry analysis, so it never gets bundled into `main`.
//      - dev: inject the source entry directly (no bundling step).
//   2. build: src/firebase/firebase-entry.js is a dedicated rollup input (see
//      vite.config.js), so Rollup emits it as its own entry chunk with no static
//      import edge from `main`. generateBundle injects a <script> tag pointing
//      at that hashed chunk.
//
// Only the main page is touched (admin is skipped); index.html on disk and the
// build3.py / gh-pages path are unaffected. See docs/REACT_VITE_MIGRATION.md
// Step 4.

// Matches the inline firebase boot in index.html — an optional leading comment
// followed by the module script that imports from js/auth/firebase.js.
const INLINE_FIREBASE_RE =
  /(?:<!--[^>]*-->\s*)?<script\s+type="module">[\s\S]*?from\s+['"]\.\/js\/auth\/firebase\.js['"][\s\S]*?<\/script>/;

// Dev-server path to the standalone entry (served from project root).
const DEV_ENTRY = '/src/firebase/firebase-entry.js';

// Rollup input name for the firebase entry (see vite.config.js input.firebase).
const FIREBASE_ENTRY_NAME = 'firebase';

function isAdminPage(ctx) {
  return (ctx.filename || ctx.path || '').includes('admin');
}

export default function firebaseIsolation() {
  let base = '/';
  return {
    name: 'shohoj-firebase-isolation',
    // 'post' so generateBundle runs after Vite's HTML plugin has emitted
    // index.html into the bundle — we mutate that asset below. (The
    // transformIndexHtml `order` field is independent of this and still runs
    // 'pre', early enough to strip the inline script before entry analysis.)
    enforce: 'post',

    configResolved(config) {
      base = config.base || '/';
    },

    transformIndexHtml: {
      // 'pre' so the inline script is removed before Vite scans the HTML for
      // module entries — otherwise it would be folded into the `main` chunk.
      order: 'pre',
      handler(html, ctx) {
        if (isAdminPage(ctx)) return html;

        const stripped = html.replace(INLINE_FIREBASE_RE, '');
        if (stripped === html) {
          // Inline firebase script not found — fail loud rather than silently
          // shipping a page with no auth boot.
          throw new Error(
            'shohoj-firebase-isolation: could not find the inline firebase ' +
              'script in index.html. Did the markup change?',
          );
        }

        // Dev: no bundling, so wire the source entry straight in. In build the
        // hashed chunk is injected later by generateBundle.
        if (ctx.server) {
          return {
            html: stripped,
            tags: [
              {
                tag: 'script',
                attrs: { type: 'module', src: DEV_ENTRY },
                injectTo: 'body',
              },
            ],
          };
        }
        return stripped;
      },
    },

    // Build: find the firebase entry chunk and inject a <script> for it into the
    // emitted main page HTML, as its own module-graph root.
    generateBundle(_options, bundle) {
      const firebaseChunk = Object.values(bundle).find(
        (out) =>
          out.type === 'chunk' && out.isEntry && out.name === FIREBASE_ENTRY_NAME,
      );
      if (!firebaseChunk) {
        throw new Error(
          'shohoj-firebase-isolation: firebase entry chunk not found. Is ' +
            "rollupOptions.input.firebase configured in vite.config.js?",
        );
      }

      const indexHtml = bundle['index.html'];
      if (!indexHtml || indexHtml.type !== 'asset') return;

      const prefix = base.endsWith('/') ? base : `${base}/`;
      const src = `${prefix}${firebaseChunk.fileName}`;
      const tag = `<script type="module" crossorigin src="${src}"></script>`;

      let source = String(indexHtml.source);
      // Place it right before </body>, mirroring where the inline boot lived.
      if (source.includes('</body>')) {
        source = source.replace('</body>', `  ${tag}\n  </body>`);
      } else {
        source += `\n${tag}\n`;
      }
      indexHtml.source = source;
    },
  };
}
