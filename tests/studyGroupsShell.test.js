/**
 * tests/studyGroupsShell.test.js
 * Pure tests for the shell study-groups model (src/core/studyGroups.ts) and
 * the studyGroupsRepo write shapes over a fake backend (#443). The legacy
 * js/core/studyGroups.js keeps its own tests until cutover.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    groupsView,
    summarizeMembers,
    validateGroupDraft,
    MIN_CAPACITY,
    MAX_CAPACITY,
} from '../src/core/studyGroups.ts';
import { createStudyGroupsRepo } from '../src/platform/firebase/studyGroupsRepo.ts';

const CATALOG = { CSE110: { name: 'Programming' }, CSE220: { name: 'Data Structures' } };

function draft(over) {
    return {
        courseCode: 'CSE220',
        title: 'Midterm grind',
        description: '',
        mode: 'in-person',
        schedule: '',
        contactLink: 'https://m.me/x',
        capacity: 6,
        ...over,
    };
}

test('validateGroupDraft: valid draft passes; each rule rejects', () => {
    assert.equal(validateGroupDraft(draft(), CATALOG), null);
    assert.match(validateGroupDraft(draft({ courseCode: 'ZZZ999' }), CATALOG), /Unknown course/);
    assert.match(validateGroupDraft(draft({ title: 'ab' }), CATALOG), /at least 3/);
    assert.match(validateGroupDraft(draft({ mode: 'carrier-pigeon' }), CATALOG), /meeting mode/);
    assert.match(validateGroupDraft(draft({ contactLink: 'http://insecure.example' }), CATALOG), /https/);
    assert.match(validateGroupDraft(draft({ capacity: MIN_CAPACITY - 1 }), CATALOG), /at least/);
    assert.match(validateGroupDraft(draft({ capacity: MAX_CAPACITY + 1 }), CATALOG), /or less/);
    assert.match(validateGroupDraft(draft({ capacity: 3.5 }), CATALOG), /whole number/);
});

test('summarizeMembers: unknown roster is advisory; known counts label + full flag', () => {
    assert.deepEqual(summarizeMembers(null, 6), { label: 'up to 6', isFull: false, spotsLeft: null, known: false });
    assert.deepEqual(summarizeMembers(4, 6), { label: '4 / 6 joined', isFull: false, spotsLeft: 2, known: true });
    assert.equal(summarizeMembers(6, 6).isFull, true);
});

test('groupsView: newest first, filtered by mode and course substring', () => {
    const groups = [
        { id: 'a', courseCode: 'CSE110', mode: 'online', createdAtMs: 100 },
        { id: 'b', courseCode: 'CSE220', mode: 'in-person', createdAtMs: 300 },
        { id: 'c', courseCode: 'MAT110', mode: 'online', createdAtMs: 200 },
    ];
    assert.deepEqual(groupsView(groups, 'all', '').map(g => g.id), ['b', 'c', 'a']);
    assert.deepEqual(groupsView(groups, 'online', '').map(g => g.id), ['c', 'a']);
    assert.deepEqual(groupsView(groups, 'all', '110').map(g => g.id), ['c', 'a']);
    assert.deepEqual(groupsView(groups, 'online', 'cse').map(g => g.id), ['a']);
});

test('repo: join/leave/report delegate with the deterministic doc ids handled by the backend', async () => {
    const log = [];
    const repo = createStudyGroupsRepo({
        config: {},
        loadBackend: async () => ({
            async listGroups() { return []; },
            async listMyMemberships() { return []; },
            async listMembers() { return []; },
            async create(d, uid) { log.push(['create', d.courseCode, uid]); return 'g1'; },
            async join(groupId, uid, email) { log.push(['join', groupId, uid, email]); },
            async leave(groupId, uid) { log.push(['leave', groupId, uid]); },
            async remove(groupId) { log.push(['remove', groupId]); },
            async report(groupId, reason, uid) { log.push(['report', groupId, reason, uid]); },
        }),
    });
    assert.equal(await repo.create(draft(), 'u1'), 'g1');
    await repo.join('g1', 'u1', 'me@g.bracu.ac.bd');
    await repo.leave('g1', 'u1');
    await repo.report('g1', 'spam', 'u1');
    assert.deepEqual(log, [
        ['create', 'CSE220', 'u1'],
        ['join', 'g1', 'u1', 'me@g.bracu.ac.bd'],
        ['leave', 'g1', 'u1'],
        ['report', 'g1', 'spam', 'u1'],
    ]);
});

test('repo: failed board reads degrade to empty; writes propagate errors', async () => {
    const repo = createStudyGroupsRepo({
        config: {},
        loadBackend: async () => ({
            async listGroups() { throw new Error('offline'); },
            async listMyMemberships() { throw new Error('offline'); },
            async listMembers() { return []; },
            async create() { throw new Error('rules'); },
            async join() { throw new Error('rules'); },
            async leave() {},
            async remove() {},
            async report() {},
        }),
    });
    assert.deepEqual(await repo.listGroups(), []);
    assert.deepEqual(await repo.listMyMemberships('u1'), []);
    await assert.rejects(() => repo.create(draft(), 'u1'));
    await assert.rejects(() => repo.join('g1', 'u1', 'x@y.z'));
});
