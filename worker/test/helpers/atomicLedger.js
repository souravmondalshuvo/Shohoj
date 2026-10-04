// Extend endpoint-specific fixtures with versioned, atomic AI ledger storage.
// The fixture still supplies initial reads and observes writes for assertions.
export function withAtomicLedger(handler) {
  const docs = new Map();
  let version = 0;
  const stamp = () => `2026-09-26T00:00:00.${String(++version).padStart(9, '0')}Z`;
  const isLedger = (path) => /^(assistantBudget|assistantDailyQuota|assistantAdmissions|lostFoundDeliveries)\//.test(path);
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || 'GET';
    if (url.hostname !== 'firestore.googleapis.com') return handler(input, init);
    if (url.pathname.endsWith('/documents:commit')) {
      const writes = JSON.parse(init.body).writes;
      const staged = new Map(docs);
      for (const write of writes) {
        const path = (write.update?.name || write.delete).split('/documents/')[1];
        if (!isLedger(path)) throw new Error('Unexpected atomic collection');
        const old = docs.get(path);
        const condition = write.currentDocument;
        if ((condition?.exists === false && old) || (condition?.updateTime && old?.updateTime !== condition.updateTime)) {
          return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
        }
        if (write.delete) staged.delete(path);
        else {
          if (!write.updateMask) throw new Error('Atomic ledger writes must carry field masks');
          const fields = { ...old?.fields };
          for (const field of write.updateMask.fieldPaths) {
            if (Object.hasOwn(write.update.fields, field)) fields[field] = write.update.fields[field];
            else delete fields[field];
          }
          staged.set(path, { fields, updateTime: stamp() });
        }
      }
      // Capture writes in the existing fixture's observer; admission records
      // are internal to this stateful store.
      for (const write of writes) {
        const path = write.update?.name.split('/documents/')[1];
        if (path && !path.startsWith('assistantAdmissions/') && !path.startsWith('lostFoundDeliveries/')) {
          const result = await handler(`${url.origin}/v1/${write.update.name}`, {
            method: 'PATCH', body: JSON.stringify({ fields: staged.get(path).fields }),
          });
          if (!result.ok) return result;
        }
      }
      docs.clear();
      for (const [key, value] of staged) docs.set(key, value);
      return Response.json({});
    }
    const path = url.pathname.split('/documents/')[1];
    if (method === 'GET' && isLedger(path)) {
      if (docs.has(path)) return Response.json(docs.get(path));
      if (path.startsWith('assistantAdmissions/') || path.startsWith('lostFoundDeliveries/')) return new Response('{}', { status: 404 });
      const response = await handler(input, init);
      if (!response.ok) return response;
      const data = await response.json();
      const document = { ...data, fields: data.fields || {}, updateTime: stamp() };
      docs.set(path, document);
      return Response.json(document);
    }
    return handler(input, init);
  };
}
