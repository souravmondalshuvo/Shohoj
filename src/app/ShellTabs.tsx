// src/app/ShellTabs.tsx
//
// The shell's primary navigation, mirroring the legacy grouped tab bar
// (index.html:355-441). Legacy keeps the top level to five items — two single
// tabs flanking three dropdown groups — so the bar never has to scroll and new
// tools drop into a group instead of widening it. The shell's 19 routes map
// onto that same five-slot structure.
//
// Class names come from css/style.css and are load bearing: .calc-tabs,
// .calc-tab, .calc-tab-group[.open], .calc-tab-trigger, .calc-tab-menu and
// .calc-tab-slider are all styled there (style.css:2785-2891), and
// e2e-visual/ diffs the rendered result against the legacy page.
//
// Interaction semantics are ported from initTabGroups (js/main.js:440-483)
// rather than reinvented:
//   - hover devices open on mouseenter and close on a 180ms delay, because the
//     pointer crosses dead space between the trigger and the menu
//   - coarse pointers have no hover, so a click toggles
//   - only one group is open at a time; outside-click and Escape close all

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';

import { useUniversity } from './providers/AuthProvider';
import { hasFeature, type FeatureId, type UniversityProfile } from '../core/university';

interface TabLeaf {
  readonly to: string;
  readonly label: string;
  readonly icon: string;
  /** The campus feature this tab needs; mirrors the route's own guard. */
  readonly feature: FeatureId;
}

interface TabGroup {
  readonly group: string;
  readonly label: string;
  readonly icon: string;
  readonly items: readonly TabLeaf[];
}

type TabEntry = TabLeaf | TabGroup;

const isGroup = (entry: TabEntry): entry is TabGroup => 'items' in entry;

/** Five top-level slots, matching legacy's Calculator / Plan / Courses / Campus
 *  / Groups. Profile is deliberately absent: legacy reaches it from the
 *  top-right account pill, not the tab bar (index.html:439). */
const TABS: readonly TabEntry[] = [
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
function tabsFor(profile: UniversityProfile | null): readonly TabEntry[] {
  if (profile === null) return TABS;
  const keep = (leaf: TabLeaf) => hasFeature(profile, leaf.feature);
  return TABS.flatMap((entry): TabEntry[] => {
    if (!isGroup(entry)) return keep(entry) ? [entry] : [];
    const items = entry.items.filter(keep);
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

/** The group containing a path, or null when the path is a single tab. */
function groupOf(entries: readonly TabEntry[], pathname: string): string | null {
  for (const entry of entries) {
    if (isGroup(entry) && entry.items.some((item) => item.to === pathname)) return entry.group;
  }
  return null;
}

export function ShellTabs() {
  const { pathname } = useLocation();
  const university = useUniversity();
  const entries = useMemo(() => tabsFor(university), [university]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Hover is a device capability, not a viewport width — read it once.
  const canHover = useRef(false);
  useEffect(() => {
    canHover.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  const clearCloseTimer = () => clearTimeout(closeTimer.current);
  const open = useCallback((group: string) => {
    clearCloseTimer();
    setOpenGroup(group);
  }, []);
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenGroup(null), 180);
  }, []);

  // Outside-click and Escape close every group, as in legacy.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      clearCloseTimer();
    };
  }, []);

  // A route change came from picking a menu item; the menu should not linger.
  useEffect(() => setOpenGroup(null), [pathname]);

  // The slider tracks the active pill. When the active route lives inside a
  // group it tracks that group's trigger, not the hidden menu item — same rule
  // as _moveTabSlider (js/main.js:485-494). Layout effect so it lands before
  // paint instead of visibly jumping on first render.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const slider = sliderRef.current;
    if (!bar || !slider) return;
    const active = bar.querySelector<HTMLElement>('[data-active-pill="true"]');
    if (!active) {
      slider.style.width = '0px';
      return;
    }
    slider.style.width = `${active.offsetWidth}px`;
    slider.style.transform = `translateX(${active.offsetLeft}px)`;
  }, [pathname]);

  const activeGroup = groupOf(entries, pathname);

  return (
    <div className="calc-tabs" ref={barRef}>
      <div className="calc-tab-slider" ref={sliderRef} />

      {entries.map((entry) => {
        if (!isGroup(entry)) {
          return (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) => (isActive ? 'calc-tab active' : 'calc-tab')}
              data-active-pill={pathname === entry.to ? 'true' : undefined}
            >
              <span className="calc-tab-icon" aria-hidden="true">
                {entry.icon}
              </span>
              <span>{entry.label}</span>
            </NavLink>
          );
        }

        const isOpen = openGroup === entry.group;
        const holdsActive = activeGroup === entry.group;

        return (
          <div
            key={entry.group}
            className={isOpen ? 'calc-tab-group open' : 'calc-tab-group'}
            data-group={entry.group}
            onMouseEnter={() => canHover.current && open(entry.group)}
            onMouseLeave={() => canHover.current && scheduleClose()}
          >
            <button
              type="button"
              className={
                holdsActive ? 'calc-tab calc-tab-trigger active' : 'calc-tab calc-tab-trigger'
              }
              aria-haspopup="true"
              aria-expanded={isOpen}
              data-active-pill={holdsActive ? 'true' : undefined}
              onClick={(event) => {
                event.stopPropagation();
                // Hover already opened it, so a click just guarantees open.
                // Coarse pointers have no hover, so the click toggles.
                if (canHover.current || !isOpen) open(entry.group);
                else setOpenGroup(null);
              }}
            >
              <span className="calc-tab-icon" aria-hidden="true">
                {entry.icon}
              </span>
              <span>{entry.label}</span>
              <span className="calc-tab-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {/* Legacy marks this role="menu" with role="menuitem" children
                (index.html:377). Deliberately not mirrored: those roles are for
                application menus, and a navigation dropdown should expose plain
                links — which is also what every caller queries by. Roles do not
                affect rendering, so parity is unaffected. */}
            <div className="calc-tab-menu">
              {entry.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? 'calc-tab-menu-item active' : 'calc-tab-menu-item'
                  }
                >
                  <span className="calc-tab-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
