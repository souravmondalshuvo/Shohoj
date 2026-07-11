// src/app/routes/RootLayout.tsx
//
// Root layout for the React Router shell (Phase 3). Wraps every route in the
// shared provider stack (AppProviders = ErrorBoundary > Theme > Notification),
// renders primary navigation, and hosts the matched route via <Outlet/>.
// Accessibility baked in from the start: a skip link, a labelled nav, and a
// focusable <main>. This shell is built/served separately from the legacy
// build3.py page; it owns no live feature behavior yet.
//
// Auth (#331): on a cloud-capable shell the AuthProvider runs the Firebase-
// backed source (built inside the RuntimeConfigProvider from the VALIDATED
// config; the SDK chunk loads on first subscribe) and the header shows
// sign-in/out. Rejection and sign-in-failure events surface as the legacy
// toast copy through the notification system. Offline shells keep the
// anonymous source and render no auth UI at all.

import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { AppProviders } from '../AppProviders';
import { AuthControls } from '../AuthControls';
import { NotificationViewport } from '../NotificationViewport';
import { AuthProvider } from '../providers/AuthProvider';
import { CloudSyncProvider } from '../providers/CloudSyncProvider';
import { ModalProvider } from '../providers/ModalProvider';
import { RuntimeConfigProvider, useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { runtimeConfigFromGlobals } from '../../platform/configuration/runtimeConfig';
import { anonymousAuthSource } from '../../platform/auth/authSnapshot';
import { FacultyReviewsProvider } from '../../features/calculator/FacultyReviewsProvider';
import { createFirebaseAuthSource } from '../../platform/auth/firebaseAuthSource';

// Raw runtime config from the window._shohoj_* globals that /runtime-config.js
// sets before the module entry runs (#329). Read once at module scope — the
// generated config never changes within a page lifetime; missing/placeholder
// values validate to the offline capability set exactly as before.
const RAW_RUNTIME_CONFIG = typeof window !== 'undefined' ? runtimeConfigFromGlobals(window) : {};

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
}

// The target route map. Routes resolve to placeholders until each feature
// migrates (Phase 5/6); the nav is the full map from the start.
const NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/calculator', label: 'Calculator' },
  { to: '/transcript', label: 'Transcript' },
  { to: '/planner', label: 'Planner' },
  { to: '/degree-progress', label: 'Degree' },
  { to: '/routine', label: 'Routine' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/seats', label: 'Seats' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/campus', label: 'Campus' },
  { to: '/bus', label: 'Bus' },
  { to: '/lost-found', label: 'Lost & Found' },
  { to: '/papers', label: 'Papers' },
  { to: '/groups', label: 'Groups' },
  { to: '/feedback', label: 'Feedback' },
  { to: '/profile', label: 'Profile' },
  { to: '/admin', label: 'Admin' },
];

/** Builds the auth source from the validated config and renders the chrome. */
function ShellChrome() {
  const config = useRuntimeConfig();
  // Mobile nav: the link list collapses behind a toggle under the CSS breakpoint
  // (desktop shows the list and hides the toggle). Selecting a link closes it.
  const [navOpen, setNavOpen] = useState(false);

  // One source per page: the validated config is module-scope stable, so this
  // memo effectively runs once. Offline (null config) keeps anonymous.
  const firebaseSource = useMemo(
    () =>
      config
        ? createFirebaseAuthSource({
            config: config.firebase,
            recaptchaV3SiteKey: config.recaptchaV3SiteKey,
          })
        : null,
    [config],
  );

  const chrome = (
    <>
      <a className="shell-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="shell-header">
        <nav className="shell-nav" aria-label="Primary">
          <button
            type="button"
            className="shell-nav-toggle"
            aria-expanded={navOpen}
            aria-controls="shell-nav-list"
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
          <div
            id="shell-nav-list"
            className={navOpen ? 'shell-nav-list shell-nav-list--open' : 'shell-nav-list'}
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'shell-nav-link shell-nav-link--active' : 'shell-nav-link'
                }
                onClick={() => setNavOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <AuthControls source={firebaseSource} />
        </nav>
      </header>
      <main id="main-content" className="shell-main" tabIndex={-1}>
        <Outlet />
      </main>
      <NotificationViewport />
    </>
  );

  return (
    <AuthProvider source={firebaseSource ?? anonymousAuthSource}>
      <ModalProvider>
        {/* Live faculty chip scores (inert until a chip requests one; no repo
            when offline → chips stay '–'). */}
        <FacultyReviewsProvider>
          {/* Cloud sync runs only on a configured shell; offline keeps chrome bare. */}
          {config ? <CloudSyncProvider config={config}>{chrome}</CloudSyncProvider> : chrome}
        </FacultyReviewsProvider>
      </ModalProvider>
    </AuthProvider>
  );
}

export function RootLayout() {
  return (
    <AppProviders label="App shell">
      <RuntimeConfigProvider rawConfig={RAW_RUNTIME_CONFIG}>
        <ShellChrome />
      </RuntimeConfigProvider>
    </AppProviders>
  );
}

export default RootLayout;
