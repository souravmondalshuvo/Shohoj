// tests/assistantClient.test.js
//
// Covers the pure Shohoj Assistant client (src/features/assistant/
// assistantClient.ts): transcript clamping to the Worker's contract, and the
// guard order + HTTP→typed-error mapping of sendAssistantTurn. All offline —
// fetch and the token getter are injected.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSISTANT_MAX_MESSAGES,
  clampTranscript,
  fetchAssistantAvailability,
  sendAssistantTurn,
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
