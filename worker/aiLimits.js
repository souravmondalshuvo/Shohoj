import { estimateCostUsd } from './assistantBudget.js';

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

// Track each attempted provider. Unattempted providers cost zero; unknown paid
// failures retain the bound. Missing usage must never release a paid hold.
export function meterProviders(providers, options) {
  let costUsd = 0;
  const wrapped = providers.map((provider) => ({
    ...provider,
    async run(args) {
      const reserved = providerReservationUsd(provider.name, options);
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
    heldUsd: providers.reduce((sum, p) => sum + providerReservationUsd(p.name, options), 0),
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
