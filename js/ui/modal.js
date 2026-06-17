// ── js/ui/modal.js ────────────────────────────────────────────────────────────
// Generic content modal: a titled dialog over a dimmed backdrop for arbitrary
// pre-rendered HTML. Closes on × / backdrop click / Escape. Unlike previewModal
// (which is wired for PDF/image iframes), this takes a plain HTML body string.
//
// Callers must pass already-escaped HTML in `bodyHtml` (build it with escHtml /
// escAttr), exactly like the other innerHTML-based renderers in this app.

import { escHtml } from '../core/helpers.js';

let _seq = 0;

/**
 * Open a modal. Returns a `close()` function.
 * @param {{ title: string, bodyHtml: string }} opts
 */
export function openModal({ title, bodyHtml }) {
  const titleId = `app-modal-title-${++_seq}`;
  const prevFocus = document.activeElement;

  const wrap = document.createElement('div');
  wrap.className = 'app-modal-backdrop';
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  wrap.innerHTML = `
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <header class="app-modal-head">
        <div class="app-modal-title" id="${titleId}">${escHtml(title)}</div>
        <button type="button" class="app-modal-close" aria-label="Close">×</button>
      </header>
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(wrap);

  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.querySelector('.app-modal-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.app-modal-close').focus();

  return close;
}
