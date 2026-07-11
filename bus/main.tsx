// bus/main.tsx
//
// Entry for the standalone bus-timetable page (#372), built by
// vite.pages.config.js into dist-pages/bus/ and deployed at /bus/ next to the
// legacy bundle. Mounts the shell's BusRoute unchanged inside a one-route
// router: the route only touches the URL through useSearchParams (?route=
// deep links), so a catch-all path works at any mount point. Retired at the
// shell cutover, when the shell serves /bus itself.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { Component as BusTimetable } from '../src/app/routes/BusRoute';

const router = createBrowserRouter([{ path: '*', Component: BusTimetable }]);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
