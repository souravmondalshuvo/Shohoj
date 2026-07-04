// src/features/calculator/jspdfLoader.ts
//
// On-demand jsPDF for the shell's PDF export (#325), the pdfjsLoader pattern:
// the legacy page ships jsPDF as a pinned CDN <script> in index.html; the
// shell injects the same pinned build (same URL, same SRI hash) only when the
// user exports, so ordinary visits pay nothing and no npm dependency is
// added. An existing window.jspdf (legacy page, test stub) short-circuits.
// Failure rejects with the legacy alert copy.

import type { PdfDocLike } from './pdfReportDraw.ts';

/** The jsPDF constructor surface this feature uses (window.jspdf.jsPDF). */
export interface JsPdfLike {
  jsPDF: new (options: { unit: 'mm'; format: 'a4' }) => PdfDocLike;
}

declare global {
  interface Window {
    jspdf?: JsPdfLike;
  }
}

// The exact pinned build + SRI the legacy index.html ships (2.5.1).
const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const JSPDF_INTEGRITY = 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';

export const JSPDF_UNAVAILABLE_MESSAGE = 'PDF library not loaded. Please check your connection.';

let pending: Promise<JsPdfLike> | null = null;

/**
 * Resolve the jsPDF module: the existing global when present, otherwise
 * inject the pinned CDN script once and share the in-flight load.
 */
export function loadJsPdf(): Promise<JsPdfLike> {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) {
    return Promise.resolve(window.jspdf);
  }
  if (pending) return pending;

  pending = new Promise<JsPdfLike>((resolve, reject) => {
    const fail = () => {
      pending = null; // allow a retry once the connection is back
      reject(new Error(JSPDF_UNAVAILABLE_MESSAGE));
    };
    const script = document.createElement('script');
    script.src = JSPDF_SRC;
    script.integrity = JSPDF_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
