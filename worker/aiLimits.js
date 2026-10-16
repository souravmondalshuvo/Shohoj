import { estimateCostUsd } from './assistantBudget.js';
import { ProviderUnavailable } from './assistantProviders.js';

// UTF-8 bytes conservatively bound input tokens. The allowance covers provider
// message/tool framing. Every paid call enforces this bound, including tool
// results, and has no automatic SDK retries.
export const MAX_MODEL_INPUT_BYTES = 131072;
export const MODEL_TOKEN_OVERHEAD = 4096;
export const MAX_AI_BODY_BYTES = 128 * 1024;
export const MAX_EXTRACTION_BODY_BYTES = 56 * 1024;
export const MAX_TOOL_ROUNDS = 5;
export function boundedModelPayload(payload) {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > MAX_MODEL_INPUT_BYTES) {
    throw new Error('AI model input exceeds the byte limit');
  }
  return json;
}

export function providerReservationUsd(name, { extraction = false } = {}) {
  const rounds = extraction ? 1 : MAX_TOOL_ROUNDS;
  const outputTokens = extraction ? 2048 : name === 'claude' ? 1024 : 4096;
  return estimateCostUsd(name, {
    inputTokens: rounds * (MAX_MODEL_INPUT_BYTES + MODEL_TOKEN_OVERHEAD),
    outputTokens: rounds * outputTokens,
  });
}

/**
 * The hold admission takes: the worst case of the provider that runs FIRST,
 * and nothing more (#920). Every fallback adds its own hold just before it is
 * contacted (meterProviders' `reserve`). Holding the whole chain up front cost
 * $1.50 a turn with both paid keys armed — three concurrent turns under a $5
 * ceiling, even when the free tier answered all of them.
 */
export function admissionHoldUsd(providers, options) {
  return providers.length > 0 ? providerReservationUsd(providers[0].name, options) : 0;
}

// Track each attempted provider. Unattempted providers cost zero; unknown paid
// failures retain the bound. Missing usage must never release a paid hold.
//
// providers[0] runs on the hold admission already took. Any later provider is
// a fallback and must first win its own hold from `reserve(usd)` — an atomic
// add against the monthly ceiling (aiAdmission.extendAiAdmission). Refused, or
// with no `reserve` at all, it is never contacted: a paid call without a hold
// is exactly what the ledger exists to prevent. A refusal is reported as the
// provider being unavailable, so the turn ends the way an exhausted chain
// does; a `reserve` that throws (the ledger itself failing) aborts the turn.
export function meterProviders(providers, options = {}) {
  const { reserve } = options;
  let costUsd = 0;
  const wrapped = providers.map((provider, index) => ({
    ...provider,
    async run(args) {
      const reserved = providerReservationUsd(provider.name, options);
      if (index > 0 && reserved > 0) {
        const granted = typeof reserve === 'function' && (await reserve(reserved));
        if (!granted) {
          throw new ProviderUnavailable(provider.name, 'no budget headroom for a fallback hold');
        }
      }
      costUsd += reserved;
      const result = await provider.run(args);
      const usage = result?.usage;
      if (
        result.usageComplete !== false &&
        usage &&
        Number.isFinite(usage.inputTokens) &&
        usage.inputTokens >= 0 &&
        Number.isFinite(usage.outputTokens) &&
        usage.outputTokens >= 0 &&
        (usage.inputTokens + usage.outputTokens > 0 || provider.name === 'gemini')
      ) {
        costUsd += estimateCostUsd(provider.name, usage) - reserved;
      }
      return result;
    },
  }));
  return {
    providers: wrapped,
    heldUsd: admissionHoldUsd(providers, options),
    costUsd: () => Math.max(0, costUsd),
  };
}

export { BodyTooLarge, readBoundedJson } from './requestBody.js';

export function boundedModelObject(payload) {
  return JSON.parse(boundedModelPayload(payload));
}
export function completeUsage(usage) {
  return (
    Number.isFinite(usage?.input_tokens) &&
    usage.input_tokens >= 0 &&
    Number.isFinite(usage?.output_tokens) &&
    usage.output_tokens >= 0
  );
}
