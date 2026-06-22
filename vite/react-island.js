// vite/react-island.js
//
// Injects the React CGPA-summary island entry into the main page — Vite only.
// transformIndexHtml runs in the Vite dev server and build, never in build3.py,
// so index.html on disk stays unchanged and the gh-pages bundle is unaffected.
// (Migration Step 4; see docs/REACT_VITE_MIGRATION.md.)

const ENTRIES = [
  '/src/react/cgpa-summary-entry.tsx',
  // Phase 5B: the semesters-container island. Self-gated — it only mounts when
  // opted in (?reactSemesters=1), so injecting it always is safe.
  '/src/react/calculator-semesters-entry.tsx',
];

export default function reactIsland() {
  return {
    name: 'shohoj-react-island',
    transformIndexHtml: {
      // 'pre' so the injected module scripts are seen during Vite's entry
      // analysis and get bundled + hashed (default order leaves the raw
      // /src/*.tsx path in the output, which would 404 in the build).
      order: 'pre',
      handler(html, ctx) {
        // Only the main calculator page; skip admin/index.html.
        const isAdmin = (ctx.filename || ctx.path || '').includes('admin');
        if (isAdmin) return html;
        return {
          html,
          tags: ENTRIES.map((src) => ({
            tag: 'script',
            attrs: { type: 'module', src },
            injectTo: 'body',
          })),
        };
      },
    },
  };
}
