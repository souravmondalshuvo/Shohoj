// js/core/assistantMorph.js
//
// The geometry behind the Assistant's opening move: the launcher pill grows
// into the chat panel, and shrinks back into the pill on the way out.
//
// The panel is not scaled — a 150×44 pill scaled up to a 380×560 box would
// stretch every corner and every glyph on the way. Instead the panel is mounted
// at its final size and CLIPPED to the pill's rectangle, and the clip is what
// animates. Corners interpolate from the pill's 999px radius down to the
// panel's, so the shape genuinely travels between the two; the CSS layers on
// top of this (the green wash, the content fade) sell the colour change.
//
// Authored in vanilla JS because both front-ends need it and build3.py flattens
// js/ into shohoj.html without a TypeScript step — the assistantClient.js
// precedent. The shell consumes it through js/core/assistantMorph.d.ts, so the
// two front-ends cannot drift apart on the timings or the maths.

/** How long the pill takes to become the panel. */
export const ASSISTANT_MORPH_OPEN_MS = 420;
/** The way back is quicker: leaving should not cost the student a beat. */
export const ASSISTANT_MORPH_CLOSE_MS = 280;

// Opening: quick off the mark, then a long glide into place — the shape stays
// readable the whole way, which is the entire point of the move.
const MORPH_EASING_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
// Closing is the mirror. Reusing the opening curve collapses the panel almost
// entirely in the first third and then dawdles, which reads as a glitch rather
// than as the panel going back where it came from.
const MORPH_EASING_CLOSE = 'cubic-bezier(0.5, 0, 0.9, 0.45)';

/**
 * The clip that makes the panel look exactly like the launcher pill.
 *
 * Insets are measured from the panel's own edges inward to the pill, so the
 * clip is expressed in the panel's coordinate space. They are floored at 0: a
 * pill that sits outside the panel's box (a narrow viewport, a mid-scroll
 * measurement) would otherwise produce a negative inset, which clips nothing
 * and makes the panel appear fully formed at frame one.
 *
 * @param {DOMRect|{top:number,right:number,bottom:number,left:number,width:number,height:number}} panelRect
 * @param {DOMRect|{top:number,right:number,bottom:number,left:number,width:number,height:number}} pillRect
 * @returns {string} a clip-path inset() value
 */
export function pillClipPath(panelRect, pillRect) {
  const top = Math.max(0, pillRect.top - panelRect.top);
  const right = Math.max(0, panelRect.right - pillRect.right);
  const bottom = Math.max(0, panelRect.bottom - pillRect.bottom);
  const left = Math.max(0, pillRect.left - panelRect.left);
  // Half the short side is what a 999px pill radius resolves to anyway; using
  // the resolved number keeps the interpolation honest at both ends.
  const radius = Math.max(0, Math.min(pillRect.width, pillRect.height) / 2);
  return `inset(${round(top)}px ${round(right)}px ${round(bottom)}px ${round(left)}px round ${round(radius)}px)`;
}

/**
 * The clip for the fully open panel: nothing clipped, the panel's own corners.
 * @param {string} radius computed border-radius of the panel
 */
export function panelClipPath(radius) {
  const corner = typeof radius === 'string' && radius.trim() ? radius.trim() : '0px';
  return `inset(0px 0px 0px 0px round ${corner})`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Whether the morph should run at all.
 *
 * Two ways it should not: the browser has no Web Animations API (the panel then
 * simply appears, which is the pre-morph behaviour), or the student asked for
 * reduced motion — a 420ms shape change is exactly what that setting is about.
 *
 * @param {Element|null} panel
 * @param {Window} [win]
 */
export function canMorphPanel(panel, win) {
  const view = win || (typeof window !== 'undefined' ? window : null);
  if (!panel || typeof panel.animate !== 'function' || !view) return false;
  if (typeof view.matchMedia !== 'function') return true;
  return !view.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate the panel between the pill's shape and its own.
 *
 * Returns the Animation so callers can await `finished` — the panel must stay
 * in the DOM until the closing morph is done, and the launcher must not be
 * hidden until the opening one is.
 *
 * @param {HTMLElement} panel the drawer
 * @param {DOMRect} pillRect the launcher's rect, measured while it was visible
 * @param {'open'|'close'} direction
 * @returns {Animation|null} null when the morph cannot or should not run
 */
export function morphPanel(panel, pillRect, direction) {
  if (!pillRect || !canMorphPanel(panel)) return null;
  const view = panel.ownerDocument?.defaultView || window;
  const pill = pillClipPath(panel.getBoundingClientRect(), pillRect);
  const full = panelClipPath(view.getComputedStyle(panel).borderRadius);
  const opening = direction !== 'close';
  return panel.animate(
    [{ clipPath: opening ? pill : full }, { clipPath: opening ? full : pill }],
    {
      duration: opening ? ASSISTANT_MORPH_OPEN_MS : ASSISTANT_MORPH_CLOSE_MS,
      easing: opening ? MORPH_EASING_OPEN : MORPH_EASING_CLOSE,
      // Held at the end frame: the closing panel must stay pill-shaped for the
      // frame or two between the animation finishing and the node being pulled.
      fill: 'both',
    },
  );
}
