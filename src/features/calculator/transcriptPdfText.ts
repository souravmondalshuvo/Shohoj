// src/features/calculator/transcriptPdfText.ts
//
// Typed port of the PDF positional text flattener from js/ui/modals.js
// (#323): turns pdf.js `getTextContent()` items into the line-oriented text
// the transcript parser (src/core/transcript.ts) expects. The heuristics are
// kept verbatim — y-jumps > 6 break rows; a course code dropped a few pixels
// low (mobile pdf.js) or an all-caps overflow fragment forces its own line so
// rows don't merge; x-gap + token-shape decide intra-row spaces. Pure: the
// pdf.js document/page objects are consumed through minimal structural types,
// so tests drive it with plain fixtures and no pdf.js.

/** The slice of a pdf.js text item this flattener reads. */
export interface PdfTextItem {
  readonly str?: string;
  /** pdf.js transform matrix; [4] = x, [5] = y. */
  readonly transform?: readonly number[];
  readonly width?: number;
}

/** Minimal structural view of a pdf.js document (what extractPdfText walks). */
export interface PdfDocumentLike {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: readonly PdfTextItem[] }>;
  }>;
}

const COURSE_CODE_RE = /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/;
const ALL_CAPS_FRAGMENT_RE = /^[A-Z][A-Z ]+$/;

function shouldInsertPdfSpace(
  lastXEnd: number | null,
  nextX: number | null,
  prevToken: string,
  nextToken: string,
): boolean {
  if (lastXEnd === null || nextX === null) return false;
  const gap = nextX - lastXEnd;
  if (gap > 1.5) return true;
  if (gap <= 0.2) return false;
  return /[A-Za-z0-9):]$/.test(prevToken) && /^[A-Za-z0-9(]/.test(nextToken);
}

/** Flatten one page's text items into row-broken text (modals.js parity). */
export function flattenPdfPageText(items: readonly PdfTextItem[]): string {
  let text = '';
  let lastY: number | null = null;
  let lastXEnd: number | null = null;
  let lastToken = '';

  for (const item of items) {
    const raw = String(item?.str ?? '');
    const str = raw.trim();
    const x = Array.isArray(item?.transform) ? item.transform[4] : null;
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;

    if (!str) {
      if (lastY !== null && y !== null && Math.abs(y - lastY) <= 1 && !text.endsWith(' ')) {
        text += ' ';
      }
      if (x !== null) lastXEnd = x + (item?.width ?? 0);
      continue;
    }

    if (lastY !== null && y !== null) {
      const yDiff = Math.abs(y - lastY);
      if (yDiff > 6) {
        text += '\n';
      } else if (yDiff > 1 && COURSE_CODE_RE.test(str)) {
        // Mobile PDF.js sometimes drops a course code a few pixels lower than
        // the rest of the row; a forced newline prevents row merging.
        text += '\n';
      } else if (yDiff > 1 && ALL_CAPS_FRAGMENT_RE.test(str) && str.length > 3) {
        // All-caps overflow fragments like "EQUATIONS" can belong to the next
        // course title and should not stay glued to the previous row.
        text += '\n';
      } else if (!text.endsWith('\n') && shouldInsertPdfSpace(lastXEnd, x, lastToken, str)) {
        text += ' ';
      }
    }

    text += str;
    lastY = y;
    lastXEnd = x !== null ? x + (item?.width ?? 0) : null;
    lastToken = str;
  }

  return text;
}

/** Full-document text: each page flattened, newline-joined (import parity). */
export async function extractPdfText(pdf: PdfDocumentLike): Promise<string> {
  let fullText = '';
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    fullText += `${flattenPdfPageText(content.items)}\n`;
  }
  return fullText;
}
