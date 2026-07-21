// src/services/storage/userSync.ts
//
// Typed port of js/auth/user-sync-service.js (#333): the two tiny pure
// helpers the cloud-sync flow leans on. Kept byte-faithful — the fingerprint
// is what decides "same data" everywhere (sign-in matrix, realtime snapshots),
// so any drift here would change conflict behavior.

/** Parse a stored state string; null (never a throw) on missing/invalid. */
export function parseStoredState(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Semantic fingerprint of a stored snapshot: the JSON with the sync metadata
 * (`updatedAt`, `_serverTimestamp`) stripped, so a metadata-only difference
 * never counts as a data change. Unparseable input falls back to the raw
 * string (legacy parity), '' for empty.
 */
export function getDataFingerprint(raw: unknown): string {
  if (!raw) return '';
  try {
    const parsed =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>);
    const { updatedAt: _u, _serverTimestamp: _s, ...dataOnly } = parsed;
    return JSON.stringify(dataOnly);
  } catch {
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}
