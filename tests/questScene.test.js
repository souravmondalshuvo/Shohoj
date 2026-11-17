// tests/questScene.test.js
//
// The 3D prototype of Shohoj Quest (#981) reads what stands where from the
// same Tiled map the 2D game draws (src/features/quest/world/sceneKinds.ts).
// These hold that reading to the map: every tile is named, so nothing in a map
// silently vanishes in 3D, and the named things are where the map puts them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadWorld, zonesInOrder } from '../src/features/quest/content/world.ts';
import { describeScene } from '../src/features/quest/world/sceneKinds.ts';
import { buildBridgeMap } from '../scripts/quest_bridge_map.mjs';

const MAPS = new URL('../src/features/quest/assets/maps/', import.meta.url);
const bridge = describeScene(buildBridgeMap());
const at = (x, y) => bridge.ground[y * bridge.width + x];
const count = (kind) => bridge.props.filter((prop) => prop.kind === kind).length;

test('every tile of every open zone is something the 3D scene can build', () => {
  const open = zonesInOrder(loadWorld()).filter((zone) => zone.status === 'open');
  assert.ok(open.length > 0);
  for (const zone of open) {
    const map = JSON.parse(readFileSync(new URL(`${zone.map}.json`, MAPS), 'utf8'));
    assert.deepEqual(describeScene(map).unknown, [], zone.id);
  }
});

test('The Bridge: the ground under foot', () => {
  assert.equal(bridge.width, 46);
  assert.equal(bridge.height, 24);
  assert.equal(at(3, 11), 'road');
  assert.equal(at(16, 5), 'bank-west');
  assert.equal(at(20, 5), 'water');
  assert.equal(at(29, 5), 'bank-east');
  assert.equal(at(13, 16), 'sand');
  // Rice grows in mud, not on the road the field's edge is drawn with.
  assert.equal(at(4, 17), 'mud');
  assert.equal(at(2, 2), 'grass');
});

test('The Bridge: its village, river and bridge', () => {
  assert.equal(count('hut'), 3);
  assert.equal(count('stall'), 1);
  assert.equal(count('boat'), 4);
  assert.ok(count('pile') >= 8, 'the bridge stands on piles before its deck is laid');
  assert.ok(count('rice') > 50);
  assert.ok(count('kash') > 0 && count('reeds') > 0);
  // Two rows of deck and a rail either side, across the whole river.
  assert.equal(bridge.deck.length, 14 * 2);
  assert.equal(bridge.rails.length, 14 * 2);
  assert.deepEqual(bridge.barriers, [{ x: 38, y: 3 }]);
});

test('a hut is found by its door, so it is one hut and not eight squares of one', () => {
  const huts = bridge.props.filter((prop) => prop.kind === 'hut').map(({ x, y }) => ({ x, y }));
  assert.deepEqual(huts, [
    { x: 3, y: 7 },
    { x: 6, y: 7 },
    { x: 42, y: 8 },
  ]);
});

test('a tile the scene does not know is reported, not dropped', () => {
  const map = buildBridgeMap();
  const detail = map.layers.find((layer) => layer.name === 'detail');
  // A tile far from anything the reader names: the sheet's last row.
  detail.data[0] = 30 * 57 + 40 + 1;
  assert.deepEqual(describeScene(map).unknown, ['40,30']);
});
