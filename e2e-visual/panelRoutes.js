// The legacy-panel <-> shell-route map.
//
// Legacy is ONE page whose ten features are `.calc-tab-panel` divs toggled by
// switchCalcTab (js/main.js:504), and it exposes a deterministic hash for each
// one via restoreCalcTab (js/main.js:582) — so a harness can put the page on any
// panel without clicking through dropdown menus or racing animations.
//
// The shell is routed, so the same ten features are ten URLs. This table is the
// correspondence, and it is what lets the cross-project visual harness compare
// them pairwise instead of only comparing the landing page.
//
// `hash` is what restoreCalcTab understands; `panel` is the id from TAB_MAP
// (js/main.js:422); `route` is the shell path. Every legacy panel now has one:
// the playground was the last null, closed by #592.

// A CAVEAT on comparing these pairwise, learned the hard way (#600).
//
// Two of these routes cannot be in the same STATE on both sides of the harness,
// so their height difference is not a defect and chasing it wastes a day:
//
//   groups, papers  The shell captures signed IN (the auth seam) against a
//                   preview build with no Firebase configured, so both render
//                   their "backend unavailable" branch. Legacy captures signed
//                   OUT, so both render a sign-in prompt. Different states,
//                   superficially similar, ~-97 and ~-42 apart.
//
//   playground      Legacy's #tabPlayground is the ONE panel with no .calc-body
//                   inside it — its boxes sit directly in the panel — while the
//                   shell's <main> always carries that padding. The route books
//                   ~84px of container inset as divergence. Its comparable box
//                   is .simulator-box, not main.
//
// Width parity still holds for all three, which is what the always-on gate
// asserts. It is only the heights that are reading unlike things.

export const PANEL_ROUTES = [
  { name: 'calculator', hash: '#calculator', panel: 'tabCalculator', route: '/calculator' },
  { name: 'planner', hash: '#calculator/planner', panel: 'tabPlanner', route: '/planner' },
  {
    name: 'playground',
    hash: '#calculator/playground',
    panel: 'tabPlayground',
    route: '/playground',
  },
  { name: 'reviews', hash: '#calculator/reviews', panel: 'tabReviews', route: '/reviews' },
  {
    name: 'difficulty',
    hash: '#calculator/difficulty',
    panel: 'tabDifficulty',
    route: '/difficulty',
  },
  { name: 'papers', hash: '#calculator/papers', panel: 'tabPapers', route: '/papers' },
  { name: 'routine', hash: '#calculator/routine', panel: 'tabRoutine', route: '/routine' },
  { name: 'seats', hash: '#calculator/seats', panel: 'tabSeats', route: '/seats' },
  { name: 'freerooms', hash: '#calculator/freerooms', panel: 'tabFreeRooms', route: '/rooms' },
  { name: 'groups', hash: '#calculator/groups', panel: 'tabGroups', route: '/groups' },
];
