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

test('rules accept the campus a repo stamps, and never demand it', () => {
    // The invariant changed after the first fix shipped, and the reason is the
    // deploy boundary. Two clients write these collections and cannot be
    // upgraded together: the legacy bundle at the site root sends no campus,
    // the shell under /app/ does. So the rules must
    //
    //   ACCEPT the field  — or the shell's creates are denied, and
    //   NOT REQUIRE it    — or legacy's creates are denied the moment the
    //                       rules deploy, taking down the main production app.
    //
    // Requiring it is the mistake this test exists to prevent a second time.
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    const clientWritten = [
        ['src/platform/firebase/studyGroupsRepo.ts', 'validStudyGroupPayload'],
        ['src/platform/firebase/feedbackRepo.ts', 'validFeedbackPayload'],
        ['src/platform/firebase/lostFoundRepo.ts', 'validLostFoundPostPayload'],
    ];

    for (const [repoPath, validator] of clientWritten) {
        const fn = rules.slice(rules.indexOf(`function ${validator}(`));
        const body = fn.slice(0, fn.indexOf('\n    }'));

        const hasOnly = body.slice(body.indexOf('hasOnly('), body.indexOf('])', body.indexOf('hasOnly(')));
        const hasAll = body.slice(body.indexOf('hasAll('), body.indexOf('])', body.indexOf('hasAll(')));

        assert.ok(
            hasOnly.includes("'university'"),
            `${validator} must ACCEPT university — the shell stamps it and would be denied`,
        );
        assert.ok(
            !hasAll.includes("'university'"),
            `${validator} must NOT require university — the legacy bundle sends none, ` +
            `and every legacy create would be denied when these rules deploy`,
        );
        // Optional is not unchecked: a present field is still pinned to the writer.
        assert.ok(
            body.includes("!('university' in d) || writingOwnCampus(d)"),
            `${validator} must still pin a present university to the writer's own campus`,
        );

        const repo = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
        assert.ok(repo.includes('campusStamp('), `${repoPath} should stamp the campus`);
    }
});
