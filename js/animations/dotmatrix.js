// ── DOT MATRIX CANVAS ────────────────────────────────
// Physics-based dot grid: repulsion, swirl, elastic spring snap.

export function initDotMatrix() {
      const canvas = document.getElementById('dot-matrix');
      const ctx    = canvas.getContext('2d');

      // ── tuning constants ─────────────────────────────────
      const SPACING  = 28;      // grid pitch (px)
      const SPRING   = 0.052;   // restore stiffness
      const DAMPING  = 0.74;    // velocity bleed per frame
      const REPEL    = 52;      // max repulsion displacement (px)
      const REACH    = 200;     // cursor influence radius (px)
      const SWIRL    = 0.28;    // tangential swirl blend (0=pure radial)
      const BASE_R   = 1.1,  MAX_R = 2.9;
      const BASE_A   = 0.13, MAX_A = 0.74;

      let W, H, cols, rows;
      let cx = -9999, cy = -9999;
      let pcx = -9999, pcy = -9999;   // previous cursor pos (velocity delta)
      let cvx = 0, cvy = 0;           // smoothed cursor velocity
      let dots = [];
      const isMobile = window.matchMedia('(pointer: coarse)').matches;

      // ── grid ─────────────────────────────────────────────
      function buildGrid() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
        cols = Math.ceil(W / SPACING) + 1;
        rows = Math.ceil(H / SPACING) + 1;
        const prev = {};
        dots.forEach(d => { prev[d.row * 10000 + d.col] = d; });
        dots = [];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const key = row * 10000 + col;
            const p   = prev[key];
            dots.push({
              row, col,
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

      buildGrid();
      window.addEventListener('resize', buildGrid);

      window.addEventListener('mousemove', e => {
        // Track cursor velocity for extra punch on fast sweeps
        cvx = cvx * 0.6 + (e.clientX - cx) * 0.4;
        cvy = cvy * 0.6 + (e.clientY - cy) * 0.4;
        cx  = e.clientX;
        cy  = e.clientY;
      }, { passive: true });

      window.addEventListener('mouseleave', () => {
        cx = -9999; cy = -9999;
        cvx = 0;    cvy = 0;
      });

      function isLight() {
        return document.documentElement.dataset.theme === 'light';
      }

      // ── animation loop ────────────────────────────────────
      function draw() {
        ctx.clearRect(0, 0, W, H);
        const light  = isLight();
        // Cursor speed scalar — fast sweeps push harder
        const cSpeed = Math.sqrt(cvx * cvx + cvy * cvy);
        const boost  = 1 + Math.min(cSpeed * 0.018, 0.85);

        for (let i = 0; i < dots.length; i++) {
          const d  = dots[i];
          const ox = d.ox, oy = d.oy;

          if (!isMobile) {
            const fromCx = ox - cx;   // vector: cursor → dot (repulsion direction)
            const fromCy = oy - cy;
            const dist   = Math.sqrt(fromCx * fromCx + fromCy * fromCy);

            if (dist < REACH && cx > -999) {
              const falloff  = 1 - dist / REACH;
              const strength = falloff * falloff * REPEL * boost;
              const invDist  = 1 / (dist || 0.001);

              // Radial unit vector (away from cursor)
              const rx = fromCx * invDist;
              const ry = fromCy * invDist;
              // Tangential unit vector (CCW perpendicular) → creates the swirl
              const tx = -ry;
              const ty =  rx;

              // Target displacement = radial push + tangential drift
              const targetDx = (rx + tx * SWIRL) * strength;
              const targetDy = (ry + ty * SWIRL) * strength;

              d.vx += (targetDx - d.dx) * SPRING;
              d.vy += (targetDy - d.dy) * SPRING;

            } else {
              // Outside influence — spring back to grid origin
              d.vx += (0 - d.dx) * SPRING;
              d.vy += (0 - d.dy) * SPRING;
            }

            d.vx *= DAMPING;
            d.vy *= DAMPING;
            d.dx += d.vx;
            d.dy += d.vy;
          }

          const x = ox + d.dx;
          const y = oy + d.dy;

          // Displacement-based brightness
          const dispMag  = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
          const dispNorm = Math.min(dispMag / REPEL, 1);

          // Rim glow: ring of light at the parting boundary (~65% of REACH)
          const distO   = Math.sqrt((ox - cx) * (ox - cx) + (oy - cy) * (oy - cy));
          const rimEase = cx > -999
            ? Math.max(0, 1 - Math.abs(distO - REACH * 0.62) / (REACH * 0.42)) ** 1.6
            : 0;

          const ease = Math.max(dispNorm * 0.88, rimEase * 0.72);

          const r = BASE_R + (MAX_R - BASE_R) * ease;
          const a = BASE_A + (MAX_A - BASE_A) * ease;

          const dotColor = light
            ? `rgba(10,${Math.round(120 + 80 * ease)},50,${a})`
            : `rgba(46,${Math.round(180 + 60 * ease)},${Math.round(80 - 60 * ease)},${a})`;

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }

        requestAnimationFrame(draw);
      }

      draw();
      themeBtn.addEventListener('click', () => { ctx.clearRect(0, 0, W, H); });
}