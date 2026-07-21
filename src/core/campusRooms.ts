/**
 * Campus room-code helpers for the 3D campus map (#370).
 *
 * Room codes in the CONNECT feed encode a location inside the Merul Badda
 * tower: `FFZ-NNK` — floor `FF` (two digits), zone/block `Z` (a letter),
 * room number `NN`, and kind `K` (`C` classroom, `L` lab, `T` theater).
 * Examples: `07A-08C`, `09G-31T`, `10B-04L`.
 *
 * A few venues in the feed don't follow the tower pattern (e.g. `AN1-01C`,
 * `FT11-02L`); they are kept as "other venues" so the UI can still list them
 * without pretending to know where they are.
 *
 * Pure data in, pure data out — the Three.js scene and the React route both
 * derive everything they render from the model built here.
 */

export type RoomKind = 'classroom' | 'lab' | 'theater' | 'unknown';

export interface ParsedRoom {
  /** Canonical code (trimmed, uppercased), e.g. "09G-31T". */
  code: string;
  floor: number;
  zone: string;
  number: number;
  kind: RoomKind;
}

export interface CampusZone {
  zone: string;
  /** Rooms in this zone, sorted by room number. */
  rooms: ParsedRoom[];
}

export interface CampusFloor {
  floor: number;
  /** Zones on this floor, sorted alphabetically. */
  zones: CampusZone[];
  roomCount: number;
}

export interface CampusModel {
  /** Floors that have at least one room in the feed, ascending. */
  floors: CampusFloor[];
  /** Real venues that don't match the tower room-code pattern, sorted. */
  otherVenues: string[];
  /** Every parsed tower room by canonical code. */
  roomsByCode: Map<string, ParsedRoom>;
}

const ROOM_CODE_RE = /^(\d{2})([A-Z])-(\d{2,3})([A-Z])$/;

const KIND_BY_LETTER: Readonly<Record<string, RoomKind>> = {
  C: 'classroom',
  L: 'lab',
  T: 'theater',
};

/** Human label for a room kind, for panels/tooltips. */
export function roomKindLabel(kind: RoomKind): string {
  switch (kind) {
    case 'classroom':
      return 'Classroom';
    case 'lab':
      return 'Lab';
    case 'theater':
      return 'Theater';
    default:
      return 'Room';
  }
}

/**
 * Parse a tower room code (`FFZ-NNK`) into its location parts, or null when
 * the string is not a tower room (schedule junk, TBA, annex venues, …).
 */
export function parseRoomCode(raw: string | null | undefined): ParsedRoom | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  const match = ROOM_CODE_RE.exec(code);
  if (!match) return null;
  const floor = parseInt(match[1], 10);
  if (floor === 0) return null;
  return {
    code,
    floor,
    zone: match[2],
    number: parseInt(match[3], 10),
    kind: KIND_BY_LETTER[match[4]] ?? 'unknown',
  };
}

/**
 * Build the campus model from the feed's room universe (`listAllRooms` of the
 * busy index). Tower rooms group into floors → zones; anything else lands in
 * `otherVenues`. Duplicates collapse on the canonical code.
 */
export function buildCampusModel(roomNames: readonly string[]): CampusModel {
  const roomsByCode = new Map<string, ParsedRoom>();
  const other = new Set<string>();

  for (const name of roomNames) {
    const parsed = parseRoomCode(name);
    if (parsed) {
      roomsByCode.set(parsed.code, parsed);
    } else if (typeof name === 'string' && name.trim() !== '') {
      other.add(name.trim().toUpperCase());
    }
  }

  const byFloor = new Map<number, Map<string, ParsedRoom[]>>();
  for (const room of roomsByCode.values()) {
    let zones = byFloor.get(room.floor);
    if (!zones) {
      zones = new Map();
      byFloor.set(room.floor, zones);
    }
    const list = zones.get(room.zone);
    if (list) list.push(room);
    else zones.set(room.zone, [room]);
  }

  const floors: CampusFloor[] = [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, zoneMap]) => {
      const zones: CampusZone[] = [...zoneMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([zone, rooms]) => ({
          zone,
          rooms: [...rooms].sort((a, b) => a.number - b.number),
        }));
      return {
        floor,
        zones,
        roomCount: zones.reduce((n, z) => n + z.rooms.length, 0),
      };
    });

  return {
    floors,
    otherVenues: [...other].sort((a, b) => a.localeCompare(b)),
    roomsByCode,
  };
}

/** BRAC University, Merul Badda (OpenStreetMap): the geofence center. */
export const CAMPUS_LAT = 23.7733146;
export const CAMPUS_LNG = 90.424371;

/**
 * Generous "on campus" radius in meters: the plot is ~5 acres and consumer
 * GPS in dense Dhaka easily drifts tens of meters, so err on inclusion.
 */
export const CAMPUS_RADIUS_M = 250;

/** Great-circle distance in meters between two WGS84 points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Classify a device position against the campus geofence. `null` distance
 * (no fix yet) is "unknown" so the UI never claims a state it doesn't have.
 */
export function onCampusStatus(distance: number | null): 'unknown' | 'on-campus' | 'off-campus' {
  if (distance === null || !Number.isFinite(distance)) return 'unknown';
  return distance <= CAMPUS_RADIUS_M ? 'on-campus' : 'off-campus';
}
