// src/app/routes/RootLayout.tsx
//
// Root layout for the React Router shell (Phase 3). Wraps every route in the
// shared provider stack (AppProviders = ErrorBoundary > Theme > Notification),
// renders primary navigation, and hosts the matched route via <Outlet/>.
// Accessibility baked in from the start: a skip link, a labelled nav, and a
// focusable <main>. This shell is built/served separately from the legacy
// build3.py page; it owns no live feature behavior yet.

import { NavLink, Outlet } from 'react-router';

import { AppProviders } from '../AppProviders';
import { NotificationViewport } from '../NotificationViewport';
import { AuthProvider } from '../providers/AuthProvider';
import { ModalProvider } from '../providers/ModalProvider';
import { RuntimeConfigProvider } from '../providers/RuntimeConfigProvider';

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
  { to: '/papers', label: 'Papers' },
  { to: '/groups', label: 'Groups' },
  { to: '/feedback', label: 'Feedback' },
  { to: '/profile', label: 'Profile' },
  { to: '/admin', label: 'Admin' },
];

export function RootLayout() {
  return (
    <AppProviders label="App shell">
      <RuntimeConfigProvider>
        <AuthProvider>
          <ModalProvider>
            <a className="shell-skip-link" href="#main-content">
              Skip to content
            </a>
            <header className="shell-header">
          <nav className="shell-nav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'shell-nav-link shell-nav-link--active' : 'shell-nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
            <main id="main-content" className="shell-main" tabIndex={-1}>
              <Outlet />
            </main>
            <NotificationViewport />
          </ModalProvider>
        </AuthProvider>
      </RuntimeConfigProvider>
    </AppProviders>
  );
}

export default RootLayout;
