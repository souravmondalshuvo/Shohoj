export function initCursor() {
  const dot        = document.getElementById('cursor-dot');
  const ring       = document.getElementById('cursor-ring');
  const cursorGlow = document.getElementById('cursor-glow');
  const body       = document.body;

  let mX = window.innerWidth / 2,  mY = window.innerHeight / 2;
  let dX = mX, dY = mY;
  let rX = mX, rY = mY;
  let gX = mX, gY = mY;

  document.addEventListener('mousemove', e => { mX = e.clientX; mY = e.clientY; }, { passive: true });

  document.querySelectorAll('a, button, .feature-card, .nav-logo').forEach(el => {
    el.addEventListener('mouseenter', () => body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => body.classList.remove('cursor-hover'));
  });
  document.querySelectorAll('select, textarea').forEach(el => {
    el.addEventListener('mouseenter', () => body.classList.add('cursor-text'));
    el.addEventListener('mouseleave', () => body.classList.remove('cursor-text'));
  });
  document.addEventListener('mouseover', e => {
    if (e.target.matches('.pf-select')) body.classList.add('cursor-text');
  });
  document.addEventListener('mouseout', e => {
    if (e.target.matches('.pf-select')) body.classList.remove('cursor-text');
  });
  document.addEventListener('mouseover', e => {
    if (e.target.matches('input, textarea')) body.classList.add('cursor-text');
  });
  document.addEventListener('mouseout', e => {
    if (e.target.matches('input, textarea')) body.classList.remove('cursor-text');
  });
  document.addEventListener('mousedown', () => body.classList.add('cursor-click'));
  document.addEventListener('mouseup',   () => body.classList.remove('cursor-click'));
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0'; ring.style.opacity = '0'; cursorGlow.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '1'; ring.style.opacity = '1'; cursorGlow.style.opacity = '1';
  });

  function animateCursor() {
    dX += (mX - dX) * 0.85; dY += (mY - dY) * 0.85;
    rX += (mX - rX) * 0.14; rY += (mY - rY) * 0.14;
    gX += (mX - gX) * 0.07; gY += (mY - gY) * 0.07;
    dot.style.left  = dX + 'px'; dot.style.top   = dY + 'px';
    ring.style.left = rX + 'px'; ring.style.top  = rY + 'px';
    cursorGlow.style.left = gX + 'px'; cursorGlow.style.top = gY + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.querySelectorAll('.magnetic').forEach(el => {
    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      el.style.transform = `translate(${(e.clientX - cx) * 0.35}px, ${(e.clientY - cy) * 0.35}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = 'translate(0,0)'; });
  });
}
