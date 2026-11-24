/**
 * Grass on the Residential Campus's lawns and rough ground, up close (#999).
 *
 * The painted ground is half a metre a pixel: seen at eye level a lawn is a
 * smooth green smear. Here the grass stands up off it — small clumps of
 * blades, scattered wherever the painted map is grass (and, sparsely, as
 * weeds on bare earth), inside the wall and a margin round it, each tinted with the ground colour under it so the clumps
 * and the map agree. The pitches and the court are mown or bare and stay
 * flat; buildings and ponds keep their ground clear.
 *
 * A clump only shows near the camera: past about 70 m it shrinks away in the
 * vertex shader, where it would be under a pixel and only shimmer. It casts no
 * shadow, and its normals point straight up, so it lights like the ground it
 * grows from.
 */

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';

import { RS_BUILDINGS, RS_GROUNDS, RS_WALL, RS_WATER, pointInPolygon, type Point } from '../../core/campusBracuRs.ts';
import { rng } from './rsTextures.ts';

type RGB = readonly [number, number, number];

export interface Tuft {
  x: number;
  y: number;
  /** Spread and height, metres. */
  w: number;
  h: number;
  turn: number;
  /** The painted ground's colour under it, sRGB 0–255. */
  rgb: RGB;
}

/** How far past the wall's bounding box grass is scattered, metres. */
const MARGIN = 45;
/** Spacing of the jittered grid the clumps are dropped on, metres. */
const SPACING = 1.15;

/**
 * Grass, green or dry-season olive — not a path, a road, a court or bare
 * earth. Grass of either kind is low in blue against its green; earth is
 * redder than it is green, and paving is near grey.
 */
export function isGrass([r, g, b]: RGB): boolean {
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  return r <= g * 1.08 && g - b > 0.22 * g && lum > 35 && lum < 170;
}

/** Bare, trodden earth: browner than grass, still far from grey paving. */
export function isEarth([r, g, b]: RGB): boolean {
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  return r > g * 1.08 && r <= g * 1.3 && g - b > 0.2 * g && lum > 35 && lum < 170;
}

/** How many clumps bare earth keeps, against grass: weeds along its edges. */
const EARTH_SHARE = 0.16;

/** Ground no clump grows on — buildings, the pitches and court, the ponds — each with its box, to test that first. */
const KEEP_CLEAR = [
  ...RS_BUILDINGS.map((b) => b.footprint),
  ...RS_GROUNDS.filter((g) => g.kind !== 'garden').map((g) => g.outline),
  ...RS_WATER.map((w) => w.outline),
].map((outline) => {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  return { outline, x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
});

/**
 * Where the clumps stand, seeded. `sample` gives the painted ground's colour
 * at a point in campus metres (null off the map); `density` thins them
 * (1 = all, 2 = about half).
 */
export function grassScatter(sample: (x: number, y: number) => RGB | null, density = 1): Tuft[] {
  if (!Number.isFinite(density) || density <= 0) density = 1;
  const r = rng(9990);
  const xs = RS_WALL.map((p) => p[0]);
  const ys = RS_WALL.map((p) => p[1]);
  const x1 = Math.min(...xs) - MARGIN;
  const x2 = Math.max(...xs) + MARGIN;
  const y1 = Math.min(...ys) - MARGIN;
  const y2 = Math.max(...ys) + MARGIN;
  const step = SPACING * Math.sqrt(density);
  const blocked = (p: Point): boolean =>
    KEEP_CLEAR.some((k) => p[0] >= k.x1 && p[0] <= k.x2 && p[1] >= k.y1 && p[1] <= k.y2 && pointInPolygon(p, k.outline));
  const tufts: Tuft[] = [];
  for (let y = y1; y < y2; y += step) {
    for (let x = x1; x < x2; x += step) {
      const px = x + r() * step;
      const py = y + r() * step;
      // Lawns are kept short; the rough ground round them grows longer, and
      // dry (yellower) ground longest of all.
      const w = 0.5 + r() * 0.55;
      let h = 0.18 + r() * 0.24;
      const turn = r() * Math.PI * 2;
      const rand = r();
      const rgb = sample(px, py);
      const weeds = rand < EARTH_SHARE;
      if (!rgb || !(isGrass(rgb) || (weeds && isEarth(rgb))) || blocked([px, py])) continue;
      if (rgb[1] < rgb[0] * 1.08) h *= 1.6;
      tufts.push({ x: px, y: py, w, h, turn, rgb });
    }
  }
  return tufts;
}

/** A clump: three blade cards crossed at 60°, standing on the ground. */
function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const corners: Array<[number, number, number, number, number]> = [
      [-cx, 0, -cz, 0, 0],
      [cx, 0, cz, 1, 0],
      [cx, 1, cz, 1, 1],
      [-cx, 1, -cz, 0, 1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i];
      if (!c) continue;
      pos.push(c[0], c[1], c[2]);
      // Up, like the ground: a clump never lights darker than its lawn.
      nor.push(0, 1, 0);
      uv.push(c[3], c[4]);
      // Darker in the clump's foot, where the blades shade each other, and
      // brighter than the lawn at the tips, which catch the sun.
      const s = 0.78 + 0.6 * c[1];
      col.push(s, s, s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Blades rising from the bottom edge, tapering, a few bent over; alpha-tested. */
function bladeTexture(seed: number): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const r = rng(seed);
    for (let i = 0; i < 22; i++) {
      const x = 10 + r() * (size - 20);
      const top = size * (0.05 + r() * 0.55);
      const lean = (r() - 0.5) * size * 0.45;
      const base = 1.6 + r() * 2.2;
      const v = Math.round(205 + r() * 50);
      const warm = r() < 0.3 ? 18 : 0;
      g.fillStyle = `rgb(${v + warm > 255 ? 255 : v + warm},${v},${Math.round(v * 0.82)})`;
      g.beginPath();
      g.moveTo(x - base, size);
      g.quadraticCurveTo(x - base * 0.4 + lean * 0.3, (size + top) / 2, x + lean, top);
      g.quadraticCurveTo(x + base * 0.4 + lean * 0.3, (size + top) / 2, x + base, size);
      g.closePath();
      g.fill();
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  return t;
}

/** Clumps are batched per tile of this many metres, so the frustum can drop a batch. */
const TILE = 60;

export interface Grass {
  group: Group;
  count: number;
  dispose(): void;
}

export function buildGrass(tufts: readonly Tuft[]): Grass {
  const group = new Group();
  const geo = tuftGeometry();
  const map = bladeTexture(9991);
  const mat = new MeshStandardMaterial({
    map,
    vertexColors: true,
    alphaTest: 0.45,
    side: DoubleSide,
    roughness: 1,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 tuftAt = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #else
    vec3 tuftAt = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #endif
  // Gone past about 70 m, where a clump is under a pixel and would shimmer.
  transformed *= 1.0 - smoothstep( 40.0, 72.0, distance( tuftAt, cameraPosition ) );`,
    );
  };
  mat.customProgramCacheKey = () => 'rs-grass';

  const tiles = new Map<string, Tuft[]>();
  for (const t of tufts) {
    const key = `${Math.floor(t.x / TILE)},${Math.floor(t.y / TILE)}`;
    const list = tiles.get(key) ?? [];
    list.push(t);
    tiles.set(key, list);
  }
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const m = new Matrix4();
  const c = new Color();
  for (const list of tiles.values()) {
    const mesh = new InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.turn);
      mesh.setMatrixAt(i, m.compose(new Vector3(t.x, 0, -t.y), q, new Vector3(t.w, t.h, t.w)));
      mesh.setColorAt(i, c.setRGB(t.rgb[0] / 255, t.rgb[1] / 255, t.rgb[2] / 255, SRGBColorSpace));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return {
    group,
    count: tufts.length,
    dispose() {
      geo.dispose();
      map.dispose();
      mat.dispose();
      for (const child of group.children) (child as InstancedMesh).dispose();
    },
  };
}
