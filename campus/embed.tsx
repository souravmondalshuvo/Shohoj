// campus/embed.tsx
//
// The Campus Map as something another page can mount, built by
// vite.pages.config.js to the stable address campus/embed.js. The legacy site
// imports it on demand into its Campus Map tab (js/ui/campusMapTab.js), so the
// map is used inside that page — under its header and tab bar, styled by
// css/style.css — where campus/main.tsx is a page of its own.
//
// It mounts the same two routes main.tsx does. The differences are the ones a
// host page forces:
//
//   - The host says which campus. It has the session; this module has none.
//   - The router is in memory. The host owns the address bar (the legacy page
//     keeps its tab in the hash), so the map's ?room= / ?floor= state must not
//     be written there. A deep link is handed in once, as `search`.
//   - NSU's section snapshot is addressed from the host's directory, which is
//     the site root, not one level below it.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { Component as BracuCampus } from '../src/app/routes/CampusRoute';
import { NsuCampus } from '../src/app/routes/CampusRouteNsu';

export interface CampusMapOptions {
  /** Campus id from the host's session. Anything but `nsu` is BRAC University. */
  campus?: string;
  /** A deep link to open on, as a query string: `?room=09G-31T`. */
  search?: string;
}

function NsuCampusAtSiteRoot() {
  return <NsuCampus siteRoot="./" />;
}

/**
 * Mount the Campus Map into `container`. Returns the function that takes it
 * down again, which the host must call before mounting another campus's map
 * into the same node.
 */
export function mountCampusMap(container: HTMLElement, options: CampusMapOptions = {}): () => void {
  const search = options.search?.startsWith('?') ? options.search : '';
  const router = createMemoryRouter(
    [{ path: '*', Component: options.campus === 'nsu' ? NsuCampusAtSiteRoot : BracuCampus }],
    { initialEntries: [`/${search}`] },
  );
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  return () => {
    root.unmount();
    router.dispose();
  };
}
