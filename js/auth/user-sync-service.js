export function parseStoredState(raw, source = 'storage') {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Shohoj] Ignoring invalid ${source} state:`, e);
    return null;
  }
}

export function getDataFingerprint(raw) {
  if (!raw) return '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { updatedAt, _serverTimestamp, ...dataOnly } = parsed;
    return JSON.stringify(dataOnly);
  } catch (_e) {
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}
