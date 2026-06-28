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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('../routes/HomeRoute') },
      { path: 'calculator', lazy: () => import('../routes/CalculatorRoute') },
      { path: '*', lazy: () => import('../routes/NotFoundRoute') },
    ],
  },
]);
