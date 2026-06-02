// vite/react-island.js
//
// Injects the React CGPA-summary island entry into the main page — Vite only.
// transformIndexHtml runs in the Vite dev server and build, never in build3.py,
// so index.html on disk stays unchanged and the gh-pages bundle is unaffected.
// (Migration Step 4; see docs/REACT_VITE_MIGRATION.md.)

const ENTRY = '/src/react/cgpa-summary-entry.tsx';

export default function reactIsland() {
  return {
    name: 'shohoj-react-island',
    transformIndexHtml: {
      // 'pre' so the injected module script is seen during Vite's entry
      // analysis and gets bundled + hashed (default order leaves the raw
      // /src/*.tsx path in the output, which would 404 in the build).
      order: 'pre',
      handler(html, ctx) {
        // Only the main calculator page; skip admin/index.html.
        const isAdmin = (ctx.filename || ctx.path || '').includes('admin');
        if (isAdmin) return html;
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module', src: ENTRY },
              injectTo: 'body',
            },
          ],
        };
      },
    },
  };
}
