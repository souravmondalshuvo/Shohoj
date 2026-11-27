/**
 * tests/campusModelSurfaces.test.js
 * NSU's flat-colour model gets brick courses on its brick, paving and
 * weathering on its stone and concrete, and nothing on glass, metal, trees or
 * cars (#1012). BRACU's tower weathers its concrete, brick, paving and outside
 * plaster, never its rooms (#1016). A material is patched once however many
 * meshes share it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';

import { bracuSurfaceKind, detailModel, surfaceKind } from '../src/features/campus/modelSurfaces.ts';

test('brick is laid in courses; stone, concrete and plaster are paved and weathered', () => {
    assert.equal(surfaceKind('Brick'), 'brick');
    for (const name of ['Stone', 'Floor', 'Concrete', 'Warm stone', 'Dark stone', 'White', 'Plaster']) {
        assert.equal(surfaceKind(name), 'masonry', name);
    }
});

test('glass, metal, trees, cars and lights keep their flat colour', () => {
    for (const name of ['Glass', 'Metal', 'Steel', 'Leaf', 'Bark', 'Grass', 'Car blue', 'Light', 'Screen', 'Road', '']) {
        assert.equal(surfaceKind(name), null, name);
    }
});

test('a shared material is patched once, and only the ones named', () => {
    const brick = new MeshStandardMaterial({ name: 'Brick' });
    const glass = new MeshStandardMaterial({ name: 'Glass' });
    const root = new Group();
    const box = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(box, brick), new Mesh(box, brick), new Mesh(box, [glass, brick]));
    assert.equal(detailModel(root, { tile: 0.6, groundY: 0 }), 1);
    assert.equal(typeof brick.onBeforeCompile, 'function');
    assert.equal(brick.customProgramCacheKey(), 'model-surface-brick-0.6');
    assert.notEqual(glass.customProgramCacheKey(), 'model-surface-brick-0.6');
});

test("BRACU's tower: concrete frame and fins, brick podium, paved forecourt, weathered plaster", () => {
    for (const name of ['Material_4', 'Material_2', 'Material_10']) assert.equal(bracuSurfaceKind(name), 'concrete', name);
    assert.equal(bracuSurfaceKind('Material_9'), 'brick');
    assert.equal(bracuSurfaceKind('Material_0'), 'masonry');
    assert.equal(bracuSurfaceKind('Interior | warm plaster'), 'render');
    for (const name of ['Interior | white', 'Interior | terrazzo', 'Core | concrete', 'Parking | concrete', 'Material_8', 'Material_13', 'Lift | timber floor']) {
        assert.equal(bracuSurfaceKind(name), null, name);
    }
});

test('a floor plate keeps the weather out, and says so in the program key', () => {
    const plaster = new MeshStandardMaterial({ name: 'Interior | warm plaster' });
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), plaster));
    assert.equal(detailModel(root, { tile: 0.6, groundY: -3, indoors: { x1: -32, x2: 32, z1: -29, z2: 27 } }, bracuSurfaceKind), 1);
    assert.equal(plaster.customProgramCacheKey(), 'model-surface-render-0.6-indoors');
    // The NSU names do not touch BRACU's materials.
    const other = new MeshStandardMaterial({ name: 'Material_4' });
    const root2 = new Group();
    root2.add(new Mesh(new BoxGeometry(1, 1, 1), other));
    assert.equal(detailModel(root2, { tile: 0.6, groundY: 0 }), 0);
});
