// worker/assistantQuota.js — a per-student daily allowance for the Assistant.
//
// assistantBudget.js caps what EVERYONE together can spend in a month. That
// protects the owner's card but says nothing to an individual student: today
// the only per-uid guard is the abuse-rate burst limiter (10 req/min), which
// is silent about a student who asks steadily all day and eats a
// disproportionate share of the shared monthly ceiling before anyone else
// gets a turn. This module is the missing layer — a generous, resettable
// daily count, per uid, shared by /api/assistant and /api/v1/tasks/extract
// (one counter, not two, for the same reason the monthly ledger is one
// ledger: the owner's exposure should be the number they set, not the sum of
// several).
//
// Deliberately generous. This is a cost/abuse backstop, not a paywall — there
// is no payment path in this deployment. A limit of 0 disables it, mirroring
// the monthly ceiling's own off-switch semantics.

/** Free daily allowance when ASSISTANT_DAILY_MESSAGE_LIMIT is unset. */
export const DEFAULT_DAILY_MESSAGE_LIMIT = 40;

/** Calendar day key, UTC — the ledger document id's suffix (e.g. "2026-09-23"). */
export function dayKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse the configured daily limit; a missing, junk, or negative value falls back. */
export function dailyLimit(env) {
  const raw = Number(env?.ASSISTANT_DAILY_MESSAGE_LIMIT);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DAILY_MESSAGE_LIMIT;
  return raw;
}

/** Whether this student has used up today's allowance. */
export function isQuotaExhausted(count, limit) {
  const used = Number.isFinite(count) && count > 0 ? count : 0;
  return used >= limit;
}

/** Next UTC midnight, ISO — when today's count stops counting against a student. */
export function resetsAtIso(date = new Date()) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return next.toISOString();
}
