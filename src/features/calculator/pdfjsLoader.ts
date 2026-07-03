// src/features/calculator/pdfjsLoader.ts
//
// On-demand pdf.js for the shell's transcript import (#323). The legacy page
// ships pdf.js as a pinned CDN <script> in index.html; the shell loads the
// same pinned build (same URL, same SRI hash) only when the user actually
// imports, so non-importing visits pay nothing and there is no new npm
// dependency. An e2e/test page that pre-sets window.pdfjsLib short-circuits
// the network entirely. Failure surfaces the legacy error copy.

import type { PdfDocumentLike } from './transcriptPdfText.ts';

/** The slice of the pdf.js global this feature uses. */
export interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc?: string };
  getDocument(params: { data: ArrayBuffer; isEvalSupported: boolean }): {
    promise: Promise<PdfDocumentLike>;
  };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLike;
  }
}

// The exact pinned build + SRI the legacy index.html ships (3.11.174).
const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_INTEGRITY = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const PDFJS_UNAVAILABLE_MESSAGE = 'PDF.js not loaded. Check your connection.';

let pending: Promise<PdfJsLike> | null = null;

function withWorker(lib: PdfJsLike): PdfJsLike {
  // Same assignment importTranscriptPDF makes before every parse.
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  return lib;
}

/**
 * Resolve the pdf.js library: the existing global when present (legacy page,
 * test stub), otherwise inject the pinned CDN script once and share the load.
 */
export function loadPdfJs(): Promise<PdfJsLike> {
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    return Promise.resolve(withWorker(window.pdfjsLib));
  }
  if (pending) return pending;

  pending = new Promise<PdfJsLike>((resolve, reject) => {
    const fail = () => {
      pending = null; // allow a retry once the connection is back
      reject(new Error(PDFJS_UNAVAILABLE_MESSAGE));
    };
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.integrity = PDFJS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.pdfjsLib) resolve(withWorker(window.pdfjsLib));
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
