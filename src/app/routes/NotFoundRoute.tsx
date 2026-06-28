// src/app/routes/NotFoundRoute.tsx
//
// Catch-all 404 route (Phase 3 skeleton). Lazy route module.

import { Link } from 'react-router';

export function Component() {
  return (
    <section className="shell-page" role="alert">
      <h1>Page not found</h1>
      <p>That page doesn’t exist.</p>
      <Link to="/">Back to home</Link>
    </section>
  );
}
