export function getPapersWorkerUrl() {
  const u = window._shohoj_papers_worker_url;
  return (typeof u === 'string' && u.startsWith('http')) ? u.replace(/\/$/, '') : null;
}

export async function getCurrentUserIdToken(currentUser) {
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken();
  } catch (_e) {
    return null;
  }
}
