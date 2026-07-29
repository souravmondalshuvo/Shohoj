// src/shared/animation/useDotMatrix.ts
//
// React port of js/animations/dotmatrix.js — the pointer-reactive dot grid
// behind the whole page. Every physics constant is carried over unchanged so the
// motion reads identically; the differences are structural:
//
//   - the canvas arrives as a ref instead of getElementById
//   - the rAF loop is cancelled on unmount (the legacy loop runs forever, which
//     under a router would leak a loop per mount)
//   - listeners are removed on unmount
//   - the theme is re-read each frame rather than cleared by a click handler
//     wired to the toggle button, so it also tracks a theme change from anywhere
//
// Coarse pointers skip the physics entirely, exactly as legacy does: the grid
// still paints, but no displacement is computed for a pointer that cannot hover.

import { useEffect, type RefObject } from 'react';

const SPACING = 28;
const SPRING = 0.052;
const DAMPING = 0.74;
const REPEL = 52;
const REACH = 200;
const SWIRL = 0.28;
const BASE_R = 1.1;
const MAX_R = 2.9;
const BASE_A = 0.13;
const MAX_A = 0.74;

interface Dot {
  row: number;
  col: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
}

export function useDotMatrix(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    let W = 0;
    let H = 0;
    let cx = -9999;
    let cy = -9999;
    let cvx = 0;
    let cvy = 0;
    let dots: Dot[] = [];

    // Carries each dot's velocity across a resize so the grid re-flows instead
    // of snapping back to rest.
    function buildGrid() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      const cols = Math.ceil(W / SPACING) + 1;
      const rows = Math.ceil(H / SPACING) + 1;
      const prev: Record<number, Dot> = {};
      dots.forEach((d) => {
        prev[d.row * 10000 + d.col] = d;
      });
      dots = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const p = prev[row * 10000 + col];
          dots.push({
            row,
            col,
            ox: col * SPACING,
            oy: row * SPACING,
            dx: p ? p.dx : 0,
            dy: p ? p.dy : 0,
            vx: p ? p.vx : 0,
            vy: p ? p.vy : 0,
          });
        }
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      cvx = cvx * 0.6 + (e.clientX - cx) * 0.4;
      cvy = cvy * 0.6 + (e.clientY - cy) * 0.4;
      cx = e.clientX;
      cy = e.clientY;
    };
    const onMouseLeave = () => {
      cx = -9999;
      cy = -9999;
      cvx = 0;
      cvy = 0;
    };

    buildGrid();
    window.addEventListener('resize', buildGrid);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave);

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const light = document.documentElement.dataset.theme === 'light';
      const cSpeed = Math.sqrt(cvx * cvx + cvy * cvy);
      const boost = 1 + Math.min(cSpeed * 0.018, 0.85);

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const { ox, oy } = d;

        if (!isMobile) {
          const fromCx = ox - cx;
          const fromCy = oy - cy;
          const dist = Math.sqrt(fromCx * fromCx + fromCy * fromCy);

          if (dist < REACH && cx > -999) {
            const falloff = 1 - dist / REACH;
            const strength = falloff * falloff * REPEL * boost;
            const invDist = 1 / (dist || 0.001);
            const rx = fromCx * invDist;
            const ry = fromCy * invDist;
            // Perpendicular component: dots orbit the pointer rather than
            // simply fleeing it.
            const targetDx = (rx + -ry * SWIRL) * strength;
            const targetDy = (ry + rx * SWIRL) * strength;
            d.vx += (targetDx - d.dx) * SPRING;
            d.vy += (targetDy - d.dy) * SPRING;
          } else {
            d.vx += (0 - d.dx) * SPRING;
            d.vy += (0 - d.dy) * SPRING;
          }

          d.vx *= DAMPING;
          d.vy *= DAMPING;
          d.dx += d.vx;
          d.dy += d.vy;
        }

        const dispMag = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
        const dispNorm = Math.min(dispMag / REPEL, 1);
        const distO = Math.sqrt((ox - cx) * (ox - cx) + (oy - cy) * (oy - cy));
        // Brightens a ring around the pointer, not just displaced dots.
        const rimEase =
          cx > -999 ? Math.max(0, 1 - Math.abs(distO - REACH * 0.62) / (REACH * 0.42)) ** 1.6 : 0;
        const ease = Math.max(dispNorm * 0.88, rimEase * 0.72);

        const r = BASE_R + (MAX_R - BASE_R) * ease;
        const a = BASE_A + (MAX_A - BASE_A) * ease;

        ctx.beginPath();
        ctx.arc(ox + d.dx, oy + d.dy, r, 0, Math.PI * 2);
        ctx.fillStyle = light
          ? `rgba(10,${Math.round(120 + 80 * ease)},50,${a})`
          : `rgba(46,${Math.round(180 + 60 * ease)},${Math.round(80 - 60 * ease)},${a})`;
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', buildGrid);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [canvasRef]);
}
