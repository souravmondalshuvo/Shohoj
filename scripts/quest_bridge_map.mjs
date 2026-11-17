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

// The place is a river village in Bengal, late in the afternoon: a ghat with a
// jetty and boats on the west bank, a little market by the road, huts, paddy
// on both banks, kash and reeds along the water, and Karim Majhi waiting at
// the head of a bamboo bridge whose piles stand in the river until the
// student lays the deck across them.
const T = {
  grass: [tile(5, 0), tile(5, 1)],
  water: [tile(0, 0), tile(1, 0)],
  // Grass meeting water, from the sheet's pond: its left and right edges.
  westShore: tile(2, 1),
  eastShore: tile(4, 1),
  // The rounded dirt road: a 3x3 set of edges and corners, and an upright piece.
  road: {
    nw: tile(7, 9), n: tile(8, 9), ne: tile(9, 9),
    w: tile(7, 10), c: tile(8, 10), e: tile(9, 10),
    sw: tile(7, 11), s: tile(8, 11), se: tile(9, 11),
    upright: tile(9, 7),
  }, // prettier-ignore
  // The same shapes in sand, twelve rows down the sheet: the ghat.
  sand: {
    nw: tile(7, 21), n: tile(8, 21), ne: tile(9, 21),
    w: tile(7, 22), c: tile(8, 22), e: tile(9, 22),
    sw: tile(7, 23), s: tile(8, 23), se: tile(9, 23),
  }, // prettier-ignore
  mud: [tile(6, 0), tile(6, 1)],
  rice: [tile(19, 10), tile(20, 10), tile(21, 10)],
  riceDark: [tile(19, 11), tile(20, 11), tile(21, 11)],
  // A post standing in the water: the bridge's piles, before the deck.
  pile: [tile(53, 16), tile(53, 17)],
  planks: [tile(8, 2), tile(8, 3)],
  rail: tile(52, 23),
  railPost: tile(53, 23),
  fence: tile(52, 23),
  fencePost: tile(53, 23),
  farGate: tile(46, 23),
  treeTop: [tile(13, 10), tile(15, 10), tile(13, 10), tile(14, 10)],
  treeTrunk: [tile(13, 11), tile(15, 11), tile(13, 11), tile(14, 11)],
  pine: [tile(16, 9), tile(18, 9)],
  fruitTree: [tile(23, 10), tile(23, 11)],
  bush: [tile(19, 9), tile(21, 9), tile(25, 9)],
  rock: [tile(54, 21), tile(55, 21)],
  riverRock: [tile(54, 23), tile(55, 24), tile(56, 23)],
  reeds: [tile(22, 10), tile(22, 11), tile(31, 9), tile(25, 11)],
  flowers: [tile(28, 9), tile(29, 9), tile(30, 9), tile(31, 9)],
  roof: [
    [tile(20, 21), tile(21, 21)],
    [tile(20, 22), tile(21, 22)],
    [tile(20, 23), tile(21, 23)],
  ],
  wall: tile(34, 17),
  door: tile(33, 0),
  awning: [tile(10, 1), tile(10, 2)],
  counter: [tile(11, 5), tile(13, 5)],
  sacks: [tile(25, 2), tile(26, 2), tile(27, 2)],
  basket: tile(13, 7),
  barrel: tile(23, 0),
  lantern: tile(17, 7),
  signpost: tile(20, 0),
  mooring: [tile(53, 16), tile(53, 17)],
  boat: [tile(53, 15), tile(53, 18)],
  marker: tile(44, 15),
};

// Where things are, in squares.
const RIVER = { from: 16, to: 29 };
const DECK = { top: 11, bottom: 12 };
const NORTH_PATH = 38;
const FENCE_ROW = 3;
const ROAD_END = NORTH_PATH + 1;
const JETTY = { from: RIVER.from, to: 19, top: 16, bottom: 17 };
const GHAT = { left: 11, right: 15, top: 14, bottom: 19 };
const FIELDS = [
  { left: 1, right: 9, top: 15, bottom: 21 },
  { left: 32, right: 43, top: 15, bottom: 21 },
];

/** Which quest lays which stretch of the bridge, west to east. */
export const SPANS = [
  { quest: 'bridge-count-the-planks', from: 16, to: 17 },
  { quest: 'bridge-first-span', from: 18, to: 19 },
  { quest: 'bridge-the-toll', from: 20, to: 21 },
  { quest: 'bridge-rope-counter', from: 22, to: 24 },
  { quest: 'bridge-plank-strength', from: 25, to: 26 },
  { quest: 'bridge-keystone', from: 27, to: 29 },
];
const BOSS = 'bridge-keystone';

// The same picture every run: variety comes from the square, not from chance.
const pick = (options, x, y) => options[(x * 7 + y * 13 + ((x * y) % 5)) % options.length];
const sprinkle = (x, y, every) => (x * 31 + y * 17 + ((x * y) % 7)) % every === 0;

// Trees: a crown over a trunk. The edges of the map are wooded, so the world
// ends in a grove rather than at a line.
const TREES = [
  [1, 1], [3, 2], [5, 1], [8, 2], [10, 1], [13, 2], [0, 4], [0, 7], [1, 9],
  [12, 4], [14, 6], [0, 14], [0, 18], [0, 22], [2, 23], [5, 23], [8, 22],
  [11, 23], [14, 22], [10, 21],
  [32, 1], [34, 2], [36, 1], [40, 2], [42, 1], [44, 2], [33, 6], [35, 8],
  [44, 6], [45, 9], [44, 12], [45, 15], [45, 19], [44, 22], [41, 23], [38, 22],
  [35, 23], [32, 22], [31, 8],
]; // prettier-ignore
const PINES = [[7, 0], [12, 0], [39, 0], [45, 4], [30, 0]]; // prettier-ignore
const FRUIT_TREES = [[9, 9], [4, 9], [40, 9], [37, 6]]; // prettier-ignore
const BUSHES = [[11, 3], [6, 9], [2, 13], [43, 13], [36, 13], [10, 14], [31, 14]]; // prettier-ignore
const ROCKS = [[13, 21], [42, 8]]; // prettier-ignore
const FLOWERS = [
  [3, 8], [8, 4], [11, 9], [2, 10], [7, 13], [12, 13], [34, 4], [41, 4], [39, 7],
  [33, 10], [42, 10], [35, 14], [40, 14],
]; // prettier-ignore
const RIVER_ROCKS = [[24, 4], [21, 21], [27, 15], [18, 2]]; // prettier-ignore
const HUTS = [
  { x: 2, y: 4 },
  { x: 5, y: 4 },
  { x: 41, y: 5 },
];

export function buildBridgeMap() {
  const size = WIDTH * HEIGHT;
  const blank = () => new Array(size).fill(0);
  const ground = blank();
  // Roads, sand and mud: their rounded edges are see-through, so they lie on
  // grass rather than replacing it.
  const paths = blank();
  const detail = blank();
  const built = blank();
  const barrier = blank();
  const above = blank();
  const blocked = blank();
  const at = (x, y) => y * WIDTH + x;
  const block = (x, y) => {
    blocked[at(x, y)] = T.marker;
  };
  const inRect = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  const onDeck = (x, y) => x >= RIVER.from && x <= RIVER.to && y >= DECK.top && y <= DECK.bottom;
  const onJetty = (x, y) => x >= JETTY.from && x <= JETTY.to && y >= JETTY.top && y <= JETTY.bottom;
  const onRoad = (x, y) =>
    // West bank: the road to the bridge.
    (x < RIVER.from && y >= DECK.top && y <= DECK.bottom) ||
    // East bank: off the bridge, then north to the gate.
    (x > RIVER.to && x <= ROAD_END && y >= DECK.top && y <= DECK.bottom) ||
    (x === NORTH_PATH && y < DECK.top);

  /** A road square, with its edges rounded where the road ends. */
  const roadTile = (x, y) => {
    const R = T.road;
    if (x === NORTH_PATH && y < DECK.top) return R.upright;
    if (x === NORTH_PATH && y === DECK.top) return R.c;
    const top = y === DECK.top;
    if (x === ROAD_END) return top ? R.ne : R.se;
    return top ? R.n : R.s;
  };
  /**
   * A square of a rounded patch (the ghat's sand, a field's mud), from a 3x3
   * set of edges and corners. `open` names a side that runs on into something
   * else and so has no edge: the ghat runs into the river.
   */
  const blobTile = (set, r, x, y, open = '') => {
    const west = x === r.left && !open.includes('w');
    const east = x === r.right && !open.includes('e');
    const north = y === r.top;
    const south = y === r.bottom;
    if (north) return west ? set.nw : east ? set.ne : set.n;
    if (south) return west ? set.sw : east ? set.se : set.s;
    return west ? set.w : east ? set.e : set.c;
  };

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const river = x >= RIVER.from && x <= RIVER.to;
      if (x === RIVER.from) ground[at(x, y)] = T.westShore;
      else if (x === RIVER.to) ground[at(x, y)] = T.eastShore;
      else if (river) ground[at(x, y)] = pick(T.water, x, y);
      else ground[at(x, y)] = pick(T.grass, x, y);
      const field = FIELDS.find((rect) => inRect(rect, x, y));
      if (onRoad(x, y)) paths[at(x, y)] = roadTile(x, y);
      else if (inRect(GHAT, x, y)) paths[at(x, y)] = blobTile(T.sand, GHAT, x, y, 'e');
      else if (field) paths[at(x, y)] = blobTile(T.road, field, x, y);
      // The river is not for walking. The deck is, once it is built (the gates
      // decide that, not this layer), and so is the jetty.
      if (river && !onDeck(x, y) && !onJetty(x, y)) block(x, y);
    }
  }

  // The bridge: two rows of planks with a rail on each side. Its piles stand
  // in the river from the start, so an unbuilt span reads as work to be done.
  for (let x = RIVER.from; x <= RIVER.to; x += 1) {
    for (let y = DECK.top; y <= DECK.bottom; y += 1) built[at(x, y)] = pick(T.planks, x, y);
    const post = (x - RIVER.from) % 3 === 0 || x === RIVER.to;
    built[at(x, DECK.top - 1)] = post ? T.railPost : T.rail;
    built[at(x, DECK.bottom + 1)] = post ? T.railPost : T.rail;
    if (post && x !== RIVER.from && x !== RIVER.to) {
      detail[at(x, DECK.top - 1)] = T.pile[0];
      detail[at(x, DECK.bottom + 1)] = T.pile[1];
    }
  }

  // The ghat's jetty, and the boats tied up at its end.
  for (let x = JETTY.from; x <= JETTY.to; x += 1) {
    for (let y = JETTY.top; y <= JETTY.bottom; y += 1) detail[at(x, y)] = pick(T.planks, x, y);
  }
  detail[at(JETTY.to + 1, JETTY.top - 1)] = T.mooring[0];
  detail[at(JETTY.to + 1, JETTY.bottom + 1)] = T.mooring[1];

  // The fence across the far bank, with the gate the boss quest opens.
  for (let x = RIVER.to + 1; x < WIDTH; x += 1) {
    if (x === NORTH_PATH) {
      barrier[at(x, FENCE_ROW)] = T.farGate;
      continue;
    }
    detail[at(x, FENCE_ROW)] = (x - RIVER.to) % 3 === 1 ? T.fencePost : T.fence;
    block(x, FENCE_ROW);
  }

  const put = (x, y, id, solid = true) => {
    detail[at(x, y)] = id;
    if (solid) block(x, y);
  };
  const place = (cells, options, { solid }) => {
    for (const [x, y] of cells) put(x, y, pick(options, x, y), solid);
  };

  // Paddy: rows of rice in wet ground, inside its rounded edge.
  for (const field of FIELDS) {
    for (let y = field.top + 1; y < field.bottom; y += 1) {
      for (let x = field.left + 1; x < field.right; x += 1) {
        put(x, y, pick(y % 2 === 0 ? T.rice : T.riceDark, x, y));
      }
    }
  }

  // Huts: a gabled roof two squares wide, then a wall with a door.
  for (const hut of HUTS) {
    T.roof.forEach((row, dy) => row.forEach((id, dx) => put(hut.x + dx, hut.y + dy, id)));
    put(hut.x, hut.y + 3, T.wall);
    put(hut.x + 1, hut.y + 3, T.door);
  }

  // The market by the road: a stall under an awning, sacks of rice, a basket.
  put(9, 6, T.awning[0]);
  put(10, 6, T.awning[1]);
  put(9, 7, T.counter[0]);
  put(10, 7, T.counter[1]);
  put(11, 7, T.sacks[0]);
  put(12, 7, T.sacks[1]);
  put(8, 7, T.basket);
  put(13, 7, T.barrel);
  put(41, 9, T.sacks[2]);
  put(7, 10, T.lantern);
  put(13, 13, T.lantern);
  put(31, 13, T.lantern);

  place(PINES, T.pine, { solid: true });
  place(FRUIT_TREES, T.fruitTree, { solid: true });
  place(BUSHES, T.bush, { solid: true });
  place(ROCKS, T.rock, { solid: true });
  place(FLOWERS, T.flowers, { solid: false });
  place(RIVER_ROCKS, T.riverRock, { solid: true });

  // Kash and reeds along both banks, wherever nothing else stands.
  for (let y = 0; y < HEIGHT; y += 1) {
    for (const x of [RIVER.from - 1, RIVER.to + 1]) {
      if (onRoad(x, y) || y === FENCE_ROW || detail[at(x, y)] !== 0) continue;
      if (inRect(GHAT, x, y) || y === DECK.top - 1 || y === DECK.bottom + 1) continue;
      if (sprinkle(x, y, 2) || y % 3 === 0) put(x, y, pick(T.reeds, x, y), false);
    }
  }

  // A tree is two tiles: the trunk stops you, the crown is drawn over you.
  TREES.forEach(([x, y], index) => {
    const kind = index % T.treeTop.length;
    put(x, y, T.treeTrunk[kind]);
    if (y > 0) above[at(x, y - 1)] = T.treeTop[kind];
  });
  put(RIVER.from - 2, DECK.bottom + 1, T.signpost);

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
    object('spawn', 3, DECK.top, 0, 0),
    // Karim Majhi waits at the head of the bridge, by the water.
    object('giver', RIVER.from - 2, DECK.top - 1, 0, 0),
    object('exit', NORTH_PATH, 0, 1, 2),
    // A span is the deck and both rails, so the rails appear with the planks.
    ...SPANS.map((span) =>
      object('gate', span.from, DECK.top - 1, span.to - span.from + 1, 4, span.quest),
    ),
    object('gate', NORTH_PATH, FENCE_ROW, 1, 1, BOSS),
  ];

  // Life that is not rules: people about their day, and boats on the river.
  // A figure is a point with a `look`; a boat is a tile object, and a `float`
  // bobs. Positions are squares, as everywhere in this file.
  const figure = (x, y, look) => ({
    height: 0,
    id: nextObject++,
    name: 'figure',
    point: true,
    properties: [{ name: 'look', type: 'string', value: look }],
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    x: x * 16 + 8,
    y: y * 16 + 8,
  });
  const float = (x, y, gid) => ({
    gid,
    height: 16,
    id: nextObject++,
    name: 'float',
    rotation: 0,
    type: '',
    visible: true,
    width: 16,
    // A tile object sits on its bottom-left corner.
    x: x * 16,
    y: (y + 1) * 16,
  });
  const scenery = [
    figure(11, 8, 'seller'),
    figure(JETTY.to, JETTY.top, 'fisher'),
    figure(5, 18, 'farmer'),
    figure(37, 18, 'farmer'),
    figure(5, 13, 'villager'),
    figure(40, 7, 'villager'),
    float(JETTY.to + 1, JETTY.top, T.boat[0]),
    float(JETTY.to + 1, JETTY.bottom, T.boat[1]),
    float(RIVER.from + 1, 6, T.boat[0]),
    float(25, 19, T.boat[1]),
  ];

  return {
    compressionlevel: -1,
    height: HEIGHT,
    infinite: false,
    layers: [
      layer(1, 'ground', ground),
      layer(2, 'paths', paths),
      layer(3, 'detail', detail),
      layer(4, 'built', built),
      layer(5, 'barrier', barrier),
      layer(6, 'above', above),
      layer(7, 'blocked', blocked, false),
      {
        draworder: 'topdown',
        id: 8,
        name: 'markers',
        objects,
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
      {
        draworder: 'topdown',
        id: 9,
        name: 'scenery',
        objects: scenery,
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 10,
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
