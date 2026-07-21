// src/app/routes/CampusRoute.tsx
//
// Campus Map — Phase 3 flagship (#370). A procedural 3D view of the Merul
// Badda tower generated live from the CONNECT feed: floors from room codes,
// rooms colored free/busy from the class schedule (same engine as the
// free-rooms tab). The Three.js canvas is presentation-only enhancement —
// every floor/room is equally reachable through the DOM controls below it,
// which double as the fallback when WebGL is unavailable.
//
// Location is handled honestly (#370 acceptance): GPS cannot resolve floors
// inside a concrete high-rise, so the map never plots an indoor dot. A
// permission-gated button answers "am I on campus?" via a geofence, and the
// floor you're on is a manual selector persisted across visits.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { fetchConnectFeed, type FeedSource } from '../../core/connectFeedClient';
import type { WeekdayName } from '../../core/connectFeed';
import {
  buildRoomBusyIndex,
  busyOnDay,
  occupantAt,
  listAllRooms,
  type BusyInterval,
} from '../../core/freeRooms';
import {
  buildCampusModel,
  parseRoomCode,
  roomKindLabel,
  distanceMeters,
  onCampusStatus,
  CAMPUS_LAT,
  CAMPUS_LNG,
  type CampusModel,
} from '../../core/campusRooms';
import {
  createCampusScene,
  type CampusSceneHandle,
  type RoomStatus,
  type RoomTooltip,
} from '../../features/campus/campusScene';

const WEEKDAY_BY_INDEX: readonly WeekdayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const FLOOR_STORAGE_KEY = 'shohoj_campus_floor_v1';

// Scene palette — matches the shell's green/red semantics; the canvas keeps
// a transparent background so the page theme shows through.
const SCENE_COLORS = {
  slab: '#a9cdb8',
  slabInactive: '#d8ded9',
  slabSelected: '#5ecb8b',
  roomFree: '#27ae60',
  roomBusy: '#e74c3c',
  roomUnknown: '#9aa59e',
  highlight: '#2d5a8a',
};

interface NowStamp {
  day: WeekdayName;
  minute: number;
}

function nowStamp(): NowStamp {
  const d = new Date();
  return { day: WEEKDAY_BY_INDEX[d.getDay()], minute: d.getHours() * 60 + d.getMinutes() };
}

function fmtTime(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function titleCaseDay(day: WeekdayName): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

function readStoredFloor(): number | null {
  try {
    const raw = localStorage.getItem(FLOOR_STORAGE_KEY);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function storeFloor(floor: number | null): void {
  try {
    if (floor === null) localStorage.removeItem(FLOOR_STORAGE_KEY);
    else localStorage.setItem(FLOOR_STORAGE_KEY, String(floor));
  } catch {
    // Storage full/blocked — the selector simply won't persist.
  }
}

type LocationState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; distance: number }
  | { phase: 'error'; message: string };

interface FeedState {
  index: Map<string, BusyInterval[]>;
  model: CampusModel;
  source: FeedSource;
  fetchedAt: number;
}

const SOURCE_LABEL: Record<FeedSource, string> = {
  live: 'Live',
  cache: 'Cached',
  fallback: 'Offline copy',
};

export function Component() {
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [now, setNow] = useState<NowStamp>(nowStamp);
  const [floor, setFloor] = useState<number | null>(readStoredFloor);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationState>({ phase: 'idle' });
  const [webglOk, setWebglOk] = useState(true);
  // v2 interaction (#385): a room search and an "only free" filter over the
  // DOM room list — the accessible layer the 3D view mirrors.
  const [search, setSearch] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  // A brief shimmer over the map while a manual refresh is in flight (#385
  // liveness) — the feed is honest about being live, so refetching shows it.
  const [refreshing, setRefreshing] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkConsumed = useRef(false);

  const canvasHost = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CampusSceneHandle | null>(null);
  // Latest tooltip describer, read through a ref so the scene (created once per
  // model) always sees current feed/time data without being torn down.
  const describeRoomRef = useRef<(code: string) => RoomTooltip | null>(() => null);

  const load = useCallback((forceRefresh: boolean) => {
    let live = true;
    setFeedError(null);
    if (forceRefresh) setRefreshing(true);
    fetchConnectFeed({ forceRefresh })
      .then((result) => {
        if (!live) return;
        const index = buildRoomBusyIndex(result.sections);
        setFeed({
          index,
          model: buildCampusModel(listAllRooms(index)),
          source: result.source,
          fetchedAt: result.fetchedAt,
        });
        setNow(nowStamp());
      })
      .catch(() => {
        if (live) setFeedError('Could not load the class schedule feed.');
      })
      .finally(() => {
        if (live) setRefreshing(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => load(false), [load]);

  // Free/busy is time-derived; tick once a minute so colors stay honest.
  useEffect(() => {
    const timer = setInterval(() => setNow(nowStamp()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const model = feed?.model ?? null;

  // Feed room names keyed by canonical code (the feed is uppercase today,
  // but the busy index must be queried with its own keys, not ours).
  const feedNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    if (feed) {
      for (const name of feed.index.keys()) {
        const parsed = parseRoomCode(name);
        if (parsed) map.set(parsed.code, name);
      }
    }
    return map;
  }, [feed]);

  const statusByCode = useMemo(() => {
    const map = new Map<string, RoomStatus>();
    if (feed) {
      for (const [code, name] of feedNameByCode) {
        map.set(code, occupantAt(feed.index, name, now.day, now.minute) ? 'busy' : 'free');
      }
    }
    return map;
  }, [feed, feedNameByCode, now]);

  // Live tower-wide free/busy tally for the legend (#385 liveness). Recomputes
  // whenever the minute tick flips a room's status.
  const towerCounts = useMemo(() => {
    let free = 0;
    let busy = 0;
    for (const status of statusByCode.values()) {
      if (status === 'free') free += 1;
      else if (status === 'busy') busy += 1;
    }
    return { free, busy };
  }, [statusByCode]);

  // Consume a ?room=09G-31T deep link once the model can resolve it. A bare
  // ?floor=N link (used by the cafeteria guide, #373) focuses a whole floor
  // when no specific room is given and the model actually has that floor.
  useEffect(() => {
    if (!model || deepLinkConsumed.current) return;
    deepLinkConsumed.current = true;
    const parsed = parseRoomCode(searchParams.get('room'));
    if (parsed && model.roomsByCode.has(parsed.code)) {
      setFloor(parsed.floor);
      setSelectedRoom(parsed.code);
      return;
    }
    const floorParam = Number(searchParams.get('floor'));
    if (Number.isInteger(floorParam) && model.floors.some((f) => f.floor === floorParam)) {
      setFloor(floorParam);
    }
  }, [model, searchParams]);

  const selectFloor = useCallback((next: number | null) => {
    setFloor(next);
    storeFloor(next);
    // Keep the selected room only when it lives on the newly focused floor.
    setSelectedRoom((current) =>
      current !== null && next !== null && parseRoomCode(current)?.floor === next ? current : null,
    );
  }, []);

  const selectRoom = useCallback((code: string) => {
    const parsed = parseRoomCode(code);
    if (!parsed) return;
    setFloor(parsed.floor);
    storeFloor(parsed.floor);
    setSelectedRoom(parsed.code);
  }, []);

  // Search submit (#385): jump to the room whose code the query resolves to.
  // A full code (e.g. "07A-01C") wins; otherwise the single tower room whose
  // code starts with the query is focused. No match leaves the list filtered.
  const submitSearch = useCallback(() => {
    if (!model) return;
    const query = search.trim().toUpperCase();
    if (!query) return;
    const exact = parseRoomCode(query);
    if (exact && model.roomsByCode.has(exact.code)) {
      selectRoom(exact.code);
      return;
    }
    const matches = [...model.roomsByCode.keys()].filter((code) => code.startsWith(query));
    if (matches.length === 1) selectRoom(matches[0]);
  }, [model, search, selectRoom]);

  // Mirror the selection into ?room= so it's shareable — but only after the
  // inbound deep link (if any) has been consumed, so we never clear it while
  // the feed is still loading.
  useEffect(() => {
    if (!deepLinkConsumed.current) return;
    if ((selectedRoom ?? null) !== (searchParams.get('room') ?? null)) {
      setSearchParams(selectedRoom ? { room: selectedRoom } : {}, { replace: true });
    }
  }, [selectedRoom, searchParams, setSearchParams]);

  // Tooltip text for a hovered 3D room (#385). Lives here because only the
  // route holds the schedule feed; the scene calls it through describeRoomRef.
  const describeRoom = useCallback(
    (code: string): RoomTooltip | null => {
      const parsed = model?.roomsByCode.get(code);
      if (!parsed) return null;
      const status = statusByCode.get(code) ?? 'unknown';
      const feedName = feedNameByCode.get(code);
      let detail: string;
      if (feed && feedName) {
        const occupant = occupantAt(feed.index, feedName, now.day, now.minute);
        if (occupant) {
          detail = `In class · ${occupant.courseCode} until ${fmtTime(occupant.endMin)}`;
        } else {
          const next = busyOnDay(feed.index, feedName, now.day).find(
            (i) => i.startMin > now.minute,
          );
          detail = next
            ? `Free until ${fmtTime(next.startMin)} · then ${next.courseCode}`
            : 'Free for the rest of today';
        }
      } else {
        detail = 'No classes scheduled here';
      }
      return { title: `${parsed.code} · ${roomKindLabel(parsed.kind)}`, status, detail };
    },
    [model, feed, feedNameByCode, now, statusByCode],
  );
  describeRoomRef.current = describeRoom;

  // Scene lifecycle — create once per model, tear down cleanly (StrictMode
  // double-mount safe: dispose removes the canvas and stops the loop).
  useEffect(() => {
    const host = canvasHost.current;
    if (!model || !host) return;
    const handle = createCampusScene(host, model, {
      colors: SCENE_COLORS,
      onFloorClick: (f) => selectFloor(f),
      onRoomClick: (code) => selectRoom(code),
      describeRoom: (code) => describeRoomRef.current(code),
    });
    if (!handle) {
      setWebglOk(false);
      return;
    }
    setWebglOk(true);
    sceneRef.current = handle;
    return () => {
      sceneRef.current = null;
      handle.dispose();
    };
  }, [model, selectFloor, selectRoom]);

  useEffect(() => {
    sceneRef.current?.setFloor(floor);
  }, [floor, model]);
  useEffect(() => {
    sceneRef.current?.setRoomStatus(statusByCode);
  }, [statusByCode]);
  useEffect(() => {
    sceneRef.current?.setHighlight(selectedRoom);
  }, [selectedRoom]);
  useEffect(() => {
    sceneRef.current?.setOnlyFree(onlyFree);
  }, [onlyFree, model]);

  const checkLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ phase: 'error', message: 'Location is not available in this browser.' });
      return;
    }
    setLocation({ phase: 'checking' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const distance = distanceMeters(
          position.coords.latitude,
          position.coords.longitude,
          CAMPUS_LAT,
          CAMPUS_LNG,
        );
        setLocation({ phase: 'done', distance });
      },
      (error) => {
        setLocation({
          phase: 'error',
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was denied.'
              : 'Could not get a location fix.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const selectedParsed =
    selectedRoom && model ? (model.roomsByCode.get(selectedRoom) ?? null) : null;
  const selectedFeedName = selectedRoom ? (feedNameByCode.get(selectedRoom) ?? null) : null;
  const selectedToday: BusyInterval[] =
    feed && selectedFeedName ? busyOnDay(feed.index, selectedFeedName, now.day) : [];
  const selectedOccupant =
    feed && selectedFeedName ? occupantAt(feed.index, selectedFeedName, now.day, now.minute) : null;
  const selectedNextClass = selectedToday.find((i) => i.startMin > now.minute) ?? null;

  const currentFloor =
    model && floor !== null ? (model.floors.find((f) => f.floor === floor) ?? null) : null;

  // Apply the search + "only free" filters to the focused floor's room list
  // (#385). Zones with no surviving rooms drop out; an all-empty result drives
  // the "no rooms match" hint below.
  const visibleZones = useMemo(() => {
    if (!currentFloor) return [];
    const needle = search.trim().toUpperCase();
    return currentFloor.zones
      .map((zone) => ({
        zone: zone.zone,
        rooms: zone.rooms.filter((room) => {
          if (onlyFree && statusByCode.get(room.code) !== 'free') return false;
          if (needle && !room.code.includes(needle)) return false;
          return true;
        }),
      }))
      .filter((zone) => zone.rooms.length > 0);
  }, [currentFloor, search, onlyFree, statusByCode]);

  return (
    <section className="shell-page campus-page" data-testid="campus-page">
      <h1>Campus Map</h1>
      <p className="shell-muted">
        The Merul Badda tower, drawn live from the class schedule feed — pick a floor to see its
        rooms and what&apos;s free right now.
      </p>

      {feedError !== null ? (
        <div className="campus-error" data-testid="campus-error">
          <p>{feedError}</p>
          <button type="button" className="shell-btn" onClick={() => load(true)}>
            Retry
          </button>
        </div>
      ) : !feed || !model ? (
        <p role="status">Loading the schedule feed…</p>
      ) : (
        <>
          <div className="campus-meta">
            <span className="campus-meta-item">
              {SOURCE_LABEL[feed.source]} feed · as of {fmtTime(now.minute)} {titleCaseDay(now.day)}
            </span>
            <button type="button" className="shell-btn campus-meta-btn" onClick={() => load(true)}>
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
            <button
              type="button"
              className="shell-btn campus-meta-btn"
              onClick={checkLocation}
              disabled={location.phase === 'checking'}
            >
              {location.phase === 'checking' ? 'Checking…' : 'Am I on campus?'}
            </button>
            <span className="campus-location" data-testid="campus-location" role="status">
              {location.phase === 'done'
                ? onCampusStatus(location.distance) === 'on-campus'
                  ? `On campus (~${Math.round(location.distance)} m from center)`
                  : `Off campus (${(location.distance / 1000).toFixed(1)} km away)`
                : location.phase === 'error'
                  ? location.message
                  : ''}
            </span>
          </div>

          <div className="campus-floors" role="group" aria-label="Floor">
            <button
              type="button"
              className={
                floor === null ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'
              }
              aria-pressed={floor === null}
              onClick={() => selectFloor(null)}
            >
              Tower
            </button>
            {model.floors.map((f) => (
              <button
                key={f.floor}
                type="button"
                className={
                  floor === f.floor
                    ? 'campus-floor-btn campus-floor-btn--active'
                    : 'campus-floor-btn'
                }
                aria-pressed={floor === f.floor}
                onClick={() => selectFloor(f.floor)}
              >
                Floor {f.floor}
              </button>
            ))}
          </div>

          <form
            className="campus-controls"
            role="search"
            aria-label="Find a room"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <label className="campus-search-field">
              <span className="shell-muted">Room</span>
              <input
                type="search"
                className="campus-search-input"
                data-testid="campus-search-input"
                placeholder="e.g. 07A-01C"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <button
              type="submit"
              className="shell-btn campus-meta-btn"
              data-testid="campus-search-btn"
            >
              Find
            </button>
            <label className="campus-freefilter">
              <input
                type="checkbox"
                data-testid="campus-onlyfree"
                checked={onlyFree}
                onChange={(e) => setOnlyFree(e.target.checked)}
              />
              Only free rooms
            </label>
          </form>

          {webglOk ? (
            <div
              className="campus-canvas"
              ref={canvasHost}
              aria-hidden="true"
              data-refreshing={refreshing ? 'true' : undefined}
              data-testid="campus-canvas"
            />
          ) : (
            <p className="shell-muted" data-testid="campus-no-webgl">
              3D view isn&apos;t available on this device — the floor lists below show everything
              the map does.
            </p>
          )}

          {refreshing && (
            <p className="campus-room-sr" data-testid="campus-refreshing" role="status">
              Refreshing the schedule feed…
            </p>
          )}

          <div
            className="campus-legend"
            data-testid="campus-legend"
            role="status"
            aria-live="polite"
          >
            <span className="campus-legend-key">
              <i className="campus-dot campus-dot--free" />
              <span
                className="campus-legend-count"
                data-testid="campus-free-count"
                key={towerCounts.free}
              >
                {towerCounts.free}
              </span>{' '}
              free now
            </span>
            <span className="campus-legend-key">
              <i className="campus-dot campus-dot--busy" />
              <span
                className="campus-legend-count"
                data-testid="campus-busy-count"
                key={towerCounts.busy}
              >
                {towerCounts.busy}
              </span>{' '}
              in class
            </span>
            <span className="campus-legend-key" aria-hidden="true">
              <i className="campus-dot campus-dot--selected" /> Selected
            </span>
          </div>

          {selectedParsed && (
            <div className="campus-room-panel" data-testid="campus-room-panel">
              <div className="campus-room-head">
                <strong>{selectedParsed.code}</strong>
                <span className="shell-muted">
                  {roomKindLabel(selectedParsed.kind)} · Floor {selectedParsed.floor} · Zone{' '}
                  {selectedParsed.zone}
                </span>
              </div>
              <p className="campus-room-status">
                {selectedOccupant
                  ? `In class now — ${selectedOccupant.courseCode} until ${fmtTime(selectedOccupant.endMin)}`
                  : selectedNextClass
                    ? `Free until ${fmtTime(selectedNextClass.startMin)} (then ${selectedNextClass.courseCode})`
                    : 'Free for the rest of today'}
              </p>
              {selectedToday.length > 0 && (
                <ul className="campus-room-schedule">
                  {selectedToday.map((slot) => (
                    <li key={`${slot.startMin}-${slot.courseCode}-${slot.sectionName}`}>
                      {fmtTime(slot.startMin)}–{fmtTime(slot.endMin)} · {slot.courseCode} (
                      {slot.kind})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {currentFloor ? (
            visibleZones.length === 0 ? (
              <p className="shell-muted" data-testid="campus-no-matches">
                No rooms on this floor match{onlyFree ? ' the “only free” filter' : ''}
                {search.trim() ? ` “${search.trim()}”` : ''}.
              </p>
            ) : (
              <div className="campus-room-list" data-testid="campus-room-list">
                {visibleZones.map((zone) => (
                  <div key={zone.zone} className="campus-zone">
                    <h2 className="campus-zone-title">Zone {zone.zone}</h2>
                    <div className="campus-zone-rooms">
                      {zone.rooms.map((room) => {
                        const status = statusByCode.get(room.code);
                        return (
                          <button
                            key={room.code}
                            type="button"
                            className={
                              room.code === selectedRoom
                                ? 'campus-room-btn campus-room-btn--selected'
                                : 'campus-room-btn'
                            }
                            onClick={() => selectRoom(room.code)}
                          >
                            <i
                              className={
                                status === 'free'
                                  ? 'campus-dot campus-dot--free'
                                  : status === 'busy'
                                    ? 'campus-dot campus-dot--busy'
                                    : 'campus-dot'
                              }
                              aria-hidden="true"
                            />
                            {room.code}
                            <span className="campus-room-sr">
                              {' '}
                              — {roomKindLabel(room.kind)},{' '}
                              {status === 'busy'
                                ? 'in class now'
                                : status === 'free'
                                  ? 'free now'
                                  : 'status unknown'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="shell-muted" data-testid="campus-floor-hint">
              Select a floor to list its rooms.
            </p>
          )}

          {model.otherVenues.length > 0 && (
            <details className="campus-other">
              <summary>Other venues ({model.otherVenues.length})</summary>
              <p className="shell-muted">
                These appear in the schedule but are outside the tower&apos;s room-code system:{' '}
                {model.otherVenues.join(', ')}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
