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
import { ShellBackdrop } from '../ShellBackdrop';
import { CalculatorProvider } from '../providers/CalculatorProvider';
import { ShellTabs } from '../ShellTabs';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { SignInPortal } from '../SignInPortal';
import { CloudSyncProvider } from '../providers/CloudSyncProvider';
import { ModalProvider } from '../providers/ModalProvider';
import { RuntimeConfigProvider, useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { runtimeConfigFromGlobals } from '../../platform/configuration/runtimeConfig';
import { anonymousAuthSource, type AuthSource } from '../../platform/auth/authSnapshot';
import { AssistantLauncher } from '../../features/assistant/AssistantDrawer';
import { FacultyReviewsProvider } from '../../features/calculator/FacultyReviewsProvider';
import {
  createFirebaseAuthSource,
  type FirebaseAuthSource,
} from '../../platform/auth/firebaseAuthSource';

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
 * this is a full-page link resolved against the deploy base.
 *
 * The id and the `is-admin` class are load bearing, not leftovers from the
 * legacy markup: css/style.css:5334 styles this link by ID ONLY — the amber
 * pill, its border, colour and font all hang off `#adminNavBtn`, and the base
 * rule is `display: none` with `#adminNavBtn.is-admin` restoring
 * `inline-flex`. Rendering the anchor with just `magnetic` therefore produced a
 * default browser link (blue, underlined) in the nav; dropping the class while
 * keeping the id would hide it outright. Legacy toggles `.is-admin` at runtime
 * because its anchor is always in the DOM — the shell mounts the node only for
 * admins, so the class is unconditional here. */
function AdminNavLink() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return (
    <a
      id="adminNavBtn"
      href={`${import.meta.env.BASE_URL}admin/`}
      className="magnetic is-admin"
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
  // Legacy markup (index.html:174): a track whose pill slides on [data-theme]
  // (style.css:251 translates .toggle-pill 28px in dark, 0 in light) AND swaps
  // the glyph — dark shows 🌙, light shows ☀️ (js/main.js:267). Both are needed
  // for parity: the glyph alone was wrong before, which the mobile nav capture
  // caught once the pill stopped dominating the diff budget.
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span className="toggle-pill">{theme === 'dark' ? '🌙' : '☀️'}</span>
    </button>
  );
}

/** The glass surface every routed feature sits on.
 *
 * Legacy does NOT give each feature its own card. It wraps the whole tool in a
 * single `.calc-wrapper.lg-surface` — header, CGPA display, tab bar and all ten
 * `.calc-tab-panel` divs inside one panel (index.html:268) — and the panels
 * themselves carry no styling at all. The shell had inverted that: a
 * `.shell-page` glass card per route at four different widths (720/760/820/860,
 * none of them legacy's 839px), which is why route interiors read as a
 * different product even where the feature was fully ported.
 *
 * `<section>` supplies the width (style.css:366, 900px centred), matching the
 * `<section id="calculator">` legacy nests this in, and `.lg-shine`/`.lg-bloom`
 * are the liquid-glass layers the surface expects as children.
 *
 * Home is deliberately NOT wrapped: its hero is full-bleed and its markup is
 * already pixel-matched to legacy by the visual harness. Wrapping it would
 * constrain the hero and break the one page that is currently at parity. */
function ShellSurface({ children }: { readonly children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/') return <>{children}</>;
  return (
    <section id="calculator">
      <div className="calc-wrapper lg-surface">
        <div className="lg-shine" />
        <div className="lg-bloom" />
        {children}
      </div>
    </section>
  );
}

/**
 * The campus gate.
 *
 * Signing in is what resolves a student to a campus, and the campus decides the
 * grading scale, the catalog and which features exist — so before we know who
 * someone is there is no correct version of the app to render. Showing the
 * calculator anyway would mean applying one university's grading rules to
 * another university's transcript, which produces a confidently wrong CGPA.
 *
 * This is a correctness gate, not a security one: Firestore rules remain the
 * authorization boundary, and hidden UI has never been authorization.
 *
 * `loading` renders nothing rather than the portal. Flashing a sign-in page at
 * a student who is already signed in reads as being logged out, and a beat of
 * blank is the lesser evil.
 */
function GatedMain({ source }: { readonly source: FirebaseAuthSource | null }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const authed = status === 'authenticated';

  // '/' is exempt. It is the pitch, not the product: nothing on it depends on
  // knowing a campus, it is the page people share and search engines read, and
  // meeting a stranger with a demand for their university account reads like a
  // phishing page. A signed-out visitor gets the hero AND the portal; every
  // route that actually applies grading rules stays gated.
  //
  // Order is load bearing: the portal renders AFTER the outlet. Putting it
  // first pushes .hero and #features down and breaks two of the e2e-visual
  // parity captures (desktop features, both themes) — measured, not guessed.
  // Rendering it last leaves those elements exactly where the baselines expect.
  // The prominent signed-out affordances are the nav's Sign in button and the
  // hero's own CTAs, which lead into gated routes anyway.
  const isLanding = pathname === '/';

  return (
    <>
      {/* Tabs are hidden while signed out: nineteen routes that all resolve to
          the same sign-in page is worse than no tabs at all. */}
      {authed ? <ShellTabs /> : null}
      {/* `<main id="main-content">` stays mounted in every state — it is the
          skip link's target, and an anchor pointing at nothing is an a11y bug
          that only appears when signed out. */}
      {/* `.calc-body` is legacy's panel inset, and on '/' legacy has no panel:
          .hero and #features are full-bleed top-level elements. Carrying the
          class here regardless made the hero render 1216px against a 1280px
          baseline (366 against 390 on mobile) — every landing parity failure
          traced to this one class. #features only showed it on mobile because
          the global `section` rule caps it at 900px, which already sits inside
          the inset on desktop.

          The portal is the exception: `.shell-page` zeroes its own padding, so
          on '/' it would meet the viewport edge. It takes the inset itself
          there rather than inheriting it, which keeps one definition of the
          padding — legacy's, with all its breakpoints — instead of a second
          copy under a landing-only selector. */}
      <main
        id="main-content"
        className={isLanding ? 'shell-main' : 'shell-main calc-body'}
        tabIndex={-1}
      >
        {status === 'loading' ? null : (
          <>
            {authed || isLanding ? <Outlet /> : null}
            {authed ? null : isLanding ? (
              <div className="calc-body">
                <SignInPortal source={source} />
              </div>
            ) : (
              <SignInPortal source={source} />
            )}
          </>
        )}
      </main>
    </>
  );
}

/** Builds the auth source from the validated config and renders the chrome. */
function ShellChrome() {
  const config = useRuntimeConfig();
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
      {/* Ambient layer: dot matrix, orbs, custom cursor, scroll progress. Also
          hosts the reveal observers, which must re-scan per route. */}
      <ShellBackdrop />
      {/* Legacy nav structure (index.html:134-177). css/style.css styles the bare
          `nav` element — fixed, 64px, masked — so the markup underneath it has
          to be legacy's, not the shell's former flat link list. The 19 routes
          live in <ShellTabs /> below, exactly as legacy puts them in .calc-tabs
          rather than the nav. */}
      {/* aria-label names the landmark: legacy omits it, but it costs no pixels
          and the shell's a11y guards assert a labelled Primary navigation. */}
      <nav className="lg-surface" aria-label="Primary">
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
      {/* Legacy hides its tab bar on the landing view because it is a single
          page: the tabs live inside the calculator section further down. The
          shell is routed, so the bar IS its primary navigation and has to be
          present on every route — hiding it on '/' left the landing page with
          no way to reach any route. Rendering it here does not affect parity:
          e2e-visual captures nav, .hero and #features as individual elements,
          so a sibling between them changes none of their pixels. */}
      {/* `.calc-body` is legacy's padding box INSIDE each panel (style.css:397,
          1.5rem/2rem, with a variant at every breakpoint). <main> occupies the
          same slot — panel content — so taking the class gives the shell
          legacy's exact inset responsively, instead of re-deriving one number
          per route. See GatedMain for why the tabs and outlet are conditional. */}
      {/* One calculator state for the shell. It wraps ShellSurface rather than
          sitting inside it because `.calc-header` — the setup wizard and the
          live CGPA — renders above the tabs and reads the same state the routes
          below mutate, exactly as legacy's single academic state does. */}
      <CalculatorProvider>
        <ShellSurface>
          <GatedMain source={firebaseSource} />
        </ShellSurface>
      </CalculatorProvider>
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
