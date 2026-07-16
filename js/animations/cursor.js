export function initCursor() {
  const dot        = document.getElementById('cursor-dot');
  const ring       = document.getElementById('cursor-ring');
  const cursorGlow = document.getElementById('cursor-glow');
  const body       = document.body;

  let mX = window.innerWidth / 2,  mY = window.innerHeight / 2;
  let dX = mX, dY = mY;
  let rX = mX, rY = mY;
  let gX = mX, gY = mY;

  // Derive the cursor shape from the element currently under the pointer on
  // every mouse event, instead of paired add/remove listeners. Paired
  // listeners get stuck when the hovered element vanishes without a mouseout
  // (innerHTML repaints, a modal opening on top) — the stale cursor-text
  // I-beam then follows the pointer everywhere.
  const HOVER_TARGETS = 'a, button, .feature-card, .nav-logo';
  const TEXT_TARGETS  = 'input, textarea, select, .pf-select';
  function syncCursorState(target) {
    const el = target instanceof Element ? target : null;
    body.classList.toggle('cursor-hover', !!(el && el.closest(HOVER_TARGETS)));
    body.classList.toggle('cursor-text',  !!(el && el.closest(TEXT_TARGETS)));
  }

  document.addEventListener('mousemove', e => {
    mX = e.clientX; mY = e.clientY;
    syncCursorState(e.target);
  }, { passive: true });
  document.addEventListener('mouseover', e => syncCursorState(e.target));
  document.addEventListener('mousedown', () => body.classList.add('cursor-click'));
  document.addEventListener('mouseup',   () => body.classList.remove('cursor-click'));
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0'; ring.style.opacity = '0'; cursorGlow.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = ''; ring.style.opacity = ''; cursorGlow.style.opacity = '';
  });

  function animateCursor() {
    dX += (mX - dX) * 0.85; dY += (mY - dY) * 0.85;
    rX += (mX - rX) * 0.14; rY += (mY - rY) * 0.14;
    gX += (mX - gX) * 0.07; gY += (mY - gY) * 0.07;
    dot.style.transform        = `translate(${dX}px, ${dY}px) translate(-50%, -50%)`;
    ring.style.transform       = `translate(${rX}px, ${rY}px) translate(-50%, -50%)`;
    cursorGlow.style.transform = `translate(${gX}px, ${gY}px) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.querySelectorAll('.magnetic').forEach(el => {
    el.addEventListener('mousemove', e => {
      if (document.body.classList.contains('modal-open')) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      el.style.transform = `translate(${(e.clientX - cx) * 0.35}px, ${(e.clientY - cy) * 0.35}px)`;
    });
    el.addEventListener('mouseleave', () => {
      if (document.body.classList.contains('modal-open')) return;
      el.style.transform = 'translate(0,0)';
    });
  });
}