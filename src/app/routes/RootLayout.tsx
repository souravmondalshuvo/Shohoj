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
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { AppProviders } from '../AppProviders';
import { AuthControls } from '../AuthControls';
import { NotificationViewport } from '../NotificationViewport';
import { ShellTabs } from '../ShellTabs';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { CloudSyncProvider } from '../providers/CloudSyncProvider';
import { ModalProvider } from '../providers/ModalProvider';
import { RuntimeConfigProvider, useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { runtimeConfigFromGlobals } from '../../platform/configuration/runtimeConfig';
import { anonymousAuthSource, type AuthSource } from '../../platform/auth/authSnapshot';
import { AssistantLauncher } from '../../features/assistant/AssistantDrawer';
import { FacultyReviewsProvider } from '../../features/calculator/FacultyReviewsProvider';
import { createFirebaseAuthSource } from '../../platform/auth/firebaseAuthSource';

// Raw runtime config from the window._shohoj_* globals that /runtime-config.js
// sets before the module entry runs (#329). Read once at module scope — the
// generated config never changes within a page lifetime; missing/placeholder
// values validate to the offline capability set exactly as before.
const RAW_RUNTIME_CONFIG = typeof window !== 'undefined' ? runtimeConfigFromGlobals(window) : {};

declare global {
  interface Window {
    /** e2e seam: an injected auth source (e.g. an authenticated stand-in). */
    __shohojAuthSource?: AuthSource;
  }
}

/** The moderation-dashboard link, rendered only for admins.
 *
 * Legacy ships the anchor in the markup and firebase.js unhides it once the
 * custom claim resolves (index.html:145, updateAuthUI). Gating on the snapshot
 * is the same behaviour without the hidden-node dance — and it matters for
 * parity, since a signed-out capture must not show an Admin link.
 *
 * Admin stays the standalone build3.py admin.html page, not a shell route, so
 * this is a full-page link resolved against the deploy base. */
function AdminNavLink() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return (
    <a
      href={`${import.meta.env.BASE_URL}admin/`}
      className="magnetic"
      aria-label="Open admin dashboard"
      title="Moderation dashboard"
    >
      <svg
        className="admin-nav-badge"
        width="22"
        height="22"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="64" height="64" rx="14" fill="#f5b942" />
        <text
          x="50%"
          y="54%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontFamily="'Noto Sans Bengali','Hind Siliguri','SolaimanLipi',serif"
          fontSize="44"
          fontWeight="900"
          fill="#2a1c00"
        >
          স
        </text>
      </svg>{' '}
      Admin
    </a>
  );
}

// The route map moved to ShellTabs, which mirrors legacy's grouped tab bar:
// five top-level slots with the rest of the routes inside dropdown groups.
// Profile is reached from the account pill rather than a tab, as in legacy.

/** Light/dark theme toggle. Persists to `shohoj_theme` (the production key) and
 * flips `data-theme` on the root; a pre-paint script in index.html applies the
 * saved value with no flash. Default dark, matching the production app. */
function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark',
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('shohoj_theme', next);
    } catch {
      // storage off — the choice just won't persist across reloads
    }
    setTheme(next);
  };
  // Legacy markup (index.html:174): a track with a pill that slides on
  // [data-theme] rather than an emoji swap — style.css:251 translates
  // .toggle-pill by 28px in dark and 0 in light. The glyph never changes, so
  // rendering a different emoji per theme would both look wrong and shift the
  // nav's layout.
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span className="toggle-pill">🌙</span>
    </button>
  );
}

/** Builds the auth source from the validated config and renders the chrome. */
function ShellChrome() {
  const config = useRuntimeConfig();
  // The tab bar is hidden on the landing route, matching legacy's layout.
  const { pathname } = useLocation();

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
      {/* Legacy nav structure (index.html:134-177). css/style.css styles the bare
          `nav` element — fixed, 64px, masked — so the markup underneath it has
          to be legacy's, not the shell's former flat link list. The 19 routes
          live in <ShellTabs /> below, exactly as legacy puts them in .calc-tabs
          rather than the nav. */}
      <nav className="lg-surface">
        <NavLink to="/" className="nav-logo" aria-label="Shohoj home" end>
          <div className="nav-logo-mark">স</div>
          <span className="nav-logo-text">
            Shohoj <span>সহজ</span>
          </span>
        </NavLink>
        <div className="nav-right">
          <Link to="/#features" className="nav-link magnetic">
            Features
          </Link>
          <NavLink to="/calculator" className="nav-link magnetic">
            CGPA Calc
          </NavLink>
          <AdminNavLink />
          <AuthControls source={firebaseSource} />
          <ThemeToggle />
        </div>
      </nav>
      {/* Legacy shows the tab bar inside the calculator section, not on the
          landing view — the home page is hero then features. Mirrored here. */}
      {pathname !== '/' && <ShellTabs />}
      <main id="main-content" className="shell-main" tabIndex={-1}>
        <Outlet />
      </main>
      <NotificationViewport />
      {/* Shohoj Assistant (#435): renders only signed-in on a cloud shell. */}
      <AssistantLauncher workerUrl={config?.papersWorkerUrl} />
    </>
  );

  // e2e seam (the __shohoj* convention): an injected auth source stands in for a
  // signed-in user so authenticated-only routes (Profile) can be driven without a
  // real Firebase session. Only the AuthProvider reads it; the header's sign-in/out
  // controls keep using the real firebaseSource.
  const providerSource =
    (typeof window !== 'undefined' && window.__shohojAuthSource) ||
    firebaseSource ||
    anonymousAuthSource;

  return (
    <AuthProvider source={providerSource}>
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
