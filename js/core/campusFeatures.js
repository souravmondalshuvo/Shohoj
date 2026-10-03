// ── CAMPUS FEATURES (legacy bundle) ──────────────────────────────────────────
//
// Which calculator tabs a campus gets. The legacy twin of the shell's
// tabsFor() (src/app/shellTabModel.ts): a tab is shown only when the campus's
// profile in js/core/university.js lists the feature behind it.
//
// A tab is hidden when Shohoj has no data for that campus, not as a matter of
// access: Routine, Seats and Free Rooms read BRACU's section feed, Difficulty
// and Tasks read BRACU's catalogue. Showing them to an NSU student would be a
// BRACU tool wearing their name. firestore.rules is the authorization
// boundary; nothing here is.

import { hasFeature } from './university.js';

/**
 * Legacy tab id → the registry feature that backs it. The ids differ in one
 * place: the tab is `freerooms`, the feature is `rooms`.
 */
export const CALC_TAB_FEATURES = {
  calculator: 'calculator',
  planner:    'planner',
  playground: 'playground',
  routine:    'routine',
  tasks:      'tasks',
  reviews:    'reviews',
  difficulty: 'difficulty',
  papers:     'papers',
  seats:      'seats',
  freerooms:  'rooms',
  groups:     'groups',
};

/**
 * Whether a campus gets a calculator tab. An unknown tab id is refused rather
 * than waved through — a tab added to the page without a feature here should
 * fail closed for every campus that did not opt in, and tests/campusFeatures
 * pins this map against the page so that cannot happen silently.
 */
export function campusAllowsTab(profile, tabId) {
  const feature = CALC_TAB_FEATURES[tabId];
  return feature !== undefined && hasFeature(profile, feature);
}

/** The tab ids a campus gets, in bar order. */
export function campusTabIds(profile) {
  return Object.keys(CALC_TAB_FEATURES).filter(tabId => campusAllowsTab(profile, tabId));
}
