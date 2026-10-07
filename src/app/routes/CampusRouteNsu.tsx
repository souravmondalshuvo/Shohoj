// src/app/routes/CampusRouteNsu.tsx
//
// North South University's Campus Map: the Bashundhara campus, building by
// building, floor by floor, room by room. Reached at /campus/?campus=nsu — the
// standalone page has no session, so the campus arrives in the URL (see
// campus/main.tsx).
//
// Three honesty rules, each visible on the page:
//
//   1. The timetable is a snapshot, not a feed. NSU publishes no live room
//      data, so "in class now" means "the published timetable has a class here
//      at this hour" and the page gives the day the timetable was captured.
//   2. Room positions are a diagram. The buildings' outlines and floor counts
//      are measured; where a room sits on its floor is not published, so rooms
//      are laid out in number order and the page says that.
//   3. A floor with no scheduled room is still a floor. Every storey of every
//      building can be opened; it says what is known about it, even when that
//      is nothing.
//
// The Three.js canvas is an enhancement. Every building, floor and room is
// reachable through the DOM controls, which are also the no-WebGL fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { CAMPUS_FEED_SNAPSHOTS } from '../../../js/core/campusFeeds.generated.js';
import { fetchConnectFeed } from '../../core/connectFeedClient';
import type { WeekdayName } from '../../core/connectFeed';
import { buildRoomBusyIndex, busyOnDay, occupantAt, type BusyInterval } from '../../core/freeRooms';
import { distanceMeters, onCampusStatus } from '../../core/campusRooms';
import {
  NSU_CAMPUS_LAT,
  NSU_CAMPUS_LNG,
  buildNsuCampus,
  nsuBuilding,
  nsuPlacesOn,
  nsuTermPhase,
  parseNsuRoom,
  type NsuBuildingId,
  type NsuCampusModel,
} from '../../core/campusNsu';
import type { RoomStatus, RoomTooltip } from '../../features/campus/campusScene';
import { createNsuCampusScene, type NsuSceneHandle } from '../../features/campus/nsuCampusScene';

const WEEKDAYS: readonly WeekdayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const SCENE_COLORS = {
  roomFree: '#27ae60',
  roomBusy: '#e74c3c',
  roomUnknown: '#9aa59e',
  highlight: '#2d5a8a',
  floorPlate: '#5ecb8b',
};

const SNAPSHOT = CAMPUS_FEED_SNAPSHOTS.nsu;

/**
 * The section snapshot's address. Its `url` is relative to the site root, and
 * this page lives one directory below it (/campus/).
 */
function snapshotUrl(): string {
  return new URL(`../${SNAPSHOT.url}`, window.location.href).toString();
}

interface NowStamp {
  day: WeekdayName;
  minute: number;
  /** The reader's local date, YYYY-MM-DD. */
  date: string;
}

function nowStamp(): NowStamp {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: WEEKDAYS[d.getDay()] ?? 'SUNDAY',
    minute: d.getHours() * 60 + d.getMinutes(),
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
}

function fmtTime(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute % 60).padStart(2, '0')} ${suffix}`;
}

function fmtDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface CampusState {
  model: NsuCampusModel;
  /** The timetable per canonical room code, each room's bookings merged. */
  busy: Map<string, BusyInterval[]>;
}

type LocationState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; distance: number }
  | { phase: 'error'; message: string };

export function NsuCampus() {
  const [campus, setCampus] = useState<CampusState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<NowStamp>(nowStamp);
  const [building, setBuilding] = useState<NsuBuildingId | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchMiss, setSearchMiss] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [location, setLocation] = useState<LocationState>({ phase: 'idle' });

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkConsumed = useRef(false);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<NsuSceneHandle | null>(null);
  const describeRoomRef = useRef<(code: string) => RoomTooltip | null>(() => null);

  const load = useCallback(() => {
    let live = true;
    setLoadError(false);
    // storage: null — the snapshot is a 1.5 MB static file the HTTP cache
    // already holds; a second copy in localStorage would crowd out the app's.
    fetchConnectFeed({ url: snapshotUrl(), storage: null, timeoutMs: 20_000 })
      .then((result) => {
        if (!live) return;
        const index = buildRoomBusyIndex(result.sections);
        const model = buildNsuCampus([...index.keys()]);
        const busy = new Map<string, BusyInterval[]>();
        for (const [code, names] of model.namesByCode) {
          const merged = names.flatMap((name) => index.get(name) ?? []);
          merged.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
          busy.set(code, merged);
        }
        setCampus({ model, busy });
        setNow(nowStamp());
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(nowStamp()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const model = campus?.model ?? null;

  // The snapshot is one term's weekly pattern. Before its first class and
  // after its last, it says nothing about today: no room is "in class", and
  // none is known to be free either.
  const termPhase = nsuTermPhase(now.date, SNAPSHOT.classStartDate, SNAPSHOT.classEndDate);
  const inTerm = termPhase === 'during';
  const termNote =
    termPhase === 'before'
      ? `Term ${SNAPSHOT.term} classes start on ${fmtDate(SNAPSHOT.classStartDate)}.`
      : `Term ${SNAPSHOT.term} classes ended on ${fmtDate(SNAPSHOT.classEndDate)}.`;

  const statusByCode = useMemo(() => {
    const map = new Map<string, RoomStatus>();
    if (campus && inTerm) {
      for (const code of campus.model.roomsByCode.keys()) {
        map.set(code, occupantAt(campus.busy, code, now.day, now.minute) ? 'busy' : 'free');
      }
    }
    return map;
  }, [campus, now, inTerm]);

  const counts = useMemo(() => {
    let free = 0;
    let busy = 0;
    for (const status of statusByCode.values()) {
      if (status === 'free') free += 1;
      else busy += 1;
    }
    return { free, busy };
  }, [statusByCode]);

  const selectBuilding = useCallback((next: NsuBuildingId | null) => {
    setBuilding(next);
    setFloor(null);
    setSelectedRoom(null);
  }, []);

  const selectFloor = useCallback((nextBuilding: NsuBuildingId, nextFloor: number | null) => {
    setBuilding(nextBuilding);
    setFloor(nextFloor);
    setSelectedRoom((current) => {
      const room = parseNsuRoom(current);
      return room && room.building === nextBuilding && room.floor === nextFloor ? current : null;
    });
  }, []);

  const selectRoom = useCallback((code: string) => {
    const room = parseNsuRoom(code);
    if (!room) return;
    setBuilding(room.building);
    setFloor(room.floor);
    setSelectedRoom(room.code);
  }, []);

  // Inbound link, once the rooms are known: ?room=NAC210, or ?building=&floor=.
  useEffect(() => {
    if (!model || deepLinkConsumed.current) return;
    deepLinkConsumed.current = true;
    const room = parseNsuRoom(searchParams.get('room'));
    if (room && model.roomsByCode.has(room.code)) {
      selectRoom(room.code);
      return;
    }
    const linked = nsuBuilding(searchParams.get('building'));
    if (!linked) return;
    const linkedFloor = Number(searchParams.get('floor'));
    const valid = Number.isInteger(linkedFloor) && linkedFloor >= 1 && linkedFloor <= linked.levels;
    selectFloor(linked.id, valid ? linkedFloor : null);
  }, [model, searchParams, selectFloor, selectRoom]);

  // Keep the address shareable. `campus` is what brought the reader here, so
  // every rewrite carries it.
  useEffect(() => {
    if (!deepLinkConsumed.current) return;
    const next: Record<string, string> = { campus: 'nsu' };
    if (selectedRoom) next['room'] = selectedRoom;
    else if (building) {
      next['building'] = building;
      if (floor !== null) next['floor'] = String(floor);
    }
    const current = Object.fromEntries(searchParams.entries());
    const same =
      Object.keys(current).length === Object.keys(next).length &&
      Object.entries(next).every(([key, value]) => current[key] === value);
    if (!same) setSearchParams(next, { replace: true });
  }, [building, floor, selectedRoom, searchParams, setSearchParams]);

  const submitSearch = useCallback(() => {
    if (!model) return;
    const query = search.trim().toUpperCase().replace(/\s+/g, '');
    if (!query) return;
    const exact = parseNsuRoom(query);
    const matches =
      exact && model.roomsByCode.has(exact.code)
        ? [exact.code]
        : [...model.roomsByCode.keys()].filter((code) => code.startsWith(query));
    const only = matches.length === 1 ? matches[0] : undefined;
    setSearchMiss(only === undefined);
    if (only !== undefined) selectRoom(only);
  }, [model, search, selectRoom]);

  const describeRoom = useCallback(
    (code: string): RoomTooltip | null => {
      if (!campus || !campus.model.roomsByCode.has(code)) return null;
      if (!inTerm) return { title: code, status: 'unknown', detail: termNote };
      const occupant = occupantAt(campus.busy, code, now.day, now.minute);
      const next = busyOnDay(campus.busy, code, now.day).find((i) => i.startMin > now.minute);
      return {
        title: code,
        status: occupant ? 'busy' : 'free',
        detail: occupant
          ? `Timetabled · ${occupant.courseCode} until ${fmtTime(occupant.endMin)}`
          : next
            ? `No class until ${fmtTime(next.startMin)} · then ${next.courseCode}`
            : 'No more classes timetabled today',
      };
    },
    [campus, now, inTerm, termNote],
  );
  describeRoomRef.current = describeRoom;

  useEffect(() => {
    const host = canvasHost.current;
    if (!model || !host) return;
    const handle = createNsuCampusScene(host, model, {
      colors: SCENE_COLORS,
      onFloorClick: (b, f) => selectFloor(b, f),
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
    sceneRef.current?.setFocus(building, floor);
  }, [building, floor, model]);
  useEffect(() => {
    sceneRef.current?.setRoomStatus(statusByCode);
  }, [statusByCode, model]);
  useEffect(() => {
    sceneRef.current?.setHighlight(selectedRoom);
  }, [selectedRoom, model]);

  const checkLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ phase: 'error', message: 'Location is not available in this browser.' });
      return;
    }
    setLocation({ phase: 'checking' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          phase: 'done',
          distance: distanceMeters(
            position.coords.latitude,
            position.coords.longitude,
            NSU_CAMPUS_LAT,
            NSU_CAMPUS_LNG,
          ),
        });
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

  const currentBuilding = model?.buildings.find((b) => b.building.id === building) ?? null;
  const currentFloor = currentBuilding?.floors.find((f) => f.floor === floor) ?? null;
  const floorPlaces = building && floor !== null ? nsuPlacesOn(building, floor) : [];

  const roomToday =
    selectedRoom && campus && inTerm ? busyOnDay(campus.busy, selectedRoom, now.day) : [];
  const roomOccupant =
    selectedRoom && campus && inTerm
      ? occupantAt(campus.busy, selectedRoom, now.day, now.minute)
      : null;
  const roomNext = roomToday.find((i) => i.startMin > now.minute) ?? null;
  const roomParsed = parseNsuRoom(selectedRoom);

  return (
    <section className="shell-page campus-page" data-testid="campus-page" data-campus="nsu">
      <h1>Campus Map</h1>
      <p className="shell-muted">
        North South University&apos;s Bashundhara campus — pick a building, then a floor, to walk
        through its rooms and see what the timetable has in each one right now.
      </p>

      {loadError ? (
        <div className="campus-error" data-testid="campus-error">
          <p>Could not load NSU&apos;s room timetable.</p>
          <button type="button" className="shell-btn" onClick={() => load()}>
            Retry
          </button>
        </div>
      ) : !campus || !model ? (
        <p role="status">Loading the campus…</p>
      ) : (
        <>
          <div className="campus-meta">
            <span className="campus-meta-item" data-testid="campus-snapshot">
              Timetable as published {fmtDate(SNAPSHOT.capturedOn)} · not live
            </span>
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
                  ? `On campus (~${Math.round(location.distance)} m from the middle)`
                  : `Off campus (${(location.distance / 1000).toFixed(1)} km away)`
                : location.phase === 'error'
                  ? location.message
                  : ''}
            </span>
          </div>

          <div
            className="campus-floors"
            role="group"
            aria-label="Building"
            data-testid="campus-buildings"
          >
            <button
              type="button"
              className={
                building === null ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'
              }
              aria-pressed={building === null}
              onClick={() => selectBuilding(null)}
            >
              Whole campus
            </button>
            {model.buildings.map(({ building: b }) => (
              <button
                key={b.id}
                type="button"
                className={
                  building === b.id
                    ? 'campus-floor-btn campus-floor-btn--active'
                    : 'campus-floor-btn'
                }
                aria-pressed={building === b.id}
                title={b.name}
                onClick={() => selectBuilding(b.id)}
              >
                {b.shortName}
              </button>
            ))}
          </div>

          {currentBuilding && (
            <div
              className="campus-floors"
              role="group"
              aria-label={`${currentBuilding.building.name} floor`}
              data-testid="campus-floors"
            >
              {currentBuilding.floors.map((f) => (
                <button
                  key={f.floor}
                  type="button"
                  className={
                    floor === f.floor
                      ? 'campus-floor-btn campus-floor-btn--active'
                      : 'campus-floor-btn'
                  }
                  aria-pressed={floor === f.floor}
                  onClick={() => selectFloor(currentBuilding.building.id, f.floor)}
                >
                  Floor {f.floor}
                  <span className="campus-room-sr">
                    {f.rooms.length === 0
                      ? ', no timetabled rooms'
                      : `, ${f.rooms.length} timetabled room${f.rooms.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              ))}
            </div>
          )}

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
                placeholder="e.g. NAC210"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchMiss(false);
                }}
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
            {searchMiss && (
              <span className="shell-muted" data-testid="campus-search-miss" role="status">
                No single timetabled room matches “{search.trim()}”.
              </span>
            )}
          </form>

          {webglOk ? (
            <div
              className="campus-canvas"
              ref={canvasHost}
              aria-hidden="true"
              data-testid="campus-canvas"
            />
          ) : (
            <p className="shell-muted" data-testid="campus-no-webgl">
              3D view isn&apos;t available on this device — the building, floor and room lists show
              everything the map does.
            </p>
          )}

          {inTerm ? (
            <div className="campus-legend" data-testid="campus-legend" role="status">
              <span className="campus-legend-key">
                <i className="campus-dot campus-dot--free" />
                <span className="campus-legend-count" data-testid="campus-free-count">
                  {counts.free}
                </span>{' '}
                rooms with no class now
              </span>
              <span className="campus-legend-key">
                <i className="campus-dot campus-dot--busy" />
                <span className="campus-legend-count" data-testid="campus-busy-count">
                  {counts.busy}
                </span>{' '}
                timetabled now
              </span>
              <span className="campus-legend-key" aria-hidden="true">
                <i className="campus-dot campus-dot--selected" /> Selected
              </span>
            </div>
          ) : (
            <p className="shell-muted" data-testid="campus-out-of-term" role="status">
              {termNote} Outside the term the timetable says nothing about today, so no room is
              shown as in class or free.
            </p>
          )}

          {roomParsed && (
            <div className="campus-room-panel" data-testid="campus-room-panel">
              <div className="campus-room-head">
                <strong>{roomParsed.code}</strong>
                <span className="shell-muted">
                  {nsuBuilding(roomParsed.building)?.name} · Floor {roomParsed.floor}
                </span>
              </div>
              <p className="campus-room-status">
                {!inTerm
                  ? `${termNote} The timetable has nothing for today.`
                  : roomOccupant
                    ? `Timetabled now — ${roomOccupant.courseCode} until ${fmtTime(roomOccupant.endMin)}`
                    : roomNext
                      ? `No class until ${fmtTime(roomNext.startMin)} (then ${roomNext.courseCode})`
                      : 'No more classes timetabled today'}
              </p>
              {roomToday.length > 0 && (
                <ul className="campus-room-schedule">
                  {roomToday.map((slot) => (
                    <li key={`${slot.startMin}-${slot.courseCode}-${slot.sectionName}`}>
                      {fmtTime(slot.startMin)}–{fmtTime(slot.endMin)} · {slot.courseCode} (section{' '}
                      {slot.sectionName})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!currentBuilding ? (
            <p className="shell-muted" data-testid="campus-floor-hint">
              Pick a building to see its floors.
            </p>
          ) : !currentFloor ? (
            <p className="shell-muted" data-testid="campus-floor-hint">
              {currentBuilding.building.name} — {currentBuilding.building.levels} floors
              {currentBuilding.building.levelsConfirmed ? '' : ' (floor count not confirmed)'},{' '}
              {currentBuilding.roomCount === 0
                ? 'no timetabled rooms'
                : `${currentBuilding.roomCount} timetabled rooms`}
              . Pick a floor to open it.
            </p>
          ) : (
            <div className="campus-room-list" data-testid="campus-room-list">
              <h2 className="campus-zone-title">
                {currentBuilding.building.name} · Floor {currentFloor.floor}
              </h2>
              {floorPlaces.length > 0 && (
                <ul className="campus-room-schedule" data-testid="campus-floor-places">
                  {floorPlaces.map((place) => (
                    <li key={place.name}>
                      {place.name} (
                      <a href={place.source} target="_blank" rel="noreferrer">
                        source
                      </a>
                      )
                    </li>
                  ))}
                </ul>
              )}
              {currentFloor.rooms.length === 0 ? (
                <p className="shell-muted" data-testid="campus-floor-empty">
                  No classes are timetabled on this floor. NSU does not publish what else is here,
                  so the map leaves it empty rather than guess.
                </p>
              ) : (
                <div className="campus-zone-rooms">
                  {currentFloor.rooms.map((room) => {
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
                        aria-pressed={room.code === selectedRoom}
                        onClick={() => selectRoom(room.code)}
                      >
                        <i
                          className={
                            status === 'busy'
                              ? 'campus-dot campus-dot--busy'
                              : status === 'free'
                                ? 'campus-dot campus-dot--free'
                                : 'campus-dot'
                          }
                          aria-hidden="true"
                        />
                        {room.code}
                        <span className="campus-room-sr">
                          {status === 'busy'
                            ? ' — class timetabled now'
                            : status === 'free'
                              ? ' — no class now'
                              : ' — no timetable for today'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {model.otherVenues.length > 0 && (
            <details className="campus-other">
              <summary>Other venues ({model.otherVenues.length})</summary>
              <p className="shell-muted">
                These are in the timetable, but no public source says which building they are in:{' '}
                {model.otherVenues.join(', ')}
              </p>
            </details>
          )}

          <details className="campus-evidence" data-testid="campus-evidence">
            <summary>How accurate is this map?</summary>
            <p>
              <strong>Measured:</strong> the site, each building&apos;s outline and where it stands,
              from OpenStreetMap. Floor counts come from NSU&apos;s own room numbers, except the
              Administration Building&apos;s, which is not confirmed.
            </p>
            <p>
              <strong>Not measured:</strong> where a room sits on its floor. NSU publishes no floor
              plans, so rooms are drawn in number order along the building — a diagram, not a plan.
              OAT rooms are shown in the Auditorium building, which is our reading and not something
              NSU states. Do not use this map to find an exit.
            </p>
            <p>
              <strong>Timetable:</strong> NSU&apos;s section list for term {SNAPSHOT.term}, as
              published on {fmtDate(SNAPSHOT.capturedOn)}. Room changes after that day are not here.
            </p>
            <div className="campus-evidence-links">
              <a
                href="https://www.openstreetmap.org/#map=18/23.81524/90.42598"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>
              <a href="https://www.northsouth.edu/" target="_blank" rel="noreferrer">
                North South University
              </a>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
