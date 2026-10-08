/**
 * North South University's campus, as data for the Campus Map.
 *
 * Unlike BRACU's single tower, NSU's Bashundhara campus is several buildings
 * joined around a courtyard, and a room code names its building outright:
 * `NAC210` is the North Academic Building, floor 2, room 10; `SAC1018` is the
 * South Academic Building, floor 10, room 18.
 *
 * What is known and what is not, because the map is only as honest as this:
 *
 *   - Footprints are measured: OpenStreetMap's outlines of the campus,
 *     projected to metres and rotated 5.7° so the academic bars run along x.
 *     Origin is the middle of the site; x runs east, y runs north.
 *   - Floor counts are read off the room codes NSU publishes (a `NAC1077`
 *     means NAC has a tenth floor) and OpenStreetMap's level tag. The
 *     Administration Building has neither, so its count is marked unconfirmed.
 *   - WHERE a room sits on its floor is not published anywhere. Rooms are laid
 *     out in number order along the building, which is a diagram and not a
 *     plan. The page says so.
 *   - `OAT` rooms are placed in the Auditorium building. NSU's own lists call
 *     OAT the lecture-hall and open-air-theatre building and that is the one
 *     block of the complex left over, but no public source names it outright.
 *
 * Pure data in, pure data out: the scene and the route derive everything they
 * draw from the model built here. No imports, so node tests can load it.
 */

export type NsuBuildingId = 'NAC' | 'SAC' | 'LIB' | 'OAT' | 'ADM' | 'BAS';

/** An axis-aligned footprint in campus metres (x east, y north). */
export interface NsuRect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface NsuBuilding {
  id: NsuBuildingId;
  name: string;
  /** Short label for a button. */
  shortName: string;
  rect: NsuRect;
  levels: number;
  /** False when no public source confirms the floor count. */
  levelsConfirmed: boolean;
  /** True when class sections are scheduled in rooms of this building. */
  hasClassrooms: boolean;
  /**
   * True for the basements: "floor" 1 is B1, the first level below ground,
   * and the numbers grow downward.
   */
  below: boolean;
}

/** Storey height the map draws, in metres. A drawing constant, not a survey. */
export const NSU_FLOOR_HEIGHT = 3.65;
/** Height of one basement level, in metres — three of them in 9.8 m. */
export const NSU_BASEMENT_HEIGHT = 9.8 / 3;

/** The site outline (OpenStreetMap), in the same frame as the buildings. */
export const NSU_SITE: NsuRect = { x1: -118, x2: 119, y1: -66, y2: 69 };

/** Open ground the map draws so the buildings have a place to stand. */
export const NSU_COURTYARD: NsuRect = { x1: -53, x2: 60, y1: -30, y2: -12 };
export const NSU_PLAYGROUND: NsuRect = { x1: -68, x2: -30, y1: 29, y2: 64 };

export const NSU_BUILDINGS: readonly NsuBuilding[] = [
  {
    id: 'NAC',
    name: 'North Academic Building',
    shortName: 'NAC',
    rect: { x1: -72, x2: 49, y1: -12, y2: 15 },
    levels: 10,
    levelsConfirmed: true,
    hasClassrooms: true,
    below: false,
  },
  {
    id: 'SAC',
    name: 'South Academic Building',
    shortName: 'SAC',
    rect: { x1: -74, x2: 60, y1: -58, y2: -30 },
    levels: 10,
    levelsConfirmed: true,
    hasClassrooms: true,
    below: false,
  },
  {
    id: 'LIB',
    name: 'Library Building',
    shortName: 'Library',
    rect: { x1: 60, x2: 103, y1: -58, y2: -14 },
    levels: 10,
    levelsConfirmed: true,
    hasClassrooms: true,
    below: false,
  },
  {
    id: 'OAT',
    name: 'Auditorium Building',
    shortName: 'Auditorium',
    rect: { x1: 69, x2: 106, y1: -2, y2: 44 },
    levels: 10,
    levelsConfirmed: true,
    hasClassrooms: true,
    below: false,
  },
  {
    id: 'ADM',
    name: 'Administration Building',
    shortName: 'Admin',
    rect: { x1: -102, x2: -74, y1: -36, y2: -6 },
    levels: 8,
    levelsConfirmed: false,
    hasClassrooms: false,
    below: false,
  },
  {
    // Three parking levels under the whole complex. NSU states the count; the
    // outline is the complex's own, a little wider — a drawing, not a survey.
    id: 'BAS',
    name: 'Basements',
    shortName: 'Basements',
    rect: { x1: -111, x2: 104, y1: -60, y2: 18 },
    levels: 3,
    levelsConfirmed: true,
    hasClassrooms: true,
    below: true,
  },
];

const BUILDING_BY_ID = new Map<string, NsuBuilding>(NSU_BUILDINGS.map((b) => [b.id, b]));

/** The building with this id, or null. */
export function nsuBuilding(id: string | null | undefined): NsuBuilding | null {
  return (id != null && BUILDING_BY_ID.get(id)) || null;
}

export interface NsuRoom {
  /** Canonical code, e.g. "NAC210" or "SAC415B". */
  code: string;
  building: NsuBuildingId;
  floor: number;
  /** Room number within the floor: 10 for NAC210, 77 for NAC1077. */
  number: number;
  /** Trailing letter of a split room ("B" in SAC415B), or "". */
  suffix: string;
}

// A scheduled room: building, floor (1–2 digits), a two-digit room number and
// an optional letter. NSU's lists also carry the same room under suffixed
// names for a second booking of it — NAC201-v1, SAC414_V, SAC415_v1 — which
// are the room itself, so the suffix is dropped.
const ROOM_RE = /^(NAC|SAC|LIB|OAT)(\d{1,2})(\d{2})([A-Z]?)$/;
const VARIANT_RE = /[_-]V\d*$/;
// A basement room: B, the level (1–3), a two-digit number, an optional letter —
// B113, B310A. That "B" means basement is our reading of the code; NSU's lists
// do not spell it out, and the page says so.
const BASEMENT_ROOM_RE = /^B(\d)(\d{2})([A-Z]?)$/;

/**
 * Parse a room name from NSU's section lists, or null when it is not a room
 * in one of the mapped buildings (NTR201, B113, "TV LAB", an empty name, …) or
 * names a floor its building does not have.
 */
export function parseNsuRoom(raw: string | null | undefined): NsuRoom | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().toUpperCase().replace(VARIANT_RE, '');
  const basement = BASEMENT_ROOM_RE.exec(name);
  if (basement) {
    const level = parseInt(basement[1] ?? '', 10);
    const levels = nsuBuilding('BAS')?.levels ?? 0;
    if (level < 1 || level > levels) return null;
    return {
      code: name,
      building: 'BAS',
      floor: level,
      number: parseInt(basement[2] ?? '', 10),
      suffix: basement[3] ?? '',
    };
  }
  const match = ROOM_RE.exec(name);
  if (!match) return null;
  const building = nsuBuilding(match[1]);
  const floor = parseInt(match[2] ?? '', 10);
  if (!building || floor < 1 || floor > building.levels) return null;
  return {
    code: name,
    building: building.id,
    floor,
    number: parseInt(match[3] ?? '', 10),
    suffix: match[4] ?? '',
  };
}

export interface NsuFloor {
  floor: number;
  /** Scheduled rooms on this floor, in number order. Empty on many floors. */
  rooms: NsuRoom[];
}

export interface NsuBuildingModel {
  building: NsuBuilding;
  /** Every floor of the building, 1 upward — with or without scheduled rooms. */
  floors: NsuFloor[];
  roomCount: number;
}

export interface NsuCampusModel {
  buildings: NsuBuildingModel[];
  roomsByCode: Map<string, NsuRoom>;
  /**
   * Every name a room goes by in the section list, keyed by canonical code.
   * The schedule is indexed by those names, so a room's timetable is the
   * union over this list.
   */
  namesByCode: Map<string, string[]>;
  /** Venues in the section list that are not rooms of a mapped building. */
  otherVenues: string[];
}

function compareRooms(a: NsuRoom, b: NsuRoom): number {
  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

/**
 * Build the campus from the room names in a section list. Every building gets
 * every one of its floors, so a floor with no scheduled room can still be
 * visited; the rooms are whatever the list names.
 */
export function buildNsuCampus(roomNames: readonly string[]): NsuCampusModel {
  const roomsByCode = new Map<string, NsuRoom>();
  const namesByCode = new Map<string, string[]>();
  const other = new Set<string>();

  for (const name of roomNames) {
    const room = parseNsuRoom(name);
    if (!room) {
      if (typeof name === 'string' && name.trim() !== '') other.add(name.trim().toUpperCase());
      continue;
    }
    roomsByCode.set(room.code, room);
    const names = namesByCode.get(room.code);
    if (!names) namesByCode.set(room.code, [name]);
    else if (!names.includes(name)) names.push(name);
  }

  const buildings = NSU_BUILDINGS.map((building): NsuBuildingModel => {
    const floors: NsuFloor[] = [];
    let roomCount = 0;
    for (let floor = 1; floor <= building.levels; floor += 1) {
      const rooms = [...roomsByCode.values()]
        .filter((room) => room.building === building.id && room.floor === floor)
        .sort(compareRooms);
      roomCount += rooms.length;
      floors.push({ floor, rooms });
    }
    return { building, floors, roomCount };
  });

  return {
    buildings,
    roomsByCode,
    namesByCode,
    otherVenues: [...other].sort((a, b) => a.localeCompare(b)),
  };
}

/** A room's box on its floor, in campus metres. */
export interface NsuRoomSlot {
  code: string;
  /** Centre. */
  x: number;
  y: number;
  /** Size along x and along y. */
  width: number;
  depth: number;
}

const END_INSET = 4; // stairs and lift lobbies at the ends of a block
const CORRIDOR = 3.2;
const WALL_INSET = 1.2;
const ROOM_GAP = 0.9;
const MAX_ROOM_LENGTH = 11;
const MAX_ROOM_DEPTH = 12;

/**
 * Lay a floor's rooms out as a diagram: two rows either side of a corridor
 * down the building's long axis, filled in number order from one end.
 *
 * This is NOT where the rooms are. NSU publishes no floor plans; the layout
 * only guarantees that every room has a box of its own, inside its building's
 * real outline, with lower numbers at one end and higher at the other.
 */
export function layoutNsuFloor(building: NsuBuilding, rooms: readonly NsuRoom[]): NsuRoomSlot[] {
  const { x1, x2, y1, y2 } = building.rect;
  const alongX = x2 - x1 >= y2 - y1;
  const longStart = (alongX ? x1 : y1) + END_INSET;
  const longLength = (alongX ? x2 - x1 : y2 - y1) - END_INSET * 2;
  const shortMid = alongX ? (y1 + y2) / 2 : (x1 + x2) / 2;
  const shortLength = alongX ? y2 - y1 : x2 - x1;

  const columns = Math.max(1, Math.ceil(rooms.length / 2));
  const pitch = Math.min(longLength / columns, MAX_ROOM_LENGTH + ROOM_GAP);
  const roomLength = pitch - ROOM_GAP;
  // Capped: in a block far deeper than a classroom (the library, the basements)
  // a room that ran wall to corridor would be a hall.
  const roomDepth = Math.min((shortLength - CORRIDOR) / 2 - WALL_INSET, MAX_ROOM_DEPTH);
  const rowOffset = CORRIDOR / 2 + roomDepth / 2;

  return rooms.map((room, index) => {
    const along = longStart + pitch * (Math.floor(index / 2) + 0.5);
    const across = shortMid + (index % 2 === 0 ? rowOffset : -rowOffset);
    return alongX
      ? { code: room.code, x: along, y: across, width: roomLength, depth: roomDepth }
      : { code: room.code, x: across, y: along, width: roomDepth, depth: roomLength };
  });
}

/** What a floor is called: "Floor 4" above ground, "B2" below it. */
export function nsuFloorName(building: NsuBuilding, floor: number): string {
  return building.below ? `B${floor}` : `Floor ${floor}`;
}

/** Height of a floor's slab above the ground, in metres; negative below it. */
export function nsuFloorBaseY(building: NsuBuilding, floor: number): number {
  return building.below ? -floor * NSU_BASEMENT_HEIGHT : (floor - 1) * NSU_FLOOR_HEIGHT;
}

export interface NsuPlace {
  building: NsuBuildingId;
  floor: number;
  name: string;
  /** Where NSU publishes this. */
  source: string;
}

const NSU_WIKIPEDIA = 'https://en.wikipedia.org/wiki/North_South_University';
const LIBRARY_COLLECTION_MAP = 'https://library.northsouth.edu/about-nsu-library/collection-map/';

/**
 * Places a public source puts on a floor. Short on purpose: an entry needs a
 * page that names the floor — so far the library's own, and the campus
 * description that gives the three basements over to parking.
 */
export const NSU_PLACES: readonly NsuPlace[] = [
  ...[1, 2, 3].map((floor): NsuPlace => ({
    building: 'BAS',
    floor,
    name: 'Vehicle parking — one of three basement levels',
    source: NSU_WIKIPEDIA,
  })),
  {
    building: 'LIB',
    floor: 3,
    name: 'Library main floor — general collection and circulation',
    source: LIBRARY_COLLECTION_MAP,
  },
  {
    building: 'LIB',
    floor: 4,
    name: 'Library reference, science and engineering collection (with the top mezzanine)',
    source: LIBRARY_COLLECTION_MAP,
  },
];

/** The published places on one floor of one building. */
export function nsuPlacesOn(building: NsuBuildingId, floor: number): NsuPlace[] {
  return NSU_PLACES.filter((place) => place.building === building && place.floor === floor);
}

export type NsuTermPhase = 'before' | 'during' | 'after';

/**
 * Where a day falls against the term a timetable snapshot was published for.
 *
 * A snapshot is a weekly pattern with a first and a last day of classes.
 * Outside them the pattern describes nothing: a room it books every Monday is
 * not booked on a Monday in the break. All three arguments are ISO dates
 * (YYYY-MM-DD), which compare correctly as strings; both ends are class days.
 */
export function nsuTermPhase(today: string, classStart: string, classEnd: string): NsuTermPhase {
  if (today < classStart) return 'before';
  return today > classEnd ? 'after' : 'during';
}

/** Middle of the site (OpenStreetMap), for the "am I on campus?" check. */
export const NSU_CAMPUS_LAT = 23.815244;
export const NSU_CAMPUS_LNG = 90.425983;
