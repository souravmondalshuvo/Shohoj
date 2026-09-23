/**
 * Campus exterior model loading (#750) — the transport half, kept free of
 * three.js so node tests can import it directly.
 *
 * The exterior of the revision-4 BRACU campus model ships as a quantized GLB,
 * gzipped at build time (scripts/build_campus_model.sh). GitHub Pages does not
 * compress binary types, so the client gunzips it with the browser's built-in
 * DecompressionStream — no WebAssembly decoder, which the production CSP (no
 * 'wasm-unsafe-eval') would block.
 */

/**
 * The model's academic floor plate, in metres (identical on floors 1–12). The
 * export already centres it on the scene origin at the scene's floor heights;
 * the scene sizes its floor slabs to this so rooms sit inside the building.
 */
export const MODEL_FLOOR_PLATE = { width: 64, depth: 52.5 } as const;

/**
 * Scene y of the model's ground level. The export shifts the model down 3.17 m
 * so its floor slabs line up with the scene's (floor 1 at y = 0); the site
 * surface, at Blender z ≈ 0, lands here.
 */
export const MODEL_GROUND_Y = -3.17;

/** Lifecycle of the exterior model, surfaced to the route for tests/fallback. */
export type ExteriorModelState = 'loading' | 'loaded' | 'failed' | 'unavailable';

/** True when this runtime can gunzip a fetched stream without a decoder library. */
export function canDecompressGzip(): boolean {
  return typeof DecompressionStream === 'function';
}

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, i) => bytes[i] === byte);
}

const GZIP_MAGIC = [0x1f, 0x8b] as const;
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46] as const; // "glTF"

/** True when the buffer starts with the binary glTF header. */
export function isGlb(buffer: ArrayBuffer): boolean {
  return buffer.byteLength >= 12 && hasMagic(new Uint8Array(buffer, 0, 4), GLB_MAGIC);
}

/**
 * Gunzip a buffer. A buffer that is already a GLB passes through untouched —
 * a host that serves the .gz with `Content-Encoding: gzip` hands fetch the
 * decoded bytes, and that must not be treated as corrupt.
 */
export async function gunzipIfNeeded(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2));
  if (!hasMagic(head, GZIP_MAGIC)) return buffer;
  if (!canDecompressGzip()) throw new Error('DecompressionStream is unavailable');
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/**
 * Fetch the gzipped exterior and return the GLB bytes. Rejects on a non-2xx
 * response or anything that isn't a GLB once decompressed; honours `signal`.
 */
export async function fetchExteriorGlb(
  url: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(url, { signal: signal ?? null });
  if (!response.ok) throw new Error(`exterior model: HTTP ${response.status}`);
  const glb = await gunzipIfNeeded(await response.arrayBuffer());
  if (!isGlb(glb)) throw new Error('exterior model: not a GLB');
  return glb;
}
