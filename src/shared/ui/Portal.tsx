// src/shared/ui/Portal.tsx
//
// Renders children into document.body instead of the caller's DOM position.
// Every shell modal backdrop needs this (#738): routes are authored as
// <section>, and style.css gives that a stacking context (position: relative;
// z-index: 1). A backdrop rendered inside it has its z-index: 9999 resolved
// *inside* that context, capped by it — so page chrome with a higher local
// z-index (e.g. .calc-tabs) can still paint over the modal depending on
// scroll offset. Mounting the backdrop on document.body escapes the trap.

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function Portal({ children }: { readonly children: ReactNode }) {
  return createPortal(children, document.body);
}
