// app/shell.tsx
//
// Vite-root entry for the React Router shell. The shell's Vite root is app/ (see
// vite.shell.config.js) so index.html builds to dist-shell/index.html and is
// served at /. A dev server resolves an index.html <script src> against that
// root, so the entry referenced from the page must live here — but the actual
// bootstrap (and the rest of the shell) lives in src/. This re-imports it for its
// mount side effect; the cross-root module import is permitted by server.fs.allow.

import '../src/app/entries/shell.tsx';
