// tests/questWorld.test.js — the walkable side of Shohoj Quest (#981): reading
// a Tiled map, walking it, and the progress that opens it up.
//
// The second half checks the maps that ship. A map that strands the player, or
// lets them walk round the boss, fails here before anyone plays it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadWorld, zonesInOrder } from '../src/features/quest/content/world.ts';
import {
  completedSet,
  emptyProgress,
  memoryProgressStore,
  withPosition,
  withSolved,
} from '../src/features/quest/progress/progress.ts';
import {
  auditZoneMap,
  canWalk,
  findRoute,
  gateAt,
  parseZoneMap,
  shutGates,
  walkGrid,
} from '../src/features/quest/world/zoneMap.ts';
import { SPANS, buildBridgeMap, serialise } from '../scripts/quest_bridge_map.mjs';

// ── A small map, drawn in text ──────────────────────────────────────────────
//
//   . grass   # blocked   S spawn   K quest-giver   E exit
//   a b       squares of the gates for quests "a" and "b"
//
// The gate squares carry a `built` tile, and gate b also a `barrier` tile.

function tiled(rows, over = {}) {
  const width = rows[0].length;
  const height = rows.length;
  const cells = rows.join('');
  const layer = (name, pick, id) => ({
    id,
    name,
    type: 'tilelayer',
    width,
    height,
    data: [...cells].map((c) => (pick(c) ? 1 : 0)),
  });
  const find = (letter) => {
    const index = cells.indexOf(letter);
    return { x: index % width, y: Math.floor(index / width) };
  };
  const point = (name, letter) => {
    const at = find(letter);
    return { name, point: true, x: at.x * 16 + 8, y: at.y * 16 + 8, width: 0, height: 0 };
  };
  const gate = (letter) => {
    const xs = [...cells].flatMap((c, i) => (c === letter ? [i % width] : []));
    const ys = [...cells].flatMap((c, i) => (c === letter ? [Math.floor(i / width)] : []));
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      name: 'gate',
      x: x * 16,
      y: y * 16,
      width: (Math.max(...xs) - x + 1) * 16,
      height: (Math.max(...ys) - y + 1) * 16,
      properties: [{ name: 'quest', type: 'string', value: letter }],
    };
  };
  const exit = find('E');
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width,
    height,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      { firstgid: 1, name: 'tiles', image: 'tiles.png', tilewidth: 16, tileheight: 16, spacing: 1 },
    ],
    layers: [
      layer('ground', () => true, 1),
      layer('built', (c) => c === 'a' || c === 'b', 2),
      layer('barrier', (c) => c === 'b', 3),
      layer('above', () => false, 4),
      layer('blocked', (c) => c === '#', 5),
      {
        id: 6,
        name: 'markers',
        type: 'objectgroup',
        objects: [
          point('spawn', 'S'),
          point('giver', 'K'),
          { name: 'exit', x: exit.x * 16, y: exit.y * 16, width: 16, height: 16 },
          ...['a', 'b'].filter((letter) => cells.includes(letter)).map(gate),
        ],
      },
    ],
    ...over,
  };
}

const ROWS = [
  '#########',
  '#S.K#...#',
  '#...a.#b#',
  '#...#.#E#',
  '#########',
]; // prettier-ignore

function small(over) {
  const parsed = parseZoneMap(tiled(ROWS, over));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error.join(' '));
  return parsed.value;
}

const none = new Set();

// ── Reading a map ───────────────────────────────────────────────────────────

test('a map is read into its size, layers, markers and gates', () => {
  const map = small();
  assert.equal(map.width, 9);
  assert.equal(map.height, 5);
  assert.equal(map.tileSize, 16);
  assert.deepEqual(map.tileset, { name: 'tiles', margin: 0, spacing: 1 });
  assert.deepEqual(map.spawn, { x: 1, y: 1 });
  assert.deepEqual(map.giver, { x: 3, y: 1 });
  assert.deepEqual(map.exit, { x: 7, y: 3, w: 1, h: 1 });
  assert.deepEqual(map.gates, [
    { x: 4, y: 2, w: 1, h: 1, quest: 'a' },
    { x: 7, y: 2, w: 1, h: 1, quest: 'b' },
  ]);
});

test('layer names decide what a layer is for, and blocked layers are not drawn', () => {
  const map = small();
  assert.deepEqual(map.layers, [
    { name: 'ground', role: 'always', above: false },
    { name: 'built', role: 'built', above: false },
    { name: 'barrier', role: 'barrier', above: false },
    { name: 'above', role: 'always', above: true },
  ]);
  assert.equal(map.blocked[0], true);
  assert.equal(map.blocked[1 * 9 + 1], false);
});

test('a rectangle marker covers every square it touches, and no more', () => {
  const source = tiled(ROWS);
  const markers = source.layers.find((layer) => layer.name === 'markers');
  // 2 squares wide and 1 pixel into a third row: 2 by 2 squares.
  markers.objects.find((o) => o.name === 'exit').width = 32;
  markers.objects.find((o) => o.name === 'exit').x = 6 * 16;
  markers.objects.find((o) => o.name === 'exit').y = 2 * 16;
  markers.objects.find((o) => o.name === 'exit').height = 17;
  const parsed = parseZoneMap(source);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.exit, { x: 6, y: 2, w: 2, h: 2 });
});

test('a gate may carry its quest the way older Tiled wrote properties', () => {
  const source = tiled(ROWS);
  const gate = source.layers.at(-1).objects.find((o) => o.name === 'gate');
  gate.properties = { quest: 'a' };
  const parsed = parseZoneMap(source);
  assert.ok(parsed.ok);
  assert.equal(parsed.value.gates[0].quest, 'a');
});

test('every problem with a map is reported, in words an author can act on', () => {
  const broken = (change) => {
    const source = tiled(ROWS);
    change(source);
    const parsed = parseZoneMap(source);
    assert.equal(parsed.ok, false);
    return parsed.error.join('\n');
  };
  const markers = (source) => source.layers.at(-1);

  assert.match(parseZoneMap(null).error.join(''), /not a Tiled JSON object/);
  assert.match(broken((s) => (s.orientation = 'isometric')), /orthogonal/);
  assert.match(broken((s) => (s.infinite = true)), /infinite/);
  assert.match(broken((s) => (s.tileheight = 32)), /square/);
  assert.match(broken((s) => (s.layers[0].data = 'eJztwTEBAAAAwqD1T20=')), /CSV/);
  assert.match(broken((s) => (s.layers[1].name = 'ground')), /its own name/);
  assert.match(broken((s) => s.layers.pop()), /object layer named "markers"/);
  assert.match(broken((s) => markers(s).objects.shift()), /"spawn" point/);
  assert.match(broken((s) => (markers(s).objects[0].x = 9999)), /outside the map/);
  assert.match(broken((s) => (markers(s).objects[0].name = 'chest')), /not a marker the game knows/);
  assert.match(broken((s) => delete markers(s).objects.at(-1).properties), /property "quest"/);
  assert.match(broken((s) => markers(s).objects.push({ ...markers(s).objects[1] })), /two "giver"/);
  assert.match(broken((s) => s.tilesets.push(s.tilesets[0])), /exactly one tileset/);
  assert.match(
    broken((s) => (s.tilesets = [{ firstgid: 1, source: 'tiles.tsx' }])),
    /Embed in Map/,
  );
  // Two mistakes, two messages: an author fixes them in one go.
  const both = broken((s) => {
    s.infinite = true;
    s.orientation = 'hexagonal';
  });
  assert.match(both, /orthogonal/);
  assert.match(both, /infinite/);
});

// ── Walking ─────────────────────────────────────────────────────────────────

test('walls, the quest-giver and shut gates cannot be walked on', () => {
  const map = small();
  const grid = walkGrid(map, none);
  assert.equal(canWalk(grid, { x: 1, y: 1 }), true);
  assert.equal(canWalk(grid, { x: 0, y: 0 }), false, 'a wall');
  assert.equal(canWalk(grid, map.giver), false, 'the quest-giver');
  assert.equal(canWalk(grid, { x: 4, y: 2 }), false, 'gate a, shut');
  assert.equal(canWalk(grid, { x: -1, y: 1 }), false, 'off the map');
  assert.equal(canWalk(grid, { x: 1, y: 99 }), false, 'off the map');
});

test('solving a quest opens its gates and no others', () => {
  const map = small();
  assert.deepEqual(shutGates(map, none).map((g) => g.quest), ['a', 'b']);
  assert.deepEqual(shutGates(map, new Set(['a'])).map((g) => g.quest), ['b']);
  assert.equal(canWalk(walkGrid(map, new Set(['a'])), { x: 4, y: 2 }), true);
  assert.equal(gateAt(map, none, { x: 4, y: 2 })?.quest, 'a');
  assert.equal(gateAt(map, new Set(['a']), { x: 4, y: 2 }), null);
  assert.equal(gateAt(map, none, { x: 1, y: 1 }), null);
});

test('a route is the shortest walk, square by square', () => {
  const map = small();
  const route = findRoute(walkGrid(map, none), map.spawn, { x: 3, y: 3 });
  assert.equal(route.short, 0);
  assert.equal(route.steps.length, 4);
  assert.deepEqual(route.steps.at(-1), { x: 3, y: 3 });
  // Each step is to a square next to the last.
  let at = map.spawn;
  for (const step of route.steps) {
    assert.equal(Math.abs(step.x - at.x) + Math.abs(step.y - at.y), 1);
    at = step;
  }
});

test('a route to where the hero already stands is no steps', () => {
  const map = small();
  assert.deepEqual(findRoute(walkGrid(map, none), map.spawn, map.spawn), { steps: [], short: 0 });
});

test('walking up to the quest-giver stops beside them', () => {
  const map = small();
  const route = findRoute(walkGrid(map, none), map.spawn, map.giver);
  assert.equal(route.short, 1);
  assert.deepEqual(route.steps.at(-1), { x: 2, y: 1 });
});

test('a tap somewhere out of reach walks as near as it can', () => {
  const map = small();
  // Beyond gate a, which is shut: the walk ends beside the gate.
  const route = findRoute(walkGrid(map, none), map.spawn, { x: 5, y: 2 });
  assert.equal(route.short, 2);
  assert.deepEqual(route.steps.at(-1), { x: 3, y: 2 });
  // With the gate open the same tap arrives.
  assert.equal(findRoute(walkGrid(map, new Set(['a'])), map.spawn, { x: 5, y: 2 }).short, 0);
});

// ── A map against its zone ──────────────────────────────────────────────────

test('a sound map has nothing to report', () => {
  assert.deepEqual(auditZoneMap(small(), ['a', 'b'], 'b'), []);
});

test('the audit catches a gate for a quest that is not in the zone', () => {
  assert.match(auditZoneMap(small(), ['b'], 'b').join('\n'), /"a", which is not a quest/);
});

test('the audit catches an exit that needs no boss, and one nothing guards', () => {
  const open = ['#########', '#S.K....#', '#...a.#b#', '#...#..E#', '#########'];
  const parsed = parseZoneMap(tiled(open));
  assert.ok(parsed.ok);
  assert.match(
    auditZoneMap(parsed.value, ['a', 'b'], 'b').join('\n'),
    /reached without solving the boss/,
  );
  assert.match(auditZoneMap(small(), ['a', 'b', 'c'], 'c').join('\n'), /No gate is tied to the boss/);
});

test('the audit catches a player who cannot reach the quest-giver or the exit', () => {
  const walled = ['#########', '#S#K#...#', '###.a.#b#', '#...#.#E#', '#########'];
  const parsed = parseZoneMap(tiled(walled));
  assert.ok(parsed.ok);
  const problems = auditZoneMap(parsed.value, ['a', 'b'], 'b').join('\n');
  assert.match(problems, /cannot walk to the quest-giver/);
  assert.match(problems, /exit cannot be reached/);
});

// ── The maps that ship ──────────────────────────────────────────────────────

const MAPS = new URL('../src/features/quest/assets/maps/', import.meta.url);
const openZones = zonesInOrder(loadWorld()).filter((zone) => zone.status === 'open');

test('every open zone has a map that reads cleanly and can be played through', () => {
  assert.ok(openZones.length > 0);
  const registry = readFileSync(new URL('index.ts', MAPS), 'utf8');
  for (const zone of openZones) {
    const text = readFileSync(new URL(`${zone.map}.json`, MAPS), 'utf8');
    const parsed = parseZoneMap(JSON.parse(text));
    assert.ok(parsed.ok, `${zone.id}: ${parsed.ok ? '' : parsed.error.join(' ')}`);
    const boss = zone.quests.find((quest) => quest.boss)?.id ?? null;
    assert.deepEqual(
      auditZoneMap(
        parsed.value,
        zone.quests.map((quest) => quest.id),
        boss,
      ),
      [],
      zone.id,
    );
    assert.match(registry, new RegExp(`\\b${zone.map}: \\(\\) => import\\('\\./${zone.map}\\.json'\\)`));
  }
});

test('The Bridge: every quest lays a span, in the order the quests are written', () => {
  const bridge = openZones.find((zone) => zone.id === 'bridge');
  assert.deepEqual(
    SPANS.map((span) => span.quest),
    bridge.quests.map((quest) => quest.id),
  );
  // The spans meet end to end: no square of deck is left out or laid twice.
  SPANS.slice(1).forEach((span, index) => assert.equal(span.from, SPANS[index].to + 1));
});

test('The Bridge: the committed map is what its script draws', () => {
  assert.equal(
    readFileSync(new URL('bridge.json', MAPS), 'utf8'),
    serialise(buildBridgeMap()),
    'run: node scripts/quest_bridge_map.mjs',
  );
});

test('The Bridge: each quest solved lets the hero walk further east', () => {
  const parsed = parseZoneMap(buildBridgeMap());
  assert.ok(parsed.ok);
  const map = parsed.value;
  const reach = (completed) => {
    // How far east the hero can get by aiming at the far bank.
    const route = findRoute(walkGrid(map, completed), map.spawn, { x: map.width - 1, y: map.spawn.y });
    return route.steps.at(-1)?.x ?? map.spawn.x;
  };
  const done = new Set();
  let last = reach(done);
  for (const span of SPANS) {
    done.add(span.quest);
    const now = reach(done);
    assert.ok(now > last, `${span.quest} should open more of the bridge`);
    last = now;
  }
});

// ── Progress ────────────────────────────────────────────────────────────────

test('progress starts empty, at the spawn point', () => {
  assert.deepEqual(emptyProgress('bridge'), { completed: {}, zone: 'bridge', at: null });
});

test('a solved quest is recorded once: the first time stands', () => {
  const first = withSolved(emptyProgress('bridge'), 'q', 1000);
  assert.deepEqual(first.completed, { q: 1000 });
  assert.equal(withSolved(first, 'q', 2000), first);
  assert.deepEqual([...completedSet(withSolved(first, 'r', 3000))], ['q', 'r']);
});

test('a quest named like an Object method is not already solved', () => {
  const progress = withSolved(emptyProgress('bridge'), 'constructor', 5);
  assert.deepEqual(progress.completed, { constructor: 5 });
});

test('progress is never changed in place', () => {
  const start = emptyProgress('bridge');
  const moved = withPosition(start, { x: 3, y: 4 });
  assert.equal(start.at, null);
  assert.deepEqual(moved.at, { x: 3, y: 4 });
  assert.equal(withPosition(moved, { x: 3, y: 4 }), moved, 'standing still is no change');
  assert.deepEqual(start.completed, {});
});

test('the memory store hands back what it was given', async () => {
  const store = memoryProgressStore();
  assert.equal(await store.load(), null);
  const progress = withSolved(emptyProgress('bridge'), 'q', 1);
  store.save(progress);
  assert.equal(await store.load(), progress);
});
