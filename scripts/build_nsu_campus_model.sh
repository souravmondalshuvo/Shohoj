#!/usr/bin/env bash
# scripts/build_nsu_campus_model.sh
#
# Rebuilds the 3D campus NSU's Campus Map loads (#873). Unlike BRACU's model,
# which is exported from a .blend its owner keeps, NSU's is generated: the
# whole campus is scripts/nsu_campus_model.py, so this needs no input file.
#
#   1. Blender (headless) runs the generator in its web mode (NSU_WEB): the
#      buildings as seen from outside, one node per building, storey and roof —
#      the Campus Map opens a floor by switching off the storeys above it.
#   2. gltf-transform quantizes it (KHR_mesh_quantization, decoded natively by
#      three's GLTFLoader). Draco/meshopt are NOT used: their decoders are
#      WebAssembly, which the production CSP does not allow. --join/--flatten
#      are off because they would merge the per-storey nodes away.
#   3. gzip -9 -n (deterministic). GitHub Pages does not compress binary types,
#      so the client gunzips it with DecompressionStream.
#
# Usage:
#   npm run build:nsu-campus-model
#   BLENDER=/path/to/Blender npm run build:nsu-campus-model
#
# Output: src/features/campus/assets/nsu-campus.glb.gz (committed).

set -euo pipefail

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
GLTF_TRANSFORM_VERSION="4.5.0"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/features/campus/assets/nsu-campus.glb.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v "$BLENDER" >/dev/null || [ -x "$BLENDER" ] || {
  echo "Blender not found at $BLENDER (set BLENDER=...)" >&2
  exit 1
}

echo "==> Blender $("$BLENDER" --version | head -1)"
NSU_WEB="$WORK/raw.glb" "$BLENDER" -b -P "$ROOT/scripts/nsu_campus_model.py" -- "$WORK" \
  | grep -E '^nsu_campus_model:|Error' || true
[ -s "$WORK/raw.glb" ] || { echo "Blender export produced nothing" >&2; exit 1; }

echo "==> gltf-transform $GLTF_TRANSFORM_VERSION (quantize)"
npx -y "@gltf-transform/cli@$GLTF_TRANSFORM_VERSION" optimize "$WORK/raw.glb" "$WORK/quantized.glb" \
  --compress quantize --texture-compress false --simplify false --palette false \
  --join false --flatten false --instance false >/dev/null

mkdir -p "$(dirname "$OUT")"
gzip -9 -n -c "$WORK/quantized.glb" > "$OUT"

kb() { echo $(( $(wc -c < "$1") / 1024 )); }
echo "==> raw $(kb "$WORK/raw.glb") KB -> quantized $(kb "$WORK/quantized.glb") KB -> gzip $(kb "$OUT") KB"
echo "    $OUT"
