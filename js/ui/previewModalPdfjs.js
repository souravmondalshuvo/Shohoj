// ── js/ui/previewModalPdfjs.js ────────────────────────────────────────────────
// Alternative paper preview that renders PDFs with PDF.js to canvas inside the
// parent document, instead of handing them off to the browser's built-in PDF
// iframe viewer. Why: the iframe viewer runs cross-process (Chrome) or in a
// separate document (Safari/Firefox), so the parent never receives mousemove
// events while the pointer is over the PDF — the site's JS custom cursor
// freezes. Rendering each page to a <canvas> in the same document means
// mousemove fires normally and the custom cursor tracks across the whole modal.
//
// Trade-offs: loses the browser PDF toolbar (page jump field, native print,
// download button). We provide minimal page-count + zoom controls; the "Open
// in new tab" link still offers full browser PDF UI as an escape hatch.
//
// Activated by setting localStorage.setItem('shohoj_pdfjs_preview','1') in the
// console. Falls back to the legacy iframe modal for non-PDF mime types or
// when pdfjsLib isn't available.

import { escHtml, escAttr } from '../core/helpers.js';

const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const BASE_RENDER_SCALE = 1.5; // canvas pixel density vs CSS pixel size

function _pdfjsAvailable() {
  return typeof window.pdfjsLib !== 'undefined';
}

function _ensureWorker() {
  if (!_pdfjsAvailable()) return false;
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
  return true;
}

export async function openPreviewModalPdfjs({ url, title, mimeType }) {
  if (!_ensureWorker()) {
    throw new Error('PDF.js not loaded');
  }

  const wrap = document.createElement('div');
  wrap.className = 'admin-preview-backdrop';
  wrap.innerHTML = `
    <div class="admin-preview-modal admin-preview-modal--pdfjs" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
      <header class="admin-preview-head">
        <div class="admin-preview-title">${escHtml(title)}</div>
        <div class="admin-preview-head-actions">
          <div class="admin-preview-toolbar">
            <span class="admin-preview-page-indicator" aria-live="polite">…</span>
            <button type="button" class="admin-preview-zoom-btn" data-act="zoom-out" aria-label="Zoom out">−</button>
            <span class="admin-preview-zoom-indicator" aria-live="polite">100%</span>
            <button type="button" class="admin-preview-zoom-btn" data-act="zoom-in" aria-label="Zoom in">+</button>
          </div>
          <a class="admin-preview-newtab" href="${escAttr(url)}" target="_blank" rel="noopener">Open in new tab ↗</a>
          <button type="button" class="admin-preview-close" aria-label="Close">×</button>
        </div>
      </header>
      <div class="admin-preview-body admin-preview-body--pdfjs">
        <div class="admin-preview-pdfjs-pages" tabindex="0"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.querySelector('.admin-preview-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);

  const pagesContainer = wrap.querySelector('.admin-preview-pdfjs-pages');
  const pageInd = wrap.querySelector('.admin-preview-page-indicator');
  const zoomInd = wrap.querySelector('.admin-preview-zoom-indicator');
  let zoom = 1.0;
  let pdf = null;

  async function renderAll() {
    pagesContainer.innerHTML = '';
    if (!pdf) return;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: zoom * BASE_RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.className = 'admin-preview-pdfjs-page';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = (viewport.width / BASE_RENDER_SCALE) + 'px';
      canvas.style.height = (viewport.height / BASE_RENDER_SCALE) + 'px';
      pagesContainer.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }

  function setZoom(next) {
    zoom = Math.max(0.5, Math.min(next, 3));
    zoomInd.textContent = Math.round(zoom * 100) + '%';
    renderAll();
  }

  wrap.querySelectorAll('.admin-preview-zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      setZoom(act === 'zoom-in' ? zoom * 1.25 : zoom / 1.25);
    });
  });

  try {
    pdf = await window.pdfjsLib.getDocument({ url }).promise;
    pageInd.textContent = `${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}`;
    await renderAll();
  } catch (e) {
    console.error('[Shohoj] PDF.js render failed:', e);
    pagesContainer.innerHTML = `
      <div class="admin-preview-pdfjs-error">
        Failed to render PDF.
        <a href="${escAttr(url)}" target="_blank" rel="noopener">Open in new tab</a>
      </div>
    `;
  }
}
