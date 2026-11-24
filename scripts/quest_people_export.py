# scripts/quest_people_export.py
#
# Blender-side half of the Shohoj Quest people pipeline (#981). Run headless by
# scripts/build_quest_people.sh, not directly:
#
#   Blender -b --python scripts/quest_people_export.py -- \
#       <body.gltf> <body-basecolour.png> <eye-basecolour.png> <out.glb> \
#       [--clips <UAL1_Standard.glb>] [--pallu] <hair.gltf>...
#
# Turns one of Quaternius's CC0 Universal Base Characters into a village
# figure the 3D zone can dress at run time, with no textures at all:
#
#   * The body keeps its skeleton and skin weights. Each vertex is given the
#     part of the body it moves with (head, hand, forearm, upper arm, torso,
#     hips, thigh, calf, foot), from its bone weights, and that part is written
#     to the red channel of its colour; the green channel is how light or dark
#     the original skin texture is there (lips, brows, the hollows of the
#     face). The zone turns parts into colours per person: a shirt is "torso +
#     upper arm", a lungi is "hips + thigh + calf", and so on.
#   * Where clothes go, the sculpted muscles are smoothed away and the surface
#     is lifted a few millimetres, so a shirt reads as cloth, not paint.
#   * A plain tube skirt to the ankle is added, hung from the hips: a lungi or
#     a sari. It barely follows the legs, so only people who stand wear it; a
#     runner, a sitter or a kneeler gets trousers, or a lungi rolled to the
#     knee, painted on the legs.
#   * With --pallu, a band from the left shoulder to the right hip is marked
#     as its own part: the end of a sari, worn over the shoulder.
#   * Eyes keep their colours, baked from their texture into vertex colours.
#   * Hairstyles from the kit are bound to this skeleton (each was made on the
#     same body, so they sit on the head as they are).
#   * With --clips, the animations the zone uses are taken from Quaternius's
#     CC0 Universal Animation Library, which shares the skeleton. Only bone
#     rotations are kept, and the pelvis's position: the kit's bodies differ in
#     bone lengths, and rotations fit them all.
#
# Textures are left out on purpose. A GLB's embedded images reach three.js as
# blob: URLs, which the page's Content-Security-Policy does not allow for
# images; and at the size people are drawn, flat colour reads better anyway.
# Verified against Blender 5.2.1 LTS.

import math
import sys

import bmesh
import bpy
import numpy as np

# The animations the zone plays, from the Universal Animation Library.
CLIPS = (
    'Idle_Loop',
    'Jog_Fwd_Loop',
    'Idle_Talking_Loop',
    'Sitting_Idle_Loop',
    'Fixing_Kneeling',
)

# Parts of the body, in the order of their ids (red channel = id / 15).
PARTS = ('none', 'head', 'hand', 'forearm', 'upperarm', 'torso', 'hips', 'thigh', 'calf', 'foot', 'pallu')
PART_ID = {name: i for i, name in enumerate(PARTS)}
CLOTHED = ('upperarm', 'torso', 'hips', 'thigh')


def say(*words):
    print('quest_people_export:', *words)


def part_of_bone(bone):
    if bone in ('Head', 'neck_01'):
        return 'head'
    if bone.startswith(('hand_', 'index_', 'middle_', 'ring_', 'pinky_', 'thumb_')):
        return 'hand'
    if bone.startswith('lowerarm_'):
        return 'forearm'
    if bone.startswith('upperarm_'):
        return 'upperarm'
    if bone.startswith(('spine_', 'clavicle_')):
        return 'torso'
    if bone in ('pelvis', 'root'):
        return 'hips'
    if bone.startswith('thigh_'):
        return 'thigh'
    if bone.startswith('calf_'):
        return 'calf'
    if bone.startswith(('foot_', 'ball_')):
        return 'foot'
    return 'torso'


def parse(argv):
    args = argv[argv.index('--') + 1:]
    options = {'clips': None, 'pallu': False}
    rest = []
    i = 0
    while i < len(args):
        if args[i] == '--clips':
            options['clips'] = args[i + 1]
            i += 2
        elif args[i] == '--pallu':
            options['pallu'] = True
            i += 1
        else:
            rest.append(args[i])
            i += 1
    if len(rest) < 4:
        raise SystemExit('usage: <body.gltf> <body.png> <eye.png> <out.glb> [--clips ual.glb] [--pallu] <hair.gltf>...')
    options['body'], options['skin_png'], options['eye_png'], options['out'] = rest[:4]
    options['hairs'] = rest[4:]
    return options


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, merge_vertices=True)
    return [o for o in bpy.data.objects if o not in before]


def texture(path):
    image = bpy.data.images.load(path)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(h, w, 4), w, h


def vertex_uvs(mesh):
    """One UV per vertex (from the first loop that uses it), Blender's v-up."""
    uv_layer = mesh.uv_layers[0].data
    uvs = np.zeros((len(mesh.vertices), 2), dtype=np.float32)
    for loop in mesh.loops:
        uvs[loop.vertex_index] = uv_layer[loop.index].uv
    return uvs


def sample(pixels, w, h, uvs):
    u = np.clip((uvs[:, 0] % 1.0) * w, 0, w - 1).astype(int)
    v = np.clip((uvs[:, 1] % 1.0) * h, 0, h - 1).astype(int)
    return pixels[v, u, :3]


def strip_mesh(obj, keep_colours=False):
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    if not keep_colours:
        for attribute in list(mesh.color_attributes):
            mesh.color_attributes.remove(attribute)


def plain_material(obj, name):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    obj.data.materials.clear()
    obj.data.materials.append(material)


def set_colours(obj, colours):
    mesh = obj.data
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    attribute = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    flat = np.ones((len(mesh.vertices), 4), dtype=np.float32)
    flat[:, :3] = colours
    attribute.data.foreach_set('color', flat.ravel())
    mesh.color_attributes.active_color = attribute
    mesh.color_attributes.render_color_index = 0


def body_parts(obj):
    """Each vertex's part of the body, by which bones move it most."""
    names = {g.index: part_of_bone(g.name) for g in obj.vertex_groups}
    parts = []
    for vertex in obj.data.vertices:
        totals = {}
        for g in vertex.groups:
            part = names.get(g.group)
            if part:
                totals[part] = totals.get(part, 0.0) + g.weight
        parts.append(max(totals, key=totals.get) if totals else 'torso')
    return parts


def smooth_clothes(obj, parts):
    """Smooth the sculpted muscles under clothes away, and lift the cloth a little."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    # Plain averaging, a few gentle passes; open edges stay where they are.
    clothed = [
        v for v in bm.verts if parts[v.index] in CLOTHED and v.is_manifold and not v.is_boundary
    ]
    for _ in range(4):
        bmesh.ops.smooth_vert(
            bm,
            verts=clothed,
            factor=0.5,
            use_axis_x=True,
            use_axis_y=True,
            use_axis_z=True,
        )
    bm.normal_update()
    for v in clothed:
        v.co += v.normal * 0.006
    bm.to_mesh(obj.data)
    bm.free()


def pallu(obj, parts):
    """A sari's end: a band from the left shoulder down to the right hip."""
    a = np.array((0.19, 1.43))  # left shoulder (x, z); the figure's left is +x
    b = np.array((-0.17, 0.93))  # right hip
    d = (b - a) / np.linalg.norm(b - a)
    out = list(parts)
    for i, v in enumerate(obj.data.vertices):
        if parts[i] not in ('torso', 'hips', 'upperarm'):
            continue
        p = np.array((v.co.x, v.co.z)) - a
        along = float(p @ d)
        across = abs(float(p[0] * d[1] - p[1] * d[0]))
        if -0.06 <= along <= np.linalg.norm(b - a) + 0.05 and across < 0.075:
            out[i] = 'pallu'
    return out


def skirt(armature, body, parts, name, hem_z):
    """
    A straight tube from the waist to `hem_z`: a lungi, or a sari's skirt.
    It hangs from the hips and follows the thighs only a little, so it is worn
    by people who stand; anyone who runs, sits or kneels is dressed without it.
    """
    co = np.array([v.co[:] for v in body.data.vertices])
    lower = np.array([p in ('hips', 'thigh') for p in parts])
    high = lower & (co[:, 2] > 0.8)
    waist_z = float(co[high, 2].max()) - 0.03 if high.any() else 1.0
    cy = float(co[lower, 1].mean())
    rings, segments = 8, 28
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    groups = {'pelvis': 0, 'thigh_l': 1, 'thigh_r': 2}  # this mesh's own groups
    grid = []
    widest = 0.0
    for r in range(rings):
        t = r / (rings - 1)
        z = waist_z + (hem_z - waist_z) * t
        near = np.abs(co[:, 2] - z) < 0.04
        band = near & (lower | (co[:, 2] < 0.55))
        band &= np.array([p not in ('hand', 'forearm') for p in parts])
        if band.any():
            reach = float(np.sqrt(co[band, 0] ** 2 + ((co[band, 1] - cy) / 0.86) ** 2).max())
            widest = max(widest, reach + 0.012)
        radius = widest + 0.02 * t * t
        ring = []
        for s in range(segments):
            angle = 2 * math.pi * s / segments
            x = math.cos(angle) * radius
            y = cy + math.sin(angle) * radius * 0.86
            vert = bm.verts.new((x, y, z))
            side = max(0.0, min(1.0, 0.5 + x / (radius * 1.2)))  # 1 = the left leg (+x)
            follow = 0.3 * t
            weights = {'pelvis': 1 - follow, 'thigh_l': follow * side, 'thigh_r': follow * (1 - side)}
            for bone, weight in weights.items():
                if weight > 1e-4:
                    vert[deform][groups[bone]] = weight
            ring.append(vert)
        grid.append(ring)
    for r in range(rings - 1):
        for s in range(segments):
            a, b = grid[r][s], grid[r][(s + 1) % segments]
            c, d = grid[r + 1][(s + 1) % segments], grid[r + 1][s]
            bm.faces.new((a, d, c, b))
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for group_name in ('pelvis', 'thigh_l', 'thigh_r'):
        obj.vertex_groups.new(name=group_name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj.parent = armature
    modifier = obj.modifiers.new('Armature', 'ARMATURE')
    modifier.object = armature
    plain_material(obj, 'Skirt')
    return obj


def channelbag_fcurves(action):
    """F-curves of an action, for Blender's layered actions and older ones alike."""
    if hasattr(action, 'layers') and action.layers:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    yield bag, bag.fcurves
    elif hasattr(action, 'fcurves'):
        yield action, action.fcurves


def take_clips(armature, path):
    imported = import_gltf(path)
    actions = []
    for name in CLIPS:
        action = bpy.data.actions.get(name)
        if not action:
            raise SystemExit(f'clip {name} not found in {path}')
        for _owner, fcurves in channelbag_fcurves(action):
            for fcurve in list(fcurves):
                path_ = fcurve.data_path
                keep = path_.endswith('rotation_quaternion') or (
                    path_ == 'pose.bones["pelvis"].location'
                )
                if not keep:
                    fcurves.remove(fcurve)
        actions.append(action)
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    data = armature.animation_data or armature.animation_data_create()
    for action in actions:
        track = data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        if hasattr(strip, 'action_slot') and len(action.slots):
            strip.action_slot = action.slots[0]
        track.mute = False
    data.action = None
    say('clips', [a.name for a in actions])


def main():
    options = parse(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    imported = import_gltf(options['body'])
    armature = next(o for o in imported if o.type == 'ARMATURE')
    armature.name = 'Figure'
    meshes = [o for o in imported if o.type == 'MESH' and o.parent == armature]
    for obj in imported:
        if obj.type == 'MESH' and obj.parent != armature:
            bpy.data.objects.remove(obj, do_unlink=True)
    body = max(meshes, key=lambda o: len(o.data.vertices))
    eyes = next(o for o in meshes if o.name.startswith('Eyes'))
    brows = next(o for o in meshes if o.name.startswith('Eyebrows'))

    # Body: parts and skin detail into the vertex colours.
    parts = body_parts(body)
    pixels, w, h = texture(options['skin_png'])
    rgb = sample(pixels, w, h, vertex_uvs(body.data))
    luminance = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    head = np.array([p == 'head' for p in parts])
    reference = float(np.median(luminance[head]))
    detail = np.clip(luminance / max(reference, 1e-4), 0.35, 1.3) / 1.5
    smooth_clothes(body, parts)
    if options['pallu']:
        parts = pallu(body, parts)
    colours = np.zeros((len(parts), 3), dtype=np.float32)
    colours[:, 0] = [PART_ID[p] / 15 for p in parts]
    colours[:, 1] = detail
    skirt(armature, body, parts, 'Skirt', 0.08)
    strip_mesh(body)
    set_colours(body, colours)
    plain_material(body, 'Body')
    body.name = body.data.name = 'Body'
    counts = {p: parts.count(p) for p in PARTS if parts.count(p)}
    say('body', len(parts), 'vertices', counts)

    # Eyes: their own colours, baked.
    eye_pixels, ew, eh = texture(options['eye_png'])
    eye_rgb = sample(eye_pixels, ew, eh, vertex_uvs(eyes.data))
    strip_mesh(eyes)
    set_colours(eyes, eye_rgb)
    plain_material(eyes, 'Eyes')
    eyes.name = eyes.data.name = 'Eyes'

    strip_mesh(brows)
    plain_material(brows, 'Hair')
    brows.name = brows.data.name = 'Brows'

    for path in options['hairs']:
        hair_objects = import_gltf(path)
        for obj in hair_objects:
            if obj.type == 'MESH' and obj.parent and obj.parent.type == 'ARMATURE':
                obj.parent = armature
                for modifier in obj.modifiers:
                    if modifier.type == 'ARMATURE':
                        modifier.object = armature
                strip_mesh(obj)
                plain_material(obj, 'Hair')
                obj.name = path.rsplit('/', 1)[-1].rsplit('.', 1)[0]
                obj.data.name = obj.name
                say('hair', obj.name, len(obj.data.vertices), 'vertices')
        for obj in hair_objects:
            if obj.name in bpy.data.objects and (obj.type == 'ARMATURE' or obj.parent is None):
                bpy.data.objects.remove(obj, do_unlink=True)

    if options['clips']:
        take_clips(armature, options['clips'])

    # Nothing else in the file: no images, no leftover materials.
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)

    bpy.ops.object.select_all(action='DESELECT')
    armature.select_set(True)
    for obj in armature.children:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=options['out'],
        export_format='GLB',
        use_selection=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_extras=False,
        export_yup=True,
        export_animations=bool(options['clips']),
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_reset_pose_bones=True,
    )
    say('wrote', options['out'])


main()
