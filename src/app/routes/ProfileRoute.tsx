// src/app/routes/ProfileRoute.tsx
//
// Account hub (Phase 6 shell migration of the legacy profileTab.js, #397 /
// #196). This first slice ports the auth gate, the account header, and the
// saved-routine summary (read from the migrated Routine route's storage). The
// seat watchlist + email-alert toggle and the student's own reviews are
// deferred follow-up slices — the watchlist depends on the seat-watch feature
// landing on the Seats route first.
//
// Auth-gated: signed-out students see a sign-in prompt (the actual sign-in
// control lives in the header). Signed-in students see their hub.

import { useMemo } from 'react';
import { Link } from 'react-router';

import { useAuth } from '../providers/AuthProvider';

const ROUTINE_STORAGE_KEY = 'shohoj_routine_picks_v1';

interface RoutineSummary {
  courses: number;
  sectionsPicked: number;
}

// Count the saved routine straight from the Routine route's persisted picks —
// no feed needed, and a missing/foreign value just reads as an empty routine.
function readRoutineSummary(): RoutineSummary {
  try {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) return { courses: 0, sectionsPicked: 0 };
    const parsed = JSON.parse(raw) as unknown;
    const picks = (parsed as { picks?: unknown })?.picks;
    if (!picks || typeof picks !== 'object') return { courses: 0, sectionsPicked: 0 };
    const entries = Object.values(picks as Record<string, unknown>);
    const sectionsPicked = entries.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
    return { courses: entries.length, sectionsPicked };
  } catch {
    return { courses: 0, sectionsPicked: 0 };
  }
}

export function Component() {
  const auth = useAuth();
  const routine = useMemo(readRoutineSummary, []);

  if (auth.status === 'loading') {
    return (
      <section className="shell-page profile-page" data-testid="profile-page">
        <h1>Profile</h1>
        <p className="shell-muted" data-testid="profile-loading">
          Checking your sign-in…
        </p>
      </section>
    );
  }

  if (auth.status !== 'authenticated') {
    return (
      <section className="shell-page profile-page" data-testid="profile-page">
        <h1>Profile</h1>
        <div className="profile-signedout" data-testid="profile-signedout">
          <p>
            Sign in with your BRACU G-Suite account to see your account hub — your
            saved routine, seat watchlist, and reviews all in one place.
          </p>
          <p className="shell-muted">Use the <strong>Sign in</strong> button in the top bar.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="shell-page profile-page" data-testid="profile-page">
      <h1>Profile</h1>

      <div className="profile-account" data-testid="profile-account">
        <div className="profile-avatar" aria-hidden="true">
          {(auth.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="profile-account-detail">
          <span className="profile-email" data-testid="profile-email">
            {auth.email ?? 'Signed in'}
          </span>
          <span className="profile-account-sub shell-muted">Signed in with BRACU G-Suite</span>
        </div>
      </div>

      <div className="profile-cards">
        <section className="profile-card" data-testid="profile-routine-card" aria-labelledby="profile-routine-heading">
          <h2 id="profile-routine-heading" className="profile-card-title">
            Saved routine
          </h2>
          {routine.courses === 0 ? (
            <p className="shell-muted" data-testid="profile-routine-empty">
              No saved routine yet. <Link to="/routine">Build one</Link> and it appears here.
            </p>
          ) : (
            <p data-testid="profile-routine-summary">
              {routine.courses} course{routine.courses === 1 ? '' : 's'} added ·{' '}
              {routine.sectionsPicked} section{routine.sectionsPicked === 1 ? '' : 's'} picked.{' '}
              <Link to="/routine">Open routine</Link>
            </p>
          )}
        </section>

        <section className="profile-card profile-card--soon" aria-labelledby="profile-soon-heading">
          <h2 id="profile-soon-heading" className="profile-card-title">
            Coming soon
          </h2>
          <p className="shell-muted">
            Your seat watchlist, email-alert toggle, and your own reviews move here in
            an upcoming update.
          </p>
        </section>
      </div>

      <p className="profile-signout-note shell-muted">
        To sign out, use the <strong>Sign out</strong> button in the top bar.
      </p>
    </section>
  );
}
