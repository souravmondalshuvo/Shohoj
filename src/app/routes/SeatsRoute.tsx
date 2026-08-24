// src/app/routes/SeatsRoute.tsx
//
// Seat status browser (Phase 6 shell migration of the legacy seatsTab.js,
// #397). This first slice ports the seat lookup: search a course, see each of
// its sections with a live open/tight/full seat badge, sortable by section or
// seats-left, with an "open seats only" filter.
//
// The seat math + search live in the already-typed src/core/seatStatus module;
// this component is the thin React shell over it, consuming the CONNECT feed the
// same way RoutineRoute / CampusRoute do. The seat-drop watchlist + email alerts
// (auth + Firestore + background polling, shared with the Profile tab) are a
// deferred follow-up slice under #397.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import {
  indexByCourse,
  type NormalizedSection,
  type SectionIndex,
  type WeekdayName,
} from '../../core/connectFeed';
import { feedAgeLabel, feedSourceLabel } from '../../core/feedFreshness.ts';
import { searchCourseSections, seatInfo, type SeatSortMode } from '../../core/seatStatus';
import {
  addWatch,
  isWatched,
  parseWatches,
  removeWatch,
  serializeWatches,
  MAX_WATCHES,
  SEAT_WATCH_STORAGE_KEY,
  type WatchEntry,
} from '../../core/seatWatch';
import { useSeatAlertSync } from '../providers/useSeatAlertSync';

// Email-alert pref (managed on Profile; absent → armed). Read live so a toggle
// there is honoured by the next watch change here.
function alertsEnabled(): boolean {
  try {
    return localStorage.getItem('shohoj_seat_alerts_enabled') !== '0';
  } catch {
    return true;
  }
}

const DAY_LABEL: Record<WeekdayName, string> = {
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};

const STATUS_LABEL: Record<'open' | 'tight' | 'full', string> = {
  open: 'Open',
  tight: 'Almost full',
  full: 'Full',
};

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function slotSummary(section: NormalizedSection): string {
  if (section.classSlots.length === 0) return 'No scheduled class slots';
  return section.classSlots
    .map((s) => `${DAY_LABEL[s.day]} ${fmtMinutes(s.startMin)}–${fmtMinutes(s.endMin)}`)
    .join(' · ');
}

interface FeedState {
  index: SectionIndex;
  source: FeedSource;
  count: number;
  /** When the feed was pulled — the badge reports how stale it is. */
  fetchedAt: number;
}

export function Component() {
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SeatSortMode>('section');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [watches, setWatches] = useState<WatchEntry[]>(() => {
    try {
      return parseWatches(localStorage.getItem(SEAT_WATCH_STORAGE_KEY));
    } catch {
      return [];
    }
  });

  // Persist the watchlist so the Profile hub and the seat-drop alerts see it.
  useEffect(() => {
    try {
      localStorage.setItem(SEAT_WATCH_STORAGE_KEY, serializeWatches(watches));
    } catch {
      // Storage off — the watchlist just won't survive a reload.
    }
  }, [watches]);

  const atWatchLimit = watches.length >= MAX_WATCHES;
  const syncSeatAlerts = useSeatAlertSync();
  const toggleWatch = (section: NormalizedSection) => {
    setWatches((prev) => {
      const next = isWatched(prev, section.sectionId)
        ? removeWatch(prev, section.sectionId)
        : addWatch(prev, section);
      // Mirror the new set to the cron Worker (when signed in) so it can email.
      syncSeatAlerts(next, alertsEnabled());
      return next;
    });
  };

  // Load the CONNECT feed (cache-first, same client as RoutineRoute).
  //
  // `forceRefresh` is what the header's Refresh button needs. Seat counts move
  // through registration, and legacy has always let a student re-pull them
  // without reloading the page (js/ui/seatsTab.js:367) — the shell only ever
  // fetched once per mount, so a stale count could sit there indefinitely.
  const load = useCallback((forceRefresh: boolean) => {
    let alive = true;
    setFeedError(null);
    fetchConnectFeed({ forceRefresh })
      .then((result) => {
        if (!alive) return;
        setFeed({
          index: indexByCourse(result.sections),
          source: result.source,
          count: result.sections.length,
          fetchedAt: result.fetchedAt,
        });
      })
      .catch(() => {
        if (alive) setFeedError('Could not load the seat feed. Try again shortly.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(false), [load]);

  const trimmedQuery = query.trim();
  const groups = useMemo(() => {
    if (!feed || trimmedQuery === '') return [];
    return searchCourseSections(feed.index, trimmedQuery, { sort: sortMode, availableOnly });
  }, [feed, trimmedQuery, sortMode, availableOnly]);

  // Legacy's quick picks: the six courses carrying the most sections, straight
  // off the feed index (js/ui/seatsTab.js:305). They are the whole reason its
  // empty state is 226px where the shell's was 95 — and they are the difference
  // between "type something" and one tap into the busiest course on campus.
  const quickPicks = useMemo(() => {
    if (!feed) return [];
    return [...feed.index.keys()]
      .sort((a, b) => (feed.index.get(b)?.length ?? 0) - (feed.index.get(a)?.length ?? 0))
      .slice(0, 6);
  }, [feed]);

  return (
    <section className="shell-page seats-page seats-tab" data-testid="seats-page">
      {/* Legacy's one-row header (js/ui/seatsTab.js:359): title on the left with
          the feed badge beside it. The shell spread the same information over an
          <h1>, a description legacy does not have, and a third status line —
          100px against legacy's 31.
 */}
      <div className="seats-header">
        <div className="seats-header-left">
          <h1>🪑 Seat Status</h1>
          {feed && (
            <span
              className={`seats-source-badge seats-source--${feed.source}`}
              title={`Source: ${feedSourceLabel(feed.source)} • Updated ${feedAgeLabel(feed.fetchedAt)}`}
              data-testid="seats-feed-source"
            >
              {feedSourceLabel(feed.source)} · {feedAgeLabel(feed.fetchedAt)}
            </span>
          )}
        </div>
        <div className="seats-header-right">
          <button type="button" className="btn-secondary btn-sm" onClick={() => load(true)}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ marginRight: 6 }}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <p className="seats-loading-note" data-testid="seats-loading">
          Loading the seat feed…
        </p>
      )}
      {feedError && (
        <p className="seats-error" role="alert">
          {feedError}
        </p>
      )}

      {/* Legacy's search row: the icon is positioned over the input rather than
          labelled above it (style.css:6719), which is 25px shorter. The input
          keeps an accessible name through aria-label, since there is no visible
          <label> to point at. */}
      <div className="seats-searchbar">
        <span className="seats-search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          id="seats-course-input"
          className="seats-search-input"
          type="text"
          aria-label="Search a course"
          placeholder="Search a course code, e.g. CSE220"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="seats-search-input"
        />
      </div>

      {/* Legacy's controls are chips throughout, with `.is-active` marking the
          selection (js/ui/seatsTab.js:386) — including "Open seats only", which
          the shell had built as a checkbox in a <label>. Same state, same
          aria-pressed, legacy's affordance. */}
      <div className="seats-controls">
        <div className="seats-sort" role="group" aria-label="Sort sections">
          <span className="seats-sort-label">Sort</span>
          <button
            type="button"
            className={sortMode === 'section' ? 'seats-chip is-active' : 'seats-chip'}
            aria-pressed={sortMode === 'section'}
            onClick={() => setSortMode('section')}
          >
            Section #
          </button>
          <button
            type="button"
            className={sortMode === 'seats' ? 'seats-chip is-active' : 'seats-chip'}
            aria-pressed={sortMode === 'seats'}
            onClick={() => setSortMode('seats')}
          >
            Seats left
          </button>
        </div>
        <button
          type="button"
          className={
            availableOnly
              ? 'seats-chip seats-chip--filter is-active'
              : 'seats-chip seats-chip--filter'
          }
          aria-pressed={availableOnly}
          title="Hide sections with no seats left"
          onClick={() => setAvailableOnly(!availableOnly)}
          data-testid="seats-available-only"
        >
          Open seats only
        </button>
      </div>

      {trimmedQuery === '' ? (
        <div className="seats-empty" data-testid="seats-prompt">
          <div className="seats-empty-icon" aria-hidden="true">
            🪑
          </div>
          <div className="seats-empty-title">Check a seat in seconds</div>
          <div className="seats-empty-sub">
            Type a course code to see live seats, faculty &amp; rooms
            {quickPicks.length > 0 ? ' — or start with one of these:' : '.'}
          </div>
          {quickPicks.length > 0 && (
            <div className="seats-quickpicks">
              {quickPicks.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="seats-chip seats-quickpick"
                  onClick={() => setQuery(code)}
                  data-testid={`seats-quickpick-${code}`}
                >
                  {code}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : groups.length === 0 ? (
        <p className="seats-empty shell-muted" data-testid="seats-no-results">
          No {availableOnly ? 'open ' : ''}sections match “{trimmedQuery}”.
        </p>
      ) : (
        <ul className="seats-groups" data-testid="seats-groups">
          {groups.map((group) => (
            <li
              className="seats-group"
              key={group.courseCode}
              data-testid={`seats-group-${group.courseCode}`}
            >
              <div className="seats-group-head">
                <span className="seats-group-code">{group.courseCode}</span>
                {group.courseName && <span className="seats-group-name">{group.courseName}</span>}
                <span className="seats-group-summary">
                  {group.summary.openSections}/{group.summary.totalSections} open ·{' '}
                  {group.summary.seatsLeft} seat
                  {group.summary.seatsLeft === 1 ? '' : 's'} left
                </span>
              </div>
              <ul className="seats-sections">
                {group.sections.map((section) => {
                  const info = seatInfo(section);
                  const watched = isWatched(watches, section.sectionId);
                  return (
                    <li className="seats-section" key={section.sectionId}>
                      <div className="seats-section-main">
                        <span className="seats-section-name">Section {section.sectionName}</span>
                        <span
                          className={`seats-badge seats-badge--${info.status}`}
                          data-status={info.status}
                        >
                          {STATUS_LABEL[info.status]}
                        </span>
                        <span className="seats-section-count">
                          {info.left} / {info.capacity} left
                        </span>
                      </div>
                      <div className="seats-section-meta">
                        {section.facultyInitials || 'TBA'}
                        {section.roomName ? ` · ${section.roomName}` : ''}
                      </div>
                      <div className="seats-section-slots">{slotSummary(section)}</div>
                      <button
                        type="button"
                        className={watched ? 'seats-watch seats-watch--on' : 'seats-watch'}
                        aria-pressed={watched}
                        disabled={!watched && atWatchLimit}
                        onClick={() => toggleWatch(section)}
                        data-testid={`seats-watch-${section.sectionId}`}
                        title={
                          !watched && atWatchLimit
                            ? `Watchlist is full (${MAX_WATCHES} max)`
                            : undefined
                        }
                      >
                        {watched ? '★ Watching' : '☆ Watch'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
