// src/app/entries/shell.tsx
//
// Entry point for the React Router shell (Phase 3), built by vite.shell.config.js
// into dist-shell/ — completely separate from the legacy build3.py page and the
// opt-in islands. Mounts the data router onto #root. This is the seed of the
// future SPA; it does not replace the live app until the Phase 12/13 cutover.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { router } from '../routing/router';
import { createLogger } from '../../platform/observability/logger.ts';
import { installGlobalErrorHandlers } from '../../platform/observability/globalErrorHandlers.ts';

// Last-resort capture: route uncaught errors / rejections through the structured
// logger so frontend exceptions are observable (see docs/OBSERVABILITY.md).
installGlobalErrorHandlers(createLogger({ base: { app: 'shell' } }));

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
