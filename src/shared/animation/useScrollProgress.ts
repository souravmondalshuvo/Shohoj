// src/shared/animation/useScrollProgress.ts
//
// React port of the scroll-progress bar and the nav's scrolled state
// (js/main.js:276-286). The bar fills with how far down the document the
// viewport is, and the nav gains `.scrolled` past 40px, which is what swaps it
// from transparent to the frosted glass treatment (style.css:187).
//
// Legacy binds once and never recomputes on navigation. Here the position is
// re-read whenever the route changes too: a new route has a different document
// height, and without that the bar would keep the previous page's fill until
// the next scroll event.

import { useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router';

export function useScrollProgress(barRef: RefObject<HTMLDivElement | null>): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const update = () => {
      const bar = barRef.current;
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      document.querySelector('nav')?.classList.toggle('scrolled', scrollTop > 40);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [barRef, pathname]);
}
