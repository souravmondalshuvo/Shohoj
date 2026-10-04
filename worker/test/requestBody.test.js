import test from 'node:test';
import assert from 'node:assert/strict';
import { BodyTooLarge, readBoundedBytes, readBoundedJson } from '../requestBody.js';

const encode = (value) => new TextEncoder().encode(value);
const request = (body, headers = {}) =>
  new Request('https://shohoj.example.invalid', {
    method: 'POST',
    headers,
    body,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });

function streamed(chunks, { headers = {}, cancel = () => {} } = {}) {
  let reads = 0;
  let cancellations = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        reads++;
        if (chunks.length) controller.enqueue(chunks.shift());
        else controller.close();
      },
      cancel(reason) {
        cancellations++;
        return cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  return {
    request: request(body, headers),
    reads: () => reads,
    cancellations: () => cancellations,
  };
}

test('actual byte count rejects omitted, understated, and invalid Content-Length', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': 'invalid' }]) {
    await assert.rejects(readBoundedJson(request('{"ok":true}', headers), 10), BodyTooLarge);
  }
});

test('an oversized declaration rejects and cancels without reading the body', async () => {
  const stream = streamed([encode('{}')], { headers: { 'Content-Length': '100' } });
  await assert.rejects(readBoundedJson(stream.request, 2), BodyTooLarge);
  assert.equal(stream.reads(), 0);
  assert.equal(stream.cancellations(), 1);
  assert.equal(stream.request.body.locked, false);
});

test('chunked bodies stop at the first oversized chunk and release the reader', async () => {
  const stream = streamed([encode('123'), encode('456'), encode('789')]);
  await assert.rejects(readBoundedBytes(stream.request, 5), BodyTooLarge);
  assert.equal(stream.reads(), 2);
  assert.equal(stream.cancellations(), 1);
  assert.equal(stream.request.body.locked, false);
});

test(
  'an indefinitely pending cancellation cannot delay an oversized response',
  { timeout: 1000 },
  async () => {
    for (const headers of [{}, { 'Content-Length': '100' }]) {
      const stream = streamed([encode('oversized')], {
        headers,
        cancel: () => new Promise(() => {}),
      });
      await assert.rejects(readBoundedBytes(stream.request, 2), BodyTooLarge);
      assert.equal(stream.cancellations(), 1);
      assert.equal(stream.request.body.locked, false);
    }
  },
);

test('a failed cancellation preserves the body-limit error', async () => {
  const stream = streamed([encode('oversized')], {
    cancel: () => Promise.reject(new Error('cancel failed')),
  });
  await assert.rejects(readBoundedBytes(stream.request, 2), BodyTooLarge);
});

test('UTF-8 is limited by bytes rather than JavaScript character length', async () => {
  const json = '{"message":"বাংলা🙂"}';
  const bytes = encode(json);
  assert.ok(bytes.byteLength > json.length);
  assert.deepEqual(await readBoundedJson(request(json), bytes.byteLength), JSON.parse(json));
  await assert.rejects(readBoundedJson(request(json), bytes.byteLength - 1), BodyTooLarge);
});

test('JSON at the exact boundary works across arbitrary UTF-8 chunk boundaries', async () => {
  const json = '{"message":"🙂"}';
  const bytes = encode(json);
  const stream = streamed(Array.from(bytes, (byte) => new Uint8Array([byte])));
  assert.deepEqual(await readBoundedJson(stream.request, bytes.byteLength), { message: '🙂' });
  assert.equal(stream.cancellations(), 0);
});

test('malformed JSON and invalid UTF-8 reject after bounded reading', async () => {
  await assert.rejects(readBoundedJson(request('{"bad":}'), 100), SyntaxError);
  await assert.rejects(readBoundedJson(request(new Uint8Array([0xff])), 100), TypeError);
});

test('binary data is preserved byte-for-byte within the limit', async () => {
  const input = new Uint8Array([0, 255, 128, 0, 13, 10]);
  const stream = streamed([input.subarray(0, 2), input.subarray(2)]);
  assert.deepEqual(await readBoundedBytes(stream.request, input.byteLength), input);
});

test('small views and many empty chunks do not retain an oversized backing buffer', async () => {
  const backing = new Uint8Array(1024 * 1024);
  backing[900000] = 7;
  const stream = streamed([
    ...Array.from({ length: 100 }, () => new Uint8Array(0)),
    backing.subarray(900000, 900001),
  ]);
  const bytes = await readBoundedBytes(stream.request, 2);
  assert.deepEqual(bytes, new Uint8Array([7]));
  assert.ok(bytes.buffer.byteLength <= 2);
});

test('a missing body is empty binary data and invalid JSON', async () => {
  assert.deepEqual(await readBoundedBytes(request(undefined), 0), new Uint8Array(0));
  await assert.rejects(readBoundedJson(request(undefined), 0), SyntaxError);
  await assert.rejects(readBoundedBytes(request('x'), 0), BodyTooLarge);
});

test('invalid byte limits reject before consuming input', async () => {
  for (const limit of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const stream = streamed([encode('{}')]);
    await assert.rejects(readBoundedBytes(stream.request, limit), RangeError);
    assert.equal(stream.reads(), 0);
  }
});

test('a stream read failure is propagated and releases the lock', async () => {
  const failure = new Error('stream failed');
  const body = new ReadableStream({
    pull(controller) {
      controller.error(failure);
    },
  });
  await assert.rejects(readBoundedBytes(request(body), 10), (error) => error === failure);
  assert.equal(body.locked, false);
});
