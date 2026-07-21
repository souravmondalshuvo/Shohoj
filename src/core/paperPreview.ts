/**
 * Paper preview MIME helpers (#375 / #440). Pre-migration R2 objects were
 * stored without a Content-Type, so downloads arrive as octet-stream and a
 * preview iframe renders blank. Sniff the magic bytes and re-wrap the blob
 * with the real type — same logic as the legacy client and the Worker.
 */

/** Detect PDF/PNG/JPEG/GIF/WebP from the first bytes; null when unknown. */
export function sniffPreviewMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 4) return null;
  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // GIF: "GIF"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  // WEBP: "RIFF"…"WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/**
 * When the server hands back a generic/empty Content-Type, re-wrap the blob
 * with the sniffed type so the preview renders inline instead of blank.
 * Already-typed PDF/image blobs pass through untouched.
 */
export async function retypeGenericBlob(blob: Blob): Promise<Blob> {
  const t = (blob.type || '').toLowerCase();
  if (t === 'application/pdf' || t.startsWith('image/')) return blob;
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const sniffed = sniffPreviewMime(head);
    if (sniffed) return new Blob([blob], { type: sniffed });
  } catch {
    // Sniff failed — fall through to the original blob.
  }
  return blob;
}
