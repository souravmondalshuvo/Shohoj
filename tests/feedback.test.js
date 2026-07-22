/**
 * tests/feedback.test.js
 * Pure tests for the app-feedback model (src/core/feedback.ts) and the
 * feedbackRepo toggle/write behavior over a fake backend (#437).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    boardView,
    feedbackAge,
    isFeedbackType,
    validateFeedbackText,
    TEXT_MAX,
} from '../src/core/feedback.ts';
import { createFeedbackRepo } from '../src/platform/firebase/feedbackRepo.ts';
import { isShohojError } from '../src/core/errors.ts';

test('validateFeedbackText: trims, rejects short and oversized input', () => {
    assert.deepEqual(validateFeedbackText('  a solid thought  '), { ok: true, text: 'a solid thought' });
    assert.equal(validateFeedbackText('  hi ').ok, false); // < 3 after trim
    assert.equal(validateFeedbackText(null).ok, false);
    assert.equal(validateFeedbackText('x'.repeat(TEXT_MAX + 1)).ok, false);
    assert.equal(validateFeedbackText('x'.repeat(TEXT_MAX)).ok, true);
});

test('isFeedbackType accepts only the three known types', () => {
    assert.equal(isFeedbackType('bug'), true);
    assert.equal(isFeedbackType('feature'), true);
    assert.equal(isFeedbackType('general'), true);
    assert.equal(isFeedbackType('rant'), false);
    assert.equal(isFeedbackType(3), false);
});

test('boardView: newest first, filtered by type, input untouched', () => {
    const items = [
        { id: 'a', type: 'bug', text: 'old bug', anonymous: true, createdAtMs: 100 },
        { id: 'b', type: 'feature', text: 'idea', anonymous: true, createdAtMs: 300 },
        { id: 'c', type: 'bug', text: 'new bug', anonymous: true, createdAtMs: 200 },
    ];
    assert.deepEqual(boardView(items, 'all').map(i => i.id), ['b', 'c', 'a']);
    assert.deepEqual(boardView(items, 'bug').map(i => i.id), ['c', 'a']);
    assert.deepEqual(items.map(i => i.id), ['a', 'b', 'c']); // no in-place sort
});

test('feedbackAge: sensible buckets', () => {
    const now = 1_000_000_000_000;
    assert.equal(feedbackAge(now - 30_000, now), 'just now');
    assert.equal(feedbackAge(now - 5 * 60_000, now), '5m ago');
    assert.equal(feedbackAge(now - 3 * 3_600_000, now), '3h ago');
    assert.equal(feedbackAge(now - 2 * 86_400_000, now), '2d ago');
    assert.equal(feedbackAge(0, now), '');
});

function fakeBackend(log) {
    return {
        async listRecent() { log.push(['listRecent']); return []; },
        async listMyUpvotes(uid) { log.push(['listMyUpvotes', uid]); return []; },
        async submit(draft, uid) { log.push(['submit', draft, uid]); },
        async addUpvote(id, uid) { log.push(['addUpvote', id, uid]); },
        async removeUpvote(id, uid) { log.push(['removeUpvote', id, uid]); },
        async adminDelete(id) { log.push(['adminDelete', id]); },
    };
}

test('repo: toggleUpvote adds when not voted, removes when voted', async () => {
    const log = [];
    const repo = createFeedbackRepo({
        config: {},
        loadBackend: async () => fakeBackend(log),
    });
    await repo.toggleUpvote('f1', 'u1', false);
    await repo.toggleUpvote('f1', 'u1', true);
    assert.deepEqual(log, [['addUpvote', 'f1', 'u1'], ['removeUpvote', 'f1', 'u1']]);
});

test('repo: failed reads reject with a typed error; writes propagate errors', async () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
    });
    const repo = createFeedbackRepo({
        config: {},
        loadBackend: async () => ({
            async listRecent() { throw new Error('offline'); },
            async listMyUpvotes() { throw denied; },
            async submit() { throw new Error('rules'); },
            async addUpvote() { throw new Error('rules'); },
            async removeUpvote() {},
            async adminDelete() {},
        }),
    });
    // Reads no longer swallow failures into [] — an outage must be
    // distinguishable from an empty board.
    await assert.rejects(() => repo.listRecent(), (e) => {
        assert.ok(isShohojError(e), 'typed error');
        assert.ok(e.userMessage, 'user-safe message');
        return e.code === 'firebase_unavailable';
    });
    await assert.rejects(() => repo.listMyUpvotes('u1'), (e) => e.code === 'permission');
    await assert.rejects(() => repo.submit({ type: 'bug', text: 'abc', anonymous: true }, 'u1'));
    await assert.rejects(() => repo.toggleUpvote('f1', 'u1', false));
});

test('repo: a genuinely empty board still resolves empty', async () => {
    const repo = createFeedbackRepo({
        config: {},
        loadBackend: async () => ({
            async listRecent() { return []; },
            async listMyUpvotes() { return []; },
            async submit() {},
            async addUpvote() {},
            async removeUpvote() {},
            async adminDelete() {},
        }),
    });
    assert.deepEqual(await repo.listRecent(), []);
    assert.deepEqual(await repo.listMyUpvotes('u1'), []);
});
