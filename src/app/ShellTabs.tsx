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
import { groupOf, isGroup, tabsFor } from './shellTabModel';

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
  // as _moveTabSlider (js/main.js:508-529).
  const positionSlider = useCallback(() => {
    const bar = barRef.current;
    const slider = sliderRef.current;
    if (!bar || !slider) return;
    const active = bar.querySelector<HTMLElement>('[data-active-pill="true"]');
    if (!active) {
      // Collapsing to width 0 is not enough to hide it: the slider's own
      // borders still paint a 2px sliver in the bar's left cap, which reads as
      // a stray text cursor on Home. data-active drives the stylesheet's
      // opacity, mirroring legacy's _moveTabSlider.
      slider.dataset.active = 'false';
      slider.style.width = '0px';
      return;
    }
    // Position with `left`, exactly as legacy does, rather than a transform on
    // top of the stylesheet's own `left: 4px`: that left the bar's 4px padding
    // counted twice, and `transform` is not in the slider's transition list so
    // the pill teleported between tabs instead of sliding.
    //
    // offsetLeft is measured from the offset parent, which is the bar for a
    // top-level tab but the (position: relative) group for a trigger — so a
    // trigger's own offsetLeft is ~0 and the group's has to be added back.
    const group = active.closest<HTMLElement>('.calc-tab-group');
    const left = group ? group.offsetLeft + active.offsetLeft : active.offsetLeft;
    slider.style.left = `${left}px`;
    slider.style.width = `${active.offsetWidth}px`;
    slider.dataset.active = 'true';
  }, []);

  // Layout effect so it lands before paint instead of visibly jumping on first
  // render — but one measurement is not enough. The bar keeps moving after the
  // route commits: the emoji font arrives, the route's own content decides
  // whether there is a scrollbar, and the pills are `flex: 1 0 auto` so any of
  // that resizes them. Legacy re-runs _moveTabSlider on window resize
  // (js/main.js:915); an observer covers that plus the post-commit reflow that
  // left the slider a stale 68px too wide on /calculator.
  useLayoutEffect(() => {
    positionSlider();
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => positionSlider());
    // The bar for viewport changes, and each pill because a sibling growing
    // moves the active one without the bar's own box changing at all.
    observer.observe(bar);
    bar.querySelectorAll<HTMLElement>('.calc-tab').forEach((pill) => observer.observe(pill));
    return () => observer.disconnect();
  }, [pathname, positionSlider]);

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
