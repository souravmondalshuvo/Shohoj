// tests/questRenderer.test.js
//
// Whether Shohoj Quest's zone is drawn in 3D or 2D (#981,
// src/features/quest/game/rendererChoice.ts). 3D is the default where the
// host offers it; a browser without WebGL 2, or drawing in software, gets 2D;
// the address can ask for either.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  askedRenderer,
  chooseRenderer,
  isSoftwareRenderer,
} from '../src/features/quest/game/rendererChoice.ts';

const gpu = () => ({ webgl: true, software: false });
const software = () => ({ webgl: true, software: true });
const noWebGL = () => ({ webgl: false, software: false });
const unasked = () => {
  throw new Error('the browser was probed when the choice was not its to make');
};

test('the address: ?quest3d=1 is 3D, ?quest3d=0 is 2D, anything else is the default', () => {
  assert.equal(askedRenderer('?quest3d=1'), '3d');
  assert.equal(askedRenderer('?quest3d=0'), '2d');
  assert.equal(askedRenderer('?quest3dq=low&quest3d=0'), '2d');
  assert.equal(askedRenderer(''), 'auto');
  assert.equal(askedRenderer('?quest3d=yes'), 'auto');
  assert.equal(askedRenderer('?quest3dq=high'), 'auto');
});

test('by default, a browser with a graphics card gets 3D', () => {
  assert.equal(chooseRenderer('auto', true, gpu), '3d');
});

test('by default, a browser drawing in software, or without WebGL 2, gets 2D', () => {
  assert.equal(chooseRenderer('auto', true, software), '2d');
  assert.equal(chooseRenderer('auto', true, noWebGL), '2d');
});

test('the address overrides the browser, without asking it', () => {
  assert.equal(chooseRenderer('2d', true, unasked), '2d');
  assert.equal(chooseRenderer('3d', true, unasked), '3d');
});

test('a host that does not offer 3D gets 2D, whatever is asked', () => {
  assert.equal(chooseRenderer('3d', false, unasked), '2d');
  assert.equal(chooseRenderer('auto', false, unasked), '2d');
});

/** A WebGL context that names its renderer `name`, or hides it. */
function context(name, { hidden = false, throws = false } = {}) {
  const DEBUG_RENDERER = 0x9246;
  const RENDERER = 0x1f01;
  return {
    RENDERER,
    getExtension: (ext) =>
      ext === 'WEBGL_debug_renderer_info' && !hidden ? { UNMASKED_RENDERER_WEBGL: DEBUG_RENDERER } : null,
    getParameter: (param) => {
      if (throws) throw new Error('not allowed');
      if (param === DEBUG_RENDERER) return name;
      if (param === RENDERER) return 'WebKit WebGL';
      return null;
    },
  };
}

test('software renderers are told apart by the name they give', () => {
  for (const name of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'softpipe',
    'Microsoft Basic Render Driver',
  ]) {
    assert.equal(isSoftwareRenderer(context(name)), true, name);
  }
  for (const name of ['Apple M3 Pro', 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', 'Mali-G57']) {
    assert.equal(isSoftwareRenderer(context(name)), false, name);
  }
});

test('a renderer that hides its name, or will not say, is taken to be a graphics card', () => {
  assert.equal(isSoftwareRenderer(context('SwiftShader', { hidden: true })), false);
  assert.equal(isSoftwareRenderer(context('SwiftShader', { throws: true })), false);
});
