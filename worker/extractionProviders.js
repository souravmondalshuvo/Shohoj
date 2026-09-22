// worker/extractionProviders.js — one-shot model calls for extraction (#741).
//
// WHY THIS IS NOT assistantProviders.js
//
// That module runs a bounded TOOL LOOP: it ships ASSISTANT_TOOLS, executes
// uid-scoped functions between rounds, and translates tool state across three
// wire formats. Extraction is the opposite shape — one request, no tools, no
// continuation, a JSON object back. Parameterising the loop to also not-loop
// would mean adding branches to the hot path of a LIVE feature that runs on a
// single free-tier key, where one bad payload field is a total outage.
//
// So the fallback ORDER and the failure vocabulary are shared (ProviderUnavailable,
// the model constants, the response parsers are all imported), and only the
// request shape is written again. That is about forty lines of HTTP, against a
// change that could take the Assistant down.
//
// Free leads here for the same reason it leads there: Shohoj is funded by one
// person, and a paid provider should only ever be reached because the free one
// could not answer.

import Anthropic from '@anthropic-ai/sdk';

import {
  CLAUDE_MODEL,
  GEMINI_MODEL,
  GEMINI_URL,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  OPENAI_URL,
  ProviderUnavailable,
  claudeText,
  geminiText,
  openAiText,
} from './assistantProviders.js';

/**
 * Output cap for an extraction.
 *
 * Smaller than the Assistant's: this returns a bounded JSON array, not prose.
 * A reply that needs more than this is a reply that has stopped following the
 * format, and paying for its tail buys nothing.
 */
export const EXTRACTION_MAX_TOKENS = 2048;

async function runGeminiExtraction({ apiKey, system, prompt, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        system_instruction: system,
        input: prompt,
      }),
    });
  } catch (e) {
    throw new ProviderUnavailable('gemini', 'request failed', e);
  }
  if (!res.ok) {
    // Truncated, and it carries no student text — this is the API complaining
    // about our envelope, which is exactly what a first live call needs to say.
    const detail = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new ProviderUnavailable('gemini', `HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new ProviderUnavailable('gemini', 'unreadable response', e);
  }
  return {
    text: geminiText(body),
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

async function runClaudeExtraction({ apiKey, system, prompt }) {
  const anthropic = new Anthropic({ apiKey, maxRetries: 1 });
  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: EXTRACTION_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    // The SDK does not throw on a refusal, so every throw is transport or API
    // failure — exactly the fallback signal.
    throw new ProviderUnavailable('claude', e?.status ? `HTTP ${e.status}` : 'request failed', e);
  }
  return {
    text: claudeText(response?.content),
    usage: {
      inputTokens: Number(response?.usage?.input_tokens) || 0,
      outputTokens: Number(response?.usage?.output_tokens) || 0,
    },
  };
}

async function runOpenAiExtraction({ apiKey, system, prompt, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: EXTRACTION_MAX_TOKENS,
        reasoning: { effort: OPENAI_REASONING_EFFORT },
      }),
    });
  } catch (e) {
    throw new ProviderUnavailable('openai', 'request failed', e);
  }
  if (!res.ok) throw new ProviderUnavailable('openai', `HTTP ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new ProviderUnavailable('openai', 'unreadable response', e);
  }
  return {
    text: openAiText(body?.output),
    usage: {
      inputTokens: Number(body?.usage?.input_tokens) || 0,
      outputTokens: Number(body?.usage?.output_tokens) || 0,
    },
  };
}

/**
 * The providers this deployment can use for extraction, free first.
 *
 * Gated by the SAME secrets as the Assistant: a deployment that can answer
 * questions can also read an announcement, and a deployment that cannot do
 * either says so once rather than in two different voices.
 */
export function buildExtractionProviders(env, { fetchImpl = fetch } = {}) {
  const providers = [];
  if (env?.GEMINI_API_KEY) {
    providers.push({
      name: 'gemini',
      run: ({ system, prompt }) =>
        runGeminiExtraction({ apiKey: env.GEMINI_API_KEY, system, prompt, fetchImpl }),
    });
  }
  if (env?.ANTHROPIC_API_KEY) {
    providers.push({
      name: 'claude',
      run: ({ system, prompt }) =>
        runClaudeExtraction({ apiKey: env.ANTHROPIC_API_KEY, system, prompt }),
    });
  }
  if (env?.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      run: ({ system, prompt }) =>
        runOpenAiExtraction({ apiKey: env.OPENAI_API_KEY, system, prompt, fetchImpl }),
    });
  }
  return providers;
}

/**
 * Run one extraction, falling through the providers on infrastructure failure.
 *
 * Rejects with the last failure when all are exhausted. A provider that
 * ANSWERS — even with something unusable — is a real result and is returned:
 * deciding whether the text was usable is the validator's job, not this
 * module's, and retrying a model that replied would double the bill to get a
 * second opinion nobody asked for.
 */
export async function runExtractionTurn({ providers, system, prompt, onFallback }) {
  if (!providers || providers.length === 0) {
    throw new Error('No extraction provider configured');
  }
  let lastFailure = null;
  for (const provider of providers) {
    try {
      const { text, usage } = await provider.run({ system, prompt });
      return { text, provider: provider.name, usage: usage || { inputTokens: 0, outputTokens: 0 } };
    } catch (e) {
      if (!(e instanceof ProviderUnavailable)) throw e;
      lastFailure = e;
      if (typeof onFallback === 'function') onFallback(e);
    }
  }
  throw lastFailure;
}
