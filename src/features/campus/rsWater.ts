/**
 * The ponds round the Residential Campus (#996).
 *
 * Still, silty water mirrors the tree lines and the sky — the most familiar
 * sight in rural Bangladesh. Where the device can afford it, every pond is one
 * planar mirror (three's Reflector, one extra render of the scene a frame)
 * whose image is rippled by a breeze and mixed with the dark water by the
 * Fresnel term: looking down you see the water, looking across you see the
 * far bank. Elsewhere the ponds reflect only the sky, through the material's
 * own environment map.
 */

import {
  type BufferGeometry,
  Color,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type ShaderMaterial,
  Shape,
  ShapeGeometry,
  type Texture,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { type Point } from '../../core/campusBracuRs.ts';
import { ripples } from './rsTextures.ts';

/** Deep, silty green-brown, as the ponds read in the satellite image. */
const WATER = new Color('#28331f');

const WaterShader = {
  name: 'RsWaterShader',
  uniforms: UniformsUtils.merge([
    UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      tRipple: { value: null },
      waterColor: { value: new Color() },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tRipple;
    uniform vec3 waterColor;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWorld.xz;
      vec2 n = ( texture2D( tRipple, p * 0.09 ).xy * 2.0 - 1.0 ) * 0.6
             + ( texture2D( tRipple, p * 0.031 + vec2( 0.31, 0.77 ) ).xy * 2.0 - 1.0 ) * 0.4;
      vec3 N = normalize( vec3( n.x * 0.18, 1.0, n.y * 0.18 ) );
      vec3 V = normalize( cameraPosition - vWorld );
      float cosT = clamp( dot( V, N ), 0.0, 1.0 );
      float fresnel = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
      vec4 uv = vUv;
      uv.xy += n * 0.012 * uv.w;
      vec3 reflected = texture2DProj( tDiffuse, uv ).rgb;
      gl_FragColor = vec4( mix( waterColor, reflected, fresnel ), 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

/** Every pond as one flat geometry in its local XY plane (the mirror's plane). */
function pondGeometry(outlines: readonly (readonly Point[])[]): BufferGeometry | null {
  const parts = outlines.map((o) => new ShapeGeometry(new Shape(o.map((p) => new Vector2(p[0], p[1])))));
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  return merged;
}

export interface Ponds {
  mesh: Mesh;
  /** Resize the mirror's image, in device pixels. */
  setSize(width: number, height: number): void;
  dispose(): void;
}

/**
 * The ponds. `mirror` chooses the true reflection; otherwise `env` (the sky)
 * is all the water reflects.
 */
export function buildPonds(
  outlines: readonly (readonly Point[])[],
  options: { mirror: boolean; env: Texture | null; width: number; height: number },
): Ponds | null {
  const geo = pondGeometry(outlines);
  if (!geo) return null;
  const rippleMap = ripples(9701);
  rippleMap.repeat.set(1, 1);
  let mesh: Mesh;
  let target: { setSize(w: number, h: number): void } | null = null;
  let material: Material;
  if (options.mirror) {
    const reflector = new Reflector(geo, {
      textureWidth: Math.max(256, Math.round(options.width / 2)),
      textureHeight: Math.max(256, Math.round(options.height / 2)),
      clipBias: 0.003,
      shader: WaterShader,
      multisample: 0,
    });
    const mat = reflector.material as ShaderMaterial;
    mat.fog = true;
    const u = mat.uniforms;
    if (u['tRipple']) u['tRipple'].value = rippleMap;
    if (u['waterColor']) u['waterColor'].value = WATER.clone();
    target = reflector.getRenderTarget();
    material = mat;
    mesh = reflector;
  } else {
    const mat = new MeshStandardMaterial({ color: WATER, roughness: 0.04, metalness: 0, normalMap: rippleMap });
    mat.normalScale.set(0.25, 0.25);
    if (options.env) {
      mat.envMap = options.env;
      mat.envMapIntensity = 1;
    }
    material = mat;
    mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
  }
  // Local XY → the ground plane (local y is campus north, scene −z).
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  return {
    mesh,
    setSize(width, height) {
      target?.setSize(Math.max(256, Math.round(width / 2)), Math.max(256, Math.round(height / 2)));
    },
    dispose() {
      if (mesh instanceof Reflector) mesh.dispose();
      else material.dispose();
      geo.dispose();
      rippleMap.dispose();
    },
  };
}
