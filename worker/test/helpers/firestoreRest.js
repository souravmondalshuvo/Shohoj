// Stateful REST fake: PATCH without a mask replaces, masked writes merge, and
// commit preconditions are checked together before any writes become visible.
export const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key,
  value === null ? { nullValue: null } : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
      : typeof value === 'string' ? { stringValue: value } : { mapValue: { fields: toFields(value) } },
]));
export const fromFields = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key,
  'stringValue' in value ? value.stringValue : 'integerValue' in value ? Number(value.integerValue)
    : 'doubleValue' in value ? value.doubleValue : 'booleanValue' in value ? value.booleanValue
      : 'mapValue' in value ? fromFields(value.mapValue.fields) : null,
]));
export function firestoreRest() {
  const docs = new Map();
  let version = 0;
  const stamp = () => `2026-09-26T00:00:00.${String(++version).padStart(9, '0')}Z`;
  const put = (path, fields) => docs.set(path, { fields, updateTime: stamp() });
  const apply = (path, fields, mask) => {
    if (!mask) return put(path, structuredClone(fields));
    const next = { ...docs.get(path)?.fields };
    for (const field of mask) {
      if (Object.hasOwn(fields, field)) next[field] = fields[field];
      else delete next[field];
    }
    put(path, next);
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname !== 'firestore.googleapis.com') throw new Error(`Unexpected fake destination: ${url.hostname}`);
    const path = url.pathname.split('/documents/')[1];
    const method = init.method || 'GET';
    if (method === 'POST' && url.pathname.endsWith('/documents:commit')) {
      const writes = JSON.parse(init.body).writes;
      for (const w of writes) {
        const p = (w.update?.name || w.delete).split('/documents/')[1];
        const old = docs.get(p);
        if ((w.currentDocument?.exists === false && old) || (w.currentDocument?.updateTime && old?.updateTime !== w.currentDocument.updateTime)) {
          return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
        }
      }
      // No await between validation and writes: one atomic operation.
      for (const w of writes) {
        const p = (w.update?.name || w.delete).split('/documents/')[1];
        if (w.delete) docs.delete(p);
        else apply(p, w.update.fields, w.updateMask?.fieldPaths);
      }
      return Response.json({});
    }
    if (method === 'PATCH') {
      const mask = url.searchParams.getAll('updateMask.fieldPaths');
      apply(path, JSON.parse(init.body).fields, mask.length ? mask : null);
      return Response.json(docs.get(path));
    }
    if (method === 'DELETE') { docs.delete(path); return Response.json({}); }
    if (method !== 'GET') throw new Error('Unexpected fake REST method');
    if (path.split('/').length % 2 === 1) {
      return Response.json({ documents: [...docs].filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(([key, value]) => ({ name: 'projects/p/databases/(default)/documents/' + key, ...value })) });
    }
    return docs.has(path) ? Response.json(docs.get(path)) : new Response('{}', { status: 404 });
  };
  return { docs, fetch, seed: (path, fields) => put(path, toFields(fields)), read: (path) => docs.has(path) ? fromFields(docs.get(path).fields) : null };
}
