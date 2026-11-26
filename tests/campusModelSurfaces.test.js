/**
 * tests/campusModelSurfaces.test.js
 * NSU's flat-colour model gets brick courses on its brick, paving and
 * weathering on its stone and concrete, and nothing on glass, metal, trees or
 * cars (#1012). A material is patched once however many meshes share it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';

import { detailModel, surfaceKind } from '../src/features/campus/modelSurfaces.ts';

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
