// src/app/routes/RouteError.tsx
//
// Route-level error element for the React Router shell (Phase 3). Catches errors
// thrown by a route's loader/action/render and shows a safe fallback — raw SDK /
// router internals never reach users (codes/messages stay for logs). Pairs with
// the provider-level <ErrorBoundary> in AppProviders: this handles route errors,
// that handles crashes in the layout/provider tree.

import { useRouteError, isRouteErrorResponse } from 'react-router';

import { toShohojError } from '../../core/errors';

export function RouteError() {
  const error = useRouteError();

  let heading = 'Something went wrong';
  let message: string;

  if (isRouteErrorResponse(error)) {
    heading = `${error.status} ${error.statusText}`;
    message =
      error.status === 404
        ? "We couldn't find that page."
        : 'The page failed to load. Please try again.';
  } else {
    // Never surface the raw error; ShohojError.userMessage is always safe.
    message = toShohojError(error).userMessage;
  }

  return (
    <div role="alert" className="shell-route-error">
      <h1>{heading}</h1>
      <p>{message}</p>
      <a href="/">Back to home</a>
    </div>
  );
}

export default RouteError;
