// ── SCROLL REVEAL SYSTEM ─────────────────────────────

export function initReveal() {
    function updateProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (scrollTop / docHeight * 100) + '%';
      navEl.classList.toggle('scrolled', scrollTop > 40);
    }
    window.addEventListener('scroll', updateProgress, { passive: true });

    // ── SMOOTH ANCHOR SCROLL ──────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    // ── ACTIVE NAV ON SCROLL ──────────────────────────────
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    function updateNav() {
      let current = '';
      sections.forEach(sec => {
        if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
      });
      navLinks.forEach(l => {
        l.classList.toggle('active', l.getAttribute('href') === '#' + current);
      });
    }
    window.addEventListener('scroll', updateNav, { passive: true });

    // ── SCROLL REVEAL — premium choreography ────────────────
    function makeObserver(threshold, rootMargin, cb) {
      return new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) cb(e); });
      }, { threshold, rootMargin });
    }

    // ── 1. Generic .reveal elements ─────────────────────────
    const revealObs = makeObserver(0.10, '0px 0px -50px 0px', e => {
      e.target.classList.add('visible');
      revealObs.unobserve(e.target);
    });
    document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

    // ── 2. Section labels — letterspace focus ───────────────
    const labelObs = makeObserver(0.25, '0px 0px -30px 0px', e => {
      e.target.classList.add('visible');
      labelObs.unobserve(e.target);
    });
    document.querySelectorAll('[data-reveal-label]').forEach(el => labelObs.observe(el));

    // ── 3. Section titles ────────────────────────────────────
    const titleObs = makeObserver(0.20, '0px 0px -30px 0px', e => {
      e.target.classList.add('visible');
      titleObs.unobserve(e.target);
    });
    document.querySelectorAll('[data-reveal-title]').forEach(el => titleObs.observe(el));

    // ── 4. Section descs ─────────────────────────────────────
    const descObs = makeObserver(0.20, '0px 0px -30px 0px', e => {
      e.target.classList.add('visible');
      descObs.unobserve(e.target);
    });
    document.querySelectorAll('[data-reveal-desc]').forEach(el => descObs.observe(el));

    // ── 5. Hero cascade ──────────────────────────────────────
    // Badge(0ms) → h1(130ms) → sub(260ms) → CTA(390ms)
    // Each element draws the eye downward — page introduces itself
    (function revealHero() {
      document.querySelectorAll('[data-reveal-hero]').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), 100 + i * 130);
      });
    })();

    // ── 6. Hero stats — stagger + expo-out counter ───────────
    function animateCounter(el) {
      const numEl  = el.querySelector('.stat-num');
      const count  = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      if (!numEl || isNaN(count) || count === 0) return; // ∞ stays as-is
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
      const delay = idx * 120; // 120ms between each stat
      e.target.style.transitionDelay = delay + 'ms';
      e.target.classList.add('visible');
      setTimeout(() => animateCounter(e.target), delay + 220);
      statObs.unobserve(e.target);
    });
    document.querySelectorAll('[data-reveal-stat]').forEach(el => statObs.observe(el));

    // ── 7. Feature cards — each observed individually ────────
    // Cards fire as THEY enter the viewport, not when the grid does.
    // Slow scrollers see true one-by-one reveals.
    // Fast scrollers see a pleasing rapid cascade.
    // transitionDelay set progressively so grid-order is respected
    // even when all cards enter at once (e.g. on wide screens).
    let cardDelay = 0;
    const cardObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = cardDelay + 'ms';
        e.target.classList.add('visible');
        // Reset delay window — cards that enter together stagger;
        // cards that enter separately (slow scroll) fire at 0ms delay
        cardDelay += 110;
        clearTimeout(cardObs._resetTimer);
        cardObs._resetTimer = setTimeout(() => { cardDelay = 0; }, 600);
        cardObs.unobserve(e.target);
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal-card]').forEach(el => cardObs.observe(el));

    // ── 8. Calc wrapper — heaviest, most deliberate entrance ─
    const calcObs = makeObserver(0.04, '0px 0px -10px 0px', e => {
      e.target.classList.add('visible');
      calcObs.unobserve(e.target);
    });
    document.querySelectorAll('[data-reveal-calc]').forEach(el => calcObs.observe(el));

    // ── PARALLAX ORBS ────────────────────────────────────
    const orbs = document.querySelectorAll('.orb');
    const speeds = [0.04, 0.07, 0.05];
    function parallaxOrbs() {
      const y = window.scrollY;
      orbs.forEach((orb, i) => {
        orb.style.translate = '0 ' + (y * speeds[i]) + 'px';
      });
    }
    window.addEventListener('scroll', parallaxOrbs, { passive: true });
}