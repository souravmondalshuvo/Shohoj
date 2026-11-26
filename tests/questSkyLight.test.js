// tests/questSkyLight.test.js
//
// What the 3D zone's sky light leans on inside three.js (#981,
// src/features/quest/game/effects3d.ts, compileSkyLight). Its shaders are
// compiled in the background before PMREMGenerator.fromScene draws with
// them; to find the generator's own materials, a dry run on an empty scene
// stands in for its private drawing step, _renderCube. If a later three.js
// renames that step or stops keeping its materials, the sky still lights the
// zone, but the page holds still again while they compile: these say so
// first.

import test from 'node:test';
import assert from 'node:assert/strict';

import { PMREMGenerator, Scene, WebGLCoordinateSystem } from 'three';

/** As much of a WebGLRenderer as fromScene asks of one. Nothing is drawn. */
function renderer() {
  let target = null;
  return {
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    xr: { enabled: false },
    coordinateSystem: WebGLCoordinateSystem,
    getClearColor: (color) => color.set(0),
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    render(scene) {
      // An empty scene is only cleared: nothing in it compiles.
      assert.equal(scene.children.length, 0, 'the dry run drew something');
    },
  };
}

/** The materials a fromScene of an empty scene draws with, as the zone finds them. */
function dryRun(pmrem) {
  const seen = [];
  pmrem._renderCube = (_target, _lod, material) => seen.push(material);
  try {
    pmrem.fromScene(new Scene(), 0.04).dispose();
  } finally {
    delete pmrem._renderCube;
  }
  return seen;
}

test('PMREMGenerator still draws through _renderCube', () => {
  assert.equal(typeof PMREMGenerator.prototype._renderCube, 'function');
});

test('a dry run finds the blur, GGX and integration materials', () => {
  const pmrem = new PMREMGenerator(renderer());
  const names = new Set(dryRun(pmrem).map((material) => material.name));
  assert.deepEqual([...names].sort(), [
    'PMREMGGXConvolution',
    'PMREMGGXIntegration',
    'PMREMSphericalGaussianBlur',
  ]);
  assert.equal(typeof pmrem._renderCube, 'function', 'the prototype step is back');
  pmrem.dispose();
});

test('the generator keeps its materials: the real run draws with the ones compiled', () => {
  const pmrem = new PMREMGenerator(renderer());
  const first = new Set(dryRun(pmrem));
  const second = new Set(dryRun(pmrem));
  assert.deepEqual([...second], [...first]);
  pmrem.dispose();
});
