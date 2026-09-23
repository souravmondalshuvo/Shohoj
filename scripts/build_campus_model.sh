#!/usr/bin/env bash
# scripts/build_campus_model.sh
#
# Rebuilds the Campus Map's exterior model (#750) from the revision-4 BRACU
# campus .blend:
#
#   1. Blender (headless) exports the exterior collection, already placed in
#      scene coordinates          -> scripts/campus_model_export.py
#   2. gltf-transform quantizes it with KHR_mesh_quantization, which three's
#      GLTFLoader decodes natively. Draco/meshopt are deliberately NOT used:
#      their decoders are WebAssembly and the production CSP has no
#      'wasm-unsafe-eval'.
#   3. gzip -9 -n (deterministic: no name, no timestamp). GitHub Pages does not
#      compress binary types, so the client gunzips it with the browser's
#      DecompressionStream instead of relying on Content-Encoding.
#
# Usage:
#   npm run build:campus-model -- /path/to/BRACU-Campus.blend
#   BLENDER=/path/to/Blender npm run build:campus-model -- model.blend
#
# Output: src/features/campus/assets/bracu-exterior.glb.gz (committed).

set -euo pipefail

BLEND="${1:?usage: build_campus_model.sh <campus.blend>}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
GLTF_TRANSFORM_VERSION="4.5.0"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/features/campus/assets/bracu-exterior.glb.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -f "$BLEND" ] || { echo "no such .blend: $BLEND" >&2; exit 1; }
command -v "$BLENDER" >/dev/null || [ -x "$BLENDER" ] || {
  echo "Blender not found at $BLENDER (set BLENDER=...)" >&2
  exit 1
}

echo "==> Blender $("$BLENDER" --version | head -1)"
"$BLENDER" -b "$BLEND" --python "$ROOT/scripts/campus_model_export.py" -- "$WORK/raw.glb" \
  | grep -E '^campus_model_export:|Error' || true
[ -s "$WORK/raw.glb" ] || { echo "Blender export produced nothing" >&2; exit 1; }

echo "==> gltf-transform $GLTF_TRANSFORM_VERSION (quantize)"
# --palette false: the default bakes flat colours into a palette TEXTURE, which
# GLTFLoader loads through a blob: URL that the CSP's img-src rejects — and it
# would flatten the model's own materials (glass opacity) into one.
npx -y "@gltf-transform/cli@$GLTF_TRANSFORM_VERSION" optimize "$WORK/raw.glb" "$WORK/quantized.glb" \
  --compress quantize --texture-compress false --simplify false --palette false >/dev/null

mkdir -p "$(dirname "$OUT")"
gzip -9 -n -c "$WORK/quantized.glb" > "$OUT"

kb() { echo $(( $(wc -c < "$1") / 1024 )); }
echo "==> raw $(kb "$WORK/raw.glb") KB -> quantized $(kb "$WORK/quantized.glb") KB -> gzip $(kb "$OUT") KB"
echo "    $OUT"
