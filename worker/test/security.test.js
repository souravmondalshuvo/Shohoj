import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import worker, { __setTestJwksForTests, runLostFoundCron } from '../index.js';
import { firestoreRest, toFields, fromFields } from './helpers/firestoreRest.js';
import { createFirestoreAtomicStore } from '../firestoreAtomic.js';
import { reserveAiAdmission, settleAiAdmission } from '../aiAdmission.js';
import { boundedModelPayload, readBoundedJson, BodyTooLarge, meterProviders, MAX_MODEL_INPUT_BYTES } from '../aiLimits.js';
const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: 'security-test', alg: 'RS256', use: 'sig' };
const base = 'https://firestore.googleapis.com/v1/projects/security-test/databases/(default)/documents';
const claims = { user_id: 'student', email: 'student@g.bracu.ac.bd', name: 'Student', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const sign = (extra = {}) => new SignJWT({ ...claims, ...extra }).setSubject(extra.user_id || claims.user_id).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setAudience('security-test').setIssuer('https://securetoken.google.com/security-test').setIssuedAt().setExpirationTime('10m').sign(privateKey);
const env = { FIREBASE_PROJECT_ID: 'security-test', SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.invalid', private_key: await exportPKCS8(privateKey), token_uri: 'https://oauth.example.invalid/token' }), PAPERS_RATE_LIMIT: { limit: async () => ({ success: true }) }, ASSISTANT_RATE_LIMIT: { limit: async () => ({ success: true }) }, OPENAI_API_KEY: 'test-key', PAPERS_BUCKET: { get: async () => ({ body: 'PDF', size: 3, httpMetadata: { contentType: 'application/pdf' } }) } };
async function harness(fn, provider = async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], usage: { input_tokens: 100, output_tokens: 20 } })) {
  const db = firestoreRest(); const real = globalThis.fetch; let calls = 0; const emails = [];
  const token = await sign();
  __setTestJwksForTests({ keys: [jwk] });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'oauth.example.invalid') return Response.json({ access_token: 'test-oauth', expires_in: 3600 });
    if (url.hostname === 'api.resend.com') { emails.push({ body: JSON.parse(init.body), key: init.headers['Idempotency-Key'] }); return Response.json({ id: 'synthetic-email' }); }
    if (url.hostname === 'api.openai.com') { calls++; return provider(JSON.parse(init.body)); }
    return db.fetch(input, init);
  };
  const request = (method, path, body, bearer = token, extraEnv = {}) => worker.fetch(new Request('https://worker.example.invalid' + path, { method, headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { ...env, ...extraEnv });
  try { await fn({ db, request, calls: () => calls, emails }); }
  finally { globalThis.fetch = real; __setTestJwksForTests(null); }
}

test('calendar round trip preserves profile and rejects revoked and orphan credentials', async () => harness(async ({ db, request }) => {
  assert.equal((await request('GET', '/api/v1/me')).status, 201);
  db.seed('shohojUsers/student', { ...db.read('shohojUsers/student'), studentId: 'synthetic-student-id' });
  const created = await request('POST', '/api/v1/tasks/feed');
  assert.equal(created.status, 200);
  const url = new URL((await created.json()).feed.url);
  assert.equal(db.read('shohojUsers/student').studentId, 'synthetic-student-id');
  const live = await request('GET', url.pathname, undefined, null);
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('cache-control'), 'private, no-store');
  // Profile drift must merge only identity fields, preserving the active token.
  assert.equal((await request('GET', '/api/v1/me', undefined, await sign({ name: 'Updated Name' }))).status, 200);
  assert.equal((await request('GET', url.pathname, undefined, null)).status, 200);
  assert.equal((await request('DELETE', '/api/v1/tasks/feed')).status, 200);
  assert.equal((await request('GET', url.pathname, undefined, null)).status, 404);
  const orphan = 'cft_' + 'a'.repeat(32);
  db.seed('calendarFeeds/' + orphan, { firebaseUid: 'student' });
  assert.equal((await request('GET', '/feeds/tasks/' + orphan + '.ics', undefined, null)).status, 404);
}));

test('parallel feed rotations leave one active link and revocation kills every returned link', async () => harness(async ({ db, request }) => {
  await request('GET', '/api/v1/me');
  const responses = await Promise.all([request('POST', '/api/v1/tasks/feed'), request('POST', '/api/v1/tasks/feed')]);
  assert.ok(responses.every(r => r.status === 200));
  const paths = await Promise.all(responses.map(async r => new URL((await r.json()).feed.url).pathname));
  assert.equal([...db.docs.keys()].filter(p => p.startsWith('calendarFeeds/')).length, 1);
  await request('DELETE', '/api/v1/tasks/feed');
  for (const path of paths) assert.equal((await request('GET', path, undefined, null)).status, 404);
}));

test('approved-paper download enforces campus, including legacy documents and admin access', async () => harness(async ({ db, request }) => {
  for (const university of ['bracu', undefined]) {
    db.seed('papers/paper', { approved: true, uploaderUid: 'student', storagePath: 'papers/CSE110/student/paper.pdf', mimeType: 'application/pdf', ...(university ? { university } : {}) });
    assert.equal((await request('GET', '/download?paperId=paper', undefined, await sign({ user_id: 'nsu', email: 'nsu@northsouth.edu' }))).status, 403);
    assert.equal((await request('GET', '/download?paperId=paper')).status, 200);
    assert.equal((await request('GET', '/download?paperId=paper', undefined, await sign({ user_id: 'admin', admin: true, email: 'admin@example.invalid' }))).status, 200);
  }
}));

test('concurrent chat and extraction share one reserved last daily slot', async () => harness(async ({ db, request, calls }) => {
  const day = new Date().toISOString().slice(0, 10);
  db.seed('assistantDailyQuota/student_' + day, { count: 39 });
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => i % 2
    ? request('POST', '/api/v1/tasks/extract', { text: 'Exam tomorrow.', courseCodes: ['CSE110'] })
    : request('POST', '/api/assistant', { messages: [{ role: 'user', content: 'hello' }] })));
  assert.equal(calls(), 1);
  assert.equal(responses.filter(r => r.status === 429).length, 9);
  assert.equal(db.read('assistantDailyQuota/student_' + day).count, 40);
  const budget = db.read('assistantBudget/' + day.slice(0, 7));
  assert.equal(budget.reservedUsd, 0);
  assert.ok(budget.spentUsd > 0);
}, async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"tasks":[]}' }] }], usage: { input_tokens: 100, output_tokens: 20 } })));

test('budget is reserved before paid calls; insufficient balance never reaches provider', async () => harness(async ({ db, request, calls }) => {
  db.seed('assistantBudget/' + new Date().toISOString().slice(0, 7), { spentUsd: 4.99 });
  const response = await request('POST', '/api/assistant', { messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(response.status, 503); assert.equal(calls(), 0);
}));

test('oversized bodies and invalid course codes are rejected before ledger/model work', async () => harness(async ({ db, request, calls }) => {
  assert.equal((await request('POST', '/api/v1/tasks/extract', { text: 'Exam tomorrow', courseCodes: ['X'.repeat(400000)] })).status, 413);
  for (const courseCodes of [['CSE110'.repeat(10)], [{}], Array(21).fill('CSE110'), 'CSE110', ['<html>']]) {
    assert.equal((await request('POST', '/api/v1/tasks/extract', { text: 'Exam tomorrow', courseCodes })).status, 400);
  }
  assert.equal((await request('POST', '/api/assistant', { messages: [], ignored: 'x'.repeat(150000) })).status, 413);
  assert.equal(calls(), 0); assert.equal(db.docs.size, 0);
}));

test('streaming body bound cannot be bypassed by omitted or misleading Content-Length', async () => {
  for (const headers of [{}, { 'Content-Length': '2' }]) {
    const request = new Request('https://example.invalid', { method: 'POST', headers, body: 'x'.repeat(100) });
    await assert.rejects(readBoundedJson(request, 10), BodyTooLarge);
  }
  assert.throws(() => boundedModelPayload({ input: 'x'.repeat(MAX_MODEL_INPUT_BYTES) }));
});

test('atomic settlement is idempotent, sums concurrent costs and retains failed holds', async () => {
  const db = firestoreRest();
  const store = createFirestoreAtomicStore({ baseUrl: base, token: 'test', toFields, fromFields, fetchImpl: db.fetch });
  const options = { uid: 'student', day: '2026-09-26', month: '2026-09', quotaLimit: 40, budgetUsd: 5, heldUsd: 1 };
  const reservations = await Promise.all(Array.from({ length: 3 }, () => reserveAiAdmission(store, options)));
  assert.equal(db.read('assistantBudget/2026-09').reservedUsd, 3);
  await Promise.all(reservations.map(a => settleAiAdmission(store, a, { costUsd: 0.25, answered: true })));
  await settleAiAdmission(store, reservations[0], { costUsd: 0.25, answered: true });
  assert.deepEqual(db.read('assistantBudget/2026-09').spentUsd, 0.75);
  assert.equal(db.read('assistantBudget/2026-09').reservedUsd, 0);
  const pending = await reserveAiAdmission(store, options);
  await assert.rejects(settleAiAdmission({ ...store, commitWrites: async () => { throw new Error('offline'); } }, pending, { costUsd: 0.1, answered: false }));
  assert.equal(db.read('assistantBudget/2026-09').reservedUsd, 1);
  assert.equal(db.read('assistantDailyQuota/student_2026-09-26').count, 4);
});

test('paid failures and incomplete usage cannot be settled as free', async () => {
  const failure = meterProviders([{ name: 'openai', run: async () => { throw new Error('unknown response'); } }]);
  await assert.rejects(failure.providers[0].run({}));
  assert.equal(failure.costUsd(), failure.heldUsd);
  const incomplete = meterProviders([{ name: 'openai', run: async () => ({ usage: { inputTokens: 100, outputTokens: 1 }, usageComplete: false }) }]);
  await incomplete.providers[0].run({});
  assert.equal(incomplete.costUsd(), incomplete.heldUsd);
});


test('review and academic bodies stop reading at their byte caps before database work', async () => harness(async ({ db }) => {
  const token = await sign();
  for (const path of ['/reviews', '/api/v1/tasks', '/api/v1/enrollments', '/api/v1/semesters']) {
    for (const declared of [undefined, '1']) {
      let consumed = 0; let cancelled = false;
      const chunk = new Uint8Array(16 * 1024).fill(32);
      const body = new ReadableStream({
        pull(controller) { consumed += chunk.byteLength; controller.enqueue(chunk); },
        cancel() { cancelled = true; },
      });
      const response = await worker.fetch(new Request('https://worker.example.invalid' + path, {
        method: 'POST', duplex: 'half', body,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(declared ? { 'Content-Length': declared } : {}) },
      }), env);
      assert.equal(response.status, 413, path);
      assert.ok(cancelled, 'must cancel an unending upload');
      assert.ok(consumed <= 96 * 1024, 'must not buffer the entire request');
      assert.equal(db.docs.size, 0, 'reject before bootstrapping the account');
    }
  }
}));

test('binary upload cancels at 10 MiB even when Content-Length understates the stream', async () => harness(async ({ db }) => {
  const token = await sign(); let consumed = 0; let cancelled = false;
  const chunk = new Uint8Array(64 * 1024);
  const body = new ReadableStream({
    pull(controller) { consumed += chunk.byteLength; controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  });
  const response = await worker.fetch(new Request('https://worker.example.invalid/upload?courseCode=CSE110&filename=proof.pdf&type=notes&title=Synthetic', {
    method: 'POST', duplex: 'half', body,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf', 'Content-Length': '1024' },
  }), env);
  assert.equal(response.status, 413); assert.ok(cancelled);
  assert.ok(consumed <= 10 * 1024 * 1024 + 2 * chunk.byteLength);
  assert.equal(db.docs.size, 0);
}));

test('claim cron drops cross-campus/resolved items and persists replay-proof delivery receipts', async () => harness(async ({ db, emails }) => {
  const mailEnv = { ...env, RESEND_API_KEY: 'synthetic', EMAIL_FROM: 'Shohoj <alerts@mail.example.com>' };
  const post = { type: 'lost', title: 'Synthetic pen', status: 'open', creatorUid: 'poster', university: 'bracu' };
  const contact = { uid: 'poster', email: 'poster@g.bracu.ac.bd' };
  const claim = { postId: 'post', fromUid: 'claimant', fromEmail: 'claimant@g.bracu.ac.bd' };
  db.seed('lostFoundPosts/post', post); db.seed('lostFoundContacts/post', contact);
  db.seed('lostFoundClaims/post_claimant', { ...claim, fromEmail: 'student@northsouth.edu' });
  assert.equal((await runLostFoundCron(mailEnv)).dropped, 1); assert.equal(emails.length, 0);
  db.seed('lostFoundPosts/post', { ...post, status: 'resolved' });
  db.seed('lostFoundClaims/post_claimant', claim);
  assert.equal((await runLostFoundCron(mailEnv)).dropped, 1); assert.equal(emails.length, 0);
  db.seed('lostFoundPosts/post', post); db.seed('lostFoundClaims/post_claimant', claim);
  await Promise.all([runLostFoundCron(mailEnv), runLostFoundCron(mailEnv)]);
  assert.equal(emails.length, 1);
  assert.match(emails[0].key, /^lost-found\/[a-f0-9]{64}$/);
  assert.equal(db.read('lostFoundDeliveries/post_claimant').status, 'delivered');
  assert.equal(db.read('lostFoundClaims/post_claimant'), null);
  db.seed('lostFoundClaims/post_claimant', claim);
  await runLostFoundCron(mailEnv); assert.equal(emails.length, 1);
}));
