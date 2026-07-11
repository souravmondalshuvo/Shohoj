// campus/main.tsx
//
// Entry for the standalone campus-map page (#383), built by
// vite.campus.config.js into dist-campus/ and deployed at /campus/ next to the
// legacy bundle. It mounts the shell's CampusRoute unchanged inside a minimal
// one-route data router: the route only touches the URL through
// useSearchParams (?room= deep links), so a catch-all path works at any mount
// point — the Pages site lives under /Shohoj/, so no basename is assumed.
// Retired at the Phase 12/13 cutover, when the shell serves /campus itself.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { Component as CampusMap } from '../src/app/routes/CampusRoute';

const router = createBrowserRouter([{ path: '*', Component: CampusMap }]);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
