/**
 * Procedural textures for the Residential Campus scene (#978).
 *
 * Every surface texture is painted in code on a canvas: weathered plaster,
 * clay roof tiles, corrugated metal, brick, stained concrete, asphalt, bark,
 * leaves and palm fronds, each with a matching normal map where relief shows.
 * Nothing is fetched, so the page's CSP (no blob: images, no WASM) is never in
 * question and the look survives offline.
 *
 * The finishes follow the RS handbook's and BRACU news photographs: white
 * plaster streaked under the sills, rusty-red clay tiles, red corrugated
 * sheet, the brick boundary wall.
 */

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';

// ── Noise ───────────────────────────────────────────────────────────────────

/** A seeded pseudo-random number generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise, periodic with `period` cells, so textures tile seamlessly. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const p = (v: number): number => ((v % period) + period) % period;
  const a = hash2(p(xi), p(yi), seed);
  const b = hash2(p(xi + 1), p(yi), seed);
  const c = hash2(p(xi), p(yi + 1), seed);
  const d = hash2(p(xi + 1), p(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Fractal noise in [0, 1], tileable: (u, v) in [0, 1) map to `cells` cells at
 * the first octave and double each octave.
 */
export function fbm(u: number, v: number, cells: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * c, v * c, c, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    c *= 2;
  }
  return sum / norm;
}

// ── Canvas helpers ──────────────────────────────────────────────────────────

/** A size × size RGBA buffer and a writer into it. */
interface Pixels {
  size: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  set(i: number, r: number, g: number, b: number, a?: number): void;
}

function pixels(size: number): Pixels {
  const data = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  return {
    size,
    data,
    set(i, r, g, b, a = 255) {
      const k = i * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = a;
    },
  };
}

function toCanvasTexture(px: Pixels, srgb: boolean): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = px.size;
  canvas.height = px.size;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.putImageData(new ImageData(px.data, px.size, px.size), 0, 0);
  return finish(new CanvasTexture(canvas), srgb);
}

function finish(t: Texture, srgb: boolean): Texture {
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A tangent-space normal map from a tileable height field. */
function normalMap(height: Float32Array, size: number, strength: number): Texture {
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      data[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      // Canvas rows run downward, texture v upward.
      data[k + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  return finish(t, false);
}

export interface SurfaceTextures {
  map: Texture;
  normalMap?: Texture;
  roughnessMap?: Texture;
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

// ── Surfaces ────────────────────────────────────────────────────────────────

/**
 * Weathered plaster. The tile is 4 m wide and one storey tall: grime runs
 * down from the top (under the sill above) and gathers near the floor line,
 * as on every rendered wall in Bangladesh's monsoon.
 */
export function plaster(tint: readonly [number, number, number], seed: number, dirt = 1): SurfaceTextures {
  const size = 512;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  const streakSeed = rng(seed + 5);
  const streaks = Array.from({ length: 18 }, () => ({
    x: streakSeed(),
    w: 0.004 + streakSeed() * 0.02,
    len: 0.15 + streakSeed() * 0.55,
    a: 0.25 + streakSeed() * 0.6,
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size; // 0 at the top of the storey
      const n = fbm(u, v, 8, 5, seed);
      const fine = fbm(u, v, 64, 2, seed + 3);
      let grime = 0;
      for (const s of streaks) {
        const d = Math.min(Math.abs(u - s.x), 1 - Math.abs(u - s.x));
        if (d < s.w && v < s.len) grime += s.a * (1 - d / s.w) * (1 - v / s.len);
      }
      grime += Math.max(0, (v - 0.82) / 0.18) * 0.35; // splash near the floor line
      grime += Math.max(0, n - 0.55) * 1.4;
      grime *= dirt;
      const shade = 1 - 0.06 * (n - 0.5) - 0.03 * (fine - 0.5) - 0.18 * Math.min(1, grime);
      const i = y * size + x;
      px.set(i, clamp(tint[0] * shade - grime * 18), clamp(tint[1] * shade - grime * 20), clamp(tint[2] * shade - grime * 24));
      height[i] = fine * 0.6 + n * 0.4;
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 1.2) };
}

/**
 * Clay roof tiles, the rusty red of the RS dormitories in the photographs. The
 * tile is 2 m × 2 m: rows of 0.33 m with a rounded profile, each tile its own
 * shade, weathered darker toward the eaves of every course.
 */
export function clayTiles(seed: number): SurfaceTextures {
  const size = 512;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  const rows = 6;
  const cols = 8;
  for (let y = 0; y < size; y++) {
    const rowF = (y / size) * rows;
    const row = Math.floor(rowF);
    const inRow = rowF - row;
    for (let x = 0; x < size; x++) {
      const offset = row % 2 ? 0.5 : 0;
      const colF = (x / size) * cols + offset;
      const col = Math.floor(colF);
      const inCol = colF - col;
      const tileShade = hash2(((col % cols) + cols) % cols, row, seed);
      const curve = Math.sin(inCol * Math.PI); // rounded tile
      const overlap = inRow < 0.12 ? inRow / 0.12 : 1; // shadow of the course above
      const n = fbm(x / size, y / size, 16, 4, seed + 9);
      const moss = Math.max(0, fbm(x / size, y / size, 6, 3, seed + 11) - 0.6) * 2;
      const lit = (0.68 + 0.32 * curve) * (0.55 + 0.45 * overlap) * (0.85 + 0.3 * tileShade) * (0.9 + 0.2 * n);
      const i = y * size + x;
      px.set(
        i,
        clamp(168 * lit - moss * 40),
        clamp(78 * lit + moss * 10),
        clamp(58 * lit - moss * 6),
      );
      height[i] = curve * 0.7 + overlap * 0.3 + n * 0.08;
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 6) };
}

/** Corrugated steel sheet, painted red and faded; the tile is 1 m square. */
export function corrugated(base: readonly [number, number, number], seed: number): SurfaceTextures {
  const size = 256;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  const ridges = 13; // ~76 mm pitch
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = Math.sin((x / size) * ridges * Math.PI * 2);
      const n = fbm(x / size, y / size, 6, 4, seed);
      const rust = Math.max(0, fbm(x / size, y / size, 10, 3, seed + 4) - 0.62) * 2.5;
      const lit = 0.82 + 0.18 * p;
      const fade = 0.85 + 0.25 * n;
      const i = y * size + x;
      px.set(i, clamp(base[0] * lit * fade - rust * 40), clamp(base[1] * lit * fade + rust * 5), clamp(base[2] * lit * fade - rust * 10));
      height[i] = p * 0.5 + 0.5;
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 3) };
}

/** A stained concrete roof slab; the tile is 8 m square. */
export function concrete(seed: number, base = 172): SurfaceTextures {
  const size = 512;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u, v, 6, 5, seed);
      const stain = Math.max(0, fbm(u, v, 3, 4, seed + 2) - 0.5) * 1.8;
      // Cracks follow a contour of the noise, which closes into rings; only
      // stretches of it are cracked, so they run and stop as real ones do.
      const crack = Math.abs(fbm(u, v, 12, 3, seed + 7) - 0.5) < 0.006 && fbm(u, v, 4, 2, seed + 8) > 0.58 ? 0.25 : 0;
      const shade = base * (0.9 + 0.2 * n) - stain * 55 - crack * 80;
      const i = y * size + x;
      px.set(i, clamp(shade), clamp(shade - 3), clamp(shade - 8 - stain * 6));
      height[i] = n;
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 1.5) };
}

/**
 * Exposed red brick in English-bond courses, as on the boundary wall; the tile
 * is 1 m wide and 0.6 m tall (eight courses).
 */
export function brick(seed: number): SurfaceTextures {
  const size = 512;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  const courses = 8;
  for (let y = 0; y < size; y++) {
    const cF = (y / size) * courses;
    const c = Math.floor(cF);
    const inC = cF - c;
    const perRow = c % 2 ? 8 : 4; // headers and stretchers
    for (let x = 0; x < size; x++) {
      const bF = (x / size) * perRow + (c % 4 === 1 ? 0.5 : 0);
      const b = Math.floor(bF);
      const inB = bF - b;
      const mortar = inC < 0.12 || inB < 0.05 / (perRow / 4);
      const shade = hash2(((b % perRow) + perRow) % perRow, c, seed);
      const n = fbm(x / size, y / size, 32, 3, seed + 1);
      const i = y * size + x;
      if (mortar) {
        const m = 150 + n * 30;
        px.set(i, m, m - 6, m - 16);
        height[i] = 0;
      } else {
        const k = 0.75 + 0.35 * shade + 0.15 * (n - 0.5);
        px.set(i, clamp(150 * k), clamp(72 * k), clamp(52 * k));
        height[i] = 0.8 + n * 0.2;
      }
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 4) };
}

/**
 * A plain Bangladeshi façade for the buildings outside the wall: plaster
 * with one window per 3 m bay and storey, some with grilles, some open
 * shutters. The tile is 3 m by one storey (3.2 m).
 */
export function genericFacade(tint: readonly [number, number, number], seed: number): SurfaceTextures {
  const base = plaster(tint, seed, 1.6);
  const src = base.map.image as HTMLCanvasElement | undefined;
  const map = src ? facadeOver((g, size) => g.drawImage(src, 0, 0, size, size), seed) : base.map;
  if (src) base.map.dispose();
  return { map, ...(base.normalMap ? { normalMap: base.normalMap } : {}) };
}

/**
 * The same façade in many colours from one painting of the grime: the plaster
 * is painted once in white and multiplied by each tint. `brickTile`, when
 * given, adds one façade of bare brick (an unfinished or unrendered house).
 * Every map shares the returned normal map.
 */
/**
 * A façade's window, in metres within its 3 m × 3.2 m tile. `grille`: a
 * painted steel grille over the glass, as on most Dhaka flats.
 */
export interface WindowSpec {
  width: number;
  height: number;
  sill: number;
  grille: boolean;
}

/** A village house's window: small, behind a sunshade. */
export const VILLAGE_WINDOW: WindowSpec = { width: 1.2, height: 1.3, sill: 0.9, grille: false };
/** A Dhaka flat's: wide, nearly a storey tall, behind a white grille. */
export const CITY_WINDOW: WindowSpec = { width: 2.0, height: 1.55, sill: 0.75, grille: true };

export function facadeSet(
  tints: readonly (readonly [number, number, number])[],
  seed: number,
  brickTile?: Texture,
  window: WindowSpec = VILLAGE_WINDOW,
): { maps: Texture[]; brickMap: Texture | null; normalMap: Texture | null } {
  const base = plaster([255, 255, 255], seed, 1.6);
  const src = base.map.image as HTMLCanvasElement | undefined;
  const maps = tints.map((t, i) =>
    facadeOver((g, size) => {
      g.fillStyle = `rgb(${t[0]},${t[1]},${t[2]})`;
      g.fillRect(0, 0, size, size);
      if (src) {
        g.globalCompositeOperation = 'multiply';
        g.drawImage(src, 0, 0, size, size);
        g.globalCompositeOperation = 'source-over';
      }
    }, seed + i * 31, window),
  );
  let brickMap: Texture | null = null;
  const brickImage = brickTile?.image as HTMLCanvasElement | undefined;
  if (brickImage) {
    // The brick tile is 1 m × 0.6 m; the façade tile 3 m × 3.2 m.
    brickMap = facadeOver((g, size) => {
      const tw = size / 3;
      const th = (size * 0.6) / 3.2;
      for (let y = size - th; y > -th; y -= th) for (let x = 0; x < size; x += tw) g.drawImage(brickImage, x, y, tw, th);
    }, seed + 97, window);
  }
  base.map.dispose();
  return { maps, brickMap, normalMap: base.normalMap ?? null };
}

/** Windows over a painted wall: one per 3 m bay and 3.2 m storey. */
function facadeOver(paint: (g: CanvasRenderingContext2D, size: number) => void, seed: number, win: WindowSpec = VILLAGE_WINDOW): Texture {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    paint(g, size);
    const r = rng(seed + 9);
    // The window, centred in a 3 m × 3.2 m tile (a village house's: 1.2 m
    // wide, 1.3 m tall, sill at 0.9 m).
    const x0 = ((3 - win.width) / 2 / 3) * size;
    const w = (win.width / 3) * size;
    const y0 = size - ((win.sill + win.height) / 3.2) * size;
    const h = (win.height / 3.2) * size;
    g.fillStyle = '#1f272b';
    g.fillRect(x0, y0, w, h);
    // Curtains and what is behind the glass: some panes lighter than others.
    for (let k = 0; k < 4; k++) {
      const lit = r();
      if (lit < 0.5) continue;
      g.fillStyle = lit < 0.8 ? 'rgba(120,112,98,0.35)' : 'rgba(170,150,120,0.4)';
      g.fillRect(x0 + (k * w) / 4, y0, w / 4, h);
    }
    g.strokeStyle = r() < 0.5 ? '#5f6a6e' : '#2f5b4f';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(x0 + (k * w) / 4, y0);
      g.lineTo(x0 + (k * w) / 4, y0 + h);
      g.stroke();
    }
    if (win.grille) {
      // A painted steel grille: close bars and a few rails, off-white.
      g.strokeStyle = 'rgba(214,212,204,0.85)';
      g.lineWidth = 1.5;
      for (let x = x0 + 4; x < x0 + w; x += 7) {
        g.beginPath();
        g.moveTo(x, y0);
        g.lineTo(x, y0 + h);
        g.stroke();
      }
      g.lineWidth = 2.5;
      for (const f of [0.02, 0.5, 0.98]) {
        g.beginPath();
        g.moveTo(x0, y0 + h * f);
        g.lineTo(x0 + w, y0 + h * f);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x0 - 6, y0 - 12, w + 12, 8); // sunshade shadow
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x0 - 8, y0 - 16, w + 16, 5); // sunshade edge
  }
  return toCanvasTexture2(canvas);
}

/**
 * Ripples on still pond water, ruffled by a light breeze: a tileable normal
 * map, stretched across the wind.
 */
export function ripples(seed: number): Texture {
  const size = 256;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = fbm(u, v, 4, 4, seed) * 0.6 + fbm(u, v * 1, 16, 3, seed + 1) * 0.4;
    }
  }
  return normalMap(height, size, 6);
}

function toCanvasTexture2(canvas: HTMLCanvasElement): Texture {
  return finish(new CanvasTexture(canvas), true);
}

/** Worn asphalt, 4 m square. */
export function asphalt(seed: number): SurfaceTextures {
  const size = 256;
  const px = pixels(size);
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size, 8, 4, seed);
      const speck = r() < 0.04 ? 25 : 0;
      const v = 58 + n * 30 + speck;
      px.set(y * size + x, v, v, v + 2);
    }
  }
  return { map: toCanvasTexture(px, true) };
}

/** Bark: vertical fissures in grey-brown; the tile wraps a trunk once. */
export function bark(seed: number): SurfaceTextures {
  const size = 128;
  const px = pixels(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fiss = fbm(u, v * 0.25, 12, 3, seed);
      const n = fbm(u, v, 16, 3, seed + 1);
      const k = 0.6 + 0.5 * fiss + 0.15 * n;
      const i = y * size + x;
      px.set(i, clamp(98 * k), clamp(82 * k), clamp(66 * k));
      height[i] = fiss;
    }
  }
  return { map: toCanvasTexture(px, true), normalMap: normalMap(height, size, 4) };
}

/**
 * Fine ground detail in mid-grey, multiplied over the painted ground map so
 * the ground has grain up close; the tile is 3 m square. Under the grain,
 * thousands of short blades in light and dark — dry-season grass, trodden
 * flat in all directions — and a few bare, paler scuffs between them.
 */
export function groundDetail(seed: number): Texture {
  const size = 512;
  const px = pixels(size);
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size, 16, 4, seed);
      const v = clamp(128 + (n - 0.5) * 56 + (r() - 0.5) * 10);
      px.set(y * size + x, v, v, v);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    g.putImageData(new ImageData(px.data, size, size), 0, 0);
    // Bare scuffs: soft pale patches where the grass is worn.
    for (let i = 0; i < 14; i++) {
      const x = r() * size;
      const y = r() * size;
      const rad = 10 + r() * 26;
      // Every neighbouring tile, corners included, so a scuff near a corner
      // carries on across both edges.
      for (const [ox, oy] of [-size, 0, size].flatMap((dx) => [-size, 0, size].map((dy) => [dx, dy] as const))) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, 'rgba(176,176,176,0.55)');
        grad.addColorStop(1, 'rgba(176,176,176,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    // Blades, each drawn again across every edge it crosses so the tile repeats.
    g.lineCap = 'round';
    const blades = 26000;
    for (let i = 0; i < blades; i++) {
      const x = r() * size;
      const y = r() * size;
      const a = r() * Math.PI * 2;
      const len = 4 + r() * 11;
      const shade = r() < 0.5 ? 70 + r() * 40 : 150 + r() * 50;
      g.strokeStyle = `rgba(${shade | 0},${shade | 0},${shade | 0},${(0.35 + r() * 0.4).toFixed(2)})`;
      g.lineWidth = 0.8 + r() * 1.1;
      const dx = Math.cos(a) * len;
      const dy = Math.sin(a) * len;
      const bend = (r() - 0.5) * len * 0.6;
      for (const ox of [0, -size, size]) {
        for (const oy of [0, -size, size]) {
          const sx = x + ox;
          const sy = y + oy;
          if (sx + len < 0 || sx - len > size || sy + len < 0 || sy - len > size) continue;
          g.beginPath();
          g.moveTo(sx, sy);
          g.quadraticCurveTo(sx + dx / 2 - (dy / len) * bend, sy + dy / 2 + (dx / len) * bend, sx + dx, sy + dy);
          g.stroke();
        }
      }
    }
  }
  return finish(new CanvasTexture(canvas), false);
}

// ── Foliage (alpha) ─────────────────────────────────────────────────────────

/**
 * A cluster of leaves on transparent ground, for the broadleaf canopies: many
 * small leaves at random angles, with light and dark greens. Alpha-tested.
 */
export function leafCluster(seed: number, palette: readonly string[], leafLen = 22): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const r = rng(seed);
  if (g) {
    for (let k = 0; k < 420; k++) {
      // Denser toward the middle, so cards read as clumps not squares.
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * size * 0.46;
      const x = size / 2 + Math.cos(ang) * rad;
      const y = size / 2 + Math.sin(ang) * rad;
      const len = leafLen * (0.6 + r() * 0.6);
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      g.fillStyle = palette[Math.floor(r() * palette.length)] ?? '#3f6b2a';
      g.beginPath();
      g.ellipse(0, 0, len / 2, len / 5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  const t = finish(new CanvasTexture(canvas), true);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

/** A coconut frond on transparent ground: a midrib with leaflets either side. */
export function palmFrond(seed: number): Texture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const r = rng(seed);
  if (g) {
    g.strokeStyle = '#7b7a3a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
    for (let y = 6; y < h - 4; y += 5) {
      const t = y / h;
      const len = (w / 2 - 4) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.85 + r() * 0.15);
      for (const side of [-1, 1]) {
        g.strokeStyle = r() < 0.15 ? '#8a8d3b' : r() < 0.5 ? '#4e7a2a' : '#3b6524';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(w / 2, y);
        g.lineTo(w / 2 + side * len, y + 10 + r() * 6);
        g.stroke();
      }
    }
  }
  const t = finish(new CanvasTexture(canvas), true);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

/** A banana leaf: one broad blade, torn at the edges. */
export function bananaLeaf(seed: number): Texture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const r = rng(seed);
  if (g) {
    for (let y = 0; y < h; y += 3) {
      const t = y / h;
      const half = (w / 2 - 6) * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05));
      const torn = r() < 0.12 ? half * (0.4 + r() * 0.4) : half;
      g.fillStyle = r() < 0.5 ? '#5c8f2e' : '#4f8227';
      g.fillRect(w / 2 - torn, y, torn * 2, 3.2);
    }
    g.strokeStyle = '#a7b65a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  }
  const t = finish(new CanvasTexture(canvas), true);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}
