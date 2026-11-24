/**
 * The country round the Residential Campus, out to the horizon (#996).
 *
 * The mapped area (rsGround.ts) stops a few hundred metres from the wall. Past
 * it, Savar in the dry season is a patchwork of small paddy plots — stubble,
 * fallow, green boro seedbeds, the odd mustard field — broken by village
 * groves, each with its ponds and tin roofs, and the chimneys of brick kilns.
 * None of this is mapped: it is laid out by a seeded generator so the horizon
 * reads like the real one, and the route says so.
 *
 * One canvas paints the ground (2.5 m a pixel over 5 km); the near map is
 * painted on top of its own crop of the same canvas, so the two meet without a
 * seam. Groves, houses, lone trees, palms and chimneys are instanced; none of
 * them casts a shadow (they lie outside the sun's shadow map) and the haze
 * swallows them with distance.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { RS_ROADS, RS_WATER, pointInPolygon, type Point } from '../../core/campusBracuRs.ts';
import { GROUND_EXTENT, groundMaterial } from './rsGround.ts';
import { fbm, groundDetail, rng } from './rsTextures.ts';

/** The painted country, in campus metres. Past it the ground takes the edge colour. */
export const COUNTRY_EXTENT = { x1: -2560, x2: 2560, y1: -2560, y2: 2560 } as const;
const CRES = 2.5; // metres per pixel
const CW = Math.round((COUNTRY_EXTENT.x2 - COUNTRY_EXTENT.x1) / CRES);
const CH = Math.round((COUNTRY_EXTENT.y2 - COUNTRY_EXTENT.y1) / CRES);
const cpx = (x: number, y: number): [number, number] => [(x - COUNTRY_EXTENT.x1) / CRES, (COUNTRY_EXTENT.y2 - y) / CRES];
const cm = (metres: number): number => metres / CRES;

/** How far past the mapped area the country is left to the near map's scrub. */
const NEAR_MARGIN = 60;

type RGB = readonly [number, number, number];
type Ctx = CanvasRenderingContext2D;

export interface Lobe {
  x: number;
  y: number;
  r: number;
}
export interface Village {
  x: number;
  y: number;
  lobes: Lobe[];
}
export interface Kiln {
  x: number;
  y: number;
  angle: number;
}
export interface CountryPlan {
  villages: Village[];
  kilns: Kiln[];
}

/** True inside the mapped area, grown by `margin` metres. */
export function inNearArea(x: number, y: number, margin = 0): boolean {
  return (
    x > GROUND_EXTENT.x1 - margin &&
    x < GROUND_EXTENT.x2 + margin &&
    y > GROUND_EXTENT.y1 - margin &&
    y < GROUND_EXTENT.y2 + margin
  );
}

function trunkPath(): Point[] {
  const trunk = RS_ROADS.find((r) => r.kind === 'trunk');
  if (!trunk || trunk.path.length < 2) return [];
  const p = trunk.path;
  const extend = (a: Point, b: Point): Point => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    return [a[0] + ((a[0] - b[0]) / d) * 4000, a[1] + ((a[1] - b[1]) / d) * 4000];
  };
  const first = p[0];
  const second = p[1];
  const last = p[p.length - 1];
  const before = p[p.length - 2];
  if (!first || !second || !last || !before) return [...p];
  return [extend(first, second), ...p, extend(last, before)];
}

function distToPath(x: number, y: number, path: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return best;
}

/**
 * Where the villages and kilns are. Deterministic: the same horizon on every
 * load. Villages keep clear of the mapped area, the ponds and the trunk road's
 * carriageway; kilns keep clear of the villages.
 */
export function countryPlan(): CountryPlan {
  const r = rng(9601);
  const villages: Village[] = [];
  const trunk = trunkPath();
  const reach = COUNTRY_EXTENT.x2 - 160;
  const pondClear = (x: number, y: number, pad: number): boolean =>
    RS_WATER.every((w) => {
      const xs = w.outline.map((p) => p[0]);
      const ys = w.outline.map((p) => p[1]);
      return x < Math.min(...xs) - pad || x > Math.max(...xs) + pad || y < Math.min(...ys) - pad || y > Math.max(...ys) + pad;
    });
  for (let tries = 0; tries < 900 && villages.length < 70; tries++) {
    const x = (r() * 2 - 1) * reach;
    const y = (r() * 2 - 1) * reach;
    if (inNearArea(x, y, NEAR_MARGIN + 120)) continue;
    if (!pondClear(x, y, 140)) continue;
    if (distToPath(x, y, trunk) < 90) continue;
    if (villages.some((v) => Math.hypot(v.x - x, v.y - y) < 300)) continue;
    const lobes: Lobe[] = [];
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = i === 0 ? 0 : 30 + r() * 70;
      const lx = x + Math.cos(a) * d;
      const ly = y + Math.sin(a) * d;
      if (inNearArea(lx, ly, NEAR_MARGIN + 40)) continue;
      lobes.push({ x: lx, y: ly, r: 35 + r() * 55 });
    }
    if (lobes.length > 0) villages.push({ x, y, lobes });
  }
  const kilns: Kiln[] = [];
  for (let tries = 0; tries < 400 && kilns.length < 7; tries++) {
    const a = r() * Math.PI * 2;
    const d = 750 + r() * 1500;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (Math.abs(x) > reach || Math.abs(y) > reach) continue;
    if (villages.some((v) => v.lobes.some((l) => Math.hypot(l.x - x, l.y - y) < l.r + 110))) continue;
    if (kilns.some((k) => Math.hypot(k.x - x, k.y - y) < 500)) continue;
    if (distToPath(x, y, trunk) < 120) continue;
    kilns.push({ x, y, angle: r() * Math.PI });
  }
  return { villages, kilns };
}

export interface CountryTree {
  x: number;
  y: number;
  palm: boolean;
  /** Crown half-width and half-height, metres (palms: frond reach). */
  w: number;
  h: number;
  /** Height of the crown's centre above the ground. */
  top: number;
  turn: number;
  /** 0..1: which green, and how light. */
  tone: number;
}
export interface CountryHouse {
  x: number;
  y: number;
  turn: number;
  size: [number, number, number];
  wall: number;
  roof: number;
}
export interface CountryScatter {
  trees: CountryTree[];
  houses: CountryHouse[];
}

/**
 * Every tree and house in the country, seeded: the ground painter lays their
 * shadows from this list and the 3D pass places them from it. `density`
 * thins the trees (1 = all, 2 = about half).
 */
export function countryScatter(plan: CountryPlan, density = 1): CountryScatter {
  // Anything but a positive number would pack the lobes with endless trees.
  if (!Number.isFinite(density) || density <= 0) density = 1;
  const r = rng(9604);
  const trees: CountryTree[] = [];
  const houses: CountryHouse[] = [];
  const tree = (x: number, y: number, big: number): void => {
    const w = (3 + r() * 2.6) * big;
    const h = (2.2 + r() * 1.8) * big;
    const base = 1.2 + r() * 1.6;
    trees.push({ x, y, palm: false, w, h, top: base + h, turn: r() * Math.PI * 2, tone: r() });
  };
  const palm = (x: number, y: number): void => {
    trees.push({ x, y, palm: true, w: 3.6 + r() * 1.2, h: 1.2, top: 9 + r() * 7, turn: r() * Math.PI * 2, tone: r() });
  };
  const inPond = (x: number, y: number): boolean => RS_WATER.some((w) => pointInPolygon([x, y], w.outline));

  // Groves: trees packed through every lobe, palms and houses among them.
  const spacing = 13 * Math.sqrt(density);
  for (const v of plan.villages) {
    for (const l of v.lobes) {
      const n = Math.round((Math.PI * l.r * l.r) / (spacing * spacing));
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * l.r;
        const x = l.x + Math.cos(a) * d;
        const y = l.y + Math.sin(a) * d;
        if (inNearArea(x, y, 10)) continue;
        if (r() < 0.16) palm(x, y);
        else tree(x, y, 1.25);
      }
      const count = Math.round(l.r / 12);
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const d = (0.45 + r() * 0.5) * l.r;
        const x = l.x + Math.cos(a) * d;
        const y = l.y + Math.sin(a) * d;
        if (inNearArea(x, y, 10)) continue;
        houses.push({
          x,
          y,
          turn: (Math.round(r() * 4) * Math.PI) / 2 + (r() - 0.5) * 0.2,
          size: [6 + r() * 6, 2.6 + r() * 0.6, 4 + r() * 3],
          wall: r(),
          roof: r(),
        });
      }
    }
  }

  // Clumps of trees and palms along the bunds, a few to a square kilometre.
  const span = COUNTRY_EXTENT.x2 - 100;
  const clumps = Math.round(700 / density);
  for (let i = 0; i < clumps; i++) {
    const cx = (r() * 2 - 1) * span;
    const cy = (r() * 2 - 1) * span;
    const palms = r() < 0.35;
    const n = 1 + Math.floor(r() * (palms ? 5 : 4));
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * (palms ? 30 : 14);
      const y = cy + (r() - 0.5) * (palms ? 6 : 14);
      if (inNearArea(x, y, 15) || inPond(x, y)) continue;
      if (palms) palm(x, y);
      else tree(x, y, 0.9 + r() * 0.5);
    }
  }
  return { trees, houses };
}

/** Which way, and how far per metre of height, shadows fall on the morning of the scene. */
export const SHADOW_DIR: Point = [-0.94, 0.34];
export const SHADOW_PER_METRE = 1.44;

// ── Painting ────────────────────────────────────────────────────────────────

const jitter = (c: RGB, r: () => number, k = 10): string =>
  `rgb(${Math.round(c[0] + (r() - 0.5) * k)},${Math.round(c[1] + (r() - 0.5) * k)},${Math.round(c[2] + (r() - 0.5) * k)})`;

/** A dry-season plot: wetter land holds boro seedbeds, drier land stubble. */
function plotColour(wet: number, r: () => number): RGB {
  const p = r();
  if (wet > 0.6) {
    if (p < 0.55) return [92, 128, 54]; // boro, transplanted
    if (p < 0.8) return [74, 96, 70]; // flooded seedbed
    return [120, 140, 72];
  }
  if (wet > 0.45) {
    if (p < 0.35) return [104, 134, 60];
    if (p < 0.65) return [168, 150, 106]; // stubble
    if (p < 0.88) return [122, 128, 72]; // vegetables
    return [198, 176, 62]; // mustard
  }
  if (p < 0.45) return [176, 156, 110];
  if (p < 0.72) return [150, 128, 92]; // fallow
  if (p < 0.9) return [140, 134, 88]; // dry grass
  return [124, 100, 74]; // ploughed
}

/** A soft-edged fill: drawn off the canvas with its blurred shadow thrown back on. */
function softFill(g: Ctx, colour: string, blur: number, trace: () => void): void {
  g.save();
  const off = CW * 3;
  g.translate(-off, 0);
  g.shadowOffsetX = off;
  g.shadowBlur = blur;
  g.shadowColor = colour;
  g.fillStyle = '#000';
  trace();
  g.fill();
  g.restore();
}

/** Paints the country. The near map takes its crop of this canvas as a base. */
export function paintCountry(plan: CountryPlan, scatter: CountryScatter): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const r = rng(9602);

  // The bunds between plots: grassy earth.
  g.fillStyle = 'rgb(126,122,84)';
  g.fillRect(0, 0, CW, CH);

  // Plots, in blocks of 200 m, each block turned a little.
  const CELL = 200;
  for (let by = COUNTRY_EXTENT.y1; by < COUNTRY_EXTENT.y2; by += CELL) {
    for (let bx = COUNTRY_EXTENT.x1; bx < COUNTRY_EXTENT.x2; bx += CELL) {
      if (inNearArea(bx + CELL / 2, by + CELL / 2, -CELL)) continue; // fully under the near map
      const [x0, y0] = cpx(bx, by + CELL);
      g.save();
      g.beginPath();
      g.rect(x0, y0, cm(CELL), cm(CELL));
      g.clip();
      g.translate(x0 + cm(CELL / 2), y0 + cm(CELL / 2));
      g.rotate(0.12 + (r() - 0.5) * 0.4);
      for (let sx = -0.75 * CELL; sx < 0.75 * CELL; ) {
        const sw = 10 + r() * 28;
        for (let sy = -0.75 * CELL; sy < 0.75 * CELL; ) {
          const sl = 20 + r() * 70;
          const u = (bx + CELL / 2 - COUNTRY_EXTENT.x1) / (COUNTRY_EXTENT.x2 - COUNTRY_EXTENT.x1);
          const v = (by + CELL / 2 - COUNTRY_EXTENT.y1) / (COUNTRY_EXTENT.y2 - COUNTRY_EXTENT.y1);
          const wet = fbm(u + (sx / CELL) * 0.03, v + (sy / CELL) * 0.03, 5, 4, 9603);
          g.fillStyle = jitter(plotColour(wet, r), r, 14);
          g.fillRect(cm(sx + 0.6), cm(sy + 0.6), cm(sw - 1.2), cm(sl - 1.2));
          sy += sl;
        }
        sx += sw;
      }
      g.restore();
    }
  }

  // Round the mapped area: the same scrub and grazing the near map shows.
  {
    const x1 = GROUND_EXTENT.x1 - NEAR_MARGIN;
    const y2 = GROUND_EXTENT.y2 + NEAR_MARGIN;
    const w = GROUND_EXTENT.x2 - GROUND_EXTENT.x1 + 2 * NEAR_MARGIN;
    const h = GROUND_EXTENT.y2 - GROUND_EXTENT.y1 + 2 * NEAR_MARGIN;
    const [ax, ay] = cpx(x1, y2);
    softFill(g, 'rgb(104,106,62)', cm(40), () => {
      g.beginPath();
      g.rect(ax, ay, cm(w), cm(h));
    });
  }

  // Village tracks: each village to its nearest neighbour.
  g.lineCap = 'round';
  g.strokeStyle = 'rgb(172,152,112)';
  g.lineWidth = cm(4);
  for (const v of plan.villages) {
    let near: Village | null = null;
    let best = Infinity;
    for (const o of plan.villages) {
      const d = Math.hypot(o.x - v.x, o.y - v.y);
      if (o !== v && d < best) {
        best = d;
        near = o;
      }
    }
    if (!near || best > 900) continue;
    const [ax, ay] = cpx(v.x, v.y);
    const [bx, by] = cpx(near.x, near.y);
    const mx = (ax + bx) / 2 + (r() - 0.5) * cm(80);
    const my = (ay + by) / 2 + (r() - 0.5) * cm(80);
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx, my, bx, by);
    g.stroke();
  }

  // Village groves: shaded earth under the canopy, with ponds.
  for (const v of plan.villages) {
    for (const l of v.lobes) {
      const [x, y] = cpx(l.x, l.y);
      softFill(g, 'rgba(56,62,38,0.95)', cm(10), () => {
        g.beginPath();
        g.arc(x, y, cm(l.r), 0, Math.PI * 2);
      });
    }
    const ponds = 1 + Math.floor(r() * 3);
    for (let i = 0; i < ponds; i++) {
      const l = v.lobes[Math.floor(r() * v.lobes.length)];
      if (!l) continue;
      const a = r() * Math.PI * 2;
      const [x, y] = cpx(l.x + Math.cos(a) * l.r * 0.7, l.y + Math.sin(a) * l.r * 0.7);
      const pw = cm(16 + r() * 22);
      const ph = cm(14 + r() * 18);
      g.save();
      g.translate(x, y);
      g.rotate(r() * 0.6);
      g.fillStyle = 'rgb(110,96,70)';
      g.fillRect(-pw / 2 - 2, -ph / 2 - 2, pw + 4, ph + 4);
      g.fillStyle = 'rgb(44,58,50)';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.restore();
    }
  }

  // Tree shadows, thrown west-north-west: without them a tree at a distance
  // floats. The houses' too.
  g.fillStyle = 'rgba(28,34,20,0.38)';
  for (const t of scatter.trees) {
    const off = t.top * SHADOW_PER_METRE;
    const [x, y] = cpx(t.x + SHADOW_DIR[0] * off, t.y + SHADOW_DIR[1] * off);
    g.beginPath();
    g.ellipse(x, y, cm(t.w * 1.25), cm(t.palm ? t.w * 0.7 : t.w * 0.85), -Math.atan2(SHADOW_DIR[1], SHADOW_DIR[0]), 0, Math.PI * 2);
    g.fill();
  }
  for (const hs of scatter.houses) {
    const off = hs.size[1] * 0.7 * SHADOW_PER_METRE;
    const [x, y] = cpx(hs.x + SHADOW_DIR[0] * off, hs.y + SHADOW_DIR[1] * off);
    g.beginPath();
    g.ellipse(x, y, cm(hs.size[0] * 0.6), cm(hs.size[2] * 0.6), -hs.turn, 0, Math.PI * 2);
    g.fill();
  }

  // Brick kilns: a yard of stacked green bricks round the oval kiln.
  for (const k of plan.kilns) {
    const [x, y] = cpx(k.x, k.y);
    g.save();
    g.translate(x, y);
    g.rotate(-k.angle);
    g.fillStyle = 'rgb(170,124,94)';
    g.fillRect(-cm(75), -cm(45), cm(150), cm(90));
    g.fillStyle = 'rgb(150,102,78)';
    for (let i = -6; i <= 6; i++) g.fillRect(cm(i * 11) - cm(3), -cm(42), cm(6), cm(20));
    g.fillStyle = 'rgb(92,56,44)';
    g.beginPath();
    g.ellipse(0, cm(12), cm(40), cm(17), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(126,80,62)';
    g.beginPath();
    g.ellipse(0, cm(12), cm(30), cm(8), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // The trunk road, carried on to the horizon both ways.
  {
    const path = trunkPath();
    g.lineJoin = 'round';
    g.beginPath();
    path.forEach((p, i) => {
      const [x, y] = cpx(p[0], p[1]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = 'rgb(168,148,110)';
    g.lineWidth = cm(13);
    g.stroke();
    g.strokeStyle = 'rgb(72,73,76)';
    g.lineWidth = cm(7.5);
    g.stroke();
  }

  // The mapped ponds, where they run past the near map.
  for (const w of RS_WATER) {
    g.beginPath();
    w.outline.forEach((p, i) => {
      const [x, y] = cpx(p[0], p[1]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fillStyle = 'rgb(52,69,44)';
    g.fill();
  }
  return canvas;
}

/** The near map's base: this canvas's crop of the mapped area, `w` × `h` pixels. */
export function drawNearCrop(g: Ctx, country: HTMLCanvasElement, w: number, h: number): void {
  const [sx, sy] = cpx(GROUND_EXTENT.x1, GROUND_EXTENT.y2);
  const sw = cm(GROUND_EXTENT.x2 - GROUND_EXTENT.x1);
  const sh = cm(GROUND_EXTENT.y2 - GROUND_EXTENT.y1);
  g.imageSmoothingEnabled = true;
  g.drawImage(country, sx, sy, sw, sh, 0, 0, w, h);
}

// ── 3D ──────────────────────────────────────────────────────────────────────

/**
 * The ground past the near map: one plane under everything, the mapped area
 * included (the near map is drawn over it with a polygon offset). Cut with a
 * hole, the triangulation runs kilometre-long slivers out to the corners that
 * crack at a grazing angle and let the sky through; a grid does not.
 */
function countryGround(map: Texture): BufferGeometry {
  const R = 9000;
  const geo = new PlaneGeometry(2 * R, 2 * R, 90, 90);
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - COUNTRY_EXTENT.x1) / (COUNTRY_EXTENT.x2 - COUNTRY_EXTENT.x1);
    uv[i * 2 + 1] = (pos.getY(i) - COUNTRY_EXTENT.y1) / (COUNTRY_EXTENT.y2 - COUNTRY_EXTENT.y1);
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.rotateX(-Math.PI / 2);
  map.wrapS = ClampToEdgeWrapping;
  map.wrapT = ClampToEdgeWrapping;
  return geo;
}

/** A lumpy crown, darker underneath: one instance is one tree at a distance. */
function crownGeometry(seed: number): BufferGeometry {
  const ico = new IcosahedronGeometry(1, 1);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const geo = mergeVertices(ico);
  ico.dispose();
  const r = rng(seed);
  const pos = geo.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.82 + r() * 0.3;
    const y = pos.getY(i);
    pos.setXYZ(i, pos.getX(i) * k, y * (y < 0 ? 0.55 : 1) * k, pos.getZ(i) * k);
    const shade = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 1) / 1.6));
    colours[i * 3] = shade;
    colours[i * 3 + 1] = shade;
    colours[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A unit house: a 1 × 1 × 1 box with a gable roof rising another half. */
function houseGeometry(): { walls: BufferGeometry; roof: BufferGeometry } {
  const walls = new BufferGeometry();
  // Four walls, no floor or ceiling.
  const w: number[] = [];
  const quads: Array<[number, number, number, number, number, number]> = [
    [-0.5, -0.5, 0.5, -0.5, 0, -1],
    [0.5, -0.5, 0.5, 0.5, 1, 0],
    [0.5, 0.5, -0.5, 0.5, 0, 1],
    [-0.5, 0.5, -0.5, -0.5, -1, 0],
  ];
  // Wound so each wall faces out.
  for (const [ax, az, bx, bz] of quads) {
    w.push(bx, 0, bz, ax, 0, az, ax, 1, az, bx, 0, bz, ax, 1, az, bx, 1, bz);
  }
  walls.setAttribute('position', new Float32BufferAttribute(w, 3));
  walls.computeVertexNormals();
  const roof = new BufferGeometry();
  const o = 0.12;
  const e = 0.5 + o;
  roof.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        // Two slopes, ridge along x, wound to face up and out.
        -e, 1, -e, e, 1.5, 0, e, 1, -e, -e, 1, -e, -e, 1.5, 0, e, 1.5, 0,
        e, 1, e, -e, 1.5, 0, -e, 1, e, e, 1, e, e, 1.5, 0, -e, 1.5, 0,
        // Gable ends.
        -0.5, 1, -0.5, -0.5, 1, 0.5, -0.5, 1.5, 0,
        0.5, 1, 0.5, 0.5, 1, -0.5, 0.5, 1.5, 0,
      ],
      3,
    ),
  );
  roof.computeVertexNormals();
  return { walls, roof };
}

/**
 * A coconut palm's head at a distance: twelve fronds of unit reach, arching
 * up and drooping at the tips, darker toward the crown.
 */
function palmHeadGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const fronds = 12;
  const steps = 5;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const lift = f % 3 === 0 ? 0.35 : 0.1;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const point = (t: number, side: number): [number, number, number] => {
      const half = 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.1));
      const y = lift * t - 0.75 * t * t;
      return [ca * t - sa * half * side, y, sa * t + ca * half * side];
    };
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const a0 = point(t0, -1);
      const b0 = point(t0, 1);
      const a1 = point(t1, -1);
      const b1 = point(t1, 1);
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      const s0 = 0.6 + 0.4 * t0;
      const s1 = 0.6 + 0.4 * t1;
      col.push(s0, s0, s0, s0, s0, s0, s1, s1, s1, s0, s0, s0, s1, s1, s1, s1, s1, s1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function instanced(geo: BufferGeometry, mat: Material, list: Array<{ m: Matrix4; c: Color }>): InstancedMesh | null {
  if (list.length === 0) return null;
  const mesh = new InstancedMesh(geo, mat, list.length);
  list.forEach((x, i) => {
    mesh.setMatrixAt(i, x.m);
    mesh.setColorAt(i, x.c);
  });
  mesh.computeBoundingSphere();
  mesh.frustumCulled = false; // spread over kilometres; the sphere would always pass
  return mesh;
}

export interface Country {
  group: Group;
  /** How many trees the country holds (for tests and budgets). */
  trees: number;
  dispose(): void;
}

/**
 * The 3D country: ground, groves, lone trees and palms, village houses and
 * kiln chimneys, placed from `scatter` (the same list the ground's shadows
 * were painted from).
 */
export function buildCountry(canvas: HTMLCanvasElement, plan: CountryPlan, scatter: CountryScatter): Country {
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();
  const r = rng(9608);

  const map = keep(new CanvasTexture(canvas));
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  const detail = keep(groundDetail(9607));
  const ground = new Mesh(
    keep(countryGround(map)),
    keep(groundMaterial(map, detail, COUNTRY_EXTENT.x2 - COUNTRY_EXTENT.x1)),
  );
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const greens: RGB[] = [
    [62, 86, 40],
    [52, 76, 36],
    [74, 94, 46],
    [58, 80, 44],
    [84, 98, 52],
  ];
  const leafy = (tone: number, k: number): Color => {
    const c = greens[Math.floor(tone * greens.length) % greens.length] ?? [60, 84, 40];
    const lift = k * (0.85 + ((tone * 7.31) % 1) * 0.3);
    return new Color().setRGB((c[0] / 255) * lift, (c[1] / 255) * lift, (c[2] / 255) * lift, SRGBColorSpace);
  };
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const crowns: Array<{ m: Matrix4; c: Color }> = [];
  const trunks: Array<{ m: Matrix4; c: Color }> = [];
  const palms: Array<{ m: Matrix4; c: Color }> = [];
  const walls: Array<{ m: Matrix4; c: Color }> = [];
  const roofs: Array<{ m: Matrix4; c: Color }> = [];
  const bark = new Color('#4a3f33');
  for (const t of scatter.trees) {
    q.setFromAxisAngle(up, t.turn);
    if (t.palm) {
      trunks.push({ m: new Matrix4().compose(new Vector3(t.x, t.top / 2, -t.y), q, new Vector3(0.4, t.top, 0.4)), c: bark });
      palms.push({ m: new Matrix4().compose(new Vector3(t.x, t.top, -t.y), q, new Vector3(t.w, t.w, t.w)), c: leafy(t.tone, 1.05) });
    } else {
      crowns.push({
        m: new Matrix4().compose(new Vector3(t.x, t.top, -t.y), q, new Vector3(t.w, t.h, t.w * (0.8 + t.tone * 0.4))),
        c: leafy(t.tone, 1),
      });
      trunks.push({ m: new Matrix4().compose(new Vector3(t.x, t.top / 2, -t.y), q, new Vector3(0.5, t.top, 0.5)), c: bark });
    }
  }
  for (const hs of scatter.houses) {
    q.setFromAxisAngle(up, hs.turn);
    const m = new Matrix4().compose(new Vector3(hs.x, 0, -hs.y), q, new Vector3(...hs.size));
    const p = hs.wall;
    walls.push({ m, c: new Color(p < 0.4 ? '#b8b3a6' : p < 0.7 ? '#8b5a44' : p < 0.85 ? '#9fb0b4' : '#c9c1a4') });
    const t = hs.roof;
    roofs.push({ m, c: new Color(t < 0.5 ? '#a4a8a8' : t < 0.8 ? '#7d5a44' : '#6f7c80') });
  }

  const leafMat = keep(new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  const palmMat = keep(new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide }));
  const crownGeo = keep(crownGeometry(9605));
  const palmGeo = keep(palmHeadGeometry());
  const trunkGeo = keep(new CylinderGeometry(0.5, 0.6, 1, 5, 1, true));
  const trunkMat = keep(new MeshStandardMaterial({ roughness: 1 }));
  const house = houseGeometry();
  keep(house.walls);
  keep(house.roof);
  const wallMat = keep(new MeshStandardMaterial({ roughness: 0.95 }));
  const roofMat = keep(new MeshStandardMaterial({ roughness: 0.5, metalness: 0.45 }));
  for (const mesh of [
    instanced(crownGeo, leafMat, crowns),
    instanced(palmGeo, palmMat, palms),
    instanced(trunkGeo, trunkMat, trunks),
    instanced(house.walls, wallMat, walls),
    instanced(house.roof, roofMat, roofs),
  ]) {
    if (mesh) group.add(mesh);
  }

  // Kiln chimneys: tapering brick stacks, sooted at the top.
  if (plan.kilns.length > 0) {
    const stack = keep(new CylinderGeometry(1.3, 2.6, 1, 12, 1, true));
    const soot = keep(new CylinderGeometry(1.32, 1.4, 1, 12, 1, true));
    const brickMat = keep(new MeshStandardMaterial({ color: '#7a4434', roughness: 0.95 }));
    const sootMat = keep(new MeshStandardMaterial({ color: '#2a2422', roughness: 0.95 }));
    const stacks: Array<{ m: Matrix4; c: Color }> = [];
    const tops: Array<{ m: Matrix4; c: Color }> = [];
    const white = new Color(1, 1, 1);
    for (const k of plan.kilns) {
      const h = 34 + r() * 8;
      stacks.push({ m: new Matrix4().compose(new Vector3(k.x, h / 2, -k.y), q.identity(), new Vector3(1, h, 1)), c: white });
      tops.push({ m: new Matrix4().compose(new Vector3(k.x, h - 1.5, -k.y), q.identity(), new Vector3(1, 3, 1)), c: white });
    }
    for (const mesh of [instanced(stack, brickMat, stacks), instanced(soot, sootMat, tops)]) if (mesh) group.add(mesh);
  }

  return {
    group,
    trees: scatter.trees.length,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
