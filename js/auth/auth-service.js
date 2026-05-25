export function isSafeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return /(^|\.)googleusercontent\.com$/i.test(u.hostname);
  } catch (_e) {
    return false;
  }
}

export function firstDisplayName(displayName) {
  return String(displayName || '').split(' ')[0] || 'you';
}
