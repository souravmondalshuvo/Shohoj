// src/app/routes/AdminRoute.tsx
//
// Admin route content (Phase 3 skeleton). Rendered only after <RequireAdmin>
// passes the client-side gate; the real moderation dashboard migrates here later
// (and every admin action is re-verified server-side regardless of this gate).

export function AdminRoute() {
  return (
    <section className="shell-page">
      <h1>Admin</h1>
      <p className="shell-muted">
        Moderation tools migrate here in Phase 6/7. Access is gated client-side by RequireAdmin and
        enforced server-side by Firestore rules + the Worker.
      </p>
    </section>
  );
}
