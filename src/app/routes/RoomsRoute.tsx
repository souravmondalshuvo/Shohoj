// src/app/routes/RoomsRoute.tsx
//
// Free Rooms finder on the shell (#434), the React port of the legacy
// js/ui/freeRoomsTab.js. Answers "which rooms are empty on day D at time T"
// from the live CONNECT feed: day chips + a time picker (with a Now shortcut),
// a free-only vs all-rooms view toggle, a room-type filter, and per-room cards
// that open a weekly free/busy timeline dialog.
//
// All availability math lives in the typed src/core/freeRooms module; this
// component is the thin React shell over it, consuming the feed the same way
// SeatsRoute / CampusRoute do.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import type { WeekdayName } from '../../core/connectFeed';
import {
  buildRoomBusyIndex,
  busyOnDay,
  dayTimeline,
  freeRoomsAt,
  freeWindowsForRoom,
  isLabOccupant,
  listAllRooms,
  occupantAt,
  roomTypeKey,
  CAMPUS_START_MIN,
  CAMPUS_END_MIN,
  ROOM_TYPE_LABELS,
  type BusyInterval,
  type RoomTypeKey,
} from '../../core/freeRooms';
import { trapTabKey, useRestoreFocus } from '../../shared/ui/useFocusTrap';

const DAY_ORDER: readonly WeekdayName[] = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];
const DAY_SHORT: Record<WeekdayName, string> = {
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};
// Date.getDay() (0=Sun..6=Sat) -> canonical day name.
const WEEKDAY_BY_INDEX: readonly WeekdayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const TYPE_FILTERS: readonly { key: RoomTypeKey | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'C', label: 'Class' },
  { key: 'L', label: 'Lab' },
  { key: 'T', label: 'Theater' },
];

const SOURCE_LABEL: Record<FeedSource, string> = {
  live: 'Live',
  cache: 'Cached',
  fallback: 'Offline copy',
};

function clampMinute(m: number): number {
  return Math.max(CAMPUS_START_MIN, Math.min(CAMPUS_END_MIN - 1, m));
}
function nowMinute(): number {
  const d = new Date();
  return clampMinute(d.getHours() * 60 + d.getMinutes());
}
function hhmm24(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function fmt12(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(min) ? min : null;
}

type BusyIndex = Map<string, BusyInterval[]>;

interface FeedState {
  index: BusyIndex;
  source: FeedSource;
}

// Card status text: "free until 11:00 AM" / "in class · CSE110 Section 01 · …".
function roomStatus(
  index: BusyIndex,
  room: string,
  day: WeekdayName,
  minute: number,
): { free: boolean; lab: boolean; label: string } {
  const occ = occupantAt(index, room, day, minute);
  if (!occ) {
    const win = freeWindowsForRoom(index, room, day).find(
      (w) => minute >= w.startMin && minute < w.endMin,
    );
    const label =
      !win || win.endMin >= CAMPUS_END_MIN ? 'free rest of day' : `free until ${fmt12(win.endMin)}`;
    return { free: true, lab: false, label };
  }
  const lab = isLabOccupant(room, occ.kind);
  const sec = occ.sectionName ? `${occ.courseCode} Section ${occ.sectionName}` : occ.courseCode;
  return {
    free: false,
    lab,
    label: `${lab ? 'in lab' : 'in class'} · ${sec} · until ${fmt12(occ.endMin)}`,
  };
}

function RoomWeekDialog({
  index,
  room,
  activeDay,
  onClose,
}: {
  readonly index: BusyIndex;
  readonly room: string;
  readonly activeDay: WeekdayName;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useRestoreFocus();
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="shell-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          return;
        }
        trapTabKey(e, dialogRef);
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="shell-modal rooms-week-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rooms-week-title"
        data-testid="rooms-week-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rooms-week-title" className="shell-modal-title">
          {room} · weekly availability
        </h2>
        <div className="rooms-week">
          {DAY_ORDER.map((day) => {
            const segs = dayTimeline(index, room, day);
            const hasClasses = busyOnDay(index, room, day).length > 0;
            return (
              <div
                key={day}
                className={
                  day === activeDay ? 'rooms-week-row rooms-week-row--active' : 'rooms-week-row'
                }
              >
                <div className="rooms-week-day">{DAY_SHORT[day]}</div>
                <ul className="rooms-week-segs">
                  {!hasClasses ? (
                    <li className="rooms-seg rooms-seg--none">No class data</li>
                  ) : (
                    segs.map((s, i) => {
                      const cls = !s.busy
                        ? 'rooms-seg rooms-seg--free'
                        : s.lab
                          ? 'rooms-seg rooms-seg--lab'
                          : 'rooms-seg rooms-seg--busy';
                      const label = !s.busy
                        ? 'free'
                        : `${s.sectionName ? `${s.courseCode} Section ${s.sectionName}` : s.courseCode}${s.lab ? ' · lab' : ''}`;
                      return (
                        <li key={i} className={cls}>
                          <span className="rooms-seg-time">
                            {fmt12(s.startMin)} – {fmt12(s.endMin)}
                          </span>
                          <span className="rooms-seg-label">{label}</span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
        <button type="button" className="shell-btn rooms-week-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function Component() {
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [day, setDay] = useState<WeekdayName>(() => WEEKDAY_BY_INDEX[new Date().getDay()]);
  const [minute, setMinute] = useState<number>(nowMinute);
  const [showAll, setShowAll] = useState(false);
  const [roomType, setRoomType] = useState<RoomTypeKey | 'ALL'>('ALL');
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  const load = useCallback((forceRefresh: boolean) => {
    let live = true;
    setFeedError(null);
    fetchConnectFeed({ forceRefresh })
      .then((result) => {
        if (!live) return;
        setFeed({ index: buildRoomBusyIndex(result.sections), source: result.source });
      })
      .catch(() => {
        if (live) setFeedError('Could not load the class schedule feed.');
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => load(false), [load]);

  const rooms = useMemo(() => {
    if (!feed) return [];
    if (!showAll) return freeRoomsAt(feed.index, day, minute);
    const all = listAllRooms(feed.index);
    return roomType === 'ALL' ? all : all.filter((r) => roomTypeKey(r) === roomType);
  }, [feed, showAll, roomType, day, minute]);

  const freeCount = useMemo(() => {
    if (!feed || !showAll) return rooms.length;
    return rooms.filter((r) => !occupantAt(feed.index, r, day, minute)).length;
  }, [feed, showAll, rooms, day, minute]);

  const when = `${DAY_SHORT[day]} ${fmt12(minute)}`;

  return (
    <section className="shell-page rooms-page" data-testid="rooms-page">
      <h1>Free Rooms</h1>
      <p className="shell-muted">
        Which rooms are empty right now? Pick a day and time — availability comes live from the
        class schedule feed.
      </p>

      {feedError !== null ? (
        <div className="rooms-error" data-testid="rooms-error">
          <p>{feedError}</p>
          <button type="button" className="shell-btn" onClick={() => load(true)}>
            Retry
          </button>
        </div>
      ) : !feed ? (
        <p role="status">Loading the schedule feed…</p>
      ) : (
        <>
          <div className="rooms-meta">
            <span className="rooms-meta-item" data-testid="rooms-feed-source">
              {SOURCE_LABEL[feed.source]} feed
            </span>
            <button type="button" className="shell-btn rooms-meta-btn" onClick={() => load(true)}>
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

          <div className="rooms-controls">
            <div className="rooms-days" role="group" aria-label="Day">
              {DAY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={d === day ? 'rooms-chip rooms-chip--active' : 'rooms-chip'}
                  aria-pressed={d === day}
                  onClick={() => setDay(d)}
                  data-testid={`rooms-day-${DAY_SHORT[d]}`}
                >
                  {DAY_SHORT[d]}
                </button>
              ))}
            </div>
            <div className="rooms-time-wrap">
              <label className="rooms-time-label" htmlFor="rooms-time-input">
                at
              </label>
              <input
                id="rooms-time-input"
                className="rooms-time"
                type="time"
                value={hhmm24(minute)}
                min={hhmm24(CAMPUS_START_MIN)}
                max={hhmm24(CAMPUS_END_MIN - 1)}
                data-testid="rooms-time-input"
                onChange={(e) => {
                  const m = parseTime(e.target.value);
                  if (m !== null) setMinute(clampMinute(m));
                }}
              />
              <button
                type="button"
                className="shell-btn"
                title="Jump to right now"
                onClick={() => {
                  setDay(WEEKDAY_BY_INDEX[new Date().getDay()]);
                  setMinute(nowMinute());
                }}
              >
                Now
              </button>
            </div>
          </div>

          <div className="rooms-controls rooms-controls--view">
            <div className="rooms-view" role="group" aria-label="View">
              <button
                type="button"
                className={!showAll ? 'rooms-chip rooms-chip--active' : 'rooms-chip'}
                aria-pressed={!showAll}
                onClick={() => setShowAll(false)}
                data-testid="rooms-view-free"
              >
                Free only
              </button>
              <button
                type="button"
                className={showAll ? 'rooms-chip rooms-chip--active' : 'rooms-chip'}
                aria-pressed={showAll}
                onClick={() => setShowAll(true)}
                data-testid="rooms-view-all"
              >
                All rooms
              </button>
            </div>
            {showAll && (
              <div className="rooms-types" role="group" aria-label="Room type">
                {TYPE_FILTERS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={roomType === t.key ? 'rooms-chip rooms-chip--active' : 'rooms-chip'}
                    aria-pressed={roomType === t.key}
                    onClick={() => setRoomType(t.key)}
                    data-testid={`rooms-type-${t.key}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {rooms.length === 0 ? (
            <p className="rooms-empty shell-muted" data-testid="rooms-empty">
              {showAll ? 'No rooms match this filter.' : `No rooms are free at ${when}.`}
            </p>
          ) : (
            <>
              <p className="rooms-summary shell-muted" data-testid="rooms-summary">
                {showAll
                  ? `${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${freeCount} free · ${when}`
                  : `${rooms.length} room${rooms.length === 1 ? '' : 's'} free · ${when}`}
              </p>
              <ul className="rooms-grid" data-testid="rooms-grid">
                {rooms.map((room) => {
                  const status = roomStatus(feed.index, room, day, minute);
                  const stateClass = status.free
                    ? 'rooms-card rooms-card--free'
                    : status.lab
                      ? 'rooms-card rooms-card--lab'
                      : 'rooms-card rooms-card--busy';
                  return (
                    <li key={room}>
                      <button
                        type="button"
                        className={stateClass}
                        aria-haspopup="dialog"
                        title={`${room} — view weekly availability`}
                        onClick={() => setOpenRoom(room)}
                        data-testid={`rooms-card-${room}`}
                      >
                        <span className="rooms-card-room">
                          {room}
                          <span className="rooms-card-type">
                            {ROOM_TYPE_LABELS[roomTypeKey(room)]}
                          </span>
                        </span>
                        <span className="rooms-card-status">{status.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {openRoom !== null && (
            <RoomWeekDialog
              index={feed.index}
              room={openRoom}
              activeDay={day}
              onClose={() => setOpenRoom(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
