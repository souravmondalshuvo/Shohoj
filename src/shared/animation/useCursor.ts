// src/shared/animation/useCursor.ts
//
// React port of js/animations/cursor.js — the custom cursor (dot, ring, glow)
// and the magnetic pull on interactive elements.
//
// One behavioural fix, not a straight port. Legacy binds the magnetic effect by
// walking `.magnetic` once at boot (cursor.js:50), which only works because the
// legacy page never adds nodes after load. Under a router, anything rendered
// later would get no listeners at all — js/auth/firebase.js:372 already re-walks
// `.magnetic` for exactly this reason, patching a single call site. Delegating
// from document removes the failure mode outright: there is nothing to re-scan,
// so it holds for every route without a route-change dependency.
//
// The lerp factors, the 0.35 magnetic ratio and the hover/text target lists are
// carried over unchanged. Both rAF loops are cancelled on unmount.

import { useEffect, type RefObject } from 'react';

const HOVER_TARGETS = 'a, button, .feature-card, .nav-logo';
const TEXT_TARGETS = 'input, textarea, select, .pf-select';
const MAGNETIC_PULL = 0.35;

export interface CursorRefs {
  readonly dot: RefObject<HTMLDivElement | null>;
  readonly ring: RefObject<HTMLDivElement | null>;
  readonly glow: RefObject<HTMLDivElement | null>;
}

export function useCursor({ dot, ring, glow }: CursorRefs): void {
  useEffect(() => {
    const dotEl = dot.current;
    const ringEl = ring.current;
    const glowEl = glow.current;
    if (!dotEl || !ringEl || !glowEl) return;

    // Coarse pointers never show a custom cursor; skip the whole rig rather
    // than run two rAF loops that move invisible nodes.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const body = document.body;
    let mX = window.innerWidth / 2;
    let mY = window.innerHeight / 2;
    let dX = mX;
    let dY = mY;
    let rX = mX;
    let rY = mY;
    let gX = mX;
    let gY = mY;

    // Derived from whatever is under the pointer on each event rather than
    // paired enter/leave listeners: those get stuck when the hovered element
    // disappears without a mouseout (a repaint, a modal opening over it) and
    // the stale I-beam then follows the pointer everywhere.
    const syncCursorState = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      body.classList.toggle('cursor-hover', !!el?.closest(HOVER_TARGETS));
      body.classList.toggle('cursor-text', !!el?.closest(TEXT_TARGETS));
    };

    const onMouseMove = (e: MouseEvent) => {
      mX = e.clientX;
      mY = e.clientY;
      syncCursorState(e.target);

      // Magnetic pull, delegated: resolve the element under the pointer each
      // move instead of holding listeners on a snapshot of `.magnetic` nodes.
      if (body.classList.contains('modal-open')) return;
      const magnet = e.target instanceof Element ? e.target.closest('.magnetic') : null;
      if (magnet instanceof HTMLElement) {
        const rect = magnet.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        magnet.style.transform = `translate(${(e.clientX - cx) * MAGNETIC_PULL}px, ${
          (e.clientY - cy) * MAGNETIC_PULL
        }px)`;
        lastMagnet = magnet;
      } else if (lastMagnet) {
        lastMagnet.style.transform = 'translate(0,0)';
        lastMagnet = null;
      }
    };

    // The element the pointer most recently pulled, so it can be released when
    // the pointer moves off it — the delegated stand-in for mouseleave.
    let lastMagnet: HTMLElement | null = null;

    const onMouseOver = (e: MouseEvent) => syncCursorState(e.target);
    const onMouseDown = () => body.classList.add('cursor-click');
    const onMouseUp = () => body.classList.remove('cursor-click');
    const onMouseLeave = () => {
      dotEl.style.opacity = '0';
      ringEl.style.opacity = '0';
      glowEl.style.opacity = '0';
    };
    const onMouseEnter = () => {
      dotEl.style.opacity = '';
      ringEl.style.opacity = '';
      glowEl.style.opacity = '';
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    // Three different lerp factors give the dot/ring/glow their trailing feel.
    let frame = 0;
    const animate = () => {
      dX += (mX - dX) * 0.85;
      dY += (mY - dY) * 0.85;
      rX += (mX - rX) * 0.14;
      rY += (mY - rY) * 0.14;
      gX += (mX - gX) * 0.07;
      gY += (mY - gY) * 0.07;
      dotEl.style.transform = `translate(${dX}px, ${dY}px) translate(-50%, -50%)`;
      ringEl.style.transform = `translate(${rX}px, ${rY}px) translate(-50%, -50%)`;
      glowEl.style.transform = `translate(${gX}px, ${gY}px) translate(-50%, -50%)`;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
      lastMagnet?.style.removeProperty('transform');
      body.classList.remove('cursor-hover', 'cursor-text', 'cursor-click');
    };
  }, [dot, ring, glow]);
}
