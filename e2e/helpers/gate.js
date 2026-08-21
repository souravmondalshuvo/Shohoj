// Shared unlock for the campus gate (js/ui/signinPortal.js).
//
// The calculator is hidden until sign-in resolves a student to a campus, so a
// spec that boots the page signed out now lands on the sign-in portal with the
// tool hidden. Almost every spec in this suite is about what the CALCULATOR
// does, not about the gate, and Firebase is deliberately unreachable here
// (boot() aborts https), so those specs would otherwise spend their whole
// budget waiting for an auth state that never arrives.
//
// This sets the same session flag the portal's own escape hatches set, which is
// exactly what a returning student's browser looks like. The gate itself is
// exercised — signed out, no flag — in e2e/campus-gate.spec.js.
//
// Call this AFTER any addInitScript that clears storage, or the clear wipes it.

export const UNLOCK_KEY = 'shohoj_calc_unlocked';

/** @param {import('@playwright/test').Page} page */
export async function unlockCalculator(page) {
  await page.addInitScript(key => {
    try { sessionStorage.setItem(key, '1'); } catch (_e) { /* private mode */ }
  }, UNLOCK_KEY);
}
