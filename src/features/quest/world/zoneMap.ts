// src/features/quest/world/zoneMap.ts
//
// Reads a zone's Tiled map (#981) and answers the questions the game asks of
// it: where can the hero walk, how does it get from here to there, and which
// parts of the place are still waiting on a quest.
//
// A map is drawn in Tiled and exported as JSON. The game takes its meaning from
// layer and object names, so a map author never touches engine code:
//
//   Tile layers, drawn in the order they appear:
//     blocked…   never drawn. Any tile on it marks a square nobody can walk on.
//     built…     drawn only inside gates that are open: the planks a quest lays.
//     barrier…   drawn only inside gates that are shut: the fence a quest removes.
//     above…     drawn over the characters: treetops, a lintel.
//     anything else is drawn always, under the characters.
//
//   One object layer named `markers`:
//     spawn      a point: where a new player starts.
//     giver      a point: where the quest-giver stands. Nobody walks through.
//     exit       a rectangle: stepping in leaves the zone.
//     gate       a rectangle with a string property `quest`. Its squares cannot
//                be walked on until that quest is solved. A quest may have
//                several gates, and a gate may sit anywhere.
//
// Outside every gate, `built` layers are drawn and `barrier` layers are not, so
// a map looks finished in Tiled and the gates say what is missing at the start.
//
// Pure: no Phaser, React or DOM. Phaser draws the same JSON; this file is the
// rules, and the unit tests load it in Node.

import { err, ok, type Result } from '../../../core/result.ts';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Cell {
  readonly w: number;
  readonly h: number;
}

/** Squares shut until `quest` is solved. */
export interface Gate extends Rect {
  readonly quest: string;
}

/** When a drawn layer shows. See the header. */
export type LayerRole = 'always' | 'built' | 'barrier';

export interface ZoneLayer {
  readonly name: string;
  readonly role: LayerRole;
  /** Drawn over the characters rather than under them. */
  readonly above: boolean;
}

export interface ZoneMap {
  /** In squares. */
  readonly width: number;
  readonly height: number;
  /** Pixels per square in the tileset. */
  readonly tileSize: number;
  /** The one tileset the map is drawn with, as Tiled describes it. */
  readonly tileset: { readonly name: string; readonly margin: number; readonly spacing: number };
  /** The drawn tile layers, in drawing order. `blocked` layers are not here. */
  readonly layers: readonly ZoneLayer[];
  /** Row by row: true where a `blocked` layer has a tile. */
  readonly blocked: readonly boolean[];
  readonly spawn: Cell;
  readonly giver: Cell;
  readonly exit: Rect;
  readonly gates: readonly Gate[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function roleOf(name: string): LayerRole {
  if (name.startsWith('built')) return 'built';
  if (name.startsWith('barrier')) return 'barrier';
  return 'always';
}

/** A Tiled object's `quest` property, however this version of Tiled wrote it. */
function questProperty(object: Json): string | null {
  const properties = object['properties'];
  if (Array.isArray(properties)) {
    for (const property of properties) {
      if (isObject(property) && property['name'] === 'quest') {
        return typeof property['value'] === 'string' ? property['value'] : null;
      }
    }
  } else if (isObject(properties) && typeof properties['quest'] === 'string') {
    return properties['quest'];
  }
  return null;
}

/**
 * Check a Tiled JSON export and pull out what the game needs. Every problem is
 * reported at once, in words a map author can act on.
 */
export function parseZoneMap(input: unknown): Result<ZoneMap, readonly string[]> {
  if (!isObject(input)) return err(['The map is not a Tiled JSON object.']);

  const problems: string[] = [];
  const width = input['width'];
  const height = input['height'];
  const tileSize = input['tilewidth'];

  if (input['orientation'] !== 'orthogonal') problems.push('The map must be orthogonal.');
  if (input['infinite'] === true)
    problems.push('The map must not be infinite. Turn that off in Map Properties.');
  if (!isCount(width) || !isCount(height)) problems.push('The map needs a width and a height.');
  if (!isCount(tileSize) || input['tileheight'] !== tileSize)
    problems.push('Tiles must be square.');
  const rawLayers = input['layers'];
  if (!Array.isArray(rawLayers)) problems.push('The map has no layers.');
  if (problems.length > 0 || !isCount(width) || !isCount(height) || !isCount(tileSize))
    return err(problems);

  const size = width * height;
  const blocked: boolean[] = new Array<boolean>(size).fill(false);
  const layers: ZoneLayer[] = [];
  const names = new Set<string>();
  let markers: readonly unknown[] | null = null;

  for (const layer of Array.isArray(rawLayers) ? rawLayers : []) {
    if (!isObject(layer)) continue;
    const name = typeof layer['name'] === 'string' ? layer['name'] : '';
    if (layer['type'] === 'objectgroup') {
      if (name === 'markers' && Array.isArray(layer['objects'])) markers = layer['objects'];
      continue;
    }
    if (layer['type'] !== 'tilelayer') {
      problems.push(
        `Layer "${name}" is a ${String(layer['type'])} layer. Use tile layers and one object layer.`,
      );
      continue;
    }
    if (name === '' || names.has(name)) {
      problems.push(`Every tile layer needs its own name. "${name}" is missing or repeated.`);
      continue;
    }
    names.add(name);
    const data = layer['data'];
    if (!Array.isArray(data) || data.length !== size) {
      problems.push(
        `Layer "${name}" is not plain tile data. Export with Tile Layer Format set to CSV and no compression.`,
      );
      continue;
    }
    if (name.startsWith('blocked')) {
      data.forEach((gid, index) => {
        if (typeof gid === 'number' && gid !== 0) blocked[index] = true;
      });
      continue;
    }
    layers.push({ name, role: roleOf(name), above: name.startsWith('above') });
  }

  if (layers.length === 0) problems.push('The map has nothing to draw: add a tile layer.');

  // One tileset, embedded: the game ships one image per zone, and a tileset
  // kept in its own .tsx file is not in the export for the game to read.
  const tilesets = Array.isArray(input['tilesets']) ? input['tilesets'] : [];
  const only: unknown = tilesets[0];
  let tileset: ZoneMap['tileset'] | null = null;
  if (tilesets.length !== 1 || !isObject(only)) {
    problems.push('The map must use exactly one tileset.');
  } else if (typeof only['name'] !== 'string' || typeof only['image'] !== 'string') {
    problems.push(
      'The tileset must be embedded in the map. In Tiled, use "Embed in Map" on the Tilesets panel.',
    );
  } else if (only['tilewidth'] !== tileSize || only['tileheight'] !== tileSize) {
    problems.push("The tileset's tiles are not the size of the map's squares.");
  } else {
    const whole = (value: unknown) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
    tileset = {
      name: only['name'],
      margin: whole(only['margin']),
      spacing: whole(only['spacing']),
    };
  }
  if (markers === null) problems.push('The map needs an object layer named "markers".');

  const pixels = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
  const toCell = (px: number) => Math.floor(px / tileSize);
  const inside = (cell: Cell) => cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;

  const points = new Map<string, Cell>();
  const gates: Gate[] = [];
  let exit: Rect | null = null;

  for (const object of markers ?? []) {
    if (!isObject(object)) continue;
    const name = typeof object['name'] === 'string' ? object['name'] : '';
    const left = pixels(object['x']);
    const top = pixels(object['y']);
    // A point has no size: it covers the square it sits in. A rectangle covers
    // every square it touches, so its last pixel decides where it ends.
    const spanX = Math.max(1, pixels(object['width']) || 0);
    const spanY = Math.max(1, pixels(object['height']) || 0);
    const cell = { x: toCell(left), y: toCell(top) };
    const right = toCell(left + spanX - 1);
    const bottom = toCell(top + spanY - 1);
    const rect: Rect = { ...cell, w: right - cell.x + 1, h: bottom - cell.y + 1 };
    // NaN fails every comparison, so a marker with no position lands here too.
    if (!inside(cell) || !inside({ x: right, y: bottom })) {
      problems.push(`The "${name}" marker is outside the map.`);
      continue;
    }
    if (name === 'spawn' || name === 'giver') {
      if (points.has(name)) problems.push(`There are two "${name}" markers. Keep one.`);
      points.set(name, cell);
    } else if (name === 'exit') {
      if (exit) problems.push('There are two "exit" markers. Keep one.');
      exit = rect;
    } else if (name === 'gate') {
      const quest = questProperty(object);
      if (!quest) {
        problems.push(
          `The gate at ${cell.x},${cell.y} needs a string property "quest" holding a quest id.`,
        );
      } else {
        gates.push({ ...rect, quest });
      }
    } else {
      problems.push(`"${name}" is not a marker the game knows. Use spawn, giver, exit or gate.`);
    }
  }

  const spawn = points.get('spawn');
  const giver = points.get('giver');
  if (markers !== null) {
    if (!spawn) problems.push('The markers layer needs a "spawn" point.');
    if (!giver) problems.push('The markers layer needs a "giver" point.');
    if (!exit) problems.push('The markers layer needs an "exit" rectangle.');
  }
  if (problems.length > 0 || !spawn || !giver || !exit || !tileset) return err(problems);

  return ok({ width, height, tileSize, tileset, layers, blocked, spawn, giver, exit, gates });
}

// ── Walking ─────────────────────────────────────────────────────────────────

export const inRect = (rect: Rect, cell: Cell): boolean =>
  cell.x >= rect.x && cell.y >= rect.y && cell.x < rect.x + rect.w && cell.y < rect.y + rect.h;

/** The gates still shut, given the quests solved so far. */
export function shutGates(map: ZoneMap, completed: ReadonlySet<string>): readonly Gate[] {
  return map.gates.filter((gate) => !completed.has(gate.quest));
}

/** The shut gate covering a square, if there is one. */
export function gateAt(map: ZoneMap, completed: ReadonlySet<string>, cell: Cell): Gate | null {
  return shutGates(map, completed).find((gate) => inRect(gate, cell)) ?? null;
}

/** Which squares can be stood on right now. */
export interface WalkGrid {
  readonly width: number;
  readonly height: number;
  /** Row by row. */
  readonly open: readonly boolean[];
}

export function walkGrid(map: ZoneMap, completed: ReadonlySet<string>): WalkGrid {
  const open = map.blocked.map((blocked) => !blocked);
  open[map.giver.y * map.width + map.giver.x] = false;
  for (const gate of shutGates(map, completed)) {
    for (let y = gate.y; y < gate.y + gate.h; y += 1) {
      for (let x = gate.x; x < gate.x + gate.w; x += 1) open[y * map.width + x] = false;
    }
  }
  return { width: map.width, height: map.height, open };
}

export function canWalk(grid: WalkGrid, cell: Cell): boolean {
  return (
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < grid.width &&
    cell.y < grid.height &&
    grid.open[cell.y * grid.width + cell.x] === true
  );
}

const STEPS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export interface Route {
  /** The squares to walk through, in order, not counting the starting one. */
  readonly steps: readonly Cell[];
  /** How far the last square is from the target, in squares. 0 means it arrives. */
  readonly short: number;
}

/**
 * The shortest walk from `from` towards `target`.
 *
 * A tap can land on water, on the quest-giver, or on the far bank of a bridge
 * that is not built yet. So this never fails: it walks to the reachable square
 * nearest the target, and says how far short that is. Walking up to the
 * quest-giver is a route that ends 1 short.
 */
export function findRoute(grid: WalkGrid, from: Cell, target: Cell): Route {
  const start = from.y * grid.width + from.x;
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  const distance = (index: number) =>
    Math.abs((index % grid.width) - target.x) + Math.abs(Math.floor(index / grid.width) - target.y);

  let best = start;
  let bestShort = distance(start);
  for (let head = 0; head < queue.length && bestShort > 0; head += 1) {
    const index = queue[head] as number;
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    for (const step of STEPS) {
      const next = { x: x + step.x, y: y + step.y };
      const nextIndex = next.y * grid.width + next.x;
      if (!canWalk(grid, next) || cameFrom.has(nextIndex)) continue;
      cameFrom.set(nextIndex, index);
      queue.push(nextIndex);
      // Breadth-first, so the first square found at a distance is also the
      // fewest steps away: ties go to the shorter walk.
      const short = distance(nextIndex);
      if (short < bestShort) {
        best = nextIndex;
        bestShort = short;
      }
    }
  }

  const steps: Cell[] = [];
  for (let index = best; index !== start; index = cameFrom.get(index) as number) {
    steps.push({ x: index % grid.width, y: Math.floor(index / grid.width) });
  }
  steps.reverse();
  return { steps, short: bestShort };
}

// ── Checking a map against its zone ─────────────────────────────────────────

/**
 * What is wrong with a map as the home of a zone's quests. Empty when it is
 * sound. Run by the unit tests for every open zone, so a map that strands the
 * player fails before anyone plays it.
 */
export function auditZoneMap(
  map: ZoneMap,
  questIds: readonly string[],
  bossId: string | null,
): string[] {
  const problems: string[] = [];
  const known = new Set(questIds);
  for (const gate of map.gates) {
    if (!known.has(gate.quest)) {
      problems.push(
        `The gate at ${gate.x},${gate.y} names "${gate.quest}", which is not a quest in this zone.`,
      );
    }
  }

  const reaches = (completed: ReadonlySet<string>, target: Cell) =>
    findRoute(walkGrid(map, completed), map.spawn, target);
  const nothing = new Set<string>();
  const everything = new Set(questIds);
  const exitCell = { x: map.exit.x, y: map.exit.y };

  if (!canWalk(walkGrid(map, nothing), map.spawn))
    problems.push('The spawn point is on a square that cannot be walked on.');
  if (reaches(nothing, map.giver).short > 1)
    problems.push('A new player cannot walk to the quest-giver.');
  if (reaches(everything, exitCell).short > 0)
    problems.push('The exit cannot be reached even with every quest solved.');
  if (bossId !== null) {
    if (!map.gates.some((gate) => gate.quest === bossId)) {
      problems.push('No gate is tied to the boss quest, so nothing guards the exit.');
    } else {
      const allButBoss = new Set(questIds.filter((id) => id !== bossId));
      if (reaches(allButBoss, exitCell).short === 0)
        problems.push('The exit can be reached without solving the boss quest.');
    }
  }
  return problems;
}
