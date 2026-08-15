// worker/assistantProviders.js — the Assistant's model providers (#544).
//
// Claude answers. If the turn fails for an infrastructure reason — 5xx, 429,
// timeout, network error, missing or invalid key — the SAME turn is retried on
// OpenAI. The student gets an answer instead of "temporarily unavailable".
//
// Fallback is whole-turn, never mid-loop. The two APIs express tool calling
// differently (Anthropic tool_use/tool_result content blocks; OpenAI
// function_call/function_call_output items on the Responses API), and handing a
// half-finished tool conversation from one to the other would mean translating
// provider-specific state under failure conditions. Restarting the turn from
// the original transcript costs one wasted call and removes that whole class of
// bug.
//
// What does NOT fall back:
//   - a model that answers, refuses, or declines — that is a real result;
//   - a tool executor throwing — our own bug, and it fails identically on the
//     other provider, so retrying would just double the latency.
//
// Both providers share ONE system prompt, ONE tool set, and ONE set of
// uid-scoped executors from assistant.js. Only the wire format differs, so a
// tool can never exist on one provider and not the other, and neither schema
// carries a user identifier.

import Anthropic from '@anthropic-ai/sdk';

import { ASSISTANT_SYSTEM, ASSISTANT_TOOLS, executeAssistantTool } from './assistant.js';

export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
export const CLAUDE_MAX_TOKENS = 1024;

// OpenAI's cost tier, the closest counterpart to the Haiku 4.5 tier Claude is
// locked to. It only runs after Claude has already failed, so the marginal
// spend is bounded by how often that happens.
export const OPENAI_MODEL = 'gpt-5.6-luna';
export const OPENAI_URL = 'https://api.openai.com/v1/responses';

// The GPT-5.6 family are reasoning models: reasoning tokens are charged against
// max_output_tokens, and too tight a cap gets consumed before any visible text,
// yielding status:"incomplete" with an empty answer that still costs money.
// Hence a generous cap and the lowest useful reasoning effort — this is a
// short, tool-grounded academic answer, not a puzzle.
export const OPENAI_MAX_OUTPUT_TOKENS = 4096;
export const OPENAI_REASONING_EFFORT = 'low';

const MAX_TOOL_ROUNDS = 5;

const NO_ANSWER = 'Sorry, I could not produce an answer. Please try rephrasing.';
const TOO_MANY_ROUNDS =
  'Sorry, that took too many steps to answer. Please ask a more specific question.';

/**
 * An infrastructure failure of one provider — the signal that the turn may be
 * retried elsewhere. Anything else thrown escapes untouched, so a bug in our
 * own code is never silently papered over by a second vendor.
 */
export class ProviderUnavailable extends Error {
  constructor(provider, reason, cause) {
    super(`${provider} unavailable: ${reason}`);
    this.name = 'ProviderUnavailable';
    this.provider = provider;
    this.reason = reason;
    this.cause = cause;
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

function claudeText(content) {
  return (content || [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Bounded tool loop against the Anthropic Messages API (no beta SDK features):
 * call the model, execute any requested tools against the uid-scoped ctx, feed
 * the results back, stop when it answers or the round cap is hit.
 */
export async function runClaudeTurn({ anthropic, messages, ctx }) {
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: ASSISTANT_SYSTEM,
        tools: ASSISTANT_TOOLS,
        messages: convo,
      });
    } catch (e) {
      // Every throw out of the SDK is transport or API failure (it does not
      // throw on refusals), so it is exactly the fallback signal.
      throw new ProviderUnavailable('claude', e?.status ? `HTTP ${e.status}` : 'request failed', e);
    }

    lastText = claudeText(response.content) || lastText;
    if (response.stop_reason !== 'tool_use') return lastText || NO_ANSWER;

    convo.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let content;
      let isError = false;
      try {
        content = JSON.stringify(await executeAssistantTool(block.name, block.input, ctx));
      } catch (e) {
        content = `Error: ${e?.message || 'tool failed'}`;
        isError = true;
      }
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content,
        ...(isError ? { is_error: true } : {}),
      });
    }
    convo.push({ role: 'user', content: results });
  }

  return lastText || TOO_MANY_ROUNDS;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

/**
 * The shared tool set in Responses API shape. `strict` is deliberately left
 * off: strict mode requires every property to be listed in `required`, and the
 * CGPA tool's parameters are genuinely optional (target_cgpa OR what_if_gpa).
 */
export function openAiTools() {
  return ASSISTANT_TOOLS.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

function openAiText(output) {
  return (Array.isArray(output) ? output : [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

/** The same bounded tool loop, in Responses API terms. */
export async function runOpenAiTurn({ apiKey, messages, ctx, fetchImpl = fetch }) {
  // The system prompt rides as the first input item; the Responses API keeps
  // the whole exchange — messages, tool calls, tool outputs — in one array.
  const input = [
    { role: 'system', content: ASSISTANT_SYSTEM },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = openAiTools();
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let res;
    try {
      res = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input,
          tools,
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
          reasoning: { effort: OPENAI_REASONING_EFFORT },
        }),
      });
    } catch (e) {
      throw new ProviderUnavailable('openai', 'request failed', e);
    }
    if (!res.ok) {
      throw new ProviderUnavailable('openai', `HTTP ${res.status}`);
    }

    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new ProviderUnavailable('openai', 'unreadable response', e);
    }

    const output = Array.isArray(body?.output) ? body.output : [];
    const calls = output.filter((item) => item.type === 'function_call');
    lastText = openAiText(output) || lastText;

    if (calls.length === 0) {
      // A truncated turn with nothing to show is a failure, not an answer:
      // reasoning tokens can exhaust the cap before any text is emitted, and
      // returning "" would render an empty bubble.
      if (body?.status === 'incomplete' && !lastText) {
        throw new ProviderUnavailable(
          'openai',
          `incomplete: ${body?.incomplete_details?.reason || 'unknown'}`,
        );
      }
      return lastText || NO_ANSWER;
    }

    // Echo the calls back verbatim, then answer each one. Both halves must
    // carry the same call_id or the model cannot pair them up.
    for (const call of calls) {
      input.push({
        type: 'function_call',
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
      });
    }
    for (const call of calls) {
      let out;
      try {
        // Arguments arrive as a JSON string; malformed JSON is the model's
        // mistake, so it is reported back as a tool error rather than treated
        // as the provider being down.
        const args = JSON.parse(call.arguments || '{}');
        out = JSON.stringify(await executeAssistantTool(call.name, args, ctx));
      } catch (e) {
        out = `Error: ${e?.message || 'tool failed'}`;
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: out });
    }
  }

  return lastText || TOO_MANY_ROUNDS;
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * The providers this deployment can actually use, in fallback order. Each is
 * gated by its own secret: with neither, the caller must 503 rather than
 * pretend the assistant exists (#455); with only one, that one serves every
 * turn; with both, Claude leads.
 */
export function buildAssistantProviders(env, { fetchImpl } = {}) {
  const providers = [];
  if (env?.ANTHROPIC_API_KEY) {
    providers.push({
      name: 'claude',
      run: ({ messages, ctx }) =>
        runClaudeTurn({
          anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 }),
          messages,
          ctx,
        }),
    });
  }
  if (env?.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      run: ({ messages, ctx }) =>
        runOpenAiTurn({ apiKey: env.OPENAI_API_KEY, messages, ctx, fetchImpl }),
    });
  }
  return providers;
}

/**
 * Run one turn, falling through the provider list on infrastructure failures.
 * Resolves with the reply and which provider produced it; rejects with the last
 * failure when every provider is exhausted.
 */
export async function runAssistantTurn({ providers, messages, ctx, onFallback }) {
  if (!providers || providers.length === 0) {
    throw new Error('No assistant provider configured');
  }
  let lastFailure = null;
  for (const provider of providers) {
    try {
      return { reply: await provider.run({ messages, ctx }), provider: provider.name };
    } catch (e) {
      if (!(e instanceof ProviderUnavailable)) throw e;
      lastFailure = e;
      if (typeof onFallback === 'function') onFallback(e);
    }
  }
  throw lastFailure;
}
