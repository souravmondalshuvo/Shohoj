// lost-found/main.tsx
//
// Entry for the standalone Lost & Found page (#390), built by
// vite.pages.config.js into dist-pages/lost-found/ and deployed at
// /lost-found/ next to the legacy bundle. Unlike the campus/bus pages this
// route needs the shell's cloud stack, so the entry recreates RootLayout's
// provider composition (AppProviders → RuntimeConfigProvider → AuthProvider →
// ModalProvider) around the unchanged LostFoundRoute, with the shared
// AuthControls in a minimal top bar.
//
// Router notes: the basename is derived from the boot pathname so the route's
// internal absolute links stay under the page's mount point (the Pages site
// lives under /Shohoj/). The route's "<room> on the campus map" links point at
// the shell's /campus route; a tiny redirect shim forwards them to the main
// site's Campus Map tab instead. Retired at the shell cutover.

import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { AppProviders } from '../src/app/AppProviders';
import { AuthControls } from '../src/app/AuthControls';
import { NotificationViewport } from '../src/app/NotificationViewport';
import { AuthProvider } from '../src/app/providers/AuthProvider';
import { ModalProvider } from '../src/app/providers/ModalProvider';
import {
  RuntimeConfigProvider,
  useRuntimeConfig,
} from '../src/app/providers/RuntimeConfigProvider';
import { Component as LostFoundBoard } from '../src/app/routes/LostFoundRoute';
import { anonymousAuthSource } from '../src/platform/auth/authSnapshot';
import { createFirebaseAuthSource } from '../src/platform/auth/firebaseAuthSource';
import { runtimeConfigFromGlobals } from '../src/platform/configuration/runtimeConfig';

// e.g. "/Shohoj/lost-found" on Pages, "/lost-found" under vite preview.
const basename = window.location.pathname.replace(/\/+$/, '');
// The directory the page is mounted in, where the main site lives: "/Shohoj/".
// Taken from the mount point, not from the URL being redirected, so a
// trailing slash on that URL cannot move it.
const siteRoot = basename.replace(/[^/]*$/, '');

/**
 * Forwards the route's internal /campus?room= links to the main site's Campus
 * Map tab, which opens on the room named in its hash (js/ui/campusMapTab.js).
 */
function CampusRedirect() {
  useEffect(() => {
    // Every room code on the board is a BRAC University tower room
    // (parseRoomCode in src/core/lostFound.ts), so the link names that campus:
    // a reader whose own campus is another would otherwise get their map,
    // without the room. The standalone /campus/ page still serves bookmarks.
    const room = new URLSearchParams(window.location.search).get('room');
    const query = new URLSearchParams({ ...(room ? { room } : {}), campus: 'bracu' });
    window.location.replace(`${siteRoot}#calculator/campus?${query.toString()}`);
  }, []);
  return null;
}

const router = createBrowserRouter(
  [
    { path: 'campus', Component: CampusRedirect },
    { path: '*', Component: LostFoundBoard },
  ],
  { basename },
);

function StandalonePage() {
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

  return (
    <AuthProvider source={firebaseSource ?? anonymousAuthSource}>
      <ModalProvider>
        <header className="lf-topbar">
          <a className="pg-brand" href="../" aria-label="Back to Shohoj">
            <span className="pg-brand-mark" aria-hidden="true">স</span>
            <span className="pg-brand-text">Shohoj <span>সহজ</span></span>
          </a>
          <AuthControls source={firebaseSource} />
        </header>
        <main>
          <RouterProvider router={router} />
        </main>
        <NotificationViewport />
      </ModalProvider>
    </AuthProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AppProviders label="Lost & Found">
        <RuntimeConfigProvider rawConfig={runtimeConfigFromGlobals(window)}>
          <StandalonePage />
        </RuntimeConfigProvider>
      </AppProviders>
    </StrictMode>,
  );
}
