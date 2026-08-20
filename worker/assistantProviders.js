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

// Gemini's free tier is what makes this assistant runnable at all: Shohoj is a
// free student project funded by one person, and a per-token bill is the
// difference between shipping the feature and leaving it switched off. Free
// therefore LEADS the provider chain (#550) — paid providers are the safety
// net, not the default.
export const GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// thinking_level defaults to medium, and it applies to BOTH round-trips of a
// turn — pick the tool, then answer. These questions are grounded in our own
// executors: the CGPA, the prerequisite verdict and the seat counts are
// computed by Shohoj and handed to the model, so deep reasoning buys nothing
// and costs the student seconds of waiting (#553). Mirrors the `low` reasoning
// effort already set on the OpenAI path. Never send this alongside the legacy
// thinking_budget parameter — together they are a 400.
export const GEMINI_THINKING_LEVEL = 'low';

// It rides inside generation_config, NOT at the top level of the payload. Sent
// top-level the API answers "Unknown parameter 'thinking_level'" and rejects
// the request outright (#563) — and because that 400 lands on the FIRST call of
// a turn, there is no interaction to retry against and the whole turn fails.
// One frozen object shared by every payload so the three call sites below
// cannot drift apart again.
const GEMINI_GENERATION_CONFIG = Object.freeze({ thinking_level: GEMINI_THINKING_LEVEL });

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
 *
 * Resolves to { text, usage } — tokens summed across every round, because the
 * spend ceiling has to account for the tool rounds too, not just the last call.
 */
export async function runClaudeTurn({ anthropic, messages, ctx }) {
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  let lastText = '';
  const usage = { inputTokens: 0, outputTokens: 0 };

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

    usage.inputTokens += Number(response?.usage?.input_tokens) || 0;
    usage.outputTokens += Number(response?.usage?.output_tokens) || 0;

    lastText = claudeText(response.content) || lastText;
    if (response.stop_reason !== 'tool_use') return { text: lastText || NO_ANSWER, usage };

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

  return { text: lastText || TOO_MANY_ROUNDS, usage };
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

/** The same bounded tool loop, in Responses API terms. Same { text, usage }. */
export async function runOpenAiTurn({ apiKey, messages, ctx, fetchImpl = fetch }) {
  // The system prompt rides as the first input item; the Responses API keeps
  // the whole exchange — messages, tool calls, tool outputs — in one array.
  const input = [
    { role: 'system', content: ASSISTANT_SYSTEM },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = openAiTools();
  let lastText = '';
  const usage = { inputTokens: 0, outputTokens: 0 };

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

    usage.inputTokens += Number(body?.usage?.input_tokens) || 0;
    usage.outputTokens += Number(body?.usage?.output_tokens) || 0;

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
      return { text: lastText || NO_ANSWER, usage };
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

  return { text: lastText || TOO_MANY_ROUNDS, usage };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

/**
 * Flatten the transcript into one prompt.
 *
 * Shohoj keeps no server-side conversation state — the client replays the
 * visible transcript on every turn — so there is no interaction id to continue
 * from. Speaker labels are the plainest way to hand the model the history it
 * needs; `previous_interaction_id` is used only for the tool round-trip WITHIN
 * a turn, which is what it is for.
 */
function geminiPrompt(messages) {
  return messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Student'}: ${m.content}`)
    .join('\n\n');
}

// The reference documents the produced items as `steps` (and that is what the
// live API returns), but review flagged `outputs`, and a shape mismatch here
// would fail silently — every answer empty, every tool call skipped. Reading
// both costs one line and removes the whole risk.
function geminiSteps(body) {
  if (Array.isArray(body?.steps)) return body.steps;
  if (Array.isArray(body?.outputs)) return body.outputs;
  return [];
}

function geminiText(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }
  return (
    geminiSteps(body)
      .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      // Newline, not empty string: separate parts are separate blocks here, and
      // concatenating them bare runs the end of one into the start of the next.
      .join('\n')
      .trim()
  );
}

// Usage is reported for observability only — the free tier bills nothing, so
// the ledger charges Gemini zero. Field names are read defensively because a
// missing count must never break a turn.
function geminiUsage(body) {
  const usage = body?.usage || body?.usage_metadata || {};
  return {
    inputTokens: Number(usage.total_input_tokens ?? usage.input_tokens) || 0,
    outputTokens: Number(usage.total_output_tokens ?? usage.output_tokens) || 0,
  };
}

/**
 * Restate the question with the tool output as grounding text.
 *
 * The fallback path when the API rejects the documented tool continuation
 * (#556). It uses only the request shape we have proven works in production —
 * a plain `input` string — so the student gets a grounded answer even when the
 * structured round-trip is refused. The model still cannot invent numbers: the
 * figures here come from the same uid-scoped executors, they are simply
 * delivered as text rather than as function_result items.
 */
function geminiGroundedPrompt(messages, grounding) {
  const facts = grounding.map((g) => `Result of ${g.name}: ${g.output}`).join('\n');
  return [
    geminiPrompt(messages),
    '',
    "Data retrieved from the student's own Shohoj record for this question:",
    facts,
    '',
    'Answer the question using only the data above.',
  ].join('\n');
}

/** The same bounded tool loop against the Interactions API. Same { text, usage }. */
export async function runGeminiTurn({ apiKey, messages, ctx, fetchImpl = fetch }) {
  // Tool declarations happen to use the same shape OpenAI's Responses API
  // wants, so there is one translation, not two.
  const tools = openAiTools();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let payload = {
    model: GEMINI_MODEL,
    system_instruction: ASSISTANT_SYSTEM,
    generation_config: GEMINI_GENERATION_CONFIG,
    tools,
    input: geminiPrompt(messages),
  };
  let lastText = '';
  // Tool output collected this turn, kept so the turn can be restarted as a
  // grounded prompt if the structured continuation is refused.
  let grounding = [];
  let continuationRefused = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let res;
    try {
      res = await fetchImpl(GEMINI_URL, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new ProviderUnavailable('gemini', 'request failed', e);
    }

    // A 4xx on a CONTINUATION is a disagreement about request shape, not an
    // outage: the first request of the same turn just succeeded with the same
    // key, model and quota. Retry once as a fresh, grounded prompt rather than
    // failing the student — and only once, so a genuinely broken request
    // cannot loop.
    if (
      !res.ok &&
      res.status >= 400 &&
      res.status < 500 &&
      res.status !== 429 &&
      payload.previous_interaction_id &&
      !continuationRefused
    ) {
      const why = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim();
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'assistant_gemini_continuation_refused',
          status: res.status,
          detail: why,
        }),
      );
      continuationRefused = true;
      payload = {
        model: GEMINI_MODEL,
        system_instruction: ASSISTANT_SYSTEM,
        generation_config: GEMINI_GENERATION_CONFIG,
        input: geminiGroundedPrompt(messages, grounding),
      };
      continue;
    }

    if (!res.ok) {
      // Google's error bodies say WHY — wrong key, quota exhausted, model not
      // available to this project — and the first live call is exactly when
      // that matters. Truncated, and it carries no student data: this is the
      // API's own complaint about the request envelope.
      const detail = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').trim();
      // 429 on the free tier means the whole project's shared quota is spent,
      // not that this student asked too often. It is an outage from our side,
      // so it falls through to a paid provider when one is configured.
      const base = res.status === 429 ? 'HTTP 429 (free-tier quota)' : `HTTP ${res.status}`;
      throw new ProviderUnavailable('gemini', detail ? `${base}: ${detail}` : base);
    }

    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new ProviderUnavailable('gemini', 'unreadable response', e);
    }

    const turnUsage = geminiUsage(body);
    usage.inputTokens += turnUsage.inputTokens;
    usage.outputTokens += turnUsage.outputTokens;
    lastText = geminiText(body) || lastText;

    const calls = geminiSteps(body).filter((step) => step?.type === 'function_call');
    if (calls.length === 0) return { text: lastText || NO_ANSWER, usage };

    const results = [];
    for (const call of calls) {
      let out;
      try {
        // Arguments arrive parsed here, unlike OpenAI's JSON string — accept
        // both rather than assuming, since a malformed value is the model's
        // mistake and belongs in the tool result, not in a provider failure.
        const args =
          typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : call.arguments;
        out = JSON.stringify(await executeAssistantTool(call.name, args || {}, ctx));
      } catch (e) {
        out = `Error: ${e?.message || 'tool failed'}`;
      }
      results.push({
        type: 'function_result',
        name: call.name,
        call_id: call.call_id ?? call.id,
        result: [{ type: 'text', text: out }],
      });
      grounding.push({ name: call.name, output: out });
    }

    // Continue THIS turn against the interaction the model just created.
    payload = {
      model: GEMINI_MODEL,
      previous_interaction_id: body.id,
      generation_config: GEMINI_GENERATION_CONFIG,
      tools,
      input: results,
    };
  }

  return { text: lastText || TOO_MANY_ROUNDS, usage };
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * The providers this deployment can actually use, in fallback order: Gemini
 * (free tier) → Claude → OpenAI. Each is gated by its own secret. With none,
 * the caller must 503 rather than pretend the assistant exists (#455); with
 * one, that one serves every turn; with several, the free one leads and the
 * paid ones catch its failures.
 */
export function buildAssistantProviders(env, { fetchImpl } = {}) {
  const providers = [];
  // Free first (#550). Shohoj is funded by one person; a paid provider should
  // only ever be reached because the free one could not answer.
  if (env?.GEMINI_API_KEY) {
    providers.push({
      name: 'gemini',
      run: ({ messages, ctx }) =>
        runGeminiTurn({ apiKey: env.GEMINI_API_KEY, messages, ctx, fetchImpl }),
    });
  }
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
 * Resolves with the reply, which provider produced it, and the tokens it cost;
 * rejects with the last failure when every provider is exhausted.
 *
 * Usage is reported for the provider that ANSWERED. Tokens burned by a failed
 * attempt are not billed to us in any recoverable way — a 5xx or a dropped
 * connection has no usage block to read — so the ledger cannot count what it
 * cannot see. It is one more reason the ceiling errs on the expensive side.
 */
export async function runAssistantTurn({ providers, messages, ctx, onFallback }) {
  if (!providers || providers.length === 0) {
    throw new Error('No assistant provider configured');
  }
  let lastFailure = null;
  for (const provider of providers) {
    try {
      const { text, usage } = await provider.run({ messages, ctx });
      return { reply: text, provider: provider.name, usage };
    } catch (e) {
      if (!(e instanceof ProviderUnavailable)) throw e;
      lastFailure = e;
      if (typeof onFallback === 'function') onFallback(e);
    }
  }
  throw lastFailure;
}
