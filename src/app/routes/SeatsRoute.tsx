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

import { useEffect, useMemo, useState } from 'react';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import {
  indexByCourse,
  type NormalizedSection,
  type SectionIndex,
  type WeekdayName,
} from '../../core/connectFeed';
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

  // Load the CONNECT feed once (cache-first, same client as RoutineRoute).
  useEffect(() => {
    let alive = true;
    fetchConnectFeed()
      .then((result) => {
        if (!alive) return;
        setFeed({
          index: indexByCourse(result.sections),
          source: result.source,
          count: result.sections.length,
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

  const trimmedQuery = query.trim();
  const groups = useMemo(() => {
    if (!feed || trimmedQuery === '') return [];
    return searchCourseSections(feed.index, trimmedQuery, { sort: sortMode, availableOnly });
  }, [feed, trimmedQuery, sortMode, availableOnly]);

  return (
    <section className="shell-page seats-page" data-testid="seats-page">
      <h1>Seat Status</h1>
      <p className="shell-muted">
        Search a course to see live seat availability per section. Seats change as registration
        moves — refresh for the latest; this reflects the last feed pull.
      </p>

      {loading && (
        <p className="seats-feed-status" data-testid="seats-loading">
          Loading the seat feed…
        </p>
      )}
      {feedError && (
        <p className="seats-feed-status seats-feed-error" role="alert">
          {feedError}
        </p>
      )}
      {feed && (
        <p className="seats-feed-status shell-muted" data-testid="seats-feed-source">
          {feed.count} sections loaded{feed.source === 'live' ? ' (live)' : ' (cached)'}.
        </p>
      )}

      <div className="seats-search">
        <label className="seats-search-label" htmlFor="seats-course-input">
          Search a course
        </label>
        <input
          id="seats-course-input"
          className="seats-search-input"
          type="search"
          placeholder="e.g. CSE110 or Programming"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="seats-search-input"
        />
      </div>

      <div className="seats-controls" role="group" aria-label="Sort and filter">
        <div className="seats-sort" role="group" aria-label="Sort by">
          <button
            type="button"
            className={
              sortMode === 'section' ? 'seats-toggle seats-toggle--active' : 'seats-toggle'
            }
            aria-pressed={sortMode === 'section'}
            onClick={() => setSortMode('section')}
          >
            Section
          </button>
          <button
            type="button"
            className={sortMode === 'seats' ? 'seats-toggle seats-toggle--active' : 'seats-toggle'}
            aria-pressed={sortMode === 'seats'}
            onClick={() => setSortMode('seats')}
          >
            Seats left
          </button>
        </div>
        <label className="seats-available">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            data-testid="seats-available-only"
          />
          Open seats only
        </label>
      </div>

      {trimmedQuery === '' ? (
        <p className="seats-empty shell-muted" data-testid="seats-prompt">
          Type a course code or name above to check seats.
        </p>
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
