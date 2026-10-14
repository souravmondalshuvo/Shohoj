/**
 * tests/campusStamp.test.js
 *
 * Closes the gap that shipped: firestore.rules was changed to REQUIRE a
 * `university` field on client-created documents, the rules tests were updated
 * to send it, and every one of them passed — because the fixtures stood in for
 * the client. The real repos never sent the field. Nothing failed, because
 * nothing connected "the rules demand this" to "the client provides it".
 *
 * Two jobs here:
 *   1. campusStamp's own behaviour.
 *   2. A structural tripwire: every collection whose rules require `university`
 *      must have a client repo that actually stamps it. Crude on purpose — it
 *      reads the files — but it fails the moment the two drift again, which is
 *      exactly the failure that got through.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { campusFilter, campusStamp } from '../src/platform/firebase/campusStamp.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('campusStamp resolves the signed-in session to its campus', () => {
    assert.equal(campusStamp({ currentUser: { email: 'student@g.bracu.ac.bd' } }), 'bracu');
    assert.equal(campusStamp({ currentUser: { email: 'student@northsouth.edu' } }), 'nsu');
});

test('campusStamp returns empty rather than guessing a campus', () => {
    // An unresolvable campus must fail the write, not file the document under
    // somebody else's university. validCampus in the rules rejects ''.
    assert.equal(campusStamp({ currentUser: null }), '');
    assert.equal(campusStamp({}), '');
    assert.equal(campusStamp({ currentUser: { email: null } }), '');
    assert.equal(campusStamp({ currentUser: { email: 'someone@gmail.com' } }), '');
    // Lookalike domains resolve to nothing, same as everywhere else.
    assert.equal(campusStamp({ currentUser: { email: 'x@g.bracu.ac.bd.attacker.com' } }), '');
});

test('campusFilter scopes a student\'s list to their campus and an outside admin\'s to none', () => {
    const where = (field, op, value) => ({ field, op, value });
    assert.deepEqual(campusFilter({ currentUser: { email: 'student@g.bracu.ac.bd' } }, where), [
        { field: 'university', op: '==', value: 'bracu' },
    ]);
    assert.deepEqual(campusFilter({ currentUser: { email: 'student@northsouth.edu' } }, where), [
        { field: 'university', op: '==', value: 'nsu' },
    ]);
    assert.deepEqual(campusFilter({ currentUser: { email: 'admin@gmail.com' } }, where), []);
});

test('campusFilter follows the campus the page is showing when one is passed', () => {
    // An admin's campus switcher: useUniversity() resolves the view-as campus,
    // and the list must be that campus's, whatever the admin's own address.
    const where = (field, op, value) => ({ field, op, value });
    assert.deepEqual(campusFilter({ currentUser: { email: 'admin@gmail.com' } }, where, 'nsu'), [
        { field: 'university', op: '==', value: 'nsu' },
    ]);
    assert.deepEqual(campusFilter({ currentUser: { email: 'admin@g.bracu.ac.bd' } }, where, 'diu'), [
        { field: 'university', op: '==', value: 'diu' },
    ]);
    // Undefined (nothing resolved yet) falls back to the session's own campus.
    assert.deepEqual(campusFilter({ currentUser: { email: 'student@northsouth.edu' } }, where, undefined), [
        { field: 'university', op: '==', value: 'nsu' },
    ]);
});

test('rules require every client create to carry its own campus, and the shell sends it', () => {
    // History: the field was first optional for BRACU, because the legacy
    // bundle sent none. Legacy stamps since #822 (tests/campusScope.test.js)
    // and scripts/backfill_campus.js stamped the documents written before it,
    // so the exception — and the read-side default to BRACU that leaked other
    // campuses' rows into BRACU's unfiltered lists — is gone.
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    const own = rules.slice(rules.indexOf('function writingOwnCampus('));
    const ownBody = own.slice(0, own.indexOf('\n    }'));
    assert.ok(ownBody.includes("'university' in data"));
    assert.ok(ownBody.includes('data.university == userCampus()'));
    assert.ok(!rules.includes('validCreateCampus'), 'the BRACU omission path is gone');

    const clientWritten = [
        ['src/platform/firebase/studyGroupsRepo.ts', 'validStudyGroupPayload'],
        ['src/platform/firebase/feedbackRepo.ts', 'validFeedbackPayload'],
        ['src/platform/firebase/lostFoundRepo.ts', 'validLostFoundPostPayload'],
    ];

    for (const [repoPath, validator] of clientWritten) {
        const fn = rules.slice(rules.indexOf(`function ${validator}(`));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        const hasOnly = body.slice(body.indexOf('hasOnly('), body.indexOf('])', body.indexOf('hasOnly(')));

        assert.ok(hasOnly.includes("'university'"), `${validator} must accept university`);
        assert.ok(body.includes('writingOwnCampus(d)'), `${validator} must require the writer's campus`);

        const repo = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
        assert.ok(repo.includes('campusStamp('), `${repoPath} should stamp the campus`);
    }
});

test('every shell list of a campus-scoped collection carries the campus filter', () => {
    // The read half of the same drift: a list the rules require a filter on,
    // sent without one, is denied for every campus. And each filter follows
    // the campus being shown, so an admin's switcher moves it.
    const lists = [
        ['src/platform/firebase/studyGroupsRepo.ts', 1],
        ['src/platform/firebase/feedbackRepo.ts', 1],
        ['src/platform/firebase/lostFoundRepo.ts', 1],
        ['src/platform/firebase/papersRepo.ts', 2],
        ['src/platform/firebase/reviewsRepo.ts', 3],
    ];
    for (const [repoPath, count] of lists) {
        const repo = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
        assert.equal(repo.split('...campusFilter(auth, where, readCampus)').length - 1, count, repoPath);
    }
});
