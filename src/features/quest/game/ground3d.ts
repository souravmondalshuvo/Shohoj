// src/features/quest/game/ground3d.ts
//
// The ground of the 3D zone (#981): rolling earth, grass that moves in the
// wind, rice standing in shallow water. Built for zoneGame3d.ts from the map's
// description (world/sceneKinds.ts), so the same map drives it.
//
// The first prototype drew each square as flat facets coloured one by one,
// and the squares showed through as a zig-zag. Here the ground is one smooth
// surface: heights and colours are blended between squares, a little noise
// breaks up the grass into patches, and a road, the ghat's sand or a field's
// mud keeps a clean edge where it meets grass.
//
// `heightAt` answers how high the ground is anywhere, so people, props and the
// hero stand on it rather than at a fixed height.
//
// Grass and rice are instanced: a few thousand tufts are one draw each. Their
// sway is done on the graphics card (a few lines added to the standard
// material's vertex shader), so it costs nothing per frame here but a clock.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type IUniform,
} from 'three';

import type { GroundKind, ZoneScene } from '../world/sceneKinds.ts';

export type Quality = 'high' | 'low';

export interface Ground {
  readonly objects: readonly Object3D[];
  /** The ground's height at a point, in the zone's units (one square is one). */
  heightAt(x: number, z: number): number;
  /** Advance the wind. */
  update(time: number): void;
  dispose(): void;
}

// ── Noise ────────────────────────────────────────────────────────────────────

const hash = (x: number, y: number, salt = 0) => {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in 0..1: the same everywhere for the same point. */
function noise(x: number, y: number, salt = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(x0, y0, salt);
  const b = hash(x0 + 1, y0, salt);
  const c = hash(x0, y0 + 1, salt);
  const d = hash(x0 + 1, y0 + 1, salt);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

const fbm = (x: number, y: number, salt = 0) =>
  noise(x, y, salt) * 0.6 +
  noise(x * 2.1, y * 2.1, salt + 1) * 0.3 +
  noise(x * 4.3, y * 4.3, salt + 2) * 0.1;

// ── What each kind of ground is like ─────────────────────────────────────────

const HEIGHT: Readonly<Record<GroundKind, number>> = {
  grass: 0,
  road: -0.04,
  sand: -0.06,
  mud: -0.12,
  'bank-west': -0.45,
  'bank-east': -0.45,
  water: -0.9,
};

const PATHS: ReadonlySet<GroundKind> = new Set(['road', 'sand', 'mud']);

const COLOUR: Readonly<Record<GroundKind, Color>> = {
  grass: new Color('#5f9638'),
  road: new Color('#b27a48'),
  sand: new Color('#dcc390'),
  mud: new Color('#5d4029'),
  'bank-west': new Color('#5e6a35'),
  'bank-east': new Color('#5e6a35'),
  water: new Color('#4a6b45'),
};
const GRASS_LUSH = new Color('#4d872c');
const GRASS_DRY = new Color('#8fa648');

// ── The surface ──────────────────────────────────────────────────────────────

class Field {
  constructor(private readonly scene: ZoneScene) {}

  kind(x: number, y: number): GroundKind {
    const { width, height, ground } = this.scene;
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    return ground[cy * width + cx] ?? 'grass';
  }

  /** The four squares around a point, with how much each counts there. */
  around(x: number, z: number): { kind: GroundKind; weight: number }[] {
    const u = x - 0.5;
    const v = z - 0.5;
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const fx = smooth(Math.min(1, Math.max(0, u - x0)));
    const fz = smooth(Math.min(1, Math.max(0, v - z0)));
    return [
      { kind: this.kind(x0, z0), weight: (1 - fx) * (1 - fz) },
      { kind: this.kind(x0 + 1, z0), weight: fx * (1 - fz) },
      { kind: this.kind(x0, z0 + 1), weight: (1 - fx) * fz },
      { kind: this.kind(x0 + 1, z0 + 1), weight: fx * fz },
    ];
  }

  pathWeight(x: number, z: number): number {
    return this.around(x, z).reduce((sum, c) => sum + (PATHS.has(c.kind) ? c.weight : 0), 0);
  }

  heightAt(x: number, z: number): number {
    const blended = this.around(x, z).reduce((sum, c) => sum + HEIGHT[c.kind] * c.weight, 0);
    // Land rolls a little; paths are worn flat; the river bed is left alone.
    const land = Math.min(1, Math.max(0, (blended + 0.25) / 0.25));
    const flat = 1 - Math.min(1, this.pathWeight(x, z) * 1.6);
    return blended + (fbm(x * 0.32, z * 0.32, 7) - 0.5) * 0.24 * land * flat;
  }

  colourAt(x: number, z: number, out: Color): Color {
    const cells = this.around(x, z);
    // Grass: lush and dry patches, so a field is not one flat green.
    const patch = fbm(x * 0.22, z * 0.22, 3);
    const grass = GRASS_LUSH.clone().lerp(
      GRASS_DRY,
      smooth(Math.min(1, Math.max(0, patch * 1.6 - 0.45))),
    );
    grass.lerp(COLOUR.grass, 0.35);
    out.setRGB(0, 0, 0);
    for (const c of cells) {
      const base = c.kind === 'grass' ? grass : COLOUR[c.kind];
      out.r += base.r * c.weight;
      out.g += base.g * c.weight;
      out.b += base.b * c.weight;
    }
    // A path keeps a clean edge: past halfway it is the path's own colour.
    const path = cells.filter((c) => PATHS.has(c.kind)).sort((a, b) => b.weight - a.weight)[0];
    if (path) {
      const weight = cells.filter((c) => c.kind === path.kind).reduce((s, c) => s + c.weight, 0);
      const edge = smooth(Math.min(1, Math.max(0, (weight - 0.32) / 0.22)));
      out.lerp(COLOUR[path.kind], edge);
    }
    // Fine grain, so close up the ground is not plastic.
    const grain = 0.94 + noise(x * 3.7, z * 3.7, 11) * 0.12;
    return out.multiplyScalar(grain);
  }
}

/**
 * Squares of ground drawn past each edge of the map. The edge squares carry
 * on outwards (a road off the map's side keeps going), so the world runs on
 * into the haze instead of stopping at a line.
 */
export const BEYOND = 12;

function buildSurface(field: Field, scene: ZoneScene, quality: Quality): Mesh {
  const per = quality === 'high' ? 4 : 2;
  const geometry = new PlaneGeometry(
    scene.width + BEYOND * 2,
    scene.height + BEYOND * 2,
    (scene.width + BEYOND * 2) * per,
    (scene.height + BEYOND * 2) * per,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(scene.width / 2, 0, scene.height / 2);
  const position = geometry.attributes['position'] as BufferAttribute;
  const colours = new Float32Array(position.count * 3);
  const colour = new Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, field.heightAt(x, z));
    field.colourAt(x, z, colour);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

// ── Grass and rice ───────────────────────────────────────────────────────────

/** A tuft: blades fanned round a point, dark at the root and light at the tip. */
function tuftGeometry(
  blades: number,
  height: number,
  width: number,
  base: string,
  tip: string,
): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const root = new Color(base);
  const top = new Color(tip);
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI + hash(i, blades) * 0.6;
    const lean = 0.25 + hash(i, 7) * 0.35;
    const h = height * (0.7 + hash(i, 3) * 0.5);
    const dx = Math.cos(angle) * width;
    const dz = Math.sin(angle) * width;
    const tx = Math.cos(angle + Math.PI / 2) * lean * h * 0.5;
    const tz = Math.sin(angle + Math.PI / 2) * lean * h * 0.5;
    positions.push(-dx, 0, -dz, dx, 0, dz, tx, h, tz);
    colours.push(root.r, root.g, root.b, root.r, root.g, root.b, top.r, top.g, top.b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A material whose vertices sway with the wind, more the higher they are. */
function windMaterial(time: IUniform<number>, strength: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.85,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 rootWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 rootWorld = vec4(0.0);
        #endif
        float gust = sin(uTime * 1.7 + rootWorld.x * 0.55 + rootWorld.z * 0.35)
          + 0.4 * sin(uTime * 3.3 + rootWorld.x * 1.7);
        transformed.x += gust * ${strength.toFixed(3)} * position.y;
        transformed.z += gust * ${(strength * 0.4).toFixed(3)} * position.y;`,
      );
  };
  return material;
}

function scatter(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  spots: readonly { x: number; z: number; scale: number; turn: number }[],
  heightAt: (x: number, z: number) => number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, spots.length));
  const matrix = new Matrix4();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  spots.forEach((spot, i) => {
    turn.setFromAxisAngle(up, spot.turn);
    matrix.compose(
      new Vector3(spot.x, heightAt(spot.x, spot.z), spot.z),
      turn,
      new Vector3(spot.scale, spot.scale, spot.scale),
    );
    mesh.setMatrixAt(i, matrix);
  });
  mesh.count = spots.length;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/** Shallow water standing in the paddy, catching the sky. */
function paddyWater(
  cells: readonly { x: number; y: number }[],
  heightAt: (x: number, z: number) => number,
): Mesh {
  const positions: number[] = [];
  for (const { x, y } of cells) {
    const h = heightAt(x + 0.5, y + 0.5) + 0.045;
    positions.push(x, h, y, x, h, y + 1, x + 1, h, y, x + 1, h, y, x, h, y + 1, x + 1, h, y + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: '#4f7468',
      roughness: 0.06,
      metalness: 0.05,
      transparent: true,
      opacity: 0.62,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

export interface GroundOptions {
  readonly quality: Quality;
  /** Squares where something stands already, kept clear of grass. */
  readonly occupied: ReadonlySet<string>;
}

export function buildGround(scene: ZoneScene, options: GroundOptions): Ground {
  const field = new Field(scene);
  const heightAt = (x: number, z: number) => field.heightAt(x, z);
  const time: IUniform<number> = { value: 0 };
  const objects: Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  const surface = buildSurface(field, scene, options.quality);
  keep(surface.geometry);
  keep(surface.material as MeshStandardMaterial);
  objects.push(surface);

  // Grass: tufts across open grass, kept off paths, the water's edge and
  // anything standing.
  const perSquare = options.quality === 'high' ? 6 : 2;
  const grassSpots: { x: number; z: number; scale: number; turn: number }[] = [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      if (field.kind(x, y) !== 'grass' || options.occupied.has(`${x},${y}`)) continue;
      for (let k = 0; k < perSquare; k += 1) {
        const px = x + hash(x, y, k * 2 + 31);
        const pz = y + hash(x, y, k * 2 + 32);
        if (field.pathWeight(px, pz) > 0.25 || field.heightAt(px, pz) < -0.12) continue;
        grassSpots.push({
          x: px,
          z: pz,
          scale: 0.7 + hash(x, y, k + 50) * 0.7,
          turn: hash(x, y, k + 60) * 6.28,
        });
      }
    }
  }
  const grass = scatter(
    keep(tuftGeometry(5, 0.26, 0.03, '#3d7a26', '#a7d060')),
    keep(windMaterial(time, 0.22)),
    grassSpots,
    heightAt,
  );
  objects.push(grass);

  // Rice: clumps in rows across each paddy square, standing in water.
  const riceCells = scene.props.filter((prop) => prop.kind === 'rice');
  if (riceCells.length > 0) {
    const riceSpots: { x: number; z: number; scale: number; turn: number }[] = [];
    for (const cell of riceCells) {
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          riceSpots.push({
            x: cell.x + 0.18 + col * 0.32 + (hash(cell.x, cell.y, row * 3 + col) - 0.5) * 0.06,
            z: cell.y + 0.18 + row * 0.32 + (hash(cell.y, cell.x, row * 3 + col) - 0.5) * 0.06,
            scale: 0.85 + hash(cell.x, row, col) * 0.3,
            turn: hash(col, row, cell.x) * 6.28,
          });
        }
      }
    }
    const rice = scatter(
      keep(tuftGeometry(7, 0.42, 0.02, '#4c8a2c', '#b8d86a')),
      keep(windMaterial(time, 0.16)),
      riceSpots,
      heightAt,
    );
    objects.push(rice);
    const water = paddyWater(riceCells, heightAt);
    keep(water.geometry);
    keep(water.material as MeshStandardMaterial);
    objects.push(water);
  }

  return {
    objects,
    heightAt,
    update(now) {
      time.value = now;
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
