/**
 * The buildings outside the wall (#996): Khagan's village and the factories
 * along the road, drawn from their OpenStreetMap footprints.
 *
 * Only the footprints are mapped. What stands on them follows the way such a
 * neighbourhood is built: small footprints are tin-roofed huts of corrugated
 * sheet or bare brick; larger ones are one- to six-storey concrete houses,
 * colour-washed or left in bare brick, with a parapet, a black water tank and
 * a stair head on the flat roof, sometimes column stubs where the next floor
 * will go; the largest are factory sheds under a pale or blue sheet roof.
 * Which one each footprint gets is seeded, so it is the same on every load,
 * and the route says it is illustrative.
 *
 * Everything is merged per material: some 130 buildings in a few dozen draw
 * calls.
 */

import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Group,
  Quaternion,
  type Texture,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { polygonArea, type Point, type RsRect } from '../../core/campusBracuRs.ts';
import { capGeometry, gableGeometry, grimed, rectCorners, wallGeometry, weathered } from './rsBuildings.ts';
import { CITY_WINDOW, VILLAGE_WINDOW, brick, concrete, corrugated, facadeSet, rng, shutter, signboard, type SurfaceTextures } from './rsTextures.ts';

/** Colour washes seen on Savar's houses: off-white, cream, yellow, sky, mint, salmon. */
const WASHES: ReadonlyArray<readonly [number, number, number]> = [
  [214, 208, 194],
  [222, 204, 166],
  [226, 206, 140],
  [170, 196, 206],
  [178, 204, 180],
  [216, 172, 152],
  [170, 168, 160], // bare cement render
];

/**
 * Dhaka's blocks of flats are mostly off-white, cream or bare cement render;
 * the odd one yellow or salmon. Indices into WASHES, repeated for weight.
 */
const DHAKA_WASHES = [0, 0, 0, 0, 1, 1, 1, 6, 6, 6, 2, 5];

export type NeighbourKind = 'hut' | 'house' | 'shed';

export interface NeighbourPlan {
  kind: NeighbourKind;
  /** Storeys (huts and sheds: 1). */
  storeys: number;
  /** Wall finish: a wash index, 'brick', or 'tin'. */
  walls: number | 'brick' | 'tin';
  /** Roof: flat concrete, or a sheet gable in a colour. */
  roof: 'flat' | 'tin-silver' | 'tin-rust' | 'tin-blue' | 'sheet-pale' | 'sheet-blue';
  tank: boolean;
  stairHead: boolean;
  stubs: boolean;
}

/**
 * What stands on one footprint. Pure and seeded by the footprint's index, so
 * tests can check the mix without a browser.
 */
export function planNeighbour(area: number, seed: number): NeighbourPlan {
  const r = rng(7700 + seed);
  const p = r();
  if (area < 70) {
    return {
      kind: 'hut',
      storeys: 1,
      walls: p < 0.55 ? 'tin' : p < 0.85 ? 'brick' : Math.floor(r() * (WASHES.length - 1)),
      roof: r() < 0.55 ? 'tin-silver' : r() < 0.75 ? 'tin-rust' : 'tin-blue',
      tank: false,
      stairHead: false,
      stubs: false,
    };
  }
  if (area > 1200) {
    return {
      kind: 'shed',
      storeys: 1,
      walls: WASHES.length - 1,
      roof: p < 0.6 ? 'sheet-pale' : 'sheet-blue',
      tank: false,
      stairHead: false,
      stubs: false,
    };
  }
  const max = area < 150 ? 2 : area < 400 ? 4 : 6;
  const storeys = 1 + Math.floor(r() * max);
  const w = r();
  const walls = w < 0.2 ? 'brick' : Math.floor(r() * WASHES.length);
  // A one-storey house is often semi-pucca: brick walls under a tin roof.
  if (storeys === 1 && r() < 0.3) {
    return { kind: 'house', storeys, walls, roof: r() < 0.6 ? 'tin-silver' : 'tin-rust', tank: false, stairHead: false, stubs: false };
  }
  return {
    kind: 'house',
    storeys,
    walls,
    roof: 'flat',
    tank: r() < 0.7,
    stairHead: storeys >= 2 && r() < 0.75,
    stubs: storeys >= 2 && r() < 0.18,
  };
}

/**
 * What stands on a Dhaka plot (Bashundhara, Merul Badda): `storeys` decided by
 * the caller (OSM's count, or a likely one for the plot's size). A one-storey
 * scrap of a plot is a shop or a shack under tin; anything taller is a
 * concrete block, colour-washed or bare brick, with tanks and a stair head on
 * its flat roof. Seeded by the footprint's index.
 */
export function urbanPlan(area: number, storeys: number, seed: number): NeighbourPlan {
  const r = rng(7900 + seed);
  if (storeys <= 1 && area < 60) {
    return { kind: 'hut', storeys: 1, walls: r() < 0.5 ? 'tin' : 'brick', roof: r() < 0.6 ? 'tin-silver' : 'tin-rust', tank: false, stairHead: false, stubs: false };
  }
  const w = r();
  return {
    kind: 'house',
    storeys: Math.max(1, Math.round(storeys)),
    walls: w < 0.12 ? 'brick' : (DHAKA_WASHES[Math.floor(r() * DHAKA_WASHES.length)] ?? 0),
    roof: 'flat',
    tank: r() < 0.8,
    stairHead: storeys >= 2 && r() < 0.85,
    stubs: storeys >= 2 && storeys <= 5 && r() < 0.12,
  };
}

/** The smallest rectangle round a footprint, its long side first. */
export function fitRect(outline: readonly Point[]): RsRect {
  let best: RsRect = { cx: 0, cy: 0, length: 0, width: 0, angle: 0 };
  let bestArea = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (!a || !b) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of outline) {
      const u = p[0] * c + p[1] * s;
      const v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < bestArea) {
      bestArea = area;
      const um = (u0 + u1) / 2;
      const vm = (v0 + v1) / 2;
      const cx = um * c - vm * s;
      const cy = um * s + vm * c;
      const long = u1 - u0 >= v1 - v0;
      best = {
        cx,
        cy,
        length: long ? u1 - u0 : v1 - v0,
        width: long ? v1 - v0 : u1 - u0,
        angle: ((long ? ang : ang + Math.PI / 2) * 180) / Math.PI,
      };
    }
  }
  return best;
}

/**
 * Whether a footprint is rectangle enough to draw on its fitted rectangle
 * (for a gable roof) without visibly changing its mapped outline.
 */
export function gableFits(outline: readonly Point[]): boolean {
  const r = fitRect(outline);
  return Math.abs(polygonArea(outline)) >= 0.9 * r.length * r.width;
}

export interface Neighbours {
  group: Group;
  dispose(): void;
}

/** A Dhaka neighbourhood's extras: wide grilled windows, and relief on the nearer blocks. */
export interface CityStyle {
  /**
   * Blocks whose middle is within this many metres of the origin get a ledge
   * round every floor and balconies on their long sides; further off, haze
   * would hide them and they would only cost frames.
   */
  detailRadius: number;
  /**
   * Whether a point (campus metres, x east and y north) is within `reach` of
   * a street's kerb. A block's sides that face one get shops on the ground
   * floor, under their signboards; without it, no side does.
   */
  street?: (p: readonly [number, number], reach: number) => boolean;
}

/** Roof slabs in a Dhaka neighbourhood: mostly bare concrete, some washed pale, some stained, a few painted red oxide or green against the rain. */
const ROOF_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [1, 1, 1],
  [1.12, 1.1, 1.06],
  [1.12, 1.1, 1.06],
  [0.78, 0.76, 0.72],
  [0.86, 0.85, 0.82],
  [1.05, 0.7, 0.58],
  [0.86, 0.98, 0.88],
];
/** Water tanks on Dhaka roofs: black plastic mostly, then blue, then cream. */
const TANK_COLOURS = ['#1b1d1f', '#1b1d1f', '#1b1d1f', '#24476b', '#2f5f8f', '#d9d6cb'];
/** Shutters as they are painted: plain galvanised grey most, then blue, green, red. */
const SHUTTER_COLOURS = ['#9a9d9e', '#8c9092', '#a7a59d', '#4d6f8f', '#4f7a5a', '#8f3b31'];
/** Flex signboards, loud. */
const SIGN_COLOURS = ['#d23a2e', '#1f8a4c', '#1f5fa8', '#f0c02a', '#f4f2ea', '#e2712b', '#b0306a', '#2a9bb0'];

/**
 * Every footprint raised as `plans` say (by index), or by Savar's mix
 * (planNeighbour) where no plan is given. `city` gives the walls a Dhaka
 * flat's wide, grilled windows in place of a village house's, starts each
 * building somewhere different along its texture so no two weather alike,
 * and puts floor ledges and balconies on the nearer blocks.
 */
export function buildNeighbours(
  footprints: readonly (readonly Point[])[],
  plans?: readonly NeighbourPlan[],
  city: CityStyle | null = null,
): Neighbours {
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();

  // ── Materials ─────────────────────────────────────────────────────────
  const brickTex = brick(711);
  const set = facadeSet(WASHES, 712, brickTex.map, city ? CITY_WINDOW : VILLAGE_WINDOW);
  keep(brickTex.map);
  if (brickTex.normalMap) keep(brickTex.normalMap);
  if (set.normalMap) keep(set.normalMap);
  const facade = (map: Texture): MeshStandardMaterial => {
    keep(map);
    map.repeat.set(4 / 3, 1);
    // The walls' u runs a unit per 4 m; with this repeat, 3 m to a unit of the map's.
    const m = grimed(new MeshStandardMaterial({ map, roughness: 0.95 }), 3);
    if (set.normalMap) m.normalMap = set.normalMap;
    return keep(m);
  };
  const washMats = set.maps.map(facade);
  const brickMat = set.brickMap ? facade(set.brickMap) : keep(new MeshStandardMaterial({ color: '#8f4f3a', roughness: 0.95 }));
  const sheet = (c: readonly [number, number, number], seed: number, wallRepeat: boolean): MeshStandardMaterial => {
    const t: SurfaceTextures = corrugated(c, seed);
    keep(t.map);
    if (t.normalMap) keep(t.normalMap);
    if (wallRepeat) {
      // Walls carry u in quarter-metres and v in metres (storey = 1).
      t.map.repeat.set(4, 1);
      t.normalMap?.repeat.set(4, 1);
    }
    const m = new MeshStandardMaterial({ map: t.map, roughness: 0.55, metalness: 0.45, side: DoubleSide });
    if (t.normalMap) m.normalMap = t.normalMap;
    return keep(m);
  };
  const roofMats: Record<Exclude<NeighbourPlan['roof'], 'flat'>, MeshStandardMaterial> = {
    'tin-silver': sheet([172, 176, 174], 721, false),
    'tin-rust': sheet([142, 92, 64], 722, false),
    'tin-blue': sheet([104, 126, 140], 723, false),
    'sheet-pale': sheet([200, 202, 198], 724, false),
    'sheet-blue': sheet([84, 116, 146], 725, false),
  };
  const tinWall = sheet([150, 148, 140], 726, true);
  const slab = concrete(727, 150);
  keep(slab.map);
  if (slab.normalMap) keep(slab.normalMap);
  slab.map.repeat.set(1 / 8, 1 / 8);
  slab.normalMap?.repeat.set(1 / 8, 1 / 8);
  const slabMat = keep(weathered(new MeshStandardMaterial({ map: slab.map, roughness: 0.95 })));
  if (slab.normalMap) slabMat.normalMap = slab.normalMap;
  const parapetMat = keep(new MeshStandardMaterial({ color: '#a9a69c', roughness: 0.95 }));
  // White: each tank's own colour is its instance colour.
  const tankMat = keep(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
  const stubMat = keep(new MeshStandardMaterial({ color: '#8d8a82', roughness: 0.9 }));
  // Each roof's tint rides on its vertices (white, so unchanged, off the city).
  slabMat.vertexColors = true;

  const buckets = new Map<Material, BufferGeometry[]>();
  const put = (mat: Material, geo: BufferGeometry): void => {
    const list = buckets.get(mat) ?? [];
    list.push(geo.index ? geo.toNonIndexed() : geo);
    if (geo.index) geo.dispose();
    buckets.set(mat, list);
  };
  const tanks: Array<{ m: Matrix4; c: Color }> = [];
  const tankBlack = new Color('#1b1d1f');
  // Street-front shops: shutters (rolled down), open fronts, and signboards.
  const shutters: Array<{ m: Matrix4; c: Color }> = [];
  const openings: Matrix4[] = [];
  const signs: Array<Array<{ m: Matrix4; c: Color }>> = [[], [], []];
  // Potted plants along a roof's parapet.
  const pots: Array<{ m: Matrix4; c: Color }> = [];
  const heads: Matrix4[] = [];
  const stubs: Matrix4[] = [];
  // Floor ledges and balconies: unit boxes, tinted to their building's wash.
  const relief: Array<{ m: Matrix4; c: Color }> = [];
  const up = new Vector3(0, 1, 0);

  /**
   * A thin concrete ledge round every floor of a rectangular block (the
   * chajja that throws a band of shadow down the wall below it), and on its
   * long sides a balcony in some bays: a slab and a solid parapet. How many
   * bays have one is the building's own habit.
   */
  function addRelief(
    rect: RsRect,
    plan: NeighbourPlan,
    along: (u: number, v: number) => Vector3,
    q: Quaternion,
    r: () => number,
  ): void {
    const tint = plan.walls === 'brick' ? [150, 92, 70] : (WASHES[typeof plan.walls === 'number' ? plan.walls : 0] ?? [214, 208, 194]);
    const c = new Color().setRGB(
      Math.min(1, (tint[0] / 255) * 1.06),
      Math.min(1, (tint[1] / 255) * 1.06),
      Math.min(1, (tint[2] / 255) * 1.06),
      SRGBColorSpace,
    );
    const L = rect.length;
    const W = rect.width;
    const box = (u: number, v: number, y: number, sx: number, sy: number, sz: number): void => {
      const p = along(u, v);
      p.y = y;
      relief.push({ m: new Matrix4().compose(p, q, new Vector3(sx, sy, sz)), c });
    };
    const habit = r();
    const rate = habit < 0.3 ? 0 : 0.35 + 0.6 * habit;
    const bays = Math.max(1, Math.floor(L / 3.4));
    for (let k = 1; k < plan.storeys; k++) {
      const y = k * 3.1;
      box(0, W / 2 + 0.2, y, L + 0.8, 0.16, 0.45);
      box(0, -(W / 2 + 0.2), y, L + 0.8, 0.16, 0.45);
      box(L / 2 + 0.2, 0, y, 0.45, 0.16, W + 0.8);
      box(-(L / 2 + 0.2), 0, y, 0.45, 0.16, W + 0.8);
      for (const side of [1, -1]) {
        for (let j = 0; j < bays; j++) {
          if (r() >= rate) continue;
          const u = -L / 2 + ((j + 0.5) * L) / bays;
          const bw = Math.min(2.8, L / bays - 0.4);
          box(u, side * (W / 2 + 0.55), y + 0.06, bw, 0.14, 1.1);
          box(u, side * (W / 2 + 1.06), y + 0.56, bw, 1.0, 0.1);
        }
      }
    }
  }

  /**
   * Shops along every side of a block that faces a street: a row of bays
   * between piers on the ground floor, each a shop open to the street or
   * shuttered, with its signboard over it — some boards spanning two bays.
   */
  function addShops(
    rect: RsRect,
    along: (u: number, v: number) => Vector3,
    q: Quaternion,
    r: () => number,
    street: (p: readonly [number, number], reach: number) => boolean,
  ): void {
    const L = rect.length;
    const W = rect.width;
    // Each side: its middle, the direction along it, its length, and whether it runs along u.
    const sides = [
      { u: 0, v: W / 2, len: L, long: true, out: 1 },
      { u: 0, v: -W / 2, len: L, long: true, out: -1 },
      { u: L / 2, v: 0, len: W, long: false, out: 1 },
      { u: -L / 2, v: 0, len: W, long: false, out: -1 },
    ];
    for (const side of sides) {
      if (side.len < 4) continue;
      // Two metres out from the wall: a street within six of that is this side's.
      const probe = side.long ? along(side.u, side.v + side.out * 2) : along(side.u + side.out * 2, side.v);
      if (!street([probe.x, -probe.z], 6)) continue;
      const bays = Math.max(1, Math.floor(side.len / 3.2));
      const bay = side.len / bays;
      const w = bay - 0.4;
      let board = 0;
      for (let j = 0; j < bays; j++) {
        const t = -side.len / 2 + (j + 0.5) * bay;
        // (u, v) of a point `d` out from this side, `t` along it.
        const at = (d: number): Vector3 => (side.long ? along(t, side.v + side.out * d) : along(side.u + side.out * d, t));
        const place = (d: number, y: number, sw: number, sh: number, sd: number): Matrix4 => {
          const p = at(d);
          p.y = y;
          return new Matrix4().compose(p, q, side.long ? new Vector3(sw, sh, sd) : new Vector3(sd, sh, sw));
        };
        if (r() < 0.55) {
          openings.push(place(0.03, 1.1, w, 2.2, 0.08));
        } else {
          const c = new Color(SHUTTER_COLOURS[Math.floor(r() * SHUTTER_COLOURS.length)] ?? '#9a9d9e');
          shutters.push({ m: place(0.05, 1.1, w, 2.2, 0.08), c });
        }
        if (board > 0) {
          board--;
          continue;
        }
        if (r() < 0.12) continue;
        const span = j + 1 < bays && r() < 0.3 ? 2 : 1;
        board = span - 1;
        const bw = span * bay - 0.3;
        // A two-bay board centres between the bays; its top clears the first-floor ledge.
        const shift = (span - 1) * bay * 0.5;
        const p = side.long ? along(t + shift, side.v + side.out * 0.18) : along(side.u + side.out * 0.18, t + shift);
        p.y = 2.55 + r() * 0.06;
        const m = new Matrix4().compose(p, q, side.long ? new Vector3(bw, 0.78, 0.06) : new Vector3(0.06, 0.78, bw));
        const c = new Color(SIGN_COLOURS[Math.floor(r() * SIGN_COLOURS.length)] ?? '#d23a2e');
        signs[Math.floor(r() * signs.length)]?.push({ m, c });
      }
    }
  }

  footprints.forEach((nb, i) => {
    const area = Math.abs(polygonArea(nb));
    if (area < 8) return;
    const plan = plans?.[i] ?? planNeighbour(area, i);
    const r = rng(7800 + i);
    const rect = fitRect(nb);
    const wallMat = plan.walls === 'tin' ? tinWall : plan.walls === 'brick' ? brickMat : (washMats[plan.walls] ?? parapetMat);

    if (plan.roof !== 'flat') {
      const h = plan.kind === 'shed' ? 7 + r() * 2 : plan.kind === 'hut' ? 2.5 + r() * 0.4 : 3.1;
      const storey = plan.walls === 'tin' ? 1 : 3.1;
      if (!gableFits(nb)) {
        // Not a rectangle: keep the mapped outline, under a flat sheet roof.
        put(wallMat, wallGeometry(nb, 0, h, storey));
        put(roofMats[plan.roof], capGeometry(nb, h));
        return;
      }
      // Sheet gable on the fitted rectangle (within a tenth of the footprint);
      // walls on the same rectangle so the gables meet them.
      const rise = Math.min(plan.kind === 'shed' ? 4 : 2.2, rect.width * (plan.kind === 'shed' ? 0.12 : 0.28));
      put(wallMat, wallGeometry(rectCorners(rect, 0), 0, h, storey));
      const { roof, gables } = gableGeometry(rect, h, rise);
      put(roofMats[plan.roof], roof);
      put(plan.walls === 'tin' ? tinWall : roofMats[plan.roof], gables);
      return;
    }

    const h = plan.storeys * 3.1;
    put(wallMat, wallGeometry(nb, 0, h, 3.1, 0, false, city ? r() * 60 : 0));
    const cap = capGeometry(nb, h);
    const tint = city ? (ROOF_TINTS[Math.floor(rng(5100 + i)() * ROOF_TINTS.length)] ?? [1, 1, 1]) : [1, 1, 1];
    const count = cap.getAttribute('position').count;
    const tints = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) tints.set(tint, k * 3);
    cap.setAttribute('color', new Float32BufferAttribute(tints, 3));
    put(slabMat, cap);
    // Parapet: both faces and its top.
    put(parapetMat, wallGeometry(nb, h, h + 0.9, 3.1));
    put(parapetMat, wallGeometry(nb, h, h + 0.9, 3.1, -0.15, true));
    const ang = (rect.angle * Math.PI) / 180;
    const q = new Quaternion().setFromAxisAngle(up, ang);
    const along = (u: number, v: number): Vector3 =>
      new Vector3(
        rect.cx + Math.cos(ang) * u - Math.sin(ang) * v,
        0,
        -(rect.cy + Math.sin(ang) * u + Math.cos(ang) * v),
      );
    const near = city !== null && gableFits(nb) && Math.hypot(rect.cx, rect.cy) <= city.detailRadius;
    if (near && plan.storeys >= 3) addRelief(rect, plan, along, q, r);
    // Their own generators, so the rest of the block (and Savar) draws as before.
    if (near && city?.street && plan.storeys >= 2) addShops(rect, along, q, rng(6100 + i), city.street);
    if (plan.stairHead) {
      const p = along(rect.length * (r() - 0.5) * 0.5, rect.width * (r() - 0.5) * 0.4);
      p.y = h + 1.3;
      heads.push(new Matrix4().compose(p, q, new Vector3(3, 2.6, 3.2)));
    }
    if (plan.tank) {
      const p = along(rect.length * (r() - 0.5) * 0.6, rect.width * (r() - 0.5) * 0.5);
      p.y = h + (plan.stairHead ? 2.6 : 0) + 0.8;
      tanks.push({ m: new Matrix4().compose(p, q, new Vector3(1, 1, 1)), c: tankBlack });
    }
    if (city) {
      // A city roof carries more: a tank or two more on the slab, in black,
      // blue or cream, and on some a row of potted plants along the parapet.
      const rr = rng(5300 + i);
      const extra = rect.length * rect.width > 120 ? Math.floor(rr() * 3) : 0;
      for (let k = 0; k < extra; k++) {
        const p = along(rect.length * (rr() - 0.5) * 0.7, rect.width * (rr() - 0.5) * 0.6);
        p.y = h + 0.8;
        const c = new Color(TANK_COLOURS[Math.floor(rr() * TANK_COLOURS.length)] ?? '#1b1d1f');
        const s = 0.8 + rr() * 0.4;
        tanks.push({ m: new Matrix4().compose(p, q, new Vector3(s, 1, s)), c });
      }
      if (plan.storeys >= 3 && gableFits(nb) && rr() < 0.3) {
        const n = 3 + Math.floor(rr() * 6);
        const side = rr() < 0.5 ? 1 : -1;
        for (let k = 0; k < n; k++) {
          const p = along(-rect.length / 2 + 1 + ((k + 0.5) * (rect.length - 2)) / n, side * (rect.width / 2 - 0.8));
          const s = 0.5 + rr() * 0.5;
          p.y = h + s * 0.5;
          const c = new Color().setHSL(0.22 + rr() * 0.1, 0.45, 0.22 + rr() * 0.12, SRGBColorSpace);
          pots.push({ m: new Matrix4().compose(p, q, new Vector3(s, s, s)), c });
        }
      }
    }
    if (plan.stubs) {
      for (const [u, v] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
        [0, -0.5],
        [0, 0.5],
      ] as const) {
        const p = along(u * (rect.length - 0.6), v * (rect.width - 0.6));
        p.y = h + 0.6;
        stubs.push(new Matrix4().compose(p, q, new Vector3(0.3, 1.2, 0.3)));
      }
    }
  });

  for (const [mat, parts] of buckets) {
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    merged.computeVertexNormals();
    const mesh = new Mesh(keep(merged), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const unit = keep(new BoxGeometry(1, 1, 1));
  const tankGeo = keep(new CylinderGeometry(0.7, 0.7, 1.6, 14));
  const addInstanced = (geo: BufferGeometry, mat: Material, list: Matrix4[]): void => {
    if (list.length === 0) return;
    const m = new InstancedMesh(geo, mat, list.length);
    list.forEach((x, k) => m.setMatrixAt(k, x));
    m.castShadow = m.receiveShadow = true;
    m.computeBoundingSphere();
    group.add(m);
  };
  const addTinted = (geo: BufferGeometry, mat: Material, list: Array<{ m: Matrix4; c: Color }>, shadow = true): void => {
    if (list.length === 0) return;
    const m = new InstancedMesh(geo, mat, list.length);
    list.forEach((x, k) => {
      m.setMatrixAt(k, x.m);
      m.setColorAt(k, x.c);
    });
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    group.add(m);
  };
  addTinted(tankGeo, tankMat, tanks);
  if (shutters.length + openings.length > 0) {
    const shutterMap = keep(shutter(731));
    addTinted(unit, keep(new MeshStandardMaterial({ map: shutterMap, roughness: 0.5, metalness: 0.35 })), shutters, false);
    // An open shop: its dim inside, seen past the street's glare.
    addInstanced(unit, keep(new MeshStandardMaterial({ color: '#221e1a', roughness: 0.9 })), openings);
  }
  signs.forEach((list, k) => {
    if (list.length === 0) return;
    const map = keep(signboard(741 + k));
    addTinted(unit, keep(new MeshStandardMaterial({ map, roughness: 0.55 })), list, false);
  });
  if (pots.length > 0) {
    const bush = keep(new IcosahedronGeometry(0.55, 0));
    addTinted(bush, keep(new MeshStandardMaterial({ roughness: 0.9, flatShading: true })), pots);
  }
  if (relief.length > 0) {
    const reliefMat = keep(new MeshStandardMaterial({ roughness: 0.92 }));
    const m = new InstancedMesh(unit, reliefMat, relief.length);
    relief.forEach((x, k) => {
      m.setMatrixAt(k, x.m);
      m.setColorAt(k, x.c);
    });
    m.castShadow = m.receiveShadow = true;
    m.computeBoundingSphere();
    group.add(m);
  }
  addInstanced(unit, parapetMat, heads);
  addInstanced(unit, stubMat, stubs);
  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
