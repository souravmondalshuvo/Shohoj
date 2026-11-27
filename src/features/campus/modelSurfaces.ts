/**
 * Surface detail for a campus model drawn in flat colours (#1012).
 *
 * NSU's model carries a colour per material and no textures, so up close its
 * brick is a smooth tan sheet and its paving one grey plane. This draws the
 * detail in the shader instead, from where each fragment is in the world
 * (the model has no UVs to lean on):
 *
 * - brick walls are laid in courses, 250 × 75 mm, each brick a shade off the
 *   next, in stretcher bond;
 * - paving is cut into slabs with a dark joint, each slab a shade off the next,
 *   and stained in broad patches;
 * - exposed concrete shows the lines of the formwork panels it was cast in,
 *   and its slabs stain without being cut into paving; rendered plaster
 *   weathers the same without the panel lines (#1016);
 * - every wall weathers: broad clean and dirty stretches, rain streaks down
 *   from the top, and a damp foot.
 *
 * Joints and courses fade out as they shrink below a pixel, so far off a wall
 * keeps its own colour rather than shimmering. Colours are the model's own:
 * this only varies them.
 */

import type { Material, MeshStandardMaterial, Object3D } from 'three';
import { Mesh } from 'three';

/** What a material is drawn as. */
export type SurfaceKind = 'brick' | 'masonry' | 'concrete' | 'render';

/** Which of the NSU model's materials get which detail; the rest (glass, metal, trees, cars) are left alone. */
export function surfaceKind(materialName: string): SurfaceKind | null {
  const name = materialName.trim().toLowerCase();
  if (name === 'brick') return 'brick';
  if (['stone', 'floor', 'concrete', 'warm stone', 'dark stone', 'white', 'plaster'].includes(name)) return 'masonry';
  return null;
}

/**
 * Which of BRACU's tower materials get which detail (#1016). The model names
 * its exterior by number, so this goes by the node each one dresses: the
 * academia frame and fins are exposed concrete, the podium's red walls are
 * brick, the site structure is the forecourt's paving. Its warm plaster is
 * the outside walls and slab edges as well as the rooms, so it is rendered
 * plaster, weathered only near the outside (`SurfaceOptions.indoors`). The
 * rest of its interior, core, parking and lift materials, glass, steel and
 * planting are left alone.
 */
export function bracuSurfaceKind(materialName: string): SurfaceKind | null {
  switch (materialName.trim()) {
    case 'Material_4': // academia structure: the frame
    case 'Material_2': // academia structure.005: its pale slab edges
    case 'Material_10': // academia structure.002: the fins
      return 'concrete';
    case 'Material_9': // podium structure.003: the red walls
      return 'brick';
    case 'Material_0': // site structure: the forecourt
      return 'masonry';
    case 'Interior | warm plaster': // outside walls and slab edges, and the rooms
      return 'render';
    default:
      return null;
  }
}

export interface SurfaceOptions {
  /** Paving slab size, metres. */
  tile: number;
  /** Where the ground is, for the damp foot of a wall. */
  groundY: number;
  /**
   * A building's floor plate in scene x and z, where the rain never reaches:
   * deeper than 2.5 m inside it nothing weathers, so a room's walls stay
   * clean when a floor is opened. Without it, everywhere weathers.
   */
  indoors?: { x1: number; x2: number; z1: number; z2: number };
}

const GLSL = `
float msHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float msNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( msHash( i ), msHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( msHash( i + vec2( 0.0, 1.0 ) ), msHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// A grid's lines: 1 on a joint, 0 off it, antialiased, and faded out once a
// cell is under a few pixels across.
float msJoint( vec2 cells, float width ) {
  vec2 w = fwidth( cells );
  vec2 d = min( fract( cells ), 1.0 - fract( cells ) );
  vec2 line = 1.0 - smoothstep( vec2( width ) - w * 0.5, vec2( width ) + w * 0.5, d );
  float fade = 1.0 - smoothstep( 0.12, 0.35, max( w.x, w.y ) );
  return max( line.x, line.y ) * fade;
}`;

/**
 * Patch `mat` to draw `kind`'s detail. Safe to call on a material shared by
 * many meshes: the patch is keyed by kind and options.
 */
export function detailSurface(mat: MeshStandardMaterial, kind: SurfaceKind, options: SurfaceOptions): MeshStandardMaterial {
  const brick = kind === 'brick';
  const concrete = kind === 'concrete';
  const render = kind === 'render';
  const indoors = options.indoors;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['msTile'] = { value: options.tile };
    shader.uniforms['msGround'] = { value: options.groundY };
    shader.uniforms['msIndoors'] = { value: indoors ? [indoors.x1, indoors.x2, indoors.z1, indoors.z2] : [0, 0, 0, 0] };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 msWorld = vec4( transformed, 1.0 );
  vec3 msNormal = objectNormal;
  #ifdef USE_INSTANCING
    msWorld = instanceMatrix * msWorld;
    msNormal = mat3( instanceMatrix ) * msNormal;
  #endif
  vMsWorld = ( modelMatrix * msWorld ).xyz;
  vMsNormal = mat3( modelMatrix ) * msNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;\nuniform float msTile;\nuniform float msGround;\nuniform vec4 msIndoors;\n${GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec3 n = normalize( vMsNormal );
    vec3 p = vMsWorld;
    float level = smoothstep( 0.65, 0.9, abs( n.y ) );
    // Along a wall: its horizontal run, whichever way the wall faces.
    vec2 runDir = normalize( vec2( -n.z, n.x ) + vec2( 1e-4 ) );
    float run = dot( p.xz, runDir );
    float k = 1.0;
    // ── Walls ──
    float wall = 1.0 - level;
    if ( wall > 0.0 ) {
      float w = 1.0;
      ${
        brick
          ? `// Stretcher bond: each course shifted half a brick.
      vec2 b = vec2( run / 0.25, p.y / 0.075 );
      float row = floor( b.y );
      b.x += 0.5 * mod( row, 2.0 );
      float fade = 1.0 - smoothstep( 0.15, 0.45, fwidth( b.y ) );
      w *= mix( 1.0, 0.9 + 0.2 * msHash( vec2( floor( b.x ), row ) ), fade );
      w *= 1.0 + 0.16 * msJoint( b, 0.08 );`
          : concrete
            ? `// Formwork: the panels it was cast against, 2.4 m by 1.2 m.
      w *= 1.0 - 0.1 * msJoint( vec2( run / 2.4, p.y / 1.2 ), 0.01 );
      w *= 0.97 + 0.06 * msHash( floor( vec2( run / 2.4, p.y / 1.2 ) ) );`
            : ''
      }
      // How hard it weathers: bare concrete, pale and porous, far more than brick.
      float weather = ${concrete ? '2.2' : render ? '1.8' : '1.0'};
      // Broad clean and dirty stretches.
      w *= 1.0 - 0.06 * weather + 0.12 * weather * msNoise( vec2( run, p.y * 0.6 ) / 4.0 );
      // Rain streaks: narrow, a few metres apart, long.
      float streak = smoothstep( 0.55, 0.85, msNoise( vec2( run * 1.4, p.y * 0.05 ) ) ) * smoothstep( 0.3, 0.7, msNoise( vec2( run * 0.3, p.y * 0.25 + 7.0 ) ) );
      w *= 1.0 - 0.13 * weather * streak;
      // The damp foot.
      w *= 1.0 - 0.14 * ( 1.0 - smoothstep( 0.0, 0.7, p.y - msGround ) );
      k = mix( k, w, wall );
    }
    ${
      concrete || render
        ? `// ── A cast slab: stained, not cut into paving ──
    if ( level > 0.0 ) {
      float f = ( 0.9 + 0.16 * msNoise( p.xz / 5.0 ) ) * ( 0.92 + 0.12 * msNoise( p.xz / 17.0 + 3.0 ) );
      k = mix( k, f, level );
    }`
        : `// ── Paving ──
    if ( level > 0.0 ) {
      vec2 t = p.xz / msTile;
      float fade = 1.0 - smoothstep( 0.15, 0.45, max( fwidth( t.x ), fwidth( t.y ) ) );
      float f = mix( 1.0, 0.93 + 0.14 * msHash( floor( t ) ), fade );
      f *= 1.0 - 0.26 * msJoint( t, 0.03 );
      // Laid in bays ten slabs square, each a pour or a batch of its own,
      // with a wider movement joint between: still there from far off.
      vec2 bay = t / 10.0;
      f *= 0.95 + 0.1 * msHash( floor( bay ) + 17.0 );
      f *= 1.0 - 0.3 * msJoint( bay, 0.012 );
      // Stains a few metres across, broad weathering, and a finer grit.
      f *= 0.9 + 0.16 * msNoise( p.xz / 5.0 );
      f *= 0.9 + 0.16 * msNoise( p.xz / 17.0 + 3.0 );
      f *= 0.97 + 0.06 * msNoise( p.xz * 1.7 );
      k = mix( k, f, level );
    }`
    }
    ${
      indoors
        ? `// Indoors, more than 2.5 m in from the plate's edge, nothing weathers.
    float inside = min( min( p.x - msIndoors.x, msIndoors.y - p.x ), min( p.z - msIndoors.z, msIndoors.w - p.z ) );
    k = mix( k, 1.0, smoothstep( 0.5, 2.5, inside ) );`
        : ''
    }
    diffuseColor.rgb *= k;
  }`,
      );
  };
  mat.customProgramCacheKey = () => `model-surface-${kind}-${options.tile}${indoors ? '-indoors' : ''}`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Give every mesh under `root` whose material `kindOf` names its detail (NSU's
 * names by default). Each material is patched once, however many meshes share
 * it. Returns how many materials were patched.
 */
export function detailModel(
  root: Object3D,
  options: SurfaceOptions,
  kindOf: (materialName: string) => SurfaceKind | null = surfaceKind,
): number {
  const done = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (done.has(material) || !('isMeshStandardMaterial' in material)) continue;
      const kind = kindOf(material.name);
      if (!kind) continue;
      done.add(material);
      detailSurface(material as MeshStandardMaterial, kind, options);
    }
  });
  return done.size;
}
