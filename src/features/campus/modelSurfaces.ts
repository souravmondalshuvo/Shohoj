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
export type SurfaceKind = 'brick' | 'masonry';

/** Which of the NSU model's materials get which detail; the rest (glass, metal, trees, cars) are left alone. */
export function surfaceKind(materialName: string): SurfaceKind | null {
  const name = materialName.trim().toLowerCase();
  if (name === 'brick') return 'brick';
  if (['stone', 'floor', 'concrete', 'warm stone', 'dark stone', 'white', 'plaster'].includes(name)) return 'masonry';
  return null;
}

export interface SurfaceOptions {
  /** Paving slab size, metres. */
  tile: number;
  /** Where the ground is, for the damp foot of a wall. */
  groundY: number;
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
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['msTile'] = { value: options.tile };
    shader.uniforms['msGround'] = { value: options.groundY };
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
      .replace('#include <common>', `#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;\nuniform float msTile;\nuniform float msGround;\n${GLSL}`)
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
          : ''
      }
      // Broad clean and dirty stretches.
      w *= 0.94 + 0.12 * msNoise( vec2( run, p.y * 0.6 ) / 4.0 );
      // Rain streaks: narrow, a few metres apart, long.
      float streak = smoothstep( 0.55, 0.85, msNoise( vec2( run * 1.4, p.y * 0.05 ) ) ) * smoothstep( 0.3, 0.7, msNoise( vec2( run * 0.3, p.y * 0.25 + 7.0 ) ) );
      w *= 1.0 - 0.13 * streak;
      // The damp foot.
      w *= 1.0 - 0.14 * ( 1.0 - smoothstep( 0.0, 0.7, p.y - msGround ) );
      k = mix( k, w, wall );
    }
    // ── Paving ──
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
    }
    diffuseColor.rgb *= k;
  }`,
      );
  };
  mat.customProgramCacheKey = () => `model-surface-${kind}-${options.tile}`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Give every mesh under `root` whose material `surfaceKind` names its detail.
 * Each material is patched once, however many meshes share it. Returns how
 * many materials were patched.
 */
export function detailModel(root: Object3D, options: SurfaceOptions): number {
  const done = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (done.has(material) || !('isMeshStandardMaterial' in material)) continue;
      const kind = surfaceKind(material.name);
      if (!kind) continue;
      done.add(material);
      detailSurface(material as MeshStandardMaterial, kind, options);
    }
  });
  return done.size;
}
