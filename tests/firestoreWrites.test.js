/**
 * tests/firestoreWrites.test.js
 * What the three Firestore writes actually send (#667).
 *
 * Until #667 nothing checked these payloads at all: the object handed to
 * addDoc/setDoc was built inside the real-SDK adapter, and the repo tests fake
 * that adapter's whole method. These tests pin each payload — which keys are
 * always written, which only when there is something to write, and that no
 * key is ever written as undefined (Firestore refuses those outright).
 *
 * The key sets are read out of firestore.rules at test time rather than copied
 * here, so a rule that starts requiring a key the code does not write — or a
 * code change that writes a key the rule forbids — fails this file, not a
 * production write.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedbackWrite } from '../src/platform/firebase/feedbackRepo.ts';
import { studyGroupWrite } from '../src/platform/firebase/studyGroupsRepo.ts';
import { lostFoundClaimWrite } from '../src/platform/firebase/lostFoundRepo.ts';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

/** hasOnly / hasAll of one rule helper, straight from firestore.rules. */
function ruleKeys(helper) {
    const m = RULES.match(new RegExp(
        `function ${helper}\\(d\\)\\s*\\{\\s*return d\\.keys\\(\\)\\.hasOnly\\(\\[([^\\]]*)\\]\\)` +
        `\\s*&& d\\.keys\\(\\)\\.hasAll\\(\\[([^\\]]*)\\]\\)`,
    ));
    assert.ok(m, `could not find ${helper}'s key lists in firestore.rules`);
    const list = (s) => s.split(',').map((k) => k.trim().replace(/^'|'$/g, '')).filter(Boolean);
    return { hasOnly: list(m[1]), hasAll: list(m[2]) };
}

/** The rule's shape check: every required key, nothing unknown, nothing undefined. */
function assertWithinRule(doc, helper) {
    const { hasOnly, hasAll } = ruleKeys(helper);
    const keys = Object.keys(doc);
    for (const k of hasAll) assert.ok(keys.includes(k), `${helper}: required key "${k}" is not written`);
    for (const k of keys) assert.ok(hasOnly.includes(k), `${helper}: "${k}" is not a key the rule allows`);
    for (const [k, v] of Object.entries(doc)) assert.notEqual(v, undefined, `${helper}: "${k}" is written as undefined`);
}

// Stands in for the serverTimestamp() sentinel; the functions only pass it through.
const NOW = Symbol('serverTimestamp');

// ---- feedback -------------------------------------------------------------
test('feedback: a named submission carries its uid', () => {
    const doc = feedbackWrite({ type: 'bug', text: 'It broke', anonymous: false }, 'u1', 'bracu', NOW);
    assert.deepEqual(doc, {
        type: 'bug', text: 'It broke', context: {}, anonymous: false,
        university: 'bracu', createdAt: NOW, uid: 'u1',
    });
    assertWithinRule(doc, 'validFeedbackPayload');
});

test('feedback: an anonymous submission has no uid key at all', () => {
    const doc = feedbackWrite({ type: 'feature', text: 'An idea', anonymous: true }, 'u1', 'bracu', NOW);
    assert.equal('uid' in doc, false, 'anonymous feedback must not carry the key, even as undefined');
    assertWithinRule(doc, 'validFeedbackPayload');
});

// ---- study groups ---------------------------------------------------------
const group = (over) => ({
    courseCode: 'CSE220', title: 'Midterm grind', description: '', mode: 'in-person',
    schedule: '', contactLink: 'https://m.me/x', capacity: 6, ...over,
});

test('study group: empty description and schedule are left out', () => {
    const doc = studyGroupWrite(group(), 'u1', 'bracu', NOW);
    assert.deepEqual(doc, {
        courseCode: 'CSE220', title: 'Midterm grind', mode: 'in-person',
        contactLink: 'https://m.me/x', capacity: 6, creatorUid: 'u1',
        university: 'bracu', createdAt: NOW,
    });
    assertWithinRule(doc, 'validStudyGroupPayload');
});

test('study group: a description and schedule are written when given', () => {
    const doc = studyGroupWrite(group({ description: 'Chapters 3–5', schedule: 'Sun 4pm' }), 'u1', 'bracu', NOW);
    assert.equal(doc.description, 'Chapters 3–5');
    assert.equal(doc.schedule, 'Sun 4pm');
    assertWithinRule(doc, 'validStudyGroupPayload');
});

// ---- lost-and-found claims ------------------------------------------------
test('claim: no note means no note key', () => {
    const doc = lostFoundClaimWrite('p1', 'u1', 'me@g.bracu.ac.bd', '', NOW);
    assert.deepEqual(doc, { postId: 'p1', fromUid: 'u1', fromEmail: 'me@g.bracu.ac.bd', createdAt: NOW });
    assertWithinRule(doc, 'validLostFoundClaimPayload');
});

test('claim: a note is written when given', () => {
    const doc = lostFoundClaimWrite('p1', 'u1', 'me@g.bracu.ac.bd', 'It has my initials', NOW);
    assert.equal(doc.note, 'It has my initials');
    assertWithinRule(doc, 'validLostFoundClaimPayload');
});

// ---- the check itself ------------------------------------------------------
// A shape check that cannot fail proves nothing, so prove each clause can.
test('the rule check rejects a key the rule does not allow', () => {
    const doc = { ...lostFoundClaimWrite('p1', 'u1', 'e', '', NOW), bogus: 1 };
    assert.throws(() => assertWithinRule(doc, 'validLostFoundClaimPayload'), /not a key the rule allows/);
});

test('the rule check rejects a missing required key', () => {
    const doc = lostFoundClaimWrite('p1', 'u1', 'e', '', NOW);
    delete doc.postId;
    assert.throws(() => assertWithinRule(doc, 'validLostFoundClaimPayload'), /required key "postId"/);
});

test('the rule check rejects a key written as undefined', () => {
    const doc = { ...lostFoundClaimWrite('p1', 'u1', 'e', '', NOW), note: undefined };
    assert.throws(() => assertWithinRule(doc, 'validLostFoundClaimPayload'), /written as undefined/);
});

test('the key lists really come out of firestore.rules', () => {
    for (const h of ['validFeedbackPayload', 'validStudyGroupPayload', 'validLostFoundClaimPayload']) {
        const { hasOnly, hasAll } = ruleKeys(h);
        assert.ok(hasAll.length > 0 && hasOnly.length > hasAll.length, `${h}: implausible key lists`);
    }
});
