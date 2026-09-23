# scripts/campus_model_export.py
#
# Blender-side half of the campus model pipeline (#750, #755). Run headless by
# scripts/build_campus_model.sh — not directly:
#
#   Blender -b <campus.blend> --python scripts/campus_model_export.py -- <out.glb>
#
# Exports the revision-4 BRACU model as the BUILDING a visitor sees: the
# exterior collection AND the architecture of every floor collection — slabs,
# terraces, core, walls, ceilings, stairs, escalators, lift. The floor
# collections are not optional: in this .blend they are what make the
# building solid; the exterior collection alone is a see-through cage of
# façade screens (#755). Only furniture and fit-out are left out (FURNITURE
# below): they are most of the vertex count, invisible from outside, and a
# render of the building without them matches the full model.
#
# The GLB is written already placed in the Campus Map scene's coordinates, so
# the runtime adds it without any transform:
#
#   * The model's academic floor plate (64 x 52.5 m, identical on floors 1-12)
#     is centred on Blender y = -4.25; the scene centres its slabs on the
#     origin. Shift +4.25 m in Blender y (glTF -z).
#   * The model's floor f slab is centred at z = f * 3.1 + 0.07; the scene puts
#     floor f at y = (f - 1) * 3.1 (FLOOR_GAP 3.1 matches). Shift -3.17 m.
#
# Both shifts go on the model's single root empty, so the hierarchy the glTF
# exporter writes carries them. Verified against Blender 5.2.1 LTS.

import sys

import bpy

COLLECTIONS = ('Exterior | Approximate shell', 'CAMPUS | Editable geometry')
# Blender-space offset applied to the model root (x, y, z), in metres.
SCENE_OFFSET = (0.0, 4.25, -3.17)
# Furniture and fit-out materials. A mesh using any of these is left out.
FURNITURE = frozenset({
    'Interior | steel',            # desk and chair frames
    'Interior | charcoal',         # seats, boards
    'Interior | teal upholstery',
    'Interior | timber',           # desk tops, shelving
    'Interior | monitor glass',
    'Library | books',
    'Interior | foliage',          # indoor planters
    'Interior | ceiling lights',   # light panels
})


def is_furniture(obj: bpy.types.Object) -> bool:
    return any(slot.material and slot.material.name in FURNITURE for slot in obj.material_slots)


def main() -> None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: ... --python campus_model_export.py -- <out.glb>')
    out_path = argv[0]

    objects = set()
    for name in COLLECTIONS:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise SystemExit(f'collection not found: {name!r}')
        objects.update(collection.all_objects)

    roots = [o for o in objects if o.parent is None]
    if len(roots) != 1:
        raise SystemExit(f'expected one model root, found {len(roots)}: {[r.name for r in roots]}')
    root = roots[0]
    root.location = tuple(a + b for a, b in zip(root.location, SCENE_OFFSET))

    bpy.ops.object.select_all(action='DESELECT')
    kept = skipped = 0
    for obj in objects:
        if obj.type == 'MESH':
            # Hidden in the .blend means not part of the building.
            if obj.hide_render or not obj.visible_get() or is_furniture(obj):
                skipped += 1
                continue
            kept += 1
        # Empties are kept so the hierarchy (and the root offset) survives.
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
    print(f'campus_model_export: {kept} meshes ({skipped} furniture/hidden left out) -> {out_path}')


main()
