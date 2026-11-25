/**
 * tests/campusBracuRsWeathering.test.js
 * The weathering shaders on the Residential Campus map: wall grime, aged clay
 * tiles, stained roof slabs and the ground's surface detail. Each patches
 * three's standard shader by string replacement, which fails silently when a
 * hook it replaces is missing; these run every patch against three's own
 * shader source and check it took.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CanvasTexture, MeshStandardMaterial, ShaderLib } from 'three';

import { agedTiles, grimed, weathered } from '../src/features/campus/rsBuildings.ts';
import { groundMaterial } from '../src/features/campus/rsGround.ts';

/** Runs a material's onBeforeCompile on a copy of the standard shader. */
function compiled(mat) {
    const shader = {
        vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader,
        uniforms: {},
    };
    mat.onBeforeCompile(shader, null);
    return shader;
}

/** GLSL leaves smoothstep undefined when its first edge is not below its second. */
function assertSmoothstepsOrdered(glsl) {
    for (const m of glsl.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
        assert.ok(Number(m[1]) < Number(m[2]), `smoothstep( ${m[1]}, ${m[2]}, … )`);
    }
}

test('a wall is grimed from the roof down and damp at its foot', () => {
    const mat = grimed(new MeshStandardMaterial(), 4);
    const s = compiled(mat);
    assert.equal(s.uniforms.metresPerU.value, 4);
    assert.match(
        s.vertexShader,
        /vWallHeight = \( modelMatrix \* vec4\( transformed, 1\.0 \) \)\.y;/,
    );
    assert.match(s.fragmentShader, /varying float vWallHeight;/);
    assert.match(s.fragmentShader, /float streak = /);
    assert.match(s.fragmentShader, /float damp = /);
    assertSmoothstepsOrdered(s.fragmentShader);
    assert.equal(mat.customProgramCacheKey(), 'rs-grimed-wall');
});

test('clay tiles are aged: duller, patchy and streaked with lichen', () => {
    const mat = agedTiles(new MeshStandardMaterial());
    const s = compiled(mat);
    assert.match(s.fragmentShader, /float rsNoise\( vec2 p \)/);
    assert.match(s.fragmentShader, /float lichen = /);
    assertSmoothstepsOrdered(s.fragmentShader);
    assert.equal(mat.customProgramCacheKey(), 'rs-aged-tiles');
});

test('a roof slab is stained from a blurred sample, so cracks do not become rings', () => {
    const mat = weathered(new MeshStandardMaterial());
    const s = compiled(mat);
    const biases = [
        ...s.fragmentShader.matchAll(/texture2D\( map, vMapUv \* [\d.]+ \+ [\d.]+, ([\d.]+) \)/g),
    ].map((m) => Number(m[1]));
    assert.equal(biases.length, 2);
    for (const b of biases) assert.ok(b >= 5, `mip bias ${b}`);
    assertSmoothstepsOrdered(s.fragmentShader);
});

test('the ground gives blades to grass and earth and grit to paving', () => {
    const tex = new CanvasTexture(null);
    for (const hole of [undefined, { x1: 0, x2: 10, y1: 0, y2: 10 }]) {
        const s = compiled(groundMaterial(tex, tex, 30, hole));
        assert.match(s.fragmentShader, /float soil = smoothstep\( 0\.17, 0\.3, sat \);/);
        assert.match(
            s.fragmentShader,
            /vec3 fine = mix\( vec3\( mix\( 1\.0, grit, 0\.45 \) \), blades, soil \);/,
        );
        assertSmoothstepsOrdered(s.fragmentShader);
        if (hole) assert.match(s.fragmentShader, /discard;/);
    }
});
