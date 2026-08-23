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
