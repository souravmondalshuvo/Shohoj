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
import { campusHasFeedSnapshot } from './activeFeed.js';

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
  if (feature === undefined || profile == null) return false;
  return hasFeature(profile, feature) || legacyOnlyTab(profile, tabId);
}

/**
 * Tabs this page can serve for a campus although the registry does not list
 * the feature.
 *
 * The registry's `features` are shared with the React shell, and a feature
 * listed there switches the shell's route on too. The shell's Routine route
 * still reads BRACU's live feed, so listing `routine` for NSU would show NSU
 * students BRACU's timetable there. This page has NSU's own sections
 * (js/core/activeFeed.js), so it grants the tab itself, here, until the shell
 * can do the same and the registry can simply say so.
 */
function legacyOnlyTab(profile, tabId) {
  return tabId === 'routine' && campusHasFeedSnapshot(profile.id);
}

/** The tab ids a campus gets, in bar order. */
export function campusTabIds(profile) {
  return Object.keys(CALC_TAB_FEATURES).filter(tabId => campusAllowsTab(profile, tabId));
}
