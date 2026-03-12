export function initReveal() {
  function makeObserver(threshold, rootMargin, cb) {
    return new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) cb(e); });
    }, { threshold, rootMargin });
  }

  const revealObs = makeObserver(0.10, '0px 0px -50px 0px', e => {
    e.target.classList.add('visible');
    revealObs.unobserve(e.target);
  });
  document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

  const labelObs = makeObserver(0.25, '0px 0px -30px 0px', e => {
    e.target.classList.add('visible');
    labelObs.unobserve(e.target);
  });
  document.querySelectorAll('[data-reveal-label]').forEach(el => labelObs.observe(el));

  const titleObs = makeObserver(0.20, '0px 0px -30px 0px', e => {
    e.target.classList.add('visible');
    titleObs.unobserve(e.target);
  });
  document.querySelectorAll('[data-reveal-title]').forEach(el => titleObs.observe(el));

  const descObs = makeObserver(0.20, '0px 0px -30px 0px', e => {
    e.target.classList.add('visible');
    descObs.unobserve(e.target);
  });
  document.querySelectorAll('[data-reveal-desc]').forEach(el => descObs.observe(el));

  // Hero cascade
  document.querySelectorAll('[data-reveal-hero]').forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), 100 + i * 130);
  });

  // Stats counter
  function animateCounter(el) {
    const numEl  = el.querySelector('.stat-num');
    const count  = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    if (!numEl || isNaN(count) || count === 0) return;
    numEl.classList.add('counting');
    const dur = 900;
    const t0  = performance.now();
    (function tick(now) {
      const p  = Math.min((now - t0) / dur, 1);
      const ep = p < 1 ? 1 - Math.pow(2, -10 * p) : 1;
      numEl.textContent = Math.round(ep * count) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else { numEl.textContent = count + suffix; numEl.classList.remove('counting'); }
    })(performance.now());
  }

  const statObs = makeObserver(0.35, '0px 0px -10px 0px', e => {
    const idx   = [...e.target.parentElement.children].indexOf(e.target);
    const delay = idx * 120;
    e.target.style.transitionDelay = delay + 'ms';
    e.target.classList.add('visible');
    setTimeout(() => animateCounter(e.target), delay + 220);
    statObs.unobserve(e.target);
  });
  document.querySelectorAll('[data-reveal-stat]').forEach(el => statObs.observe(el));

  let cardDelay = 0;
  const cardObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.transitionDelay = cardDelay + 'ms';
      e.target.classList.add('visible');
      cardDelay += 110;
      clearTimeout(cardObs._resetTimer);
      cardObs._resetTimer = setTimeout(() => { cardDelay = 0; }, 600);
      cardObs.unobserve(e.target);
    });
  }, { threshold: 0.10, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('[data-reveal-card]').forEach(el => cardObs.observe(el));

  const calcObs = makeObserver(0.04, '0px 0px -10px 0px', e => {
    e.target.classList.add('visible');
    calcObs.unobserve(e.target);
  });
  document.querySelectorAll('[data-reveal-calc]').forEach(el => calcObs.observe(el));
}
