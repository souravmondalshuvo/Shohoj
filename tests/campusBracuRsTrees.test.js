/**
 * tests/campusBracuRsTrees.test.js
 * Which kind of tree the Residential Campus map draws where (#978): a fixed,
 * repeatable mix — mast trees and palms along the wall, broad canopies within.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RS_TREES } from '../src/core/campusBracuRs.ts';
import { speciesAt } from '../src/features/campus/rsTrees.ts';

test('the species at a spot is the same every time', () => {
    RS_TREES.forEach((p, i) => assert.equal(speciesAt(p, i), speciesAt(p, i)));
});

test('the campus gets all four kinds, broad canopies the most', () => {
    const counts = { broadleaf: 0, mast: 0, palm: 0, banana: 0 };
    RS_TREES.forEach((p, i) => (counts[speciesAt(p, i)] += 1));
    for (const [kind, n] of Object.entries(counts)) assert.ok(n > 0, `${kind}: ${n}`);
    assert.ok(counts.broadleaf > counts.palm && counts.broadleaf > counts.banana, JSON.stringify(counts));
});

test('mast trees stand along the wall more than in the middle', () => {
    let wallMast = 0;
    let wallAll = 0;
    let innerMast = 0;
    let innerAll = 0;
    // A spot right by the west wall and one in the central garden.
    for (let i = 0; i < 400; i++) {
        if (speciesAt([-160, 60], i) === 'mast') wallMast += 1;
        wallAll += 1;
        if (speciesAt([19, 0], i) === 'mast') innerMast += 1;
        innerAll += 1;
    }
    assert.ok(wallMast / wallAll > innerMast / innerAll);
});
