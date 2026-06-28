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

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
}

// Mirrors the target route map; routes are added as features migrate.
const NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/calculator', label: 'Calculator' },
];

export function RootLayout() {
  return (
    <AppProviders label="App shell">
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
    </AppProviders>
  );
}

export default RootLayout;
