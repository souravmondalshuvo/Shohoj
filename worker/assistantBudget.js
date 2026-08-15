// worker/assistantBudget.js — a monthly spend ceiling for the Assistant.
//
// The assistant runs on ONE person's API key while serving a whole campus, so
// the failure mode that matters is not a bad answer — it is a quiet, unbounded
// bill. The per-uid rate limit caps how fast one student can ask; this caps
// what everyone together can spend in a calendar month.
//
// Accounting is an estimate, deliberately a pessimistic one. Token usage comes
// back from the providers, but prices change and published tiers occasionally
// disagree, so where sources conflict the HIGHER price is used: overestimating
// makes the ceiling trip early, which costs a few unanswered questions.
// Underestimating would let the real bill sail past the number the owner set,
// which is the whole thing this exists to prevent. Treat the ledger as a
// safety net, never as billing-grade accounting — the provider's own dashboard
// is the source of truth for what was actually spent.

/** USD per million tokens, by provider. Higher of any conflicting published tier. */
export const ASSISTANT_PRICES_USD_PER_MTOK = {
  // Free tier (#550): genuinely $0, which is the entire reason it leads the
  // provider chain. If billing is ever enabled on that Google account this
  // MUST be updated, or the ceiling will happily count real spend as free.
  gemini: { input: 0, output: 0 },
  claude: { input: 1, output: 5 },
  openai: { input: 1, output: 6 },
};

/** Default ceiling when ASSISTANT_MONTHLY_BUDGET_USD is unset, in USD. */
export const DEFAULT_MONTHLY_BUDGET_USD = 5;

/** Calendar month key, UTC — the ledger document id (e.g. "2026-08"). */
export function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Estimated USD for one turn from the provider's reported token usage.
 * Unknown providers and missing/garbled usage are charged at the most
 * expensive rate we know, so a reporting gap can never read as "free".
 */
export function estimateCostUsd(provider, usage) {
  const price = ASSISTANT_PRICES_USD_PER_MTOK[provider] || { input: 1, output: 6 };
  const input = Number(usage?.inputTokens);
  const output = Number(usage?.outputTokens);
  const safeInput = Number.isFinite(input) && input >= 0 ? input : 0;
  const safeOutput = Number.isFinite(output) && output >= 0 ? output : 0;
  return (safeInput * price.input + safeOutput * price.output) / 1_000_000;
}

/** Parse the configured ceiling; a missing, junk, or negative value falls back. */
export function monthlyBudgetUsd(env) {
  const raw = Number(env?.ASSISTANT_MONTHLY_BUDGET_USD);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_MONTHLY_BUDGET_USD;
  return raw;
}

/**
 * Whether this month's spend has reached the ceiling.
 *
 * A ceiling of 0 disables the assistant outright — a deliberate, documented way
 * to switch it off without removing the keys.
 */
export function isBudgetExhausted(spentUsd, limitUsd) {
  const spent = Number.isFinite(spentUsd) && spentUsd > 0 ? spentUsd : 0;
  return spent >= limitUsd;
}
