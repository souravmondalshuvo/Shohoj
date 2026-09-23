# scripts/campus_model_export.py
#
# Blender-side half of the campus exterior pipeline (#750). Run headless by
# scripts/build_campus_model.sh — not directly:
#
#   Blender -b <campus.blend> --python scripts/campus_model_export.py -- <out.glb>
#
# Exports the revision-4 BRACU model's "Exterior | Approximate shell"
# collection (building, planted screens, canopy, podium, roof and site — no
# interiors) as a GLB already placed in the Campus Map scene's coordinates, so
# the runtime adds it without any transform:
#
#   * The model's academic floor plate (64 x 52.5 m, identical on floors 1-12)
#     is centred on Blender y = -4.25; the scene centres its slabs on the
#     origin. Shift +4.25 m in Blender y (glTF -z).
#   * The model's floor f slab is centred at z = f * 3.1 + 0.07; the scene puts
#     floor f at y = (f - 1) * 3.1 (FLOOR_GAP 3.1 matches). Shift -3.17 m.
#
# Both shifts go on the collection's single root empty, so the hierarchy the
# glTF exporter writes carries them. Verified against Blender 5.2.1 LTS.

import sys

import bpy

EXTERIOR_COLLECTION = 'Exterior | Approximate shell'
# Blender-space offset applied to the exterior root (x, y, z), in metres.
SCENE_OFFSET = (0.0, 4.25, -3.17)


def main() -> None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: ... --python campus_model_export.py -- <out.glb>')
    out_path = argv[0]

    collection = bpy.data.collections.get(EXTERIOR_COLLECTION)
    if collection is None:
        raise SystemExit(f'collection not found: {EXTERIOR_COLLECTION!r}')
    objects = list(collection.all_objects)
    roots = [o for o in objects if o.parent is None]
    if len(roots) != 1:
        raise SystemExit(f'expected one root in {EXTERIOR_COLLECTION!r}, found {len(roots)}')

    root = roots[0]
    root.location = tuple(a + b for a, b in zip(root.location, SCENE_OFFSET))

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_normals=True,
        # The model's materials are flat colours — no textures, so no UVs.
        export_texcoords=False,
        export_extras=False,
        export_yup=True,
    )
    meshes = sum(1 for o in objects if o.type == 'MESH')
    print(f'campus_model_export: {meshes} meshes -> {out_path}')


main()
