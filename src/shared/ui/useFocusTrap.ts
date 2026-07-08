// src/shared/ui/useFocusTrap.ts
//
// Shared Tab-trap + focus-restore behavior for the shell's modal dialogs
// (ConfirmDialog, RateFacultyModal, ReportReviewModal, CourseReviewsModal).
// Each dialog still owns Escape (guards differ, e.g. RateFacultyModal blocks
// it while submitting) and which element gets initial focus (that varies per
// dialog), so only the two identical parts are shared here.

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Restores focus to whatever was focused right before the dialog mounted. */
export function useRestoreFocus(): void {
  const restoreRef = useRef<Element | null>(null);
  useEffect(() => {
    restoreRef.current = document.activeElement;
    return () => {
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, []);
}

/**
 * Keeps Tab/Shift+Tab cycling within `dialogRef`'s focusable elements. Call
 * from the dialog's onKeyDown alongside whatever Escape handling it needs.
 */
export function trapTabKey(
  event: React.KeyboardEvent,
  dialogRef: RefObject<HTMLElement | null>,
): void {
  if (event.key !== 'Tab' || dialogRef.current === null) return;
  const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
