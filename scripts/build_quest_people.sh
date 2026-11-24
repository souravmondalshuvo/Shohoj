#!/usr/bin/env bash
# scripts/build_quest_people.sh
#
# Rebuilds the people of Shohoj Quest's 3D zone (#981) from two CC0 packs by
# Quaternius, downloaded from itch.io (free "Standard" tier) and unzipped:
#
#   Universal Base Characters [Standard]   two rigged bodies and hairstyles
#   Universal Animation Library [Standard] animations on the same skeleton
#
#   1. Blender (headless) turns each body into a figure the zone dresses at
#      run time: parts of the body in its vertex colours, clothes smoothed, a
#      skirt, hairstyles bound, no textures       -> scripts/quest_people_export.py
#      The man's file also carries the animations; the woman plays the same
#      ones, matched by bone name.
#   2. gltf-transform quantizes it (KHR_mesh_quantization, which GLTFLoader
#      reads natively). Not Draco or meshopt: their decoders are WebAssembly,
#      which the production CSP does not allow.
#   3. gzip -9 -n. GitHub Pages does not compress binary types; the zone
#      gunzips with the browser's DecompressionStream, as the Campus Map does.
#
# Usage:
#   npm run build:quest-people -- "/path/Universal Base Characters[Standard]" \
#                                 "/path/Universal Animation Library[Standard]"
#   BLENDER=/path/to/Blender npm run build:quest-people -- <characters> <animations>
#
# Output (committed): src/features/quest/assets/people/{man,woman}.glb.gz

set -euo pipefail

CHARACTERS="${1:?usage: build_quest_people.sh <Universal Base Characters dir> <Universal Animation Library dir>}"
ANIMATIONS="${2:?usage: build_quest_people.sh <Universal Base Characters dir> <Universal Animation Library dir>}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
GLTF_TRANSFORM_VERSION="4.5.0"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/src/features/quest/assets/people"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

BODIES="$CHARACTERS/Base Characters/Godot - UE"
HAIR="$CHARACTERS/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)"
CLIPS="$ANIMATIONS/Unreal-Godot/UAL1_Standard.glb"
for need in "$BODIES/Superhero_Male_FullBody.gltf" "$BODIES/Superhero_Female_FullBody.gltf" "$HAIR/Hair_Buns.gltf" "$CLIPS"; do
  [ -f "$need" ] || { echo "missing: $need" >&2; exit 1; }
done
command -v "$BLENDER" >/dev/null || [ -x "$BLENDER" ] || {
  echo "Blender not found at $BLENDER (set BLENDER=...)" >&2
  exit 1
}

echo "==> Blender $("$BLENDER" --version | head -1)"
# Arguments: body, its skin texture (read for shading only), eye texture,
# output, then options and hairstyles.
"$BLENDER" -b --python "$ROOT/scripts/quest_people_export.py" -- \
  "$BODIES/Superhero_Male_FullBody.gltf" "$BODIES/T_Superhero_Male_Dark.png" "$BODIES/T_Eye_Brown.png" \
  "$WORK/man.glb" --clips "$CLIPS" "$HAIR/Hair_SimpleParted.gltf" "$HAIR/Hair_Beard.gltf" \
  | grep -E '^quest_people_export:|Error' || true
"$BLENDER" -b --python "$ROOT/scripts/quest_people_export.py" -- \
  "$BODIES/Superhero_Female_FullBody.gltf" "$BODIES/T_Superhero_Female_Dark_BaseColor.png" "$BODIES/T_Eye_Brown.png" \
  "$WORK/woman.glb" --pallu "$HAIR/Hair_Buns.gltf" "$HAIR/Hair_Long.gltf" \
  | grep -E '^quest_people_export:|Error' || true

mkdir -p "$OUT_DIR"
kb() { echo $(( $(wc -c < "$1") / 1024 )); }
for figure in man woman; do
  [ -s "$WORK/$figure.glb" ] || { echo "Blender export produced nothing for $figure" >&2; exit 1; }
  # --palette false: a palette is baked into a texture (a blob: URL the CSP
  # rejects). --simplify false: the bodies are already light.
  npx -y "@gltf-transform/cli@$GLTF_TRANSFORM_VERSION" optimize "$WORK/$figure.glb" "$WORK/$figure.q.glb" \
    --compress quantize --texture-compress false --simplify false --palette false \
    --instance false --join false --flatten false >/dev/null
  gzip -9 -n -c "$WORK/$figure.q.glb" > "$WORK/$figure.glb.gz"
  echo "==> $figure: raw $(kb "$WORK/$figure.glb") KB -> quantized $(kb "$WORK/$figure.q.glb") KB -> gzip $(kb "$WORK/$figure.glb.gz") KB"
done
# Only now, with both built: a failure above leaves the committed pair as it
# was, never a new man beside an old woman.
for figure in man woman; do
  mv "$WORK/$figure.glb.gz" "$OUT_DIR/$figure.glb.gz"
  echo "    $OUT_DIR/$figure.glb.gz"
done
