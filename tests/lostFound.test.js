/**
 * tests/lostFound.test.js
 * Pure tests for the lost & found model (#371): draft validation, claim
 * notes, expiry, listing rules, and labels.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    validateDraft,
    validateClaimNote,
    isExpired,
    visiblePosts,
    postAge,
    claimLabel,
    TITLE_MAX,
    DESCRIPTION_MAX,
    LOCATION_MAX,
    CLAIM_NOTE_MAX,
    POST_TTL_MS,
} from '../src/core/lostFound.ts';

test('validateDraft: minimal valid draft normalizes and drops empty optionals', () => {
    const result = validateDraft({
        type: 'lost',
        title: '  Black umbrella  ',
        description: '',
        locationHint: '  ',
        roomCode: '',
    });
    assert.deepEqual(result, { ok: true, value: { type: 'lost', title: 'Black umbrella' } });
});

test('validateDraft: full draft keeps trimmed optionals and canonical room code', () => {
    const result = validateDraft({
        type: 'found',
        title: 'Student ID card',
        description: ' Found near the lift lobby. ',
        locationHint: ' 9th floor lift lobby ',
        roomCode: ' 09g-31t ',
    });
    assert.ok(result.ok);
    assert.deepEqual(result.value, {
        type: 'found',
        title: 'Student ID card',
        description: 'Found near the lift lobby.',
        locationHint: '9th floor lift lobby',
        roomCode: '09G-31T',
    });
});

test('validateDraft: rejects bad type, short/long title, oversized fields, junk room', () => {
    const bad = validateDraft({
        type: 'stolen',
        title: 'ab',
        description: 'x'.repeat(DESCRIPTION_MAX + 1),
        locationHint: 'y'.repeat(LOCATION_MAX + 1),
        roomCode: 'UB0000',
    });
    assert.equal(bad.ok, false);
    assert.deepEqual(
        Object.keys(bad.errors).sort(),
        ['description', 'locationHint', 'roomCode', 'title', 'type'],
    );

    const longTitle = validateDraft({ type: 'lost', title: 'z'.repeat(TITLE_MAX + 1) });
    assert.equal(longTitle.ok, false);
    assert.ok(longTitle.errors.title);
});

test('validateClaimNote: trims, allows empty, caps length', () => {
    assert.deepEqual(validateClaimNote('  seen it in 07A  '), { ok: true, value: 'seen it in 07A' });
    assert.deepEqual(validateClaimNote(undefined), { ok: true, value: '' });
    const over = validateClaimNote('n'.repeat(CLAIM_NOTE_MAX + 1));
    assert.equal(over.ok, false);
});

test('isExpired: half-open at the TTL boundary', () => {
    const created = 1_000_000;
    assert.equal(isExpired(created, created + POST_TTL_MS - 1), false);
    assert.equal(isExpired(created, created + POST_TTL_MS), true);
});

const post = (id, type, status, createdAtMs) => ({
    id, type, title: id, status, creatorUid: 'u1', createdAtMs,
});

test('visiblePosts: hides resolved and expired, filters by type, newest first', () => {
    const now = POST_TTL_MS * 2;
    const posts = [
        post('old-open', 'lost', 'open', now - POST_TTL_MS),        // expired
        post('resolved', 'lost', 'resolved', now - 1000),           // resolved
        post('found-new', 'found', 'open', now - 500),
        post('lost-new', 'lost', 'open', now - 100),
        post('lost-older', 'lost', 'open', now - 900),
    ];
    assert.deepEqual(visiblePosts(posts, now).map((p) => p.id),
        ['lost-new', 'found-new', 'lost-older']);
    assert.deepEqual(visiblePosts(posts, now, 'found').map((p) => p.id), ['found-new']);
    assert.deepEqual(visiblePosts(posts, now, 'lost').map((p) => p.id),
        ['lost-new', 'lost-older']);
});

test('postAge: sensible buckets', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    assert.equal(postAge(now - 30_000, now), 'just now');
    assert.equal(postAge(now - 5 * 60_000, now), '5m ago');
    assert.equal(postAge(now - 3 * 3_600_000, now), '3h ago');
    assert.equal(postAge(now - 2 * 86_400_000, now), '2d ago');
});

test('claimLabel: reads from the claimer side', () => {
    assert.equal(claimLabel('lost'), 'I found this');
    assert.equal(claimLabel('found'), 'This is mine');
});
