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

import { campusStamp } from '../src/platform/firebase/campusStamp.ts';

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

test('every collection whose rules require `university` has a repo that stamps it', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    // Collections created by the CLIENT, mapped to the repo that writes them.
    // Worker-written collections (facultyReviews, papers) are excluded: the
    // Worker stamps those itself and bypasses rules entirely.
    const clientWritten = [
        ['studyGroups', 'src/platform/firebase/studyGroupsRepo.ts', 'validStudyGroupPayload'],
        ['appFeedback', 'src/platform/firebase/feedbackRepo.ts', 'validFeedbackPayload'],
        ['lostFoundPosts', 'src/platform/firebase/lostFoundRepo.ts', 'validLostFoundPostPayload'],
    ];

    for (const [collection, repoPath, validator] of clientWritten) {
        const fn = rules.slice(rules.indexOf(`function ${validator}(`));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        const rulesRequire =
            body.includes("'university'") || body.includes('writingOwnCampus');

        const repo = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
        const repoStamps = repo.includes('campusStamp(');

        assert.equal(
            repoStamps,
            rulesRequire,
            rulesRequire
                ? `${validator} requires university, but ${repoPath} never calls campusStamp — ` +
                  `every create on ${collection} would be denied in production`
                : `${repoPath} stamps a campus that ${validator} does not require`,
        );
    }
});
