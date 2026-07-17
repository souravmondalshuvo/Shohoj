/**
 * tests/papersRepo.test.js
 * Tests for the shell papers data layer (#440): the magic-byte preview sniff
 * (src/core/paperPreview.ts) and the papersRepo Worker upload/download calls
 * over an injected fetch + backend fake.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sniffPreviewMime } from '../src/core/paperPreview.ts';
import { createPapersRepo } from '../src/platform/firebase/papersRepo.ts';

test('sniffPreviewMime: detects the five preview formats, null otherwise', () => {
    assert.equal(sniffPreviewMime(new Uint8Array([0x25, 0x50, 0x44, 0x46])), 'application/pdf');
    assert.equal(sniffPreviewMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png');
    assert.equal(sniffPreviewMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
    assert.equal(sniffPreviewMime(new Uint8Array([0x47, 0x49, 0x46, 0x38])), 'image/gif');
    assert.equal(
        sniffPreviewMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
        'image/webp',
    );
    assert.equal(sniffPreviewMime(new Uint8Array([0x00, 0x01, 0x02, 0x03])), null);
    assert.equal(sniffPreviewMime(new Uint8Array([0x25])), null); // too short
});

function repoWith({ fetchFn, backend } = {}) {
    return createPapersRepo({
        config: {},
        workerUrl: 'https://worker.test',
        getIdToken: async () => 'tok123',
        loadBackend: async () => backend ?? {
            async listRecent() { return []; },
            async listByCourse() { return []; },
            async report() {},
        },
        fetchFn,
    });
}

test('upload: POSTs the file with the legacy param shape and bearer token', async () => {
    const calls = [];
    const repo = repoWith({
        fetchFn: async (url, init) => {
            calls.push({ url: String(url), init });
            return { ok: true, json: async () => ({ id: 'p42' }) };
        },
    });
    const file = { name: 'Mid Term.PDF', size: 1000, type: 'application/pdf' };
    const result = await repo.upload({
        file, courseCode: 'CSE110', type: 'midterm', title: 'Fall 2025 mid', facultyInitials: 'abc',
    });

    assert.deepEqual(result, { ok: true, id: 'p42' });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/upload');
    assert.equal(url.searchParams.get('courseCode'), 'CSE110');
    assert.equal(url.searchParams.get('type'), 'midterm');
    assert.equal(url.searchParams.get('title'), 'Fall 2025 mid');
    assert.equal(url.searchParams.get('facultyInitials'), 'ABC'); // uppercased
    assert.match(url.searchParams.get('filename'), /^\d+_[a-z0-9]+\.pdf$/);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok123');
    assert.equal(calls[0].init.body, file);
});

test('upload: surfaces the Worker error message; no worker URL is a config error', async () => {
    const repo = repoWith({
        fetchFn: async () => ({ ok: false, json: async () => ({ error: 'File too large' }) }),
    });
    const file = { name: 'a.pdf', size: 1, type: 'application/pdf' };
    assert.deepEqual(
        await repo.upload({ file, courseCode: 'CSE110', type: 'midterm', title: 'abc' }),
        { ok: false, error: 'File too large' },
    );

    const unconfigured = createPapersRepo({
        config: {},
        getIdToken: async () => 'tok',
        loadBackend: async () => ({ async listRecent() { return []; }, async listByCourse() { return []; }, async report() {} }),
    });
    const res = await unconfigured.upload({ file, courseCode: 'CSE110', type: 'midterm', title: 'abc' });
    assert.equal(res.ok, false);
    assert.match(res.error, /not configured/);
});

test('downloadUrl: null without a token or on a failed response', async () => {
    const noToken = createPapersRepo({
        config: {},
        workerUrl: 'https://worker.test',
        getIdToken: async () => null,
        loadBackend: async () => ({ async listRecent() { return []; }, async listByCourse() { return []; }, async report() {} }),
        fetchFn: async () => { throw new Error('should not be called'); },
    });
    assert.equal(await noToken.downloadUrl('p1'), null);

    const failing = repoWith({ fetchFn: async () => ({ ok: false }) });
    assert.equal(await failing.downloadUrl('p1'), null);
});

test('list errors re-throw (load error is distinct from an empty library)', async () => {
    const repo = repoWith({
        backend: {
            async listRecent() { throw new Error('missing index'); },
            async listByCourse() { throw new Error('missing index'); },
            async report() {},
        },
    });
    await assert.rejects(() => repo.listRecent());
    await assert.rejects(() => repo.listByCourse('CSE110'));
});

test('report delegates to the backend with reason and uid', async () => {
    const log = [];
    const repo = repoWith({
        backend: {
            async listRecent() { return []; },
            async listByCourse() { return []; },
            async report(paperId, reason, uid) { log.push([paperId, reason, uid]); },
        },
    });
    await repo.report('p1', 'wrong course', 'u1');
    assert.deepEqual(log, [['p1', 'wrong course', 'u1']]);
});
