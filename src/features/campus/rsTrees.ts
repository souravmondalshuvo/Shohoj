/**
 * Trees for the Residential Campus scene (#978).
 *
 * The campus is heavily planted; the BRACU photographs show what with: broad
 * rain-tree and mango canopies, tall columnar mast trees (debdaru) along the
 * edges, coconut palms over the roofs, banana clumps by the walls, and trunks
 * whitewashed at the foot. Four species are modelled here, each once, as a
 * trunk-and-branch mesh and a set of alpha-tested leaf cards whose normals
 * point out from the crown — so a canopy shades like a mass of leaves, not
 * like flat cards. Each species is then drawn many times as an InstancedMesh.
 *
 * Positions are the canopies read off the satellite image. Which species
 * stands where is a plausible assignment (mast trees and palms by the walls),
 * not a survey; the page says so.
 */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  type Texture,
  Vector3,
} from 'three';

import { RS_OUTER_TREES, RS_TREES, RS_WALL, corner, type Point } from '../../core/campusBracuRs.ts';
import { bananaLeaf, bark, leafCluster, palmFrond, rng } from './rsTextures.ts';

type Species = 'broadleaf' | 'mast' | 'palm' | 'banana';

/** Geometry under construction: positions, normals, uvs, colours. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];

  /** A quad from four corners, with explicit per-corner normals. */
  quad(c: readonly Vector3[], n: readonly Vector3[], uvs: readonly (readonly [number, number])[], color: Color): void {
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = c[i];
      const q = n[i];
      const t = uvs[i];
      if (!p || !q || !t) continue;
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(q.x, q.y, q.z);
      this.uv.push(t[0], t[1]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /**
   * A tapered tube from a to b. The lowest `white` metres of a trunk are
   * whitewashed, as on the campus.
   */
  tube(a: Vector3, b: Vector3, r0: number, r1: number, seg: number, white = 0): void {
    const axis = b.clone().sub(a);
    const len = axis.length();
    const dir = axis.clone().normalize();
    const side = Math.abs(dir.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = new Vector3().crossVectors(dir, side).normalize();
    const v = new Vector3().crossVectors(dir, u).normalize();
    const bark = new Color('#ffffff');
    const wash = new Color('#f1efe6').multiplyScalar(1.6);
    const ring = (t: number, i: number): { p: Vector3; n: Vector3 } => {
      const ang = (i / seg) * Math.PI * 2;
      const n = u.clone().multiplyScalar(Math.cos(ang)).add(v.clone().multiplyScalar(Math.sin(ang)));
      const r = r0 + (r1 - r0) * t;
      return { p: a.clone().addScaledVector(dir, len * t).addScaledVector(n, r), n };
    };
    const steps = white > 0 ? 2 : 1;
    const cut = white > 0 ? Math.min(0.9, white / len) : 1;
    for (let s = 0; s < steps; s++) {
      const t0 = s === 0 ? 0 : cut;
      const t1 = s === 0 ? cut : 1;
      const color = white > 0 && s === 0 ? wash : bark;
      for (let i = 0; i < seg; i++) {
        const A = ring(t0, i);
        const B = ring(t0, i + 1);
        const C = ring(t1, i + 1);
        const D = ring(t1, i);
        this.quad([A.p, B.p, C.p, D.p], [A.n, B.n, C.n, D.n], [[i / seg, t0 * len], [(i + 1) / seg, t0 * len], [(i + 1) / seg, t1 * len], [i / seg, t1 * len]], color);
      }
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/**
 * A leaf card: a square facing a random direction, its normals bent outward
 * from the crown's centre so the crown lights as one rounded mass.
 */
function card(leaves: Builder, at: Vector3, size: number, crown: Vector3, r: () => number, tint: Color): void {
  const yaw = r() * Math.PI * 2;
  const pitch = (r() - 0.5) * 1.2;
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch));
  const right = new Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(size / 2);
  const up = new Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(size / 2);
  const c = [
    at.clone().sub(right).sub(up),
    at.clone().add(right).sub(up),
    at.clone().add(right).add(up),
    at.clone().sub(right).add(up),
  ];
  const n = c.map((p) => p.clone().sub(crown).normalize().lerp(new Vector3(0, 1, 0), 0.25).normalize());
  leaves.quad(c, n, [[0, 0], [1, 0], [1, 1], [0, 1]], tint);
}

/** A frond or leaf blade: a strip bending along an arc, textured lengthwise. */
function blade(leaves: Builder, base: Vector3, yaw: number, rise: number, droop: number, len: number, width: number, steps: number, tint: Color): void {
  const fwd = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const side = new Vector3(-fwd.z, 0, fwd.x).multiplyScalar(width / 2);
  const at = (t: number): Vector3 => {
    const ang = rise - droop * t;
    return base.clone().addScaledVector(fwd, Math.cos(ang) * len * t).add(new Vector3(0, Math.sin(ang) * len * t, 0));
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const p0 = at(t0);
    const p1 = at(t1);
    const n = new Vector3(0, 1, 0).lerp(fwd, 0.2).normalize();
    leaves.quad([p0.clone().sub(side), p0.clone().add(side), p1.clone().add(side), p1.clone().sub(side)], [n, n, n, n], [[0, t0], [1, t0], [1, t1], [0, t1]], tint);
  }
}

interface Prototype {
  trunk: BufferGeometry;
  leaves: BufferGeometry;
  leafTexture: Texture;
}

function broadleaf(seed: number, tex: Texture): Prototype {
  const r = rng(seed);
  const trunk = new Builder();
  const leaves = new Builder();
  const top = new Vector3(0, 3.4, 0);
  trunk.tube(new Vector3(0, 0, 0), top, 0.38, 0.28, 9, 1.1);
  const crown = new Vector3(0, 7, 0);
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + r();
    const end = new Vector3(Math.cos(ang) * 3.2, 6.2 + r() * 1.5, Math.sin(ang) * 3.2);
    trunk.tube(top, end, 0.22, 0.1, 6);
  }
  const white = new Color('#ffffff');
  for (let k = 0; k < 46; k++) {
    // Points in a flattened ellipsoid: the wide, low crown of a rain tree.
    const u = r() * Math.PI * 2;
    const v = Math.acos(2 * r() - 1);
    const rad = 0.55 + 0.45 * Math.cbrt(r());
    const p = new Vector3(Math.sin(v) * Math.cos(u) * 5.2 * rad, Math.cos(v) * 2.6 * rad, Math.sin(v) * Math.sin(u) * 5.2 * rad).add(crown);
    card(leaves, p, 3.2 + r() * 1.2, crown, r, white);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), leafTexture: tex };
}

function mast(seed: number, tex: Texture): Prototype {
  const r = rng(seed);
  const trunk = new Builder();
  const leaves = new Builder();
  trunk.tube(new Vector3(0, 0, 0), new Vector3(0, 13, 0), 0.22, 0.08, 7, 1);
  const white = new Color('#ffffff');
  for (let k = 0; k < 40; k++) {
    const h = 1.6 + r() * 12;
    const radius = 1.7 * (1 - (h - 1.6) / 13) + 0.3;
    const ang = r() * Math.PI * 2;
    const p = new Vector3(Math.cos(ang) * radius * r(), h, Math.sin(ang) * radius * r());
    card(leaves, p, 1.6 + r() * 0.8, new Vector3(0, h, 0), r, white);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), leafTexture: tex };
}

function palm(seed: number, tex: Texture): Prototype {
  const r = rng(seed);
  const trunk = new Builder();
  const leaves = new Builder();
  // A gently leaning, curving stem.
  const lean = new Vector3(0.9, 0, 0.3);
  let prev = new Vector3(0, 0, 0);
  const segs = 6;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = new Vector3(lean.x * t * t * 1.6, t * 11, lean.z * t * t * 1.6);
    trunk.tube(prev, p, 0.2 - 0.03 * (i / segs), 0.2 - 0.03 * ((i + 1) / segs), 7, i === 1 ? 0.9 : 0);
    prev = p;
  }
  const white = new Color('#ffffff');
  for (let k = 0; k < 15; k++) {
    const yaw = (k / 15) * Math.PI * 2 + r() * 0.3;
    blade(leaves, prev, yaw, 0.6 + r() * 0.4, 1.4 + r() * 0.5, 4.4 + r() * 0.8, 1.3, 6, white);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), leafTexture: tex };
}

function banana(seed: number, tex: Texture): Prototype {
  const r = rng(seed);
  const trunk = new Builder();
  const leaves = new Builder();
  const top = new Vector3(0, 2.2, 0);
  trunk.tube(new Vector3(0, 0, 0), top, 0.17, 0.12, 7);
  const white = new Color('#ffffff');
  for (let k = 0; k < 8; k++) {
    const yaw = (k / 8) * Math.PI * 2 + r();
    blade(leaves, top.clone().add(new Vector3(0, r() * 0.4, 0)), yaw, 1.1, 1.1 + r() * 0.4, 2.4 + r() * 0.5, 0.75, 5, white);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), leafTexture: tex };
}

/** Distance from a point to the campus wall. */
function wallDistance(p: Point): number {
  let best = Infinity;
  for (let i = 0; i < RS_WALL.length; i++) {
    const a = corner(RS_WALL, i);
    const b = corner(RS_WALL, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

/** The species standing at a tree position: deterministic, wall-aware. */
export function speciesAt(p: Point, i: number): Species {
  const h = rng(i * 7919 + 13)();
  if (wallDistance(p) < 6) {
    return h < 0.4 ? 'mast' : h < 0.62 ? 'palm' : h < 0.75 ? 'banana' : 'broadleaf';
  }
  return h < 0.66 ? 'broadleaf' : h < 0.84 ? 'palm' : h < 0.93 ? 'banana' : 'mast';
}

export interface Trees {
  group: Group;
  dispose(): void;
}

/**
 * Every tree, on campus and round it, as four InstancedMesh pairs.
 * `outerStride` keeps every n-th tree outside the wall (2 on a phone).
 */
export function buildTrees(outerStride = 1): Trees {
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const broadTex = keep(leafCluster(31, ['#3f6b2a', '#4c7a30', '#35602a', '#58863a', '#2e5524']));
  const mastTex = keep(leafCluster(32, ['#2f5a25', '#3a6a2b', '#26501f'], 34));
  const palmTex = keep(palmFrond(33));
  const bananaTex = keep(bananaLeaf(34));
  const barkTex = bark(35);
  keep(barkTex.map);
  if (barkTex.normalMap) keep(barkTex.normalMap);

  const protos: Record<Species, Prototype> = {
    broadleaf: broadleaf(41, broadTex),
    mast: mast(42, mastTex),
    palm: palm(43, palmTex),
    banana: banana(44, bananaTex),
  };
  const barkMat = keep(
    new MeshStandardMaterial({
      map: barkTex.map,
      normalMap: barkTex.normalMap ?? null,
      vertexColors: true,
      roughness: 0.95,
    }),
  );

  const bySpecies: Record<Species, Point[]> = { broadleaf: [], mast: [], palm: [], banana: [] };
  RS_TREES.forEach((p, i) => bySpecies[speciesAt(p, i)].push(p));
  // Outside the wall: mostly broad canopies of village groves.
  RS_OUTER_TREES.forEach((p, i) => {
    if (i % outerStride !== 0) return;
    const h = rng(i * 104729 + 7)();
    bySpecies[h < 0.72 ? 'broadleaf' : h < 0.86 ? 'palm' : h < 0.94 ? 'mast' : 'banana'].push(p);
  });

  const group = new Group();
  const m = new Matrix4();
  const greens = [new Color('#ffffff'), new Color('#e6f0d8'), new Color('#d8e6c4'), new Color('#f2efd6'), new Color('#cfdcb8')];
  for (const species of Object.keys(protos) as Species[]) {
    const proto = protos[species];
    const spots = bySpecies[species];
    if (spots.length === 0) continue;
    keep(proto.trunk);
    keep(proto.leaves);
    const leafMat = keep(
      new MeshStandardMaterial({
        map: proto.leafTexture,
        alphaTest: 0.45,
        side: DoubleSide,
        roughness: 0.85,
        vertexColors: true,
      }),
    );
    // Leaf shadows follow the leaves' shapes, not the cards'.
    const depth = keep(new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: proto.leafTexture, alphaTest: 0.45 }));
    const trunks = new InstancedMesh(proto.trunk, barkMat, spots.length);
    const crowns = new InstancedMesh(proto.leaves, leafMat, spots.length);
    crowns.customDepthMaterial = depth;
    const r = rng(species.length * 101 + spots.length);
    spots.forEach((p, i) => {
      const s = species === 'banana' ? 0.8 + r() * 0.4 : 0.75 + r() * 0.5;
      m.compose(
        new Vector3(p[0], 0, -p[1]),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * Math.PI * 2),
        new Vector3(s, species === 'palm' ? 0.85 + r() * 0.35 : s, s),
      );
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, greens[Math.floor(r() * greens.length)] ?? new Color('#ffffff'));
    });
    for (const mesh of [trunks, crowns]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
