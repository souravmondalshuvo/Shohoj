import { campusOfEmail } from './campus.generated.js';
import { conditionalWrite } from './firestoreAtomic.js';

export const LOST_FOUND_DELIVERIES = 'lostFoundDeliveries';
// Resend retains idempotency keys for 24h. Stop earlier; an ambiguous older
// attempt needs operator reconciliation, never a blind second notification.
export const CLAIM_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function eligibleLostFoundClaim(id, claim, post, contact) {
  const campus = campusOfEmail(claim?.fromEmail);
  return !!(
    ID.test(claim?.postId ?? '') &&
    ID.test(claim?.fromUid ?? '') &&
    id === `${claim.postId}_${claim.fromUid}` &&
    campus &&
    post?.status === 'open' &&
    campus === (post.university ?? 'bracu') &&
    typeof post.creatorUid === 'string' &&
    contact?.uid === post.creatorUid &&
    campusOfEmail(contact?.email) === campus
  );
}

// A private, durable receipt outlives the queue item. Its creation is also the
// admission boundary for the email. Overlapping workers use the same provider
// idempotency key and identical payload; the receipt prevents later replay.
export async function deliverLostFoundClaim({ store, id, payloadHash, send, now = Date.now }) {
  const path = `${LOST_FOUND_DELIVERIES}/${id}`;
  let receipt = await store.getDocSnapshot(path);
  if (!receipt) {
    try {
      await store.commitWrites([
        conditionalWrite(path, null, { status: 'pending', payloadHash, firstAttemptAt: now() }),
      ]);
    } catch (error) {
      if (error.conflict) return 'pending';
      throw error; // unknown reservation outcome: do not send
    }
    receipt = await store.getDocSnapshot(path);
  }
  if (receipt?.fields.status === 'delivered') return 'delivered';
  const first = receipt?.fields.firstAttemptAt;
  if (
    receipt?.fields.status !== 'pending' ||
    receipt.fields.payloadHash !== payloadHash ||
    !Number.isFinite(first) ||
    now() < first ||
    now() - first >= CLAIM_RETRY_WINDOW_MS
  )
    return 'reconcile';

  if (!(await send())) return 'pending';
  // Provider acceptance may race another worker's successful settlement.
  // A failed commit leaves the pending hold and retries the SAME provider key.
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await store.getDocSnapshot(path);
    if (latest?.fields.status === 'delivered') return 'delivered';
    if (!latest || latest.fields.payloadHash !== payloadHash) return 'reconcile';
    try {
      await store.commitWrites([
        conditionalWrite(path, latest, { status: 'delivered', deliveredAt: now() }),
      ]);
      return 'delivered';
    } catch (error) {
      if (!error.conflict) throw error;
    }
  }
  return 'pending';
}
