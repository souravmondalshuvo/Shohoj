// campus/main.tsx
//
// Entry for the standalone campus-map page (#383), built by
// vite.campus.config.js into dist-campus/ and deployed at /campus/ next to the
// legacy bundle. It mounts the shell's CampusRoute unchanged — or, for
// ?campus=nsu, North South University's map — inside a minimal one-route data
// router: the route only touches the URL through
// useSearchParams (?room= deep links), so a catch-all path works at any mount
// point — the Pages site lives under /Shohoj/, so no basename is assumed.
// Retired at the Phase 12/13 cutover, when the shell serves /campus itself.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useSearchParams } from 'react-router';

import { Component as BracuCampus } from '../src/app/routes/CampusRoute';
import { NsuCampus } from '../src/app/routes/CampusRouteNsu';

/**
 * Which university's campus to show.
 *
 * This page has no session, so it cannot know the reader's campus. The legacy
 * site knows, and links an NSU student to /campus/?campus=nsu. Anything else,
 * including no parameter at all, is BRAC University's tower, as this page
 * always was. The choice is made here and not in CampusRoute because the shell
 * mounts that route too, and the shell does not serve NSU's map.
 */
function CampusMap() {
  const [searchParams] = useSearchParams();
  return searchParams.get('campus') === 'nsu' ? <NsuCampus /> : <BracuCampus />;
}

const router = createBrowserRouter([{ path: '*', Component: CampusMap }]);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
