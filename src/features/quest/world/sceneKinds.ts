// src/features/quest/world/sceneKinds.ts
//
// What a zone's Tiled map shows, in words a 3D renderer can build from (#981).
//
// The 2D game draws the map's tiles as they are. The 3D zone
// (game/zoneGame3d.ts) cannot draw a picture of a tree; it needs to know that
// a tree stands on that square. So this reads the same map, tile by tile, and
// names what each tile is: water or road under foot, a hut, a pile in the
// river, a span of deck. One map then drives both versions, and the rules
// (world/zoneMap.ts) stay the only thing that decides where anyone can walk.
//
// The names come from where a tile sits on Kenney's "Roguelike/RPG Pack"
// sheet, which every zone is drawn with. A tile this does not know is listed
// in `unknown`, and the unit tests require that list to be empty for every
// open zone, so a new tile in a map cannot quietly vanish in 3D.
//
// Pure: no three.js, React or DOM.

import type { Cell } from './zoneMap.ts';

/** What is under foot. */
export type GroundKind = 'grass' | 'water' | 'bank-west' | 'bank-east' | 'road' | 'sand' | 'mud';

/** Something standing on a square. */
export type PropKind =
  | 'tree'
  | 'krishnachura'
  | 'pine'
  | 'fruit-tree'
  | 'bush'
  | 'rock'
  | 'river-rock'
  | 'reeds'
  | 'kash'
  | 'flowers'
  | 'rice'
  | 'hut'
  | 'stall'
  | 'sacks'
  | 'basket'
  | 'barrel'
  | 'lantern'
  | 'signpost'
  | 'pile'
  | 'jetty'
  | 'fence'
  | 'boat';

export interface Prop extends Cell {
  readonly kind: PropKind;
  /** Picks among looks of the same thing, so a grove is not one tree copied. */
  readonly variant: number;
}

export interface ZoneScene {
  readonly width: number;
  readonly height: number;
  /** Row by row. */
  readonly ground: readonly GroundKind[];
  readonly props: readonly Prop[];
  /** Squares of the `built` layers: what quests lay. Deck and rails. */
  readonly deck: readonly Cell[];
  readonly rails: readonly Cell[];
  /** Squares of the `barrier` layers: what a quest removes. */
  readonly barriers: readonly Cell[];
  /** Tiles this file cannot name, as "column,row" on the sheet. */
  readonly unknown: readonly string[];
}

const SHEET_COLUMNS = 57;

/** A tile's place on the sheet, as "column,row". */
const key = (column: number, row: number) => `${column},${row}`;

// Under foot. Anything on a ground layer not listed here is grass.
const WATER = new Set([key(0, 0), key(1, 0)]);
const BANK_WEST = key(2, 1);
const BANK_EAST = key(4, 1);
// The rounded sand set sits twelve rows below the road's on the sheet.
const isSand = (column: number, row: number) =>
  column >= 5 && column <= 9 && row >= 19 && row <= 24;
const isRoad = (column: number, row: number) =>
  (column >= 5 && column <= 9 && row >= 7 && row <= 12) || key(column, row) === key(6, 0);

/** Things on the detail layers. `null` means "part of something named elsewhere". */
const PROPS: ReadonlyMap<string, readonly [PropKind, number] | null> = new Map<
  string,
  readonly [PropKind, number] | null
>([
  // Trees by their trunks; the crowns are on an `above` layer and not read.
  [key(13, 11), ['tree', 0]],
  [key(15, 11), ['tree', 1]],
  [key(14, 11), ['krishnachura', 0]],
  [key(16, 9), ['pine', 0]],
  [key(18, 9), ['pine', 1]],
  [key(23, 10), ['fruit-tree', 0]],
  [key(23, 11), ['fruit-tree', 1]],
  [key(19, 9), ['bush', 0]],
  [key(21, 9), ['bush', 1]],
  [key(25, 9), ['bush', 2]],
  [key(54, 21), ['rock', 0]],
  [key(55, 21), ['rock', 1]],
  [key(54, 23), ['river-rock', 0]],
  [key(55, 24), ['river-rock', 1]],
  [key(56, 23), ['river-rock', 2]],
  [key(22, 10), ['reeds', 0]],
  [key(22, 11), ['reeds', 1]],
  [key(31, 9), ['kash', 0]],
  [key(25, 11), ['kash', 1]],
  [key(28, 9), ['flowers', 0]],
  [key(29, 9), ['flowers', 1]],
  [key(30, 9), ['flowers', 2]],
  [key(19, 10), ['rice', 0]],
  [key(20, 10), ['rice', 0]],
  [key(21, 10), ['rice', 0]],
  [key(19, 11), ['rice', 1]],
  [key(20, 11), ['rice', 1]],
  [key(21, 11), ['rice', 1]],
  // A hut is named by its door; its roof and wall squares are part of it.
  [key(33, 0), ['hut', 0]],
  [key(34, 17), null],
  [key(20, 21), null],
  [key(21, 21), null],
  [key(20, 22), null],
  [key(21, 22), null],
  [key(20, 23), null],
  [key(21, 23), null],
  // A stall is named by the left of its awning.
  [key(10, 1), ['stall', 0]],
  [key(10, 2), null],
  [key(11, 5), null],
  [key(13, 5), null],
  [key(25, 2), ['sacks', 0]],
  [key(26, 2), ['sacks', 1]],
  [key(27, 2), ['sacks', 2]],
  [key(13, 7), ['basket', 0]],
  [key(23, 0), ['barrel', 0]],
  [key(17, 7), ['lantern', 0]],
  [key(20, 0), ['signpost', 0]],
  [key(53, 16), ['pile', 0]],
  [key(53, 17), ['pile', 1]],
  [key(8, 2), ['jetty', 0]],
  [key(8, 3), ['jetty', 1]],
  [key(52, 23), ['fence', 0]],
  [key(53, 23), ['fence', 1]],
  // Boats, as scenery tile objects.
  [key(53, 15), ['boat', 0]],
  [key(53, 18), ['boat', 1]],
]);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A gid as its sheet place, or null for an empty square. */
function sheetPlace(gid: unknown, firstgid: number): readonly [number, number] | null {
  if (typeof gid !== 'number' || !Number.isInteger(gid) || gid < firstgid) return null;
  const index = gid - firstgid;
  return [index % SHEET_COLUMNS, Math.floor(index / SHEET_COLUMNS)];
}

/** Read a zone's Tiled JSON into what stands where. */
export function describeScene(mapJson: unknown): ZoneScene {
  const map = isObject(mapJson) ? mapJson : {};
  const width = typeof map['width'] === 'number' ? map['width'] : 0;
  const height = typeof map['height'] === 'number' ? map['height'] : 0;
  const tilesets = Array.isArray(map['tilesets']) ? map['tilesets'] : [];
  const first: unknown = tilesets[0];
  const firstgid = isObject(first) && typeof first['firstgid'] === 'number' ? first['firstgid'] : 1;
  const layers = (Array.isArray(map['layers']) ? map['layers'] : []).filter(isObject);

  const ground: GroundKind[] = new Array<GroundKind>(width * height).fill('grass');
  const props: Prop[] = [];
  const deck: Cell[] = [];
  const rails: Cell[] = [];
  const barriers: Cell[] = [];
  const unknown = new Set<string>();

  const tiles = (layer: Json, visit: (cell: Cell, column: number, row: number) => void) => {
    const data = Array.isArray(layer['data']) ? layer['data'] : [];
    data.forEach((gid: unknown, index: number) => {
      const place = sheetPlace(gid, firstgid);
      if (place) visit({ x: index % width, y: Math.floor(index / width) }, place[0], place[1]);
    });
  };
  const at = (cell: Cell) => cell.y * width + cell.x;

  for (const layer of layers) {
    const name = typeof layer['name'] === 'string' ? layer['name'] : '';
    if (layer['type'] === 'objectgroup') {
      if (name !== 'scenery' || !Array.isArray(layer['objects'])) continue;
      for (const object of layer['objects']) {
        if (!isObject(object)) continue;
        const place = sheetPlace(object['gid'], firstgid);
        const x = typeof object['x'] === 'number' ? object['x'] : NaN;
        const y = typeof object['y'] === 'number' ? object['y'] : NaN;
        if (!place || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        const named = PROPS.get(key(place[0], place[1]));
        const tileSize = typeof map['tilewidth'] === 'number' ? map['tilewidth'] : 16;
        // A tile object sits on its bottom-left corner.
        const cell = { x: Math.floor(x / tileSize), y: Math.floor((y - tileSize) / tileSize) };
        if (named) props.push({ ...cell, kind: named[0], variant: named[1] });
        else if (named === undefined) unknown.add(key(place[0], place[1]));
      }
      continue;
    }
    if (layer['type'] !== 'tilelayer' || name.startsWith('blocked') || name.startsWith('above'))
      continue;

    if (name.startsWith('built')) {
      tiles(layer, (cell, column, row) => {
        const named = PROPS.get(key(column, row));
        if (named?.[0] === 'jetty') deck.push(cell);
        else if (named?.[0] === 'fence') rails.push(cell);
        else unknown.add(key(column, row));
      });
      continue;
    }
    if (name.startsWith('barrier')) {
      tiles(layer, (cell) => barriers.push(cell));
      continue;
    }

    tiles(layer, (cell, column, row) => {
      const place = key(column, row);
      if (WATER.has(place)) ground[at(cell)] = 'water';
      else if (place === BANK_WEST) ground[at(cell)] = 'bank-west';
      else if (place === BANK_EAST) ground[at(cell)] = 'bank-east';
      else if (isSand(column, row)) ground[at(cell)] = 'sand';
      else if (isRoad(column, row)) ground[at(cell)] = 'road';
      else if (column === 5 && row <= 1) ground[at(cell)] = 'grass';
      else {
        const named = PROPS.get(place);
        if (named) props.push({ ...cell, kind: named[0], variant: named[1] });
        else if (named === undefined) unknown.add(place);
      }
    });
  }

  // Rice grows in wet ground: the squares under it are mud, not road.
  for (const prop of props) if (prop.kind === 'rice') ground[at(prop)] = 'mud';

  return { width, height, ground, props, deck, rails, barriers, unknown: [...unknown].sort() };
}
