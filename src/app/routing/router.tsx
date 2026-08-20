// src/app/routing/router.tsx
//
// React Router shell route table (Phase 3). SPA/data-router mode — no
// @react-router/dev framework plugin yet; server loaders/actions are introduced
// later, per route, only where they earn it. Child routes are `lazy` so each
// code-splits into its own chunk. The root route carries the RouteError element
// so any child route error renders the safe fallback.

import { type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';

import { RootLayout } from '../routes/RootLayout';
import { RouteError } from '../routes/RouteError';
import { RequireFeature } from './RequireFeature';
import type { FeatureId } from '../../core/university';

/** The shape every route module in ../routes exports. */
interface RouteModule {
  readonly Component: ComponentType;
}

/**
 * A route that only exists at campuses whose profile enables `feature`.
 *
 * The guard wraps the lazy module rather than sitting inside each route
 * component, so a route cannot be added to the table and quietly skip the
 * check: the feature id is part of how the route is declared.
 *
 * Note this does not avoid the fetch — `load()` is awaited before the guard
 * renders, so a disabled route still pulls its chunk before saying no. Gating
 * before the import would save it, at the cost of moving the feature check
 * away from the route declaration; the bytes are not worth that trade while
 * the tab bar already hides these routes.
 */
function campusRoute(feature: FeatureId, load: () => Promise<RouteModule>) {
  return async (): Promise<RouteModule> => {
    const mod = await load();
    const Inner = mod.Component;
    // Resolved once per lazy load, not per render, so the identity is stable
    // and React does not remount the route on every navigation.
    const Gated = () => (
      <RequireFeature feature={feature}>
        <Inner />
      </RequireFeature>
    );
    Gated.displayName = `RequireFeature(${feature})`;
    return { ...mod, Component: Gated };
  };
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, lazy: () => import('../routes/HomeRoute') },
        {
          path: 'calculator',
          lazy: campusRoute('calculator', () => import('../routes/CalculatorRoute')),
        },
        // Transcript view (#445) — shares the calculator's persisted state.
        {
          path: 'transcript',
          lazy: campusRoute('transcript', () => import('../routes/TranscriptRoute')),
        },
        // Degree tracker (#450) — read-only view over the same shared state.
        {
          path: 'degree-progress',
          lazy: campusRoute('degree', () => import('../routes/DegreeRoute')),
        },
        { path: 'planner', lazy: campusRoute('planner', () => import('../routes/PlannerRoute')) },
        { path: 'reviews', lazy: campusRoute('reviews', () => import('../routes/ReviewsRoute')) },
        // Course Difficulty Map (#453 parity port) — aggregates review difficulty
        // + workload per course over the same recent-reviews feed as /reviews.
        {
          path: 'difficulty',
          lazy: campusRoute('difficulty', () => import('../routes/DifficultyRoute')),
        },
        // Campus map (#370): Three.js stays out of the entry chunk via `lazy`.
        { path: 'campus', lazy: campusRoute('campus', () => import('../routes/CampusRoute')) },
        // Weekly routine builder (#397) over the live CONNECT feed.
        { path: 'routine', lazy: campusRoute('routine', () => import('../routes/RoutineRoute')) },
        // Seat status browser (#397) over the live CONNECT feed.
        { path: 'seats', lazy: campusRoute('seats', () => import('../routes/SeatsRoute')) },
        // Free-rooms finder (#434) over the live CONNECT feed.
        { path: 'rooms', lazy: campusRoute('rooms', () => import('../routes/RoomsRoute')) },
        // Bus timetable (#372) — static transcribed data, no backend.
        { path: 'bus', lazy: campusRoute('bus', () => import('../routes/BusRoute')) },
        {
          path: 'lost-found',
          lazy: campusRoute('lostFound', () => import('../routes/LostFoundRoute')),
        },
        // Cafeteria guide (#373) — static outlets, hours + open-now, no menus.
        {
          path: 'cafeteria',
          lazy: campusRoute('cafeteria', () => import('../routes/CafeteriaRoute')),
        },
        // Account hub (#397 / #196) — auth-gated; signed-out shows a prompt.
        { path: 'profile', lazy: campusRoute('profile', () => import('../routes/ProfileRoute')) },
        // Feedback submit + board (#437) — auth-gated; signed-out shows a prompt.
        {
          path: 'feedback',
          lazy: campusRoute('feedback', () => import('../routes/FeedbackRoute')),
        },
        // Past-papers library (#440) — auth-gated browse/upload over the Worker.
        { path: 'papers', lazy: campusRoute('papers', () => import('../routes/PapersRoute')) },
        // Study Group Finder (#443) — auth-gated board over Firestore.
        { path: 'groups', lazy: campusRoute('groups', () => import('../routes/GroupsRoute')) },
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
