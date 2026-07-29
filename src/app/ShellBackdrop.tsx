// src/app/ShellBackdrop.tsx
//
// The ambient layer behind every route: scroll-progress bar, the liquid-glass
// SVG filter, the custom cursor nodes, the pointer-reactive dot matrix and the
// three drifting orbs. Legacy scatters these across index.html:102-131; the
// shell groups them into one component mounted once by RootLayout.
//
// The ids and class names are the ones css/style.css styles, so they are load
// bearing. All four are decorative, hence aria-hidden — none of it should reach
// the accessibility tree.
//
// Note this is NOT covered by e2e-visual: the harness hides these layers before
// capturing precisely because they are animated and pointer-driven, so it can
// never assert the backdrop looks right. Its geometry is asserted through the
// DOM in e2e-shell/shell-backdrop.spec.js instead.

import { useRef } from 'react';

import { useCursor } from '../shared/animation/useCursor';
import { useDotMatrix } from '../shared/animation/useDotMatrix';
import { useReveal } from '../shared/animation/useReveal';
import { useScrollProgress } from '../shared/animation/useScrollProgress';

export function ShellBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useDotMatrix(canvasRef);
  useCursor({ dot: dotRef, ring: ringRef, glow: glowRef });
  useScrollProgress(progressRef);
  // Not backdrop chrome, but it belongs to the same animation layer and has to
  // re-scan per route — see the hook for why that matters.
  useReveal();

  return (
    <>
      <div id="scroll-progress" ref={progressRef} aria-hidden="true" />

      {/* Referenced as url(#liquid-distort) by the glass surfaces. */}
      <svg
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
        aria-hidden="true"
      >
        <defs>
          <filter id="liquid-distort" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018 0.025"
              numOctaves={3}
              seed={5}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={6}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div id="cursor-dot" ref={dotRef} aria-hidden="true" />
      <div id="cursor-ring" ref={ringRef} aria-hidden="true" />
      <div id="cursor-glow" ref={glowRef} aria-hidden="true" />

      <canvas id="dot-matrix" ref={canvasRef} aria-hidden="true" />

      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />
    </>
  );
}
