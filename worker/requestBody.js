export class BodyTooLarge extends Error {
  constructor(message = 'Request body too large') {
    super(message);
    this.name = 'BodyTooLarge';
  }
}

function cancelWithoutWaiting(stream, reason) {
  // A source can leave cancellation pending indefinitely. Signal cancellation,
  // but do not let its cleanup delay the rejection or produce an unhandled error.
  try {
    void stream.cancel(reason).catch(() => {});
  } catch {
    // Preserve the original body-limit error if the source is already closed.
  }
}

export async function readBoundedBytes(request, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a nonnegative safe integer');
  }
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    const error = new BodyTooLarge();
    if (request.body) cancelWithoutWaiting(request.body, error);
    throw error;
  }
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  let bytes = new Uint8Array(0);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        const error = new TypeError('Request body must contain bytes');
        cancelWithoutWaiting(reader, error);
        throw error;
      }
      if (value.byteLength > maxBytes - size) {
        const error = new BodyTooLarge();
        cancelWithoutWaiting(reader, error);
        throw error;
      }
      const nextSize = size + value.byteLength;
      if (nextSize > bytes.byteLength) {
        // The retained buffer is capped even for tiny or empty chunks. Copying
        // also avoids retaining a large backing buffer behind a small view.
        const grown = new Uint8Array(
          Math.min(maxBytes, Math.max(nextSize, bytes.byteLength * 2, 4096)),
        );
        grown.set(bytes.subarray(0, size));
        bytes = grown;
      }
      bytes.set(value, size);
      size = nextSize;
    }
  } finally {
    reader.releaseLock();
  }
  return bytes.subarray(0, size);
}

export async function readBoundedJson(request, maxBytes) {
  const bytes = await readBoundedBytes(request, maxBytes);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
