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
// the shell's /campus route; a tiny redirect shim forwards them to the
// standalone /campus/ page instead. Retired at the shell cutover.

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

/** Forwards the route's internal /campus?room= links to the standalone page. */
function CampusRedirect() {
  useEffect(() => {
    // Current URL is <mount>/campus?room=…; ../campus/ resolves to the
    // sibling standalone campus page with the query preserved.
    window.location.replace(`../campus/${window.location.search}`);
  }, []);
  return null;
}

// e.g. "/Shohoj/lost-found" on Pages, "/lost-found" under vite preview.
const basename = window.location.pathname.replace(/\/+$/, '');

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
          <a href="../">← Shohoj</a>
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
