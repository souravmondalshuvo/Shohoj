// tests/questShadowCompile.test.js
//
// What the 3D zone's compiling ahead leans on inside three.js (#981,
// src/features/quest/game/effects3d.ts, Finish.compileShadows and
// compilePasses). A shader compiled ahead is only used if it is keyed exactly
// as the frame asks for it; these are the facts of three r187 that the keys
// were matched to. If a later three.js changes one, the zone still draws, but
// a shader is built on a frame again and a phone's first visit stalls: on an
// iPhone the shadow pass's skinned shader alone stopped a frame for 1.4 s.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const three = (path) =>
  readFileSync(new URL(`../node_modules/three/${path}`, import.meta.url), 'utf8');

const shadowMap = three('src/renderers/webgl/WebGLShadowMap.js');

test('the shadow pass draws in a plain MeshDepthMaterial', () => {
  assert.match(shadowMap, /_depthMaterial = new MeshDepthMaterial\(\)/);
});

test('the shadow pass turns a material over: front to back, back to front', () => {
  assert.match(
    shadowMap,
    /const shadowSide = \{ \[ FrontSide \]: BackSide, \[ BackSide \]: FrontSide, \[ DoubleSide \]: DoubleSide \};/,
  );
  assert.match(
    shadowMap,
    /result\.side = \( material\.shadowSide !== null \) \? material\.shadowSide : shadowSide\[ material\.side \];/,
  );
});

test('the depth material takes the texture, alpha test and displacement it is drawn with', () => {
  for (const copied of [
    'result.alphaMap = material.alphaMap;',
    'result.map = material.map;',
    'result.displacementMap = material.displacementMap;',
    'result.wireframe = material.wireframe;',
  ]) {
    assert.ok(shadowMap.includes(copied), copied);
  }
});

test('the shadow pass draws with no scene, so without fog', () => {
  // renderBufferDirect( camera, scene = null, ...): three stands in an empty
  // scene, and whether the scene has fog is part of a shader's key.
  assert.match(
    shadowMap,
    /renderer\.renderBufferDirect\( shadowCamera, null, geometry, depthMaterial, object/,
  );
});

test("the passes' full-screen triangle has a position and a uv, no normal", () => {
  const pass = three('examples/jsm/postprocessing/Pass.js');
  const body = pass.slice(pass.indexOf('class FullscreenTriangleGeometry'));
  const attributes = [
    ...body.slice(0, body.indexOf('\n}')).matchAll(/setAttribute\( '(\w+)'/g),
  ].map((m) => m[1]);
  assert.deepEqual(attributes, ['position', 'uv']);
});
