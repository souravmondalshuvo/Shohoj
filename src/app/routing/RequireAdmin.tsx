// src/app/routing/RequireAdmin.tsx
//
// Client-side route guard for admin-only routes (Phase 3). Gates UI rendering
// based on the auth snapshot; it is NOT the authorization boundary — admin
// actions are re-verified server-side (Firebase custom claim `admin:true`,
// Firestore rules, Worker token checks). This only avoids showing a screen the
// user can't use.

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '../providers/AuthProvider';

export function RequireAdmin({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <section className="shell-page" aria-busy="true">
        <p className="shell-muted">Checking access…</p>
      </section>
    );
  }

  if (auth.status !== 'authenticated') {
    // Bounce to home; the sign-in flow attaches when auth is wired (Phase 7).
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (!auth.isAdmin) {
    return (
      <section className="shell-page" role="alert">
        <h1>Not authorized</h1>
        <p className="shell-muted">This area is for administrators.</p>
      </section>
    );
  }

  return <>{children}</>;
}
