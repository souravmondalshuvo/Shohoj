// src/shared/animation/useReveal.ts
//
// React port of js/animations/reveal.js — the scroll-triggered reveal cascades
// and the hero stat counters.
//
// This is the port that most needs to stop being one-shot. Legacy calls
// querySelectorAll seven times at boot (reveal.js:12-83) and every `.reveal`
// target starts at opacity: 0 (style.css:574). Under a router that is not a
// missing animation, it is invisible content: anything mounted after first
// paint would never receive `.visible` and would stay permanently transparent.
// So the observers are rebuilt whenever the route changes, and torn down on the
// way out.
//
// Thresholds, root margins, the 130ms hero stagger, the 120ms stat stagger, the
// 110ms card cascade and the 900ms counter easing are all carried over so the
// motion reads identically.

import { useEffect } from 'react';
import { useLocation } from 'react-router';

const COUNTER_DURATION = 900;

interface RevealGroup {
  readonly selector: string;
  readonly threshold: number;
  readonly rootMargin: string;
}

const GROUPS: readonly RevealGroup[] = [
  { selector: '.reveal', threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
  { selector: '[data-reveal-label]', threshold: 0.25, rootMargin: '0px 0px -30px 0px' },
  { selector: '[data-reveal-title]', threshold: 0.2, rootMargin: '0px 0px -30px 0px' },
  { selector: '[data-reveal-desc]', threshold: 0.2, rootMargin: '0px 0px -30px 0px' },
  { selector: '[data-reveal-calc]', threshold: 0.04, rootMargin: '0px 0px -10px 0px' },
];

export function useReveal(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const frames: number[] = [];

    const observeAll = (
      selector: string,
      threshold: number,
      rootMargin: string,
      onEnter: (el: HTMLElement) => void,
    ) => {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            onEnter(entry.target as HTMLElement);
            obs.unobserve(entry.target);
          });
        },
        { threshold, rootMargin },
      );
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => obs.observe(el));
      observers.push(obs);
    };

    // Plain reveals — add .visible and stop watching.
    GROUPS.forEach(({ selector, threshold, rootMargin }) =>
      observeAll(selector, threshold, rootMargin, (el) => el.classList.add('visible')),
    );

    // Hero cascade is time-based, not scroll-based: it is above the fold by
    // definition, so it plays on arrival.
    document.querySelectorAll<HTMLElement>('[data-reveal-hero]').forEach((el, i) => {
      timers.push(setTimeout(() => el.classList.add('visible'), 100 + i * 130));
    });

    // Counts 0 -> data-count with the legacy exponential ease-out. The final
    // value is written explicitly so the last frame lands exactly on target.
    const animateCounter = (el: HTMLElement) => {
      const numEl = el.querySelector<HTMLElement>('.stat-num');
      const count = Number.parseInt(el.dataset.count ?? '', 10);
      const suffix = el.dataset.suffix || '';
      if (!numEl || Number.isNaN(count) || count === 0) return;
      numEl.classList.add('counting');
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / COUNTER_DURATION, 1);
        const eased = p < 1 ? 1 - Math.pow(2, -10 * p) : 1;
        numEl.textContent = `${Math.round(eased * count)}${suffix}`;
        if (p < 1) {
          frames.push(requestAnimationFrame(tick));
        } else {
          numEl.textContent = `${count}${suffix}`;
          numEl.classList.remove('counting');
        }
      };
      frames.push(requestAnimationFrame(tick));
    };

    // Stats stagger by their position among siblings, and the counter starts
    // 220ms after the pill has begun sliding in.
    observeAll('[data-reveal-stat]', 0.35, '0px 0px -10px 0px', (el) => {
      const idx = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
      const delay = idx * 120;
      el.style.transitionDelay = `${delay}ms`;
      el.classList.add('visible');
      timers.push(setTimeout(() => animateCounter(el), delay + 220));
    });

    // Cards accumulate a shared delay so a row entering together fans out, with
    // the accumulator resetting once the viewport has been still for 600ms.
    let cardDelay = 0;
    let cardReset: ReturnType<typeof setTimeout> | undefined;
    observeAll('[data-reveal-card]', 0.1, '0px 0px -40px 0px', (el) => {
      el.style.transitionDelay = `${cardDelay}ms`;
      el.classList.add('visible');
      cardDelay += 110;
      clearTimeout(cardReset);
      cardReset = setTimeout(() => {
        cardDelay = 0;
      }, 600);
      timers.push(cardReset);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
    };
    // Re-scan per route: the DOM the observers watch is replaced on navigation.
  }, [pathname]);
}
