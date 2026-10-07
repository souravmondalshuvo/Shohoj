/**
 * tests/campusNsuModel.test.js
 * The committed NSU campus model against what the scene asks of it: a node
 * per building, per storey and per roof, by name. The scene opens a floor by
 * switching those nodes off, so a rebuilt model that merged or renamed them
 * would load and then silently stop opening floors.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { NSU_BUILDINGS } from '../src/core/campusNsu.ts';
import { isGlb } from '../src/features/campus/campusModel.ts';

const ASSET = new URL('../src/features/campus/assets/nsu-campus.glb.gz', import.meta.url);

function readGltfJson() {
    const glb = gunzipSync(readFileSync(ASSET));
    assert.ok(isGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
    const jsonLength = glb.readUInt32LE(12);
    assert.equal(glb.toString('latin1', 16, 20), 'JSON');
    return JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
}

test('the model has a node for every building, storey and roof the scene switches', () => {
    const names = new Set(readGltfJson().nodes.map((node) => node.name));
    for (const building of NSU_BUILDINGS) {
        assert.ok(names.has(`NSU_${building.id}`), `NSU_${building.id}`);
        assert.ok(names.has(`NSU_${building.id}_Roof`), `NSU_${building.id}_Roof`);
        for (let floor = 1; floor <= building.levels; floor += 1) {
            assert.ok(names.has(`NSU_${building.id}_L${floor}`), `NSU_${building.id}_L${floor}`);
        }
        // And no storey the campus data does not know about.
        assert.equal(names.has(`NSU_${building.id}_L${building.levels + 1}`), false);
    }
});

test('the model is something the page can load under its CSP', () => {
    const gltf = readGltfJson();
    // Decoded natively by GLTFLoader; Draco and meshopt need WebAssembly.
    assert.deepEqual(gltf.extensionsRequired, ['KHR_mesh_quantization']);
    // Textures load through blob: URLs, which img-src rejects.
    assert.equal(gltf.images, undefined);
    assert.equal(gltf.textures, undefined);
});

test('the model stays small enough to stream on a phone', () => {
    const bytes = readFileSync(ASSET).byteLength;
    assert.ok(bytes < 2 * 1024 * 1024, `${Math.round(bytes / 1024)} kB`);
});
