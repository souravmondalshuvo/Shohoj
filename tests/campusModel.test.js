/**
 * tests/campusModel.test.js
 * The campus exterior model's transport (#750): gzip sniffing, the
 * DecompressionStream path, GLB validation and fetch error handling — plus the
 * scene's aspect-aware camera framing. No WebGL needed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

import {
    canDecompressGzip,
    fetchExteriorGlb,
    gunzipIfNeeded,
    isGlb,
    MODEL_FLOOR_PLATE,
    MODEL_GROUND_Y,
} from '../src/features/campus/campusModel.ts';
import {
    framingDistanceScale,
    MODEL_LIGHTING,
    skyMoodForHour,
} from '../src/features/campus/campusScene.ts';

/** A minimal 12-byte GLB header: magic "glTF", version 2, total length. */
function fakeGlb(extra = 0) {
    const bytes = new Uint8Array(12 + extra);
    bytes.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12 + extra, 0, 0, 0]);
    for (let i = 12; i < bytes.length; i += 1) bytes[i] = i % 251;
    return bytes;
}

const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

test('isGlb: accepts the glTF magic, rejects short or foreign buffers', () => {
    assert.equal(isGlb(toArrayBuffer(fakeGlb())), true);
    assert.equal(isGlb(new ArrayBuffer(4)), false);
    assert.equal(isGlb(toArrayBuffer(new TextEncoder().encode('{"asset":{}}xx'))), false);
});

test('node provides DecompressionStream, so the gzip path is exercised', () => {
    assert.equal(canDecompressGzip(), true);
});

test('gunzipIfNeeded: inflates a gzipped GLB byte-for-byte', async () => {
    const glb = fakeGlb(4096);
    const out = new Uint8Array(await gunzipIfNeeded(toArrayBuffer(gzipSync(glb, { level: 9 }))));
    assert.deepEqual(out, glb);
});

test('gunzipIfNeeded: passes through bytes a host already decoded', async () => {
    const glb = toArrayBuffer(fakeGlb(64));
    assert.equal(await gunzipIfNeeded(glb), glb);
});

test('fetchExteriorGlb: returns the GLB from a gzipped response', async () => {
    const glb = fakeGlb(128);
    const fetchImpl = async () => new Response(gzipSync(glb));
    const out = new Uint8Array(await fetchExteriorGlb('/m.glb.gz', undefined, fetchImpl));
    assert.deepEqual(out, glb);
});

test('fetchExteriorGlb: rejects a non-2xx response', async () => {
    const fetchImpl = async () => new Response('missing', { status: 404 });
    await assert.rejects(fetchExteriorGlb('/m.glb.gz', undefined, fetchImpl), /HTTP 404/);
});

test('fetchExteriorGlb: rejects content that is not a GLB', async () => {
    const fetchImpl = async () => new Response(gzipSync(Buffer.from('<!doctype html>')));
    await assert.rejects(fetchExteriorGlb('/m.glb.gz', undefined, fetchImpl), /not a GLB/);
});

test('fetchExteriorGlb: forwards the abort signal to fetch', async () => {
    const controller = new AbortController();
    let seen;
    const fetchImpl = async (_url, init) => {
        seen = init.signal;
        return new Response(gzipSync(fakeGlb()));
    };
    await fetchExteriorGlb('/m.glb.gz', controller.signal, fetchImpl);
    assert.equal(seen, controller.signal);
});

test('model placement constants match the export script', () => {
    // scripts/campus_model_export.py: plate 64 x 52.5 m, shifted down 3.17 m.
    assert.deepEqual({ ...MODEL_FLOOR_PLATE }, { width: 64, depth: 52.5 });
    assert.equal(MODEL_GROUND_Y, -3.17);
});

test('framingDistanceScale: wide canvases keep the default framing', () => {
    assert.equal(framingDistanceScale(2.28), 1);
    assert.equal(framingDistanceScale(1.25), 1);
});

test('framingDistanceScale: narrow canvases back off, capped', () => {
    assert.ok(Math.abs(framingDistanceScale(1) - 1.25) < 1e-9);
    assert.equal(framingDistanceScale(0.4), 1.85);
});

test('framingDistanceScale: nonsense aspects fall back to 1', () => {
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(framingDistanceScale(aspect), 1, String(aspect));
    }
});

test('MODEL_LIGHTING is neutral white, unlike the time-of-day mood (#755)', () => {
    // The model must keep its Blender colours: white sky and sun, no tint.
    assert.equal(MODEL_LIGHTING.sky, '#ffffff');
    assert.equal(MODEL_LIGHTING.sunColor, '#ffffff');
    // The golden-hour mood the owner saw at 19:46 is exactly what it replaces.
    assert.notEqual(skyMoodForHour(19).sunColor, MODEL_LIGHTING.sunColor);
    assert.ok(MODEL_LIGHTING.sun > 0 && MODEL_LIGHTING.ambient > 0);
});
