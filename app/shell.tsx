// app/shell.tsx
//
// Vite-root entry for the React Router shell. The shell's Vite root is app/ (see
// vite.shell.config.js) so index.html builds to dist-shell/index.html and is
// served at /. A dev server resolves an index.html <script src> against that
// root, so the entry referenced from the page must live here — but the actual
// bootstrap (and the rest of the shell) lives in src/. This re-imports it for its
// mount side effect; the cross-root module import is permitted by server.fs.allow.

// Stylesheet order is load-bearing and must not be reordered.
//
// css/style.css is the legacy site's stylesheet and the visual reference for the
// migration; css/shell-routes.css carries the 509 route-only rules lifted out of
// index.html's former inline <style>. The two overlap on 9 core custom
// properties and 62 class names (dm-*, routine-*, seats-*, sim-*), so whichever
// is imported last wins those. style.css goes first so the contested rules
// resolve to the legacy rendering, which is what e2e-visual/ asserts.
import '../css/style.css';
import '../css/shell-routes.css';

import '../src/app/entries/shell.tsx';
