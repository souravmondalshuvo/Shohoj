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

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, lazy: () => import('../routes/HomeRoute') },
        { path: 'calculator', lazy: () => import('../routes/CalculatorRoute') },
        // Transcript view (#445) — shares the calculator's persisted state.
        { path: 'transcript', lazy: () => import('../routes/TranscriptRoute') },
        // Degree tracker (#450) — read-only view over the same shared state.
        { path: 'degree-progress', lazy: () => import('../routes/DegreeRoute') },
        { path: 'planner', lazy: () => import('../routes/PlannerRoute') },
        { path: 'reviews', lazy: () => import('../routes/ReviewsRoute') },
        // Course Difficulty Map (#453 parity port) — aggregates review difficulty
        // + workload per course over the same recent-reviews feed as /reviews.
        { path: 'difficulty', lazy: () => import('../routes/DifficultyRoute') },
        // Campus map (#370): Three.js stays out of the entry chunk via `lazy`.
        { path: 'campus', lazy: () => import('../routes/CampusRoute') },
        // Weekly routine builder (#397) over the live CONNECT feed.
        { path: 'routine', lazy: () => import('../routes/RoutineRoute') },
        // Seat status browser (#397) over the live CONNECT feed.
        { path: 'seats', lazy: () => import('../routes/SeatsRoute') },
        // Free-rooms finder (#434) over the live CONNECT feed.
        { path: 'rooms', lazy: () => import('../routes/RoomsRoute') },
        // Bus timetable (#372) — static transcribed data, no backend.
        { path: 'bus', lazy: () => import('../routes/BusRoute') },
        { path: 'lost-found', lazy: () => import('../routes/LostFoundRoute') },
        // Cafeteria guide (#373) — static outlets, hours + open-now, no menus.
        { path: 'cafeteria', lazy: () => import('../routes/CafeteriaRoute') },
        // Account hub (#397 / #196) — auth-gated; signed-out shows a prompt.
        { path: 'profile', lazy: () => import('../routes/ProfileRoute') },
        // Feedback submit + board (#437) — auth-gated; signed-out shows a prompt.
        { path: 'feedback', lazy: () => import('../routes/FeedbackRoute') },
        // Past-papers library (#440) — auth-gated browse/upload over the Worker.
        { path: 'papers', lazy: () => import('../routes/PapersRoute') },
        // Study Group Finder (#443) — auth-gated board over Firestore.
        { path: 'groups', lazy: () => import('../routes/GroupsRoute') },
        // Admin is the standalone build3.py admin.html page (linked from the nav as
        // a full-page link), not a shell route — no in-shell port yet. The static
        // page is served at <base>/admin/; the 404 SPA fallback must exclude it.
        { path: '*', lazy: () => import('../routes/NotFoundRoute') },
      ],
    },
  ],
  {
    // Follow the Vite base so the shell also works from a subpath deploy — the
    // /app/ beta on GitHub Pages builds with SHELL_BASE=/Shohoj/app/ (#449).
    // BASE_URL is '/' in dev/e2e, which leaves routing exactly as before.
    basename: import.meta.env.BASE_URL,
  },
);
