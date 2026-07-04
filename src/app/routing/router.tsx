// src/app/routing/router.tsx
//
// React Router shell route table (Phase 3). SPA/data-router mode — no
// @react-router/dev framework plugin yet; server loaders/actions are introduced
// later, per route, only where they earn it. Child routes are `lazy` so each
// code-splits into its own chunk. The root route carries the RouteError element
// so any child route error renders the safe fallback.

import { createBrowserRouter } from 'react-router';

import { RootLayout } from '../routes/RootLayout';
import { RouteError } from '../routes/RouteError';
import { RoutePlaceholder } from '../routes/RoutePlaceholder';
import { AdminRoute } from '../routes/AdminRoute';
import { RequireAdmin } from './RequireAdmin';

// Routes whose feature hasn't migrated yet share the placeholder element; real
// routes (Home, Calculator) lazy-load. Each swaps to its own lazy module as it
// migrates in Phase 5/6.
const PLACEHOLDERS: ReadonlyArray<readonly [string, string]> = [
  ['transcript', 'Transcript'],
  ['degree-progress', 'Degree progress'],
  ['routine', 'Routine'],
  ['rooms', 'Free rooms'],
  ['seats', 'Seat status'],
  ['reviews', 'Reviews'],
  ['papers', 'Past papers'],
  ['groups', 'Study groups'],
  ['feedback', 'Feedback'],
  ['profile', 'Profile'],
];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('../routes/HomeRoute') },
      { path: 'calculator', lazy: () => import('../routes/CalculatorRoute') },
      { path: 'planner', lazy: () => import('../routes/PlannerRoute') },
      ...PLACEHOLDERS.map(([path, title]) => ({
        path,
        element: <RoutePlaceholder title={title} />,
      })),
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <AdminRoute />
          </RequireAdmin>
        ),
      },
      { path: '*', lazy: () => import('../routes/NotFoundRoute') },
    ],
  },
]);
