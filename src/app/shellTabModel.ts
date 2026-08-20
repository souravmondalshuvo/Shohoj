// src/app/shellTabModel.ts
//
// The tab bar's data model, split out from the component so the campus
// filtering can be tested without a DOM. What a student is allowed to see is
// the part of this file worth pinning down; the hover/click behaviour around
// it is not.

import { hasFeature, type FeatureId, type UniversityProfile } from '../core/university';

export interface TabLeaf {
  readonly to: string;
  readonly label: string;
  readonly icon: string;
  /** The campus feature this tab needs; mirrors the route's own guard. */
  readonly feature: FeatureId;
}

export interface TabGroup {
  readonly group: string;
  readonly label: string;
  readonly icon: string;
  readonly items: readonly TabLeaf[];
}

export type TabEntry = TabLeaf | TabGroup;

export const isGroup = (entry: TabEntry): entry is TabGroup => 'items' in entry;

/** Five top-level slots, matching legacy's Calculator / Plan / Courses / Campus
 *  / Groups. Profile is deliberately absent: legacy reaches it from the
 *  top-right account pill, not the tab bar (index.html:439). */
export const TABS: readonly TabEntry[] = [
  { to: '/calculator', label: 'Calculator', icon: '🧮', feature: 'calculator' },
  {
    group: 'plan',
    label: 'Plan',
    icon: '📅',
    items: [
      { to: '/planner', label: 'Planner', icon: '📅', feature: 'planner' },
      { to: '/routine', label: 'Routine', icon: '🗓️', feature: 'routine' },
      { to: '/transcript', label: 'Transcript', icon: '📄', feature: 'transcript' },
      { to: '/degree-progress', label: 'Degree', icon: '🎓', feature: 'degree' },
    ],
  },
  {
    group: 'courses',
    label: 'Courses',
    icon: '📚',
    items: [
      { to: '/reviews', label: 'Reviews', icon: '⭐', feature: 'reviews' },
      { to: '/difficulty', label: 'Difficulty', icon: '🗺️', feature: 'difficulty' },
      { to: '/papers', label: 'Papers', icon: '📚', feature: 'papers' },
    ],
  },
  {
    group: 'campus',
    label: 'Campus',
    icon: '🏫',
    items: [
      { to: '/seats', label: 'Seats', icon: '🪑', feature: 'seats' },
      { to: '/rooms', label: 'Free Rooms', icon: '🚪', feature: 'rooms' },
      { to: '/campus', label: 'Campus Map', icon: '📍', feature: 'campus' },
      { to: '/bus', label: 'Bus', icon: '🚌', feature: 'bus' },
      { to: '/lost-found', label: 'Lost & Found', icon: '🎒', feature: 'lostFound' },
      { to: '/cafeteria', label: 'Cafeteria', icon: '🍽️', feature: 'cafeteria' },
      // Legacy has no Feedback link anywhere in the nav, and the top level is
      // capped at five slots, so it lands in a group. Placement is a judgment
      // call — move it if another group reads better.
      { to: '/feedback', label: 'Feedback', icon: '💬', feature: 'feedback' },
    ],
  },
  { to: '/groups', label: 'Groups', icon: '🧑‍🤝‍🧑', feature: 'groups' },
];

/**
 * The tab bar for one campus: entries whose feature the profile enables.
 *
 * A group whose every child is filtered out disappears entirely rather than
 * rendering an empty dropdown — at NSU the whole Campus group goes, because
 * every screen in it is a projection of BRACU's CONNECT feed or hand-collected
 * Merul Badda data.
 *
 * A null profile (signed out, or an admin with no campus of their own) keeps
 * the full bar. Signed-out never renders this component, and hiding tabs from
 * an admin would take away the screens they moderate — the same exemption
 * RequireFeature and firestore.rules make.
 */
export function tabsFor(profile: UniversityProfile | null): readonly TabEntry[] {
  if (profile === null) return TABS;
  const keep = (leaf: TabLeaf) => hasFeature(profile, leaf.feature);
  return TABS.flatMap((entry): TabEntry[] => {
    if (!isGroup(entry)) return keep(entry) ? [entry] : [];
    const items = entry.items.filter(keep);
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

/** The group containing a path, or null when the path is a single tab. */
export function groupOf(entries: readonly TabEntry[], pathname: string): string | null {
  for (const entry of entries) {
    if (isGroup(entry) && entry.items.some((item) => item.to === pathname)) return entry.group;
  }
  return null;
}
