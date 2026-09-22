// worker/test/extractionProviders.test.js
//
// Provider selection and fallback for extraction (#741).
//
// The behaviour worth pinning is which failures fall through and which do
// not. Falling through on the wrong thing either doubles the bill for no
// benefit, or hides a bug in our own code behind a second provider's answer.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ProviderUnavailable } from '../assistantProviders.js';
import { buildExtractionProviders, runExtractionTurn } from '../extractionProviders.js';

const SYSTEM = 'system';
const PROMPT = 'prompt';

/** A provider that answers. */
const answers = (name, text) => ({
  name,
  run: async () => ({ text, usage: { inputTokens: 10, outputTokens: 5 } }),
});

/** A provider that is down in the way that should fall through. */
const unavailable = (name) => ({
  name,
  run: async () => {
    throw new ProviderUnavailable(name, 'HTTP 503');
  },
});

// ── Which providers exist ───────────────────────────────────────────────────

test('no keys configured means no providers, not a broken one', () => {
  assert.deepEqual(buildExtractionProviders({}), []);
});

test('the free provider leads, and the paid ones follow in order', () => {
  // Shohoj is funded by one person. A paid provider should only ever be
  // reached because the free one could not answer.
  const providers = buildExtractionProviders({
    GEMINI_API_KEY: 'g',
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o',
  });
  assert.deepEqual(
    providers.map((p) => p.name),
    ['gemini', 'claude', 'openai'],
  );
});

test('one key configured means that one serves every extraction', () => {
  const providers = buildExtractionProviders({ ANTHROPIC_API_KEY: 'a' });
  assert.deepEqual(
    providers.map((p) => p.name),
    ['claude'],
  );
});

// ── Fallback ────────────────────────────────────────────────────────────────

test('with no providers at all it throws rather than pretending', async () => {
  await assert.rejects(() => runExtractionTurn({ providers: [], system: SYSTEM, prompt: PROMPT }), {
    message: /No extraction provider configured/,
  });
});

test('the first provider that answers wins', async () => {
  const result = await runExtractionTurn({
    providers: [answers('gemini', '{"tasks":[]}'), answers('claude', 'never reached')],
    system: SYSTEM,
    prompt: PROMPT,
  });

  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, '{"tasks":[]}');
});

test('an unavailable provider falls through to the next', async () => {
  const seen = [];
  const result = await runExtractionTurn({
    providers: [unavailable('gemini'), answers('claude', '{"tasks":[]}')],
    system: SYSTEM,
    prompt: PROMPT,
    onFallback: (e) => seen.push(e.provider),
  });

  assert.equal(result.provider, 'claude');
  assert.deepEqual(seen, ['gemini']);
});

test('when every provider is down, the last failure surfaces', async () => {
  await assert.rejects(
    () =>
      runExtractionTurn({
        providers: [unavailable('gemini'), unavailable('claude')],
        system: SYSTEM,
        prompt: PROMPT,
      }),
    (e) => e instanceof ProviderUnavailable && e.provider === 'claude',
  );
});

test('a provider that ANSWERS unusably is not retried on the next one', async () => {
  // Whether the text was usable is the validator's job. Retrying a model that
  // replied would double the bill to get a second opinion nobody asked for.
  let claudeCalled = false;
  const result = await runExtractionTurn({
    providers: [
      answers('gemini', 'Sure! Here are your deadlines.'),
      {
        name: 'claude',
        run: async () => {
          claudeCalled = true;
          return { text: '{"tasks":[]}', usage: {} };
        },
      },
    ],
    system: SYSTEM,
    prompt: PROMPT,
  });

  assert.equal(result.provider, 'gemini');
  assert.equal(claudeCalled, false);
});

test('a bug in our own code is not hidden behind the next provider', async () => {
  // Only ProviderUnavailable falls through. A TypeError means we are broken,
  // and it fails identically on the other provider — so surfacing it beats
  // doubling the latency to rediscover it.
  await assert.rejects(
    () =>
      runExtractionTurn({
        providers: [
          {
            name: 'gemini',
            run: async () => {
              throw new TypeError('someField is not a function');
            },
          },
          answers('claude', '{"tasks":[]}'),
        ],
        system: SYSTEM,
        prompt: PROMPT,
      }),
    TypeError,
  );
});

test('usage comes back for the provider that answered', async () => {
  const result = await runExtractionTurn({
    providers: [unavailable('gemini'), answers('claude', '{"tasks":[]}')],
    system: SYSTEM,
    prompt: PROMPT,
  });

  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5 });
});

test('a provider reporting no usage does not crash the caller', async () => {
  const result = await runExtractionTurn({
    providers: [{ name: 'gemini', run: async () => ({ text: '{"tasks":[]}' }) }],
    system: SYSTEM,
    prompt: PROMPT,
  });

  assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0 });
});
