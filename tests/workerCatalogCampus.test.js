/**
 * tests/workerCatalogCampus.test.js (#817)
 *
 * A course code is checked twice: by the page before it sends a review or a
 * paper, and by the Worker before it stores one. If the two catalogues differ,
 * a student is either refused by the server for a course their own page offered
 * or allowed to file something under a course the page would never show. Both
 * sides are generated, from different files, so this holds them together for
 * every campus that has a catalogue.
 */

import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};

const worker = await import('../worker/catalog.generated.js');
const { getCatalogFor } = await import('../js/core/activeCatalog.js');
const { UNIVERSITIES } = await import('../js/core/university.js');

const creditsOf = (catalogue) => Object.fromEntries(catalogue.allCourses.map((c) => [c.code, c.credits]));

assert.deepEqual(worker.COURSE_CREDITS, creditsOf(getCatalogFor('bracu')), "BRACU: the Worker's codes and credits are the page's");
assert.deepEqual(worker.NSU_COURSE_CREDITS, creditsOf(getCatalogFor('nsu')), "NSU: the Worker's codes and credits are the page's");

// Every registered campus agrees course by course — including one with no
// catalogue on either side, where nothing is known to either.
for (const id of Object.keys(UNIVERSITIES)) {
  const page = getCatalogFor(id);
  for (const course of page.allCourses) {
    assert.ok(worker.isKnownCourse(course.code, id), `${id}: the Worker refuses ${course.code}, which the page offers`);
    assert.equal(worker.creditsForCourse(course.code, id), course.credits, `${id}: ${course.code} credits`);
  }
}
// A course the page lists as untitled is in neither catalogue.
for (const code of getCatalogFor('nsu').untitled) {
  assert.equal(worker.isKnownCourse(code, 'nsu'), false, `${code} has no title, so neither side offers it`);
}

console.log('workerCatalogCampus: the Worker and the page agree on every campus\'s courses');
