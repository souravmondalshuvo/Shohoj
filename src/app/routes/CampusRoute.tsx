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
} from '../../features/campus/campusScene';

const WEEKDAY_BY_INDEX: readonly WeekdayName[] = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
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

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkConsumed = useRef(false);

  const canvasHost = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CampusSceneHandle | null>(null);

  const load = useCallback((forceRefresh: boolean) => {
    let live = true;
    setFeedError(null);
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
      });
    return () => { live = false; };
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

  // Consume a ?room=09G-31T deep link once the model can resolve it.
  useEffect(() => {
    if (!model || deepLinkConsumed.current) return;
    deepLinkConsumed.current = true;
    const parsed = parseRoomCode(searchParams.get('room'));
    if (parsed && model.roomsByCode.has(parsed.code)) {
      setFloor(parsed.floor);
      setSelectedRoom(parsed.code);
    }
  }, [model, searchParams]);

  const selectFloor = useCallback((next: number | null) => {
    setFloor(next);
    storeFloor(next);
    // Keep the selected room only when it lives on the newly focused floor.
    setSelectedRoom((current) =>
      current !== null && next !== null && parseRoomCode(current)?.floor === next
        ? current
        : null,
    );
  }, []);

  const selectRoom = useCallback((code: string) => {
    const parsed = parseRoomCode(code);
    if (!parsed) return;
    setFloor(parsed.floor);
    storeFloor(parsed.floor);
    setSelectedRoom(parsed.code);
  }, []);

  // Mirror the selection into ?room= so it's shareable — but only after the
  // inbound deep link (if any) has been consumed, so we never clear it while
  // the feed is still loading.
  useEffect(() => {
    if (!deepLinkConsumed.current) return;
    if ((selectedRoom ?? null) !== (searchParams.get('room') ?? null)) {
      setSearchParams(selectedRoom ? { room: selectedRoom } : {}, { replace: true });
    }
  }, [selectedRoom, searchParams, setSearchParams]);

  // Scene lifecycle — create once per model, tear down cleanly (StrictMode
  // double-mount safe: dispose removes the canvas and stops the loop).
  useEffect(() => {
    const host = canvasHost.current;
    if (!model || !host) return;
    const handle = createCampusScene(host, model, {
      colors: SCENE_COLORS,
      onFloorClick: (f) => selectFloor(f),
      onRoomClick: (code) => selectRoom(code),
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

  useEffect(() => { sceneRef.current?.setFloor(floor); }, [floor, model]);
  useEffect(() => { sceneRef.current?.setRoomStatus(statusByCode); }, [statusByCode]);
  useEffect(() => { sceneRef.current?.setHighlight(selectedRoom); }, [selectedRoom]);

  const checkLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ phase: 'error', message: 'Location is not available in this browser.' });
      return;
    }
    setLocation({ phase: 'checking' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const distance = distanceMeters(
          position.coords.latitude, position.coords.longitude,
          CAMPUS_LAT, CAMPUS_LNG,
        );
        setLocation({ phase: 'done', distance });
      },
      (error) => {
        setLocation({
          phase: 'error',
          message: error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied.'
            : 'Could not get a location fix.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const selectedParsed = selectedRoom && model ? model.roomsByCode.get(selectedRoom) ?? null : null;
  const selectedFeedName = selectedRoom ? feedNameByCode.get(selectedRoom) ?? null : null;
  const selectedToday: BusyInterval[] = feed && selectedFeedName
    ? busyOnDay(feed.index, selectedFeedName, now.day)
    : [];
  const selectedOccupant = feed && selectedFeedName
    ? occupantAt(feed.index, selectedFeedName, now.day, now.minute)
    : null;
  const selectedNextClass = selectedToday.find((i) => i.startMin > now.minute) ?? null;

  const currentFloor = model && floor !== null
    ? model.floors.find((f) => f.floor === floor) ?? null
    : null;

  return (
    <section className="shell-page campus-page" data-testid="campus-page">
      <h1>Campus Map</h1>
      <p className="shell-muted">
        The Merul Badda tower, drawn live from the class schedule feed — pick a
        floor to see its rooms and what&apos;s free right now.
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
              {SOURCE_LABEL[feed.source]} feed · as of {fmtTime(now.minute)}{' '}
              {titleCaseDay(now.day)}
            </span>
            <button type="button" className="shell-btn campus-meta-btn" onClick={() => load(true)}>
              ↻ Refresh
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
              className={floor === null ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'}
              aria-pressed={floor === null}
              onClick={() => selectFloor(null)}
            >
              Tower
            </button>
            {model.floors.map((f) => (
              <button
                key={f.floor}
                type="button"
                className={floor === f.floor ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'}
                aria-pressed={floor === f.floor}
                onClick={() => selectFloor(f.floor)}
              >
                Floor {f.floor}
              </button>
            ))}
          </div>

          {webglOk ? (
            <div className="campus-canvas" ref={canvasHost} aria-hidden="true" />
          ) : (
            <p className="shell-muted" data-testid="campus-no-webgl">
              3D view isn&apos;t available on this device — the floor lists below
              show everything the map does.
            </p>
          )}

          <div className="campus-legend" aria-hidden="true">
            <span><i className="campus-dot campus-dot--free" /> Free now</span>
            <span><i className="campus-dot campus-dot--busy" /> In class</span>
            <span><i className="campus-dot campus-dot--selected" /> Selected</span>
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
                      {fmtTime(slot.startMin)}–{fmtTime(slot.endMin)} · {slot.courseCode} ({slot.kind})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {currentFloor ? (
            <div className="campus-room-list" data-testid="campus-room-list">
              {currentFloor.zones.map((zone) => (
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
                            {status === 'busy' ? 'in class now' : status === 'free' ? 'free now' : 'status unknown'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="shell-muted" data-testid="campus-floor-hint">
              Select a floor to list its rooms.
            </p>
          )}

          {model.otherVenues.length > 0 && (
            <details className="campus-other">
              <summary>Other venues ({model.otherVenues.length})</summary>
              <p className="shell-muted">
                These appear in the schedule but are outside the tower&apos;s
                room-code system: {model.otherVenues.join(', ')}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
