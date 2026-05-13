// ── js/ui/previewModal.js ─────────────────────────────────────────────────────
// Shared inline preview modal for paper PDFs and images. Used by both the admin
// moderation queue and the public Papers tab.
//
// PDFs render in an <iframe>, images in an <img>. The "Open in new tab" link is
// kept as a fallback for browsers that won't render PDFs inline (mobile Safari).
// The modal closes on × / backdrop click / Escape.
//
// Cursor.js tracks parent-document mousemove events, so iframe-internal mouse
// movement would otherwise freeze the custom cursor at the iframe edge. blob:
// URLs are same-origin, so we forward mousemove from iframe.contentDocument
// back to the parent with iframe-relative coords translated to viewport coords.

import { escHtml, escAttr } from '../core/helpers.js';

export function openPreviewModal({ url, title, path }) {
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(path || '');
  const wrap = document.createElement('div');
  wrap.className = 'admin-preview-backdrop';
  const body = isImage
    ? `<img class="admin-preview-img" src="${escAttr(url)}" alt="${escAttr(title)}">`
    : `<iframe class="admin-preview-iframe" src="${escAttr(url)}" title="${escAttr(title)}"></iframe>`;
  wrap.innerHTML = `
    <div class="admin-preview-modal" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
      <header class="admin-preview-head">
        <div class="admin-preview-title">${escHtml(title)}</div>
        <div class="admin-preview-head-actions">
          <a class="admin-preview-newtab" href="${escAttr(url)}" target="_blank" rel="noopener">Open in new tab ↗</a>
          <button type="button" class="admin-preview-close" aria-label="Close">×</button>
        </div>
      </header>
      <div class="admin-preview-body">${body}</div>
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

  const iframe = wrap.querySelector('.admin-preview-iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        doc.addEventListener('mousemove', e => {
          const rect = iframe.getBoundingClientRect();
          document.dispatchEvent(new MouseEvent('mousemove', {
            clientX: rect.left + e.clientX,
            clientY: rect.top + e.clientY,
          }));
        }, { passive: true });
      } catch { /* cross-origin iframe — nothing we can do */ }
    });
  }
}
