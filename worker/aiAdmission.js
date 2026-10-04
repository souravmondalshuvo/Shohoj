import { conditionalWrite } from './firestoreAtomic.js';

const ATTEMPTS = 8;
function nonnegative(fields, key) {
  const value = fields?.[key] ?? 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid AI ledger ${key}`);
  }
  return value;
}

// Reserve BOTH gates in one atomic commit before contacting any model. Crashes,
// ambiguous writes, and failed settlement leave the hold in place (fail closed).
export async function reserveAiAdmission(
  store,
  { uid, day, month, quotaLimit, budgetUsd, heldUsd, id = crypto.randomUUID() },
) {
  if (!Number.isFinite(heldUsd) || heldUsd < 0) throw new Error('Invalid AI reservation');
  const quotaPath = `assistantDailyQuota/${uid}_${day}`;
  const budgetPath = `assistantBudget/${month}`;
  const path = `assistantAdmissions/${id}`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const quota = await store.getDocSnapshot(quotaPath);
    const count = nonnegative(quota?.fields, 'count');
    if (!Number.isInteger(count)) throw new Error('Invalid AI quota count');
    if (count >= quotaLimit) return { denied: 'quota' };
    const budget = await store.getDocSnapshot(budgetPath);
    const spent = nonnegative(budget?.fields, 'spentUsd');
    const reserved = nonnegative(budget?.fields, 'reservedUsd');
    if (
      budgetUsd === 0 ||
      spent + reserved + heldUsd > budgetUsd ||
      spent + reserved >= budgetUsd
    ) {
      return { denied: 'budget' };
    }
    const updatedAt = new Date().toISOString();
    try {
      await store.commitWrites([
        conditionalWrite(quotaPath, quota, { count: count + 1, updatedAt }),
        conditionalWrite(budgetPath, budget, {
          spentUsd: spent,
          reservedUsd: reserved + heldUsd,
          updatedAt,
        }),
        conditionalWrite(path, null, {
          quotaPath,
          budgetPath,
          heldUsd,
          status: 'pending',
          createdAt: updatedAt,
        }),
      ]);
      return { path, count: count + 1 };
    } catch (error) {
      if (!error.conflict) throw error;
    }
  }
  throw new Error('AI admission contention');
}

// Reservation status is part of the same commit: retries cannot double-charge
// or double-refund. A failed paid attempt retains its pessimistic charge because
// transport errors do not prove that the provider did no billable work.
export async function settleAiAdmission(store, admission, { costUsd, answered }) {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error('Invalid AI settlement');
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reservation = await store.getDocSnapshot(admission.path);
    if (!reservation) throw new Error('Missing AI reservation');
    if (reservation.fields.status === 'settled') return;
    if (reservation.fields.status !== 'pending') throw new Error('Invalid AI reservation status');
    const { quotaPath, budgetPath } = reservation.fields;
    const heldUsd = nonnegative(reservation.fields, 'heldUsd');
    const budget = await store.getDocSnapshot(budgetPath);
    const reserved = nonnegative(budget?.fields, 'reservedUsd');
    const spent = nonnegative(budget?.fields, 'spentUsd');
    if (!budget || reserved + 1e-9 < heldUsd) throw new Error('Missing AI budget hold');
    const updatedAt = new Date().toISOString();
    const writes = [
      conditionalWrite(budgetPath, budget, {
        spentUsd: spent + costUsd,
        reservedUsd: Math.max(0, reserved - heldUsd),
        updatedAt,
      }),
      conditionalWrite(admission.path, reservation, {
        status: 'settled',
        costUsd,
        answered,
        updatedAt,
      }),
    ];
    if (!answered) {
      const quota = await store.getDocSnapshot(quotaPath);
      const count = nonnegative(quota?.fields, 'count');
      if (!quota || count < 1) throw new Error('Missing AI quota hold');
      writes.push(conditionalWrite(quotaPath, quota, { count: count - 1, updatedAt }));
    }
    try {
      await store.commitWrites(writes);
      return;
    } catch (error) {
      if (!error.conflict) throw error;
    }
  }
  throw new Error('AI settlement contention');
}
