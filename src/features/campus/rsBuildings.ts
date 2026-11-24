/**
 * Buildings of the Residential Campus, modelled for a near-real look (#978).
 *
 * Each building stands on its OSM footprint at its sourced or estimated
 * height (src/core/campusBracuRs.ts). On the walls, real geometry rather than
 * painted windows, following the photographs of the campus:
 *
 *   - dormitories: a window per bay with a frame, a sill and the deep concrete
 *     sunshade (chajja) every RS building has, floor bands between storeys,
 *     and balconies on the long faces of the tall blocks;
 *   - the east block: yellow vertical fins over each window and red-brick
 *     sill panels, as in the RS handbook photo;
 *   - the courtyard and west blocks: continuous ribbon windows under
 *     continuous sunshades, as on the academic building in the BRACU photo;
 *   - the hall and sheds: high clerestory glazing and wide doors.
 *
 * Roofs carry textures with relief: clay tiles on the hipped roofs, red
 * corrugated sheet on Anandapur and the sheds, stained concrete with parapets
 * and black water tanks on the flat ones. Window positions are a regular
 * rhythm per bay, not a survey of each opening.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';

import {
  RS_STOREY_HEIGHT,
  corner,
  polygonArea,
  polygonCentre,
  rsWallTop,
  type Point,
  type RsBuilding,
  type RsRect,
} from '../../core/campusBracuRs.ts';
import { clayTiles, concrete, corrugated, plaster, brick, type SurfaceTextures } from './rsTextures.ts';

const EAVE_OVERHANG = 0.8;
const sx = (p: Point): number => p[0];
const sz = (p: Point): number => -p[1];

/** Counter-clockwise order (seen from above, in campus metres). */
export function ccw(points: readonly Point[]): Point[] {
  return polygonArea(points) < 0 ? [...points].reverse() : [...points];
}

/**
 * Vertical walls along a closed outline from y0 to y1. UVs are in texture
 * tiles: u per 4 m along the wall, v per storey, so the plaster's streaks
 * run down from under each sill.
 */
export function wallGeometry(
  outline: readonly Point[],
  y0: number,
  y1: number,
  storey: number,
  outset = 0,
  inward = false,
): BufferGeometry {
  const pts = ccw(outline);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = corner(pts, i);
    const b = corner(pts, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    const nx = (dy / len) * outset;
    const ny = (-dx / len) * outset;
    const base = pos.length / 3;
    const A: Point = [a[0] + nx, a[1] + ny];
    const B: Point = [b[0] + nx, b[1] + ny];
    pos.push(sx(A), y0, sz(A), sx(B), y0, sz(B), sx(B), y1, sz(B), sx(A), y1, sz(A));
    const u0 = run / 4;
    const u1 = (run + len) / 4;
    // v counts storeys upward, so the texture's top (where grime starts,
    // under the slab above) sits at the top of every storey.
    uv.push(u0, y0 / storey, u1, y0 / storey, u1, y1 / storey, u0, y1 / storey);
    if (inward) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    run += len;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A flat cap over an outline at height y; UVs in metres. */
export function capGeometry(outline: readonly Point[], y: number): BufferGeometry {
  const shape = new Shape(ccw(outline).map((p) => new Vector2(p[0], p[1])));
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** The four corners of an oriented rectangle, grown by `grow` metres. */
export function rectCorners(r: RsRect, grow = 0): Point[] {
  const a = (r.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const L = r.length / 2 + grow;
  const W = r.width / 2 + grow;
  return [
    [r.cx - L * c + W * s, r.cy - L * s - W * c],
    [r.cx + L * c + W * s, r.cy + L * s - W * c],
    [r.cx + L * c - W * s, r.cy + L * s + W * c],
    [r.cx - L * c - W * s, r.cy - L * s + W * c],
  ];
}

const at = (p: Point, y: number): Vector3 => new Vector3(sx(p), y, sz(p));

/** Triangles with UVs in `tile`-metre units laid along each face: u level, v up the slope. */
function slopedFaces(tris: readonly (readonly [Vector3, Vector3, Vector3])[], tile: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const up = new Vector3(0, 1, 0);
  for (const [a, b, c] of tris) {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    if (n.y < 0) n.negate();
    const t = new Vector3().crossVectors(up, n);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    const bt = new Vector3().crossVectors(n, t).normalize();
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      uv.push(p.dot(t) / tile, p.dot(bt) / tile);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** A hipped roof over an oriented rectangle: eaves at y, ridge `rise` above. */
function hipGeometry(r: RsRect, y: number, rise: number, overhang = EAVE_OVERHANG): BufferGeometry {
  const [p0, p1, p2, p3] = rectCorners(r, overhang).map((p) => at(p, y)) as [Vector3, Vector3, Vector3, Vector3];
  const a = (r.angle * Math.PI) / 180;
  const half = Math.max(0, r.length / 2 - r.width / 2);
  const r0 = at([r.cx - half * Math.cos(a), r.cy - half * Math.sin(a)], y + rise);
  const r1 = at([r.cx + half * Math.cos(a), r.cy + half * Math.sin(a)], y + rise);
  return slopedFaces(
    [
      [p0, p1, r1],
      [p0, r1, r0],
      [p2, p3, r0],
      [p2, r0, r1],
      [p1, p2, r1],
      [p3, p0, r0],
    ],
    2,
  );
}

/** A pitched roof: two slopes to a ridge along the long side; returns slopes and gable ends. */
function gableGeometry(r: RsRect, y: number, rise: number): { roof: BufferGeometry; gables: BufferGeometry } {
  const o = EAVE_OVERHANG * 0.6;
  const [p0, p1, p2, p3] = rectCorners(r, o).map((p) => at(p, y)) as [Vector3, Vector3, Vector3, Vector3];
  const a = (r.angle * Math.PI) / 180;
  const L = r.length / 2 + o;
  const r0 = at([r.cx - L * Math.cos(a), r.cy - L * Math.sin(a)], y + rise);
  const r1 = at([r.cx + L * Math.cos(a), r.cy + L * Math.sin(a)], y + rise);
  const roof = slopedFaces(
    [
      [p0, p1, r1],
      [p0, r1, r0],
      [p2, p3, r0],
      [p2, r0, r1],
    ],
    1,
  );
  // The gable triangles, inset to the wall line.
  const [q0, q1, q2, q3] = rectCorners(r, 0).map((p) => at(p, y)) as [Vector3, Vector3, Vector3, Vector3];
  const L0 = r.length / 2;
  const s0 = at([r.cx - L0 * Math.cos(a), r.cy - L0 * Math.sin(a)], y + rise * (1 - o / (r.width / 2 + o)));
  const s1 = at([r.cx + L0 * Math.cos(a), r.cy + L0 * Math.sin(a)], y + rise * (1 - o / (r.width / 2 + o)));
  const gables = slopedFaces(
    [
      [q1, q2, s1],
      [q3, q0, s0],
    ],
    4,
  );
  return { roof, gables };
}

// ── Shared materials ────────────────────────────────────────────────────────

export interface BuildingMaterials {
  dispose(): void;
}

interface Palette {
  plaster: SurfaceTextures;
  plasterWarm: SurfaceTextures;
  tiles: SurfaceTextures;
  hallSheet: SurfaceTextures;
  shedSheet: SurfaceTextures;
  slab: SurfaceTextures;
  brick: SurfaceTextures;
  glass: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  fin: MeshStandardMaterial;
  brickPanel: MeshStandardMaterial;
  rail: MeshStandardMaterial;
  plinth: MeshStandardMaterial;
  tank: MeshStandardMaterial;
  fascia: MeshStandardMaterial;
  door: MeshStandardMaterial;
  soffit: MeshStandardMaterial;
}

function texturedMaterial(t: SurfaceTextures, extra: { roughness?: number; metalness?: number; repeat?: number } = {}): MeshStandardMaterial {
  if (extra.repeat) {
    t.map.repeat.set(extra.repeat, extra.repeat);
    t.normalMap?.repeat.set(extra.repeat, extra.repeat);
  }
  const m = new MeshStandardMaterial({
    map: t.map,
    roughness: extra.roughness ?? 0.9,
    metalness: extra.metalness ?? 0,
  });
  if (t.normalMap) m.normalMap = t.normalMap;
  return m;
}

// ── Building assembly ───────────────────────────────────────────────────────

export interface BuiltBuilding {
  building: RsBuilding;
  group: Group;
  /** Materials tinted while the building is selected (this building's own). */
  tintable: MeshStandardMaterial[];
  /** Meshes a click can land on. */
  pickables: Mesh[];
  /** Highest point of the roof, for labels and framing. */
  top: number;
}

/** Collects instance transforms of a unit box for one material. */
class Boxes {
  readonly list: Matrix4[] = [];
  constructor(readonly material: Material) {}
  /** A box in an edge's frame: x along the edge, y up, z out of the wall. */
  add(frame: EdgeFrame, along: number, y: number, out: number, w: number, h: number, d: number): void {
    const p = new Vector3(frame.ax + frame.ux * along + frame.nx * out, y, -(frame.ay + frame.uy * along + frame.ny * out));
    this.list.push(new Matrix4().compose(p, frame.q, new Vector3(w, h, d)));
  }
  mesh(unit: BoxGeometry): InstancedMesh | null {
    if (this.list.length === 0) return null;
    const m = new InstancedMesh(unit, this.material, this.list.length);
    this.list.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = true;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }
}

interface EdgeFrame {
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  len: number;
  q: Quaternion;
}

function edges(outline: readonly Point[]): EdgeFrame[] {
  const pts = ccw(outline);
  const out: EdgeFrame[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = corner(pts, i);
    const b = corner(pts, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    out.push({
      ax: a[0],
      ay: a[1],
      ux: dx / len,
      uy: dy / len,
      nx: dy / len,
      ny: -dx / len,
      len,
      q: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(dy, dx)),
    });
  }
  return out;
}

/**
 * Builds every building. Call once; `dispose()` on the returned handle frees
 * the shared textures, geometries and materials.
 */
export function buildBuildings(buildings: readonly RsBuilding[]): {
  built: BuiltBuilding[];
  dispose(): void;
} {
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const keepTex = (t: SurfaceTextures): SurfaceTextures => {
    keep(t.map);
    if (t.normalMap) keep(t.normalMap);
    return t;
  };

  const P: Palette = {
    plaster: keepTex(plaster([236, 234, 228], 101)),
    plasterWarm: keepTex(plaster([232, 226, 210], 102, 1.3)),
    tiles: keepTex(clayTiles(103)),
    hallSheet: keepTex(corrugated([196, 58, 46], 104)),
    shedSheet: keepTex(corrugated([150, 76, 58], 105)),
    slab: keepTex(concrete(106)),
    brick: keepTex(brick(107)),
    glass: keep(new MeshStandardMaterial({ color: '#22323b', roughness: 0.06, metalness: 0.4, envMapIntensity: 5 })),
    frame: keep(new MeshStandardMaterial({ color: '#d9dbd8', roughness: 0.45, metalness: 0.4 })),
    trim: keep(new MeshStandardMaterial({ color: '#e7e5df', roughness: 0.85 })),
    fin: keep(new MeshStandardMaterial({ color: '#e1b12c', roughness: 0.6 })),
    brickPanel: keep(new MeshStandardMaterial({ color: '#a3553d', roughness: 0.9 })),
    rail: keep(new MeshStandardMaterial({ color: '#30363a', roughness: 0.5, metalness: 0.6 })),
    plinth: keep(new MeshStandardMaterial({ color: '#4a4c4c', roughness: 0.95 })),
    tank: keep(new MeshStandardMaterial({ color: '#1c1f22', roughness: 0.55 })),
    fascia: keep(new MeshStandardMaterial({ color: '#7a3a2a', roughness: 0.8 })),
    door: keep(new MeshStandardMaterial({ color: '#3b3229', roughness: 0.7 })),
    soffit: keep(new MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.9, side: DoubleSide })),
  };
  P.slab.map.repeat.set(1 / 8, 1 / 8);
  P.slab.normalMap?.repeat.set(1 / 8, 1 / 8);
  P.brick.map.repeat.set(1, 1);
  const tileMat = keep(texturedMaterial(P.tiles, { roughness: 0.75 }));
  tileMat.side = DoubleSide;
  const hallSheetMat = keep(texturedMaterial(P.hallSheet, { roughness: 0.55, metalness: 0.35 }));
  hallSheetMat.side = DoubleSide;
  const shedSheetMat = keep(texturedMaterial(P.shedSheet, { roughness: 0.65, metalness: 0.3 }));
  shedSheetMat.side = DoubleSide;
  const unit = keep(new BoxGeometry(1, 1, 1));
  const tankGeo = keep(new CylinderGeometry(0.72, 0.72, 1.55, 16));

  const built: BuiltBuilding[] = [];
  for (const b of buildings) {
    const group = new Group();
    group.userData['buildingId'] = b.id;
    const storey = RS_STOREY_HEIGHT[b.facade];
    const top = rsWallTop(b);
    const pickables: Mesh[] = [];
    const tintable: MeshStandardMaterial[] = [];
    const add = (geo: BufferGeometry, mat: Material, pick = true): Mesh => {
      keep(geo);
      const m = new Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      if (pick) pickables.push(m);
      return m;
    };

    // Walls: this building's own copy of the plaster, so selection can tint it.
    const surface = b.facade === 'shed' ? P.plasterWarm : b.kind === 'hall' ? P.plasterWarm : P.plaster;
    const wallMat = keep(texturedMaterial(surface, { roughness: 0.92 }));
    tintable.push(wallMat);
    add(wallGeometry(b.footprint, 0, top, storey), wallMat);
    add(wallGeometry(b.footprint, 0, 0.6, 0.6, 0.06), P.plinth, false);

    // ── Façade detail ──────────────────────────────────────────────────
    const glass = new Boxes(P.glass);
    const frame = new Boxes(P.frame);
    const trim = new Boxes(P.trim);
    const fins = new Boxes(P.fin);
    const panels = new Boxes(P.brickPanel);
    const rails = new Boxes(P.rail);
    const doors = new Boxes(P.door);
    const tall = b.levels >= 6;

    for (const e of edges(b.footprint)) {
      if (e.len < 2.4) continue;
      // Floor bands between storeys: slab edges that catch a line of shadow.
      if (b.levels > 1 && b.facade !== 'hall') {
        for (let f = 1; f < b.levels; f++) trim.add(e, e.len / 2, f * storey, 0.07, e.len + 0.02, 0.2, 0.14);
      }
      if (b.facade === 'dorm' || b.facade === 'fins') {
        const bay = b.facade === 'fins' ? 3.4 : 3.6;
        const n = Math.max(1, Math.floor(e.len / bay));
        const pitch = e.len / n;
        for (let f = 0; f < b.levels; f++) {
          const y0 = f * storey;
          for (let k = 0; k < n; k++) {
            const c = (k + 0.5) * pitch;
            const balcony = tall && b.facade === 'dorm' && e.len > 15 && f > 0 && k % 2 === 1;
            if (balcony) {
              // A balcony: slab, solid front, rail, and a door behind.
              const bw = Math.min(pitch - 0.4, 3);
              trim.add(e, c, y0 + 0.07, 0.65, bw, 0.15, 1.3);
              trim.add(e, c, y0 + 0.6, 1.27, bw, 0.95, 0.1);
              trim.add(e, c - bw / 2 + 0.05, y0 + 0.6, 0.65, 0.1, 0.95, 1.3);
              trim.add(e, c + bw / 2 - 0.05, y0 + 0.6, 0.65, 0.1, 0.95, 1.3);
              rails.add(e, c, y0 + 1.12, 1.27, bw, 0.05, 0.06);
              frame.add(e, c, y0 + 1.15, 0.03, 1.1, 2.25, 0.05);
              glass.add(e, c, y0 + 1.15, 0.06, 0.95, 2.1, 0.04);
              continue;
            }
            if (b.facade === 'fins') {
              // A wide window behind yellow fins, over a red-brick panel.
              const ww = Math.min(pitch - 0.5, 3);
              glass.add(e, c, y0 + 1.75, 0.04, ww, 1.75, 0.04);
              for (let j = 0; j < 7; j++) fins.add(e, c - ww / 2 + (j + 0.5) * (ww / 7), y0 + 1.75, 0.22, 0.07, 1.85, 0.36);
              panels.add(e, c, y0 + 0.5, 0.05, ww + 0.1, 0.75, 0.08);
              trim.add(e, c, y0 + 2.72, 0.3, ww + 0.4, 0.1, 0.6);
              continue;
            }
            // A window: frame, glass, sill and sunshade.
            const ww = 1.5;
            const wy = y0 + 0.9 + 0.75;
            frame.add(e, c, wy, 0.03, ww + 0.12, 1.62, 0.05);
            glass.add(e, c, wy, 0.06, ww, 1.5, 0.04);
            frame.add(e, c, wy, 0.07, 0.05, 1.5, 0.04); // mullion
            trim.add(e, c, y0 + 0.86, 0.08, ww + 0.25, 0.07, 0.16);
            trim.add(e, c, y0 + 2.58, 0.27, ww + 0.6, 0.09, 0.55);
          }
        }
        // A door at the foot of the longest walls.
        if (e.len > 12) {
          doors.add(e, e.len / 2, 1.15, 0.05, 1.6, 2.3, 0.08);
          trim.add(e, e.len / 2, 2.5, 0.5, 2.6, 0.12, 1.0);
        }
      } else if (b.facade === 'bands') {
        // Ribbon windows under continuous sunshades, storey after storey.
        const run = e.len - 0.8;
        if (run > 1) {
          for (let f = 0; f < b.levels; f++) {
            const y0 = f * storey;
            glass.add(e, e.len / 2, y0 + 1.65, 0.05, run, 1.35, 0.04);
            const mull = Math.max(1, Math.round(run / 1.5));
            for (let j = 0; j <= mull; j++) frame.add(e, 0.4 + (j * run) / mull, y0 + 1.65, 0.08, 0.06, 1.35, 0.05);
            trim.add(e, e.len / 2, y0 + 2.5, 0.42, e.len + 0.3, 0.12, 0.85);
          }
          if (e.len > 12) doors.add(e, e.len / 2, 1.15, 0.06, 2.2, 2.3, 0.08);
        }
      } else if (b.facade === 'hall') {
        if (e.len > 12) {
          glass.add(e, e.len / 2, 5.6, 0.05, e.len - 2, 1.1, 0.04);
          const nd = Math.max(1, Math.floor(e.len / 9));
          for (let k = 0; k < nd; k++) doors.add(e, ((k + 0.5) * e.len) / nd, 1.5, 0.06, 2.4, 3, 0.08);
        }
      } else if (b.facade === 'shed' && e.len > 6) {
        doors.add(e, e.len / 2, 1.1, 0.05, 1.4, 2.2, 0.08);
      }
    }
    for (const boxes of [glass, frame, trim, fins, panels, rails, doors]) {
      const m = boxes.mesh(unit);
      if (m) group.add(m);
    }

    // ── Roof ───────────────────────────────────────────────────────────
    let roofTop = top;
    if (b.roof === 'flat' || b.roof === 'flat-stubs') {
      const roofMat = keep(texturedMaterial(P.slab, { roughness: 0.95 }));
      tintable.push(roofMat);
      add(capGeometry(b.footprint, top), roofMat);
      // Parapet, both faces, with a coping line.
      add(wallGeometry(b.footprint, top, top + 1.05, 1.05, 0), wallMat);
      add(wallGeometry(b.footprint, top, top + 1.05, 1.05, -0.2, true), wallMat, false);
      add(wallGeometry(b.footprint, top + 1.0, top + 1.1, 1, 0.05), P.trim, false);
      roofTop = top + 1.1;
      // A stair head with its door, and black water tanks.
      const [cx, cy] = polygonCentre(b.footprint);
      const head = new Mesh(unit, wallMat);
      head.scale.set(4.5, 3, 4);
      head.position.set(cx, top + 1.5, -cy);
      head.castShadow = head.receiveShadow = true;
      group.add(head);
      const headRoof = new Mesh(unit, P.trim);
      headRoof.scale.set(5, 0.15, 4.5);
      headRoof.position.set(cx, top + 3.05, -cy);
      headRoof.castShadow = true;
      group.add(headRoof);
      const nTanks = Math.min(6, 2 + Math.floor(Math.abs(polygonArea(b.footprint)) / 500));
      const tanks = new InstancedMesh(tankGeo, P.tank, nTanks);
      for (let k = 0; k < nTanks; k++) {
        tanks.setMatrixAt(k, new Matrix4().makeTranslation(cx + 3.4 + (k % 3) * 1.7, top + 0.78, -cy + 1.2 - Math.floor(k / 3) * 1.7));
      }
      tanks.castShadow = true;
      group.add(tanks);
      if (b.roof === 'flat-stubs') {
        const xs = b.footprint.map((p) => p[0]);
        const ys = b.footprint.map((p) => p[1]);
        const spots: Matrix4[] = [];
        for (let x = Math.min(...xs) + 2.5; x < Math.max(...xs); x += 5) {
          for (let y = Math.min(...ys) + 2.5; y < Math.max(...ys); y += 5) {
            if (insideBy([x, y], b.footprint, 1.4)) spots.push(new Matrix4().compose(new Vector3(x, top + 0.6, -y), new Quaternion(), new Vector3(0.45, 1.2, 0.45)));
          }
        }
        const stubs = new InstancedMesh(unit, P.trim, spots.length);
        spots.forEach((m, i) => stubs.setMatrixAt(i, m));
        stubs.castShadow = true;
        group.add(stubs);
      }
    } else {
      // A slab under the roof closes the top and covers links between parts.
      add(capGeometry(b.footprint, top), P.trim, false);
      const roofMat = keep(
        b.roof === 'hip'
          ? tileMat.clone()
          : b.kind === 'hall'
            ? hallSheetMat.clone()
            : shedSheetMat.clone(),
      );
      tintable.push(roofMat);
      for (const part of b.roofParts ?? []) {
        if (b.roof === 'hip') {
          const rise = Math.min(4.6, part.width * 0.21);
          add(hipGeometry(part, top, rise), roofMat);
          // Fascia board and soffit along the eaves.
          add(wallGeometry(rectCorners(part, EAVE_OVERHANG), top - 0.28, top + 0.02, 0.3), P.fascia, false);
          add(capGeometry(rectCorners(part, EAVE_OVERHANG), top - 0.28), P.soffit, false);
          roofTop = Math.max(roofTop, top + rise);
          if (b.id === 'nikunja') {
            // Nikunja's raised ridge light: a glazed band under its own small hip.
            const inner: RsRect = { ...part, length: part.length * 0.55, width: part.width * 0.32 };
            const lift = rise * 0.62;
            add(wallGeometry(rectCorners(inner), top + lift, top + lift + 1.3, 1.3), P.glass, false);
            add(hipGeometry(inner, top + lift + 1.3, 1.1, 0.45), roofMat);
            roofTop = Math.max(roofTop, top + lift + 2.4);
          }
        } else {
          const rise = Math.min(4, part.width * (b.kind === 'hall' ? 0.15 : 0.18));
          const { roof, gables } = gableGeometry(part, top, rise);
          add(roof, roofMat);
          add(gables, wallMat);
          roofTop = Math.max(roofTop, top + rise);
        }
      }
    }
    built.push({ building: b, group, tintable, pickables, top: roofTop });
  }

  return {
    built,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Inside the polygon and at least `margin` metres from every edge. */
function insideBy(p: Point, polygon: readonly Point[], margin: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = corner(polygon, i);
    const [xj, yj] = corner(polygon, j);
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = corner(polygon, i);
    const b = corner(polygon, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < margin) return false;
  }
  return true;
}

/** A plain colour for the selection tint to be applied on top of. */
export const SELECT_TINT = new Color('#2ecc71').multiplyScalar(0.06);
