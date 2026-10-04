// Narrow CAS adapter for security-sensitive writes. Existing PATCH/replacement
// callers are deliberately unchanged. Firestore commit is atomic across writes.
export function createFirestoreAtomicStore({
  baseUrl,
  token,
  toFields,
  fromFields,
  fetchImpl = fetch,
}) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const documentBase = baseUrl.replace('https://firestore.googleapis.com/v1/', '');
  return {
    async getDocSnapshot(path) {
      const response = await fetchImpl(`${baseUrl}/${path}`, { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Firestore snapshot failed: ${response.status}`);
      const doc = await response.json();
      if (!doc.updateTime) throw new Error('Firestore snapshot has no updateTime');
      return { fields: fromFields(doc.fields || {}), updateTime: doc.updateTime };
    },
    async commitWrites(writes) {
      const body = {
        writes: writes.map(({ path, fields, updateTime, exists, delete: remove }) => {
          const name = `${documentBase}/${path}`;
          const currentDocument = updateTime
            ? { updateTime }
            : exists === false
              ? { exists: false }
              : null;
          if (!currentDocument && !remove) throw new Error('Atomic write requires a precondition');
          return remove
            ? { delete: name, ...(currentDocument ? { currentDocument } : {}) }
            : {
                update: { name, fields: toFields(fields) },
                updateMask: { fieldPaths: Object.keys(fields) },
                currentDocument,
              };
        }),
      };
      const response = await fetchImpl(`${baseUrl}:commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const status = (await response.json().catch(() => null))?.error?.status;
        const error = new Error(`Firestore commit failed: ${response.status}`);
        error.conflict =
          response.status === 409 ||
          response.status === 412 ||
          status === 'FAILED_PRECONDITION' ||
          status === 'ABORTED';
        throw error;
      }
    },
  };
}

export function conditionalWrite(path, snapshot, fields) {
  return { path, fields, ...(snapshot ? { updateTime: snapshot.updateTime } : { exists: false }) };
}
