// tests/assistantClient.test.js
//
// Covers the pure Shohoj Assistant client: transcript clamping to the Worker's
// contract, the guard order + HTTP→typed-error mapping of sendAssistantTurn,
// the tab-aware starter prompts, and sessionStorage transcript persistence. All
// offline — fetch, the token getter, and storage are injected.
//
// Imports go through the shell's typed boundary (src/features/assistant/
// assistantClient.ts) on purpose: it is a re-export of the vanilla-JS
// implementation in js/core/assistantClient.js that the legacy bundle ships, so
// exercising it here proves both front-ends share one client (#533).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSISTANT_MAX_MESSAGES,
  ASSISTANT_TRANSCRIPT_KEY,
  clampTranscript,
  clearStoredTranscript,
  examplePromptsForTab,
  fetchAssistantAvailability,
  readStoredTranscript,
  sendAssistantTurn,
  writeStoredTranscript,
} from '../src/features/assistant/assistantClient.ts';

const user = (content) => ({ role: 'user', content });
const reply = (content) => ({ role: 'assistant', content });

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('clampTranscript keeps a sane transcript as-is', () => {
  const t = [user('a'), reply('b'), user('c')];
  assert.deepEqual(clampTranscript(t), t);
});

test('clampTranscript drops empties, oversize, and foreign roles', () => {
  const t = [
    { role: 'system', content: 'evil' },
    user('   '),
    user('x'.repeat(4001)),
    user('ok'),
  ];
  assert.deepEqual(clampTranscript(t), [user('ok')]);
});

test('clampTranscript trims to the last 20 and re-anchors on a user turn', () => {
  const long = [];
  for (let i = 0; i < 15; i++) {
    long.push(user(`q${i}`), reply(`a${i}`));
  }
  long.push(user('final'));
  const clamped = clampTranscript(long);
  assert.ok(clamped.length <= ASSISTANT_MAX_MESSAGES);
  assert.equal(clamped[0].role, 'user');
  assert.equal(clamped[clamped.length - 1].content, 'final');
});

test('sendAssistantTurn: missing worker URL fails before token or network', async () => {
  const result = await sendAssistantTurn([user('hi')], {
    workerUrl: null,
    getToken: async () => { throw new Error('must not be called'); },
    fetchImpl: () => { throw new Error('must not be called'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unconfigured');
});

test('sendAssistantTurn: missing token fails before any network call', async () => {
  const result = await sendAssistantTurn([user('hi')], {
    workerUrl: 'https://worker.example',
    getToken: async () => null,
    fetchImpl: () => { throw new Error('must not be called'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthenticated');
});

test('sendAssistantTurn: posts the clamped transcript with the bearer token', async () => {
  const calls = [];
  const result = await sendAssistantTurn([user('hi')], {
    workerUrl: 'https://worker.example/',
    getToken: async () => 'id-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ reply: 'Hello!' });
    },
  });
  assert.deepEqual(result, { ok: true, reply: 'Hello!' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://worker.example/api/assistant');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer id-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), { messages: [user('hi')] });
});

test('sendAssistantTurn maps HTTP failures to typed codes', async () => {
  const codeFor = async (status) => {
    const result = await sendAssistantTurn([user('hi')], {
      workerUrl: 'https://worker.example',
      getToken: async () => 'id-token',
      fetchImpl: async () => jsonResponse({ error: 'x' }, status),
    });
    assert.equal(result.ok, false);
    return result.code;
  };
  assert.equal(await codeFor(401), 'unauthenticated');
  assert.equal(await codeFor(429), 'rate-limited');
  assert.equal(await codeFor(400), 'invalid');
  assert.equal(await codeFor(503), 'unavailable');
  assert.equal(await codeFor(500), 'unavailable');
});

test('sendAssistantTurn: network failure and malformed success map to unavailable', async () => {
  const network = await sendAssistantTurn([user('hi')], {
    workerUrl: 'https://worker.example',
    getToken: async () => 'id-token',
    fetchImpl: async () => { throw new TypeError('network down'); },
  });
  assert.equal(network.ok, false);
  assert.equal(network.code, 'unavailable');

  const malformed = await sendAssistantTurn([user('hi')], {
    workerUrl: 'https://worker.example',
    getToken: async () => 'id-token',
    fetchImpl: async () => jsonResponse({ nope: true }),
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'unavailable');
});

// ── Readiness probe (#455) ──────────────────────────────────────────────────
// The Assistant drawer shipped while ANTHROPIC_API_KEY was unset, so the
// feature was visibly offered and failed on every turn. fetchAssistantAvailability
// is what lets the launcher refuse to advertise a backend that cannot answer.

test('fetchAssistantAvailability reports ready when the Worker says configured', async () => {
  const availability = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => jsonResponse({ capabilities: { assistant: true } }),
  });
  assert.equal(availability, 'ready');
});

test('fetchAssistantAvailability reports unconfigured when the Worker says so', async () => {
  const availability = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => jsonResponse({ capabilities: { assistant: false } }),
  });
  assert.equal(availability, 'unconfigured');
});

test('fetchAssistantAvailability probes /ready without a token', async () => {
  let seenUrl = '';
  let seenAuth = null;
  await fetchAssistantAvailability({
    workerUrl: 'https://worker.example/',
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenAuth = new Headers(init?.headers).get('Authorization');
      return jsonResponse({ capabilities: { assistant: true } });
    },
  });
  // Trailing slash on the base URL must not produce a double slash.
  assert.equal(seenUrl, 'https://worker.example/ready');
  assert.equal(seenAuth, null, 'readiness is not user-specific — no token is sent');
});

test('fetchAssistantAvailability is unknown when the probe itself fails', async () => {
  const network = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => { throw new TypeError('network down'); },
  });
  assert.equal(network, 'unknown');

  const server = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => jsonResponse({ error: 'boom' }, 500),
  });
  assert.equal(server, 'unknown');

  // A 200 with an unexpected shape must not be read as "ready".
  const malformed = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => jsonResponse({ capabilities: {} }),
  });
  assert.equal(malformed, 'unknown');

  const notJson = await fetchAssistantAvailability({
    workerUrl: 'https://worker.example',
    fetchImpl: async () => new Response('nope', { status: 200 }),
  });
  assert.equal(notJson, 'unknown');
});

test('fetchAssistantAvailability is unconfigured with no worker URL', async () => {
  const availability = await fetchAssistantAvailability({
    workerUrl: null,
    fetchImpl: async () => { throw new Error('must not be called'); },
  });
  assert.equal(availability, 'unconfigured');
});

// ── Starter prompts (#533) ────────────────────────────────────────────────────

test('examplePromptsForTab offers three prompts for any tab, seat-first on Seats', () => {
  const seats = examplePromptsForTab('seats');
  assert.equal(seats.length, 3);
  assert.match(seats[0], /seats/i);

  const fallback = examplePromptsForTab('calculator');
  assert.equal(fallback.length, 3);
  // Unknown/absent tabs fall back to the general set rather than throwing.
  assert.deepEqual(examplePromptsForTab(undefined), fallback);
  assert.deepEqual(examplePromptsForTab('not-a-tab'), fallback);
});

// ── Transcript persistence (#533) ─────────────────────────────────────────────

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    has: k => map.has(k),
  };
}

test('a written transcript reads back identically for its owner', () => {
  const storage = fakeStorage();
  const transcript = [user('what is my cgpa?'), reply('3.42'), user('and next term?')];
  writeStoredTranscript(storage, transcript, 'uid-a');
  assert.deepEqual(readStoredTranscript(storage, 'uid-a'), transcript);
});

// Campus machines are shared. A transcript is one student's questions and the
// model's answers about their grades, so the next person to sign in must never
// see it — and it must never be replayed to the Worker as their context.
test('a transcript never reads back for a different uid', () => {
  const storage = fakeStorage();
  writeStoredTranscript(storage, [user('my cgpa?'), reply('3.42')], 'uid-a');
  assert.deepEqual(readStoredTranscript(storage, 'uid-b'), []);
  assert.deepEqual(readStoredTranscript(storage, null), []);
  assert.deepEqual(readStoredTranscript(storage, undefined), []);
});

test('an unstamped legacy record is unreadable rather than assumed yours', () => {
  const legacy = JSON.stringify([{ role: 'user', content: 'someone else' }]);
  const storage = fakeStorage({ [ASSISTANT_TRANSCRIPT_KEY]: legacy });
  assert.deepEqual(readStoredTranscript(storage, 'uid-a'), []);
});

test('writing without an owner, or with nothing to say, clears the key', () => {
  const stored = { [ASSISTANT_TRANSCRIPT_KEY]: JSON.stringify({ owner: 'uid-a', messages: [user('x')] }) };

  const empty = fakeStorage({ ...stored });
  writeStoredTranscript(empty, [], 'uid-a');
  assert.equal(empty.has(ASSISTANT_TRANSCRIPT_KEY), false);

  const anonymous = fakeStorage({ ...stored });
  writeStoredTranscript(anonymous, [user('x')], null);
  assert.equal(anonymous.has(ASSISTANT_TRANSCRIPT_KEY), false);
});

test('clearStoredTranscript drops the record whoever owns it', () => {
  const storage = fakeStorage();
  writeStoredTranscript(storage, [user('x')], 'uid-a');
  clearStoredTranscript(storage);
  assert.equal(storage.has(ASSISTANT_TRANSCRIPT_KEY), false);
  assert.deepEqual(readStoredTranscript(storage, 'uid-a'), []);
});

test('a stored transcript is clamped to the Worker contract on read', () => {
  const oversize = [];
  for (let i = 0; i < 15; i++) oversize.push(user(`q${i}`), reply(`a${i}`));
  const storage = fakeStorage({
    [ASSISTANT_TRANSCRIPT_KEY]: JSON.stringify({ owner: 'uid-a', messages: oversize }),
  });
  const restored = readStoredTranscript(storage, 'uid-a');
  assert.ok(restored.length <= ASSISTANT_MAX_MESSAGES);
  assert.equal(restored[0].role, 'user');
});

test('corrupt, missing, or unavailable storage yields an empty transcript', () => {
  const corrupt = fakeStorage({ [ASSISTANT_TRANSCRIPT_KEY]: '{oops' });
  assert.deepEqual(readStoredTranscript(corrupt, 'uid-a'), []);
  assert.deepEqual(readStoredTranscript(fakeStorage(), 'uid-a'), []);
  assert.deepEqual(readStoredTranscript(null, 'uid-a'), []);
  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.deepEqual(readStoredTranscript(throwing, 'uid-a'), []);
  // Writing or clearing through a hostile storage must not break the chat.
  writeStoredTranscript(throwing, [user('hi')], 'uid-a');
  clearStoredTranscript(throwing);
});
