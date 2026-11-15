#!/usr/bin/env node
// Draws The Bridge (#981) and writes it as a Tiled map:
//   src/features/quest/assets/maps/bridge.json
//
// The Bridge's map is built by this script instead of by hand so its layout is
// reviewable as code and its gates always line up with the quest ids. It is not
// how every zone has to be made: the output is an ordinary Tiled JSON map, and
// a zone drawn in Tiled and exported works exactly the same. The map contract
// is in src/features/quest/CONTENT.md.
//
// Usage:
//   node scripts/quest_bridge_map.mjs           # write the map
//   node scripts/quest_bridge_map.mjs --check   # fail if the file is stale
//
// tests/questWorld.test.js imports buildBridgeMap and compares it with the
// committed file, so a change here without re-running fails the unit suite.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(import.meta.dirname, '../src/features/quest/assets/maps/bridge.json');

export const WIDTH = 46;
export const HEIGHT = 24;

// Kenney's Roguelike/RPG sheet: 16px tiles, 1px apart, 57 across, 31 down.
const COLUMNS = 57;
const ROWS = 31;
const tile = (column, row) => row * COLUMNS + column + 1;

const T = {
  grass: [tile(5, 0), tile(5, 1)],
  water: [tile(0, 0), tile(1, 0)],
  dirt: [tile(6, 0), tile(6, 1)],
  // Grass meeting water, from the sheet's pond: its left and right edges.
  westShore: tile(2, 1),
  eastShore: tile(4, 1),
  planks: [tile(8, 2), tile(8, 3)],
  rail: tile(52, 23),
  railPost: tile(53, 23),
  fence: tile(52, 23),
  fencePost: tile(53, 23),
  farGate: tile(46, 23),
  treeTop: [tile(13, 10), tile(14, 10), tile(15, 10)],
  treeTrunk: [tile(13, 11), tile(14, 11), tile(15, 11)],
  pine: [tile(16, 9), tile(18, 9)],
  bush: [tile(19, 9), tile(21, 9), tile(25, 9)],
  rock: [tile(54, 21), tile(55, 21)],
  riverRock: [tile(54, 23), tile(55, 24), tile(56, 23)],
  signpost: tile(20, 0),
  flowers: [tile(28, 9), tile(29, 9), tile(30, 9), tile(31, 9)],
  marker: tile(44, 15),
};

// Where things are, in squares.
const RIVER = { from: 12, to: 33 };
const DECK = { top: 11, bottom: 12 };
const NORTH_PATH = 38;
const FENCE_ROW = 3;

/** Which quest lays which stretch of the bridge, west to east. */
export const SPANS = [
  { quest: 'bridge-count-the-planks', from: 12, to: 14 },
  { quest: 'bridge-first-span', from: 15, to: 18 },
  { quest: 'bridge-the-toll', from: 19, to: 21 },
  { quest: 'bridge-rope-counter', from: 22, to: 24 },
  { quest: 'bridge-plank-strength', from: 25, to: 28 },
  { quest: 'bridge-keystone', from: 29, to: 33 },
];
const BOSS = 'bridge-keystone';

// The same picture every run: variety comes from the square, not from chance.
const pick = (options, x, y) => options[(x * 7 + y * 13 + ((x * y) % 5)) % options.length];

const TREES = [
  [1, 2], [3, 5], [6, 2], [9, 4], [2, 8], [7, 7], [1, 15], [4, 18], [8, 16], [10, 20],
  [5, 21], [2, 21], [35, 6], [41, 7], [44, 9], [36, 16], [40, 18], [43, 15], [37, 21],
  [42, 21], [45, 19], [35, 20],
]; // prettier-ignore
const PINES = [[4, 1], [10, 1], [0, 9], [44, 5], [36, 1], [43, 1]]; // prettier-ignore
const BUSHES = [[5, 9], [9, 14], [3, 14], [41, 14], [36, 9], [44, 13], [7, 19]]; // prettier-ignore
const ROCKS = [[8, 9], [2, 17], [42, 17], [35, 14]]; // prettier-ignore
const FLOWERS = [
  [6, 10], [3, 12], [9, 9], [4, 15], [10, 16], [6, 14], [40, 10], [42, 12], [36, 13],
  [40, 15], [44, 16], [41, 5],
]; // prettier-ignore
const RIVER_ROCKS = [[16, 4], [22, 7], [28, 3], [19, 17], [26, 19], [31, 15], [14, 21]]; // prettier-ignore

export function buildBridgeMap() {
  const size = WIDTH * HEIGHT;
  const blank = () => new Array(size).fill(0);
  const ground = blank();
  const detail = blank();
  const built = blank();
  const barrier = blank();
  const above = blank();
  const blocked = blank();
  const at = (x, y) => y * WIDTH + x;
  const block = (x, y) => {
    blocked[at(x, y)] = T.marker;
  };

  const onDeck = (x, y) => x >= RIVER.from && x <= RIVER.to && y >= DECK.top && y <= DECK.bottom;
  const onPath = (x, y) =>
    // West bank: the road to the bridge.
    (x < RIVER.from && y >= DECK.top && y <= DECK.bottom) ||
    // East bank: off the bridge, then north to the gate.
    (x > RIVER.to && x <= NORTH_PATH + 1 && y >= DECK.top && y <= DECK.bottom) ||
    (x === NORTH_PATH && y < DECK.top);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const river = x >= RIVER.from && x <= RIVER.to;
      if (x === RIVER.from) ground[at(x, y)] = T.westShore;
      else if (x === RIVER.to) ground[at(x, y)] = T.eastShore;
      else if (river) ground[at(x, y)] = pick(T.water, x, y);
      else if (onPath(x, y)) ground[at(x, y)] = pick(T.dirt, x, y);
      else ground[at(x, y)] = pick(T.grass, x, y);
      // The river is not for walking. The deck is, once it is built; the gates
      // decide that, not this layer.
      if (river && !onDeck(x, y)) block(x, y);
    }
  }

  // The bridge: two rows of planks with a rail on each side.
  for (let x = RIVER.from; x <= RIVER.to; x += 1) {
    for (let y = DECK.top; y <= DECK.bottom; y += 1) built[at(x, y)] = pick(T.planks, x, y);
    const post = (x - RIVER.from) % 3 === 0 || x === RIVER.to;
    built[at(x, DECK.top - 1)] = post ? T.railPost : T.rail;
    built[at(x, DECK.bottom + 1)] = post ? T.railPost : T.rail;
  }

  // The fence across the far bank, with the gate the boss quest opens.
  for (let x = RIVER.to + 1; x < WIDTH; x += 1) {
    if (x === NORTH_PATH) {
      barrier[at(x, FENCE_ROW)] = T.farGate;
      continue;
    }
    detail[at(x, FENCE_ROW)] = (x - RIVER.to) % 3 === 1 ? T.fencePost : T.fence;
    block(x, FENCE_ROW);
  }

  const place = (cells, options, { solid }) => {
    for (const [x, y] of cells) {
      detail[at(x, y)] = pick(options, x, y);
      if (solid) block(x, y);
    }
  };
  place(PINES, T.pine, { solid: true });
  place(BUSHES, T.bush, { solid: true });
  place(ROCKS, T.rock, { solid: true });
  place(FLOWERS, T.flowers, { solid: false });
  place(RIVER_ROCKS, T.riverRock, { solid: true });
  // A tree is two tiles: the trunk stops you, the crown is drawn over you.
  TREES.forEach(([x, y], index) => {
    const kind = index % T.treeTop.length;
    detail[at(x, y)] = T.treeTrunk[kind];
    above[at(x, y - 1)] = T.treeTop[kind];
    block(x, y);
  });
  detail[at(11, 13)] = T.signpost;
  block(11, 13);

  const layer = (id, name, data, visible = true) => ({
    data,
    height: HEIGHT,
    id,
    name,
    opacity: 1,
    type: 'tilelayer',
    visible,
    width: WIDTH,
    x: 0,
    y: 0,
  });

  let nextObject = 1;
  const object = (name, x, y, w, h, quest) => ({
    height: h * 16,
    id: nextObject++,
    name,
    ...(w === 0 ? { point: true } : {}),
    ...(quest ? { properties: [{ name: 'quest', type: 'string', value: quest }] } : {}),
    rotation: 0,
    type: '',
    visible: true,
    width: w * 16,
    // A point sits in the middle of its square, as Tiled places one.
    x: x * 16 + (w === 0 ? 8 : 0),
    y: y * 16 + (h === 0 ? 8 : 0),
  });

  const objects = [
    object('spawn', 4, DECK.top, 0, 0),
    object('giver', 10, DECK.top - 1, 0, 0),
    object('exit', NORTH_PATH, 0, 1, 2),
    // A span is the deck and both rails, so the rails appear with the planks.
    ...SPANS.map((span) =>
      object('gate', span.from, DECK.top - 1, span.to - span.from + 1, 4, span.quest),
    ),
    object('gate', NORTH_PATH, FENCE_ROW, 1, 1, BOSS),
  ];

  return {
    compressionlevel: -1,
    height: HEIGHT,
    infinite: false,
    layers: [
      layer(1, 'ground', ground),
      layer(2, 'detail', detail),
      layer(3, 'built', built),
      layer(4, 'barrier', barrier),
      layer(5, 'above', above),
      layer(6, 'blocked', blocked, false),
      {
        draworder: 'topdown',
        id: 7,
        name: 'markers',
        objects,
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 8,
    nextobjectid: nextObject,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    tileheight: 16,
    tilesets: [
      {
        columns: COLUMNS,
        firstgid: 1,
        image: '../roguelikeSheet_transparent.png',
        imageheight: 526,
        imagewidth: 968,
        margin: 0,
        name: 'roguelike',
        spacing: 1,
        tilecount: COLUMNS * ROWS,
        tileheight: 16,
        tilewidth: 16,
      },
    ],
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    width: WIDTH,
  };
}

/** One tile layer per line: a diff shows which layer moved, not 1,104 numbers. */
export function serialise(map) {
  return (
    JSON.stringify(map, (key, value) => (key === 'data' ? `@@${value.join(',')}@@` : value), 1)
      .replace(/"@@/g, '[')
      .replace(/@@"/g, ']') + '\n'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = serialise(buildBridgeMap());
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== text) {
      console.error('bridge.json is stale. Run: node scripts/quest_bridge_map.mjs');
      process.exit(1);
    }
    console.log('bridge.json is up to date.');
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  }
}
