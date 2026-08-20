// src/app/routing/RequireFeature.tsx
//
// Client-side route guard for campus-scoped routes.
//
// Not every feature exists at every university. Seats, Routine, Free Rooms and
// the campus map are all projections of BRACU's CONNECT feed; Bus and Cafeteria
// are hand-collected Merul Badda data; Lost & Found is keyed to BRACU's room
// codes. A campus without that data does not get a degraded version of those
// screens, it gets no screen — an empty seat map is worse than an honest
// absence, because it reads as "no seats left" rather than "not here".
//
// Like RequireAdmin, this gates UI only. The authorization boundary is
// firestore.rules, which scopes documents by the campus derived from the
// verified email domain. A student who defeats this guard sees an empty shell,
// not another university's data.

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth, useUniversity } from '../providers/AuthProvider';
import { hasFeature, type FeatureId } from '../../core/university';

export interface RequireFeatureProps {
  readonly feature: FeatureId;
  readonly children: ReactNode;
}

export function RequireFeature({ feature, children }: RequireFeatureProps) {
  const auth = useAuth();
  const university = useUniversity();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <section className="shell-page" aria-busy="true">
        <p className="shell-muted">Checking access…</p>
      </section>
    );
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // Admins carry no campus of their own — `evaluateCampusAccess` admits them on
  // the claim alone — so gating them on a feature list they have no entry in
  // would lock them out of every screen they moderate. Same exemption the
  // Firestore rules make.
  if (auth.isAdmin && university === null) return <>{children}</>;

  // Authenticated, not an admin, and still no campus: the address passed the
  // domain check at sign-in but resolves to nothing now, which means the
  // registry changed under a live session. Say so plainly rather than guessing
  // a campus.
  if (university === null) {
    return (
      <section className="shell-page" role="alert">
        <h1>Campus not recognised</h1>
        <p className="shell-muted">
          We couldn&rsquo;t work out which university this account belongs to. Signing out and back
          in usually fixes it.
        </p>
      </section>
    );
  }

  if (!hasFeature(university, feature)) {
    return (
      <section className="shell-page" role="alert" data-testid="feature-unavailable">
        <h1>Not available at {university.shortName}</h1>
        <p className="shell-muted">
          This part of Shohoj runs on data we don&rsquo;t have for {university.name} yet. Everything
          else in your tab bar works as normal.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}

export default RequireFeature;
