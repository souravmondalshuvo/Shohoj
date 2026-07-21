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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { useAuth } from '../providers/AuthProvider';
import { useSeatAlertSync } from '../providers/useSeatAlertSync';
import {
  parseWatches,
  removeWatch,
  serializeWatches,
  SEAT_WATCH_STORAGE_KEY,
  type WatchEntry,
} from '../../core/seatWatch';

const ROUTINE_STORAGE_KEY = 'shohoj_routine_picks_v1';
// Email-alert channel on/off, shared with the legacy Seats tab. Absent → armed.
const SEAT_ALERT_PREF_KEY = 'shohoj_seat_alerts_enabled';

function readAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(SEAT_ALERT_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

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
    const sectionsPicked = entries.filter(
      (v) => typeof v === 'number' && Number.isFinite(v),
    ).length;
    return { courses: entries.length, sectionsPicked };
  } catch {
    return { courses: 0, sectionsPicked: 0 };
  }
}

export function Component() {
  const auth = useAuth();
  const routine = useMemo(readRoutineSummary, []);
  const [watches, setWatches] = useState<WatchEntry[]>(() => {
    try {
      return parseWatches(localStorage.getItem(SEAT_WATCH_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const [alertsEnabled, setAlertsEnabled] = useState(readAlertsEnabled);
  const syncSeatAlerts = useSeatAlertSync();

  // Push the current watchlist + preference once the user is known, so signing
  // in retroactively arms alerts for sections already being watched. Signed-out
  // / offline → the sync is a no-op.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (auth.status === 'authenticated' && auth.uid && syncedFor.current !== auth.uid) {
      syncedFor.current = auth.uid;
      syncSeatAlerts(watches, alertsEnabled);
    }
  }, [auth.status, auth.uid, watches, alertsEnabled, syncSeatAlerts]);

  // Removing here writes back to the same key the Seats route watches, then
  // re-syncs so the cron Worker stops emailing for the dropped section.
  const unwatch = (sectionId: number) => {
    setWatches((prev) => {
      const next = removeWatch(prev, sectionId);
      try {
        localStorage.setItem(SEAT_WATCH_STORAGE_KEY, serializeWatches(next));
      } catch {
        // Storage off — the change just won't persist.
      }
      syncSeatAlerts(next, alertsEnabled);
      return next;
    });
  };

  const toggleAlerts = () => {
    setAlertsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SEAT_ALERT_PREF_KEY, next ? '1' : '0');
      } catch {
        // Storage off — the choice just won't persist.
      }
      syncSeatAlerts(watches, next);
      return next;
    });
  };

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
            Sign in with your BRACU G-Suite account to see your account hub — your saved routine,
            seat watchlist, and reviews all in one place.
          </p>
          <p className="shell-muted">
            Use the <strong>Sign in</strong> button in the top bar.
          </p>
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
        <section
          className="profile-card"
          data-testid="profile-routine-card"
          aria-labelledby="profile-routine-heading"
        >
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

        <section
          className="profile-card"
          data-testid="profile-watchlist-card"
          aria-labelledby="profile-watch-heading"
        >
          <h2 id="profile-watch-heading" className="profile-card-title">
            Seat watchlist
          </h2>
          <label className="profile-alert-toggle">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={toggleAlerts}
              data-testid="profile-alert-toggle"
            />
            Email me when a watched seat opens
          </label>
          <p className="profile-alert-note shell-muted" data-testid="profile-alert-note">
            {auth.email
              ? alertsEnabled
                ? `On — alerts go to ${auth.email}.`
                : 'Off — no emails will be sent.'
              : 'Sign in with the top-bar button to receive email alerts.'}
          </p>
          {watches.length === 0 ? (
            <p className="shell-muted" data-testid="profile-watchlist-empty">
              You&apos;re not watching any sections. Add them from{' '}
              <Link to="/seats">Seat Status</Link>.
            </p>
          ) : (
            <ul className="profile-watchlist" data-testid="profile-watchlist">
              {watches.map((w) => (
                <li className="profile-watch-item" key={w.sectionId}>
                  <span className="profile-watch-label">
                    <strong>{w.courseCode}</strong> · Section {w.sectionName}
                  </span>
                  <button
                    type="button"
                    className="profile-watch-remove"
                    onClick={() => unwatch(w.sectionId)}
                    aria-label={`Stop watching ${w.courseCode} section ${w.sectionName}`}
                    data-testid={`profile-unwatch-${w.sectionId}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="profile-card profile-card--soon" aria-labelledby="profile-soon-heading">
          <h2 id="profile-soon-heading" className="profile-card-title">
            Coming soon
          </h2>
          <p className="shell-muted">Your own submitted reviews move here in an upcoming update.</p>
        </section>
      </div>

      <p className="profile-signout-note shell-muted">
        To sign out, use the <strong>Sign out</strong> button in the top bar.
      </p>
    </section>
  );
}
