/**
 * The ground of the Residential Campus, painted as one map (#978).
 *
 * One canvas covers the campus and the land round it at half a metre a pixel.
 * Everything on it is laid out from the site data, the way the February 2026
 * satellite image shows the ground: dusty earth with patchy grass inside the
 * wall, greener gardens, the two fields worn bare in the goalmouths, the
 * paved court, concrete campus roads, the asphalt trunk road and its dusty
 * verges — then soft shade under every tree and along every wall, which the
 * sun's shadows alone leave too clean.
 */

import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three';

import {
  RS_BUILDINGS,
  RS_CRICKET_STRIP,
  RS_GROUNDS,
  RS_ROADS,
  RS_TREES,
  RS_WALL,
  RS_WATER,
  type Point,
} from '../../core/campusBracuRs.ts';
import { fbm, rng } from './rsTextures.ts';

/** The painted area, in campus metres. */
export const GROUND_EXTENT = { x1: -330, x2: 330, y1: -240, y2: 240 } as const;
const RES = 0.5; // metres per pixel

type Ctx = CanvasRenderingContext2D;

const W = Math.round((GROUND_EXTENT.x2 - GROUND_EXTENT.x1) / RES);
const H = Math.round((GROUND_EXTENT.y2 - GROUND_EXTENT.y1) / RES);
const px = (p: Point): [number, number] => [(p[0] - GROUND_EXTENT.x1) / RES, (GROUND_EXTENT.y2 - p[1]) / RES];
const m = (metres: number): number => metres / RES;

function tracePolygon(g: Ctx, pts: readonly Point[]): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = px(p);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
}

function tracePath(g: Ctx, pts: readonly Point[]): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = px(p);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
}

/**
 * A low-resolution blend of two colours by fractal noise, drawn scaled up:
 * the large-scale mottling of grass and bare earth.
 */
function mottle(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  seed: number,
  cells: number,
  bias = 0.5,
  sharp = 3,
): HTMLCanvasElement {
  const w = Math.round(W / 4);
  const h = Math.round(H / 4);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w, y / h, cells, 5, seed);
      const t = Math.min(1, Math.max(0, (n - bias) * sharp + 0.5));
      const k = (y * w + x) * 4;
      img.data[k] = a[0] + (b[0] - a[0]) * t;
      img.data[k + 1] = a[1] + (b[1] - a[1]) * t;
      img.data[k + 2] = a[2] + (b[2] - a[2]) * t;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A fine grain tile for the whole map, drawn as a pattern. */
function grain(seed: number): HTMLCanvasElement {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(s, s);
  const r = rng(seed);
  for (let i = 0; i < s * s; i++) {
    const v = 128 + (r() - 0.5) * 70;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The long side of a quadrilateral first: [a, b] along it, [b, c] across. */
function orientQuad(q: readonly Point[]): [Point, Point, Point, Point] | null {
  const [a, b, c, d] = q;
  if (!a || !b || !c || !d) return null;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) >= Math.hypot(c[0] - b[0], c[1] - b[1]) ? [a, b, c, d] : [b, c, d, a];
}

/**
 * Map the unit square onto a quadrilateral's first three corners (an affine
 * fit — the fields are near-rectangles), so a pitch can be drawn in its own
 * frame: u along the length, v across.
 */
function quadFrame(g: Ctx, q: [Point, Point, Point, Point], len: number, wid: number): void {
  const [a, b, , d] = q;
  const [ax, ay] = px(a);
  const [bx, by] = px(b);
  const [dx, dy] = px(d);
  g.setTransform((bx - ax) / len, (by - ay) / len, (dx - ax) / wid, (dy - ay) / wid, ax, ay);
}

function paintPitch(g: Ctx, q: [Point, Point, Point, Point], cricket: boolean, seed: number): void {
  const [a, b, c] = q;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const wid = Math.hypot(c[0] - b[0], c[1] - b[1]);
  g.save();
  quadFrame(g, q, len, wid);
  // Grass, mown in stripes.
  g.fillStyle = '#5a8132';
  g.fillRect(0, 0, len, wid);
  for (let x = 0; x < len; x += 10) {
    g.fillStyle = 'rgba(255,255,230,0.06)';
    g.fillRect(x, 0, 5, wid);
  }
  // Worn earth where play is hardest: the goalmouths and the centre.
  const worn = (x: number, y: number, rx: number, ry: number, alpha: number): void => {
    const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    grd.addColorStop(0, `rgba(160,135,95,${alpha})`);
    grd.addColorStop(1, 'rgba(160,135,95,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const r = rng(seed);
  worn(4, wid / 2, 9, 7, 0.85);
  worn(len - 4, wid / 2, 9, 7, 0.85);
  worn(len / 2, wid / 2, 10, 8, 0.45);
  for (let k = 0; k < 14; k++) worn(r() * len, r() * wid, 3 + r() * 6, 2 + r() * 4, 0.25 + r() * 0.3);
  // Lines, chalked and a little faded.
  g.strokeStyle = 'rgba(240,238,225,0.85)';
  g.lineWidth = 0.12;
  const mgn = 1.2;
  g.strokeRect(mgn, mgn, len - 2 * mgn, wid - 2 * mgn);
  if (!cricket) {
    g.beginPath();
    g.moveTo(len / 2, mgn);
    g.lineTo(len / 2, wid - mgn);
    g.stroke();
    g.beginPath();
    g.arc(len / 2, wid / 2, Math.min(6, wid / 4), 0, Math.PI * 2);
    g.stroke();
  }
  const boxD = Math.min(11, len * 0.13);
  const boxW = Math.min(26, wid * 0.62);
  g.strokeRect(mgn, (wid - boxW) / 2, boxD, boxW);
  g.strokeRect(len - mgn - boxD, (wid - boxW) / 2, boxD, boxW);
  g.restore();
}

function paintCourt(g: Ctx, q: [Point, Point, Point, Point]): void {
  const [a, b, c] = q;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const wid = Math.hypot(c[0] - b[0], c[1] - b[1]);
  g.save();
  quadFrame(g, q, len, wid);
  g.fillStyle = '#8e8c86';
  g.fillRect(0, 0, len, wid);
  g.fillStyle = 'rgba(60,60,55,0.18)';
  for (let k = 0; k < 30; k++) g.fillRect((k * 7.3) % len, (k * 3.1) % wid, 2.5, 1.5);
  g.strokeStyle = 'rgba(245,245,240,0.9)';
  g.lineWidth = 0.08;
  const mgn = 1;
  g.strokeRect(mgn, mgn, len - 2, wid - 2);
  g.beginPath();
  g.moveTo(len / 2, mgn);
  g.lineTo(len / 2, wid - mgn);
  g.stroke();
  g.beginPath();
  g.arc(len / 2, wid / 2, 1.8, 0, Math.PI * 2);
  g.stroke();
  for (const end of [mgn, len - mgn]) {
    const dir = end === mgn ? 1 : -1;
    g.beginPath();
    g.arc(end, wid / 2, 6.75, -Math.PI / 2, Math.PI / 2, dir < 0);
    g.stroke();
    g.strokeRect(dir > 0 ? end : end - 5.8, wid / 2 - 2.45, 5.8, 4.9);
  }
  g.restore();
}

/** Paint the ground map. Takes a few hundred milliseconds; call once. */
/**
 * Paints the map. `base`, when given, draws the country beyond (rsLandscape.ts)
 * under it, cropped to this map: the scrub round the campus then fades into
 * it toward the edges, so the near map and the country meet without a seam.
 */
export function paintGround(base?: (g: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.imageSmoothingEnabled = true;

  // Land round the campus: fields and scrub, mottled green and earth.
  const scrub = mottle([88, 104, 50], [126, 108, 74], 401, 10, 0.48, 2.5);
  if (base) {
    base(g, W, H);
    // The scrub, faded out over the last 35 m of the map.
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const lg = layer.getContext('2d');
    const mg = mask.getContext('2d');
    if (lg && mg) {
      // A soft-edged rectangle: its blurred shadow, the shape itself off-canvas.
      const off = W * 2;
      mg.translate(-off, 0);
      mg.shadowOffsetX = off;
      mg.shadowBlur = m(22);
      mg.shadowColor = '#000';
      mg.fillStyle = '#000';
      mg.fillRect(m(35), m(35), W - m(70), H - m(70));
      lg.drawImage(scrub, 0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in';
      lg.drawImage(mask, 0, 0);
      g.drawImage(layer, 0, 0);
    }
  } else {
    g.drawImage(scrub, 0, 0, W, H);
  }

  // Inside the wall: dusty earth with patchy, dry grass.
  g.save();
  tracePolygon(g, RS_WALL);
  g.clip();
  g.drawImage(mottle([146, 122, 86], [96, 112, 56], 402, 14, 0.5, 3.2), 0, 0, W, H);

  // Gardens: greener, with soft edges.
  g.shadowColor = 'rgba(70,110,45,0.8)';
  g.shadowBlur = m(1.5);
  for (const gr of RS_GROUNDS) {
    if (gr.kind !== 'garden') continue;
    tracePolygon(g, gr.outline);
    g.fillStyle = '#4f7a2c';
    g.fill();
  }
  g.shadowBlur = 0;
  // Grass mottling over the gardens.
  for (const gr of RS_GROUNDS) {
    if (gr.kind !== 'garden') continue;
    g.save();
    tracePolygon(g, gr.outline);
    g.clip();
    g.globalAlpha = 0.45;
    g.drawImage(mottle([70, 108, 42], [108, 118, 60], 403, 20, 0.5, 2), 0, 0, W, H);
    g.restore();
  }

  // Fields and court, each in its own frame.
  g.save();
  g.scale(1, 1);
  for (const gr of RS_GROUNDS) {
    if (gr.kind === 'garden') continue;
    const q = orientQuad(gr.outline);
    if (!q) continue;
    if (gr.kind === 'court') paintCourt(g, q);
    else paintPitch(g, q, gr.id === 'duronto', gr.osmWay);
  }
  g.restore();
  // Duronto's cricket strip: rolled bare.
  {
    const s = RS_CRICKET_STRIP;
    const a = (s.angle * Math.PI) / 180;
    const [cx, cy] = px([s.cx, s.cy]);
    g.save();
    g.translate(cx, cy);
    g.rotate(-a);
    g.fillStyle = '#c9b48a';
    g.fillRect(-m(s.length) / 2, -m(s.width) / 2, m(s.length), m(s.width));
    g.restore();
  }
  g.restore(); // end of the wall clip

  // Roads and paths.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const r of RS_ROADS) {
    if (r.kind === 'trunk') {
      tracePath(g, r.path);
      g.strokeStyle = '#a8946e'; // dusty verge
      g.lineWidth = m(12);
      g.stroke();
      g.strokeStyle = '#45464a';
      g.lineWidth = m(7.5);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = m(2.5);
      g.stroke();
    } else if (r.inside) {
      tracePath(g, r.path);
      g.strokeStyle = 'rgba(120,105,80,0.55)';
      g.lineWidth = m(r.kind === 'footway' ? 2.6 : 4.6);
      g.stroke();
      g.strokeStyle = r.kind === 'footway' ? '#c8bba0' : '#bdb5a5';
      g.lineWidth = m(r.kind === 'footway' ? 1.8 : 3.6);
      g.stroke();
    } else {
      tracePath(g, r.path);
      g.strokeStyle = '#a3906c';
      g.lineWidth = m(r.kind === 'service' ? 3.2 : 4.8);
      g.stroke();
      g.strokeStyle = 'rgba(80,70,55,0.25)';
      g.lineWidth = m(1.2);
      g.stroke();
    }
  }

  // Ponds: dark, silty green water inside a muddy bank.
  for (const w of RS_WATER) {
    tracePolygon(g, w.outline);
    g.strokeStyle = '#7a6a4c';
    g.lineWidth = m(3);
    g.stroke();
    g.fillStyle = '#34452c';
    g.fill();
  }

  // Soft shade: under every canopy, at the foot of every building and wall.
  for (const t of RS_TREES) {
    const [x, y] = px(t);
    const grd = g.createRadialGradient(x, y, 0, x, y, m(4.5));
    grd.addColorStop(0, 'rgba(40,45,25,0.42)');
    grd.addColorStop(1, 'rgba(40,45,25,0)');
    g.fillStyle = grd;
    g.fillRect(x - m(4.5), y - m(4.5), m(9), m(9));
  }
  // Drawn far off the canvas with its shadow thrown back on: only the soft
  // shadow lands, which works where ctx.filter does not (older Safari).
  g.save();
  const OFF = W * 2;
  g.translate(-OFF, 0);
  g.shadowOffsetX = OFF;
  g.shadowBlur = m(1.6);
  g.shadowColor = 'rgba(30,28,22,0.6)';
  g.strokeStyle = '#000';
  g.lineWidth = m(2.2);
  for (const b of RS_BUILDINGS) {
    tracePolygon(g, b.footprint);
    g.stroke();
  }
  g.shadowColor = 'rgba(60,45,30,0.5)';
  g.lineWidth = m(1.6);
  tracePolygon(g, RS_WALL);
  g.stroke();
  g.restore();

  // Grain over everything.
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.35;
  const pat = g.createPattern(grain(404), 'repeat');
  if (pat) {
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
  }
  g.restore();
  return canvas;
}

/** The ground's colour texture. */
export function groundTexture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

/**
 * The ground material: the painted map, with a detail texture multiplied in
 * twice — at a 3 m tile for grain up close, and at 27 m for the patches of
 * grass and bare earth that keep the middle distance from going smooth.
 * `span` is how many metres the map's UVs cover.
 *
 * With `hole` (campus metres), the ground is not drawn inside that rectangle:
 * the country's plane runs under the near map, and drawing both there would
 * need the near map pulled forward with a polygon offset — which, at a
 * grazing angle, pulls it in front of anything low standing on it too.
 */
export function groundMaterial(
  map: Texture,
  detail: Texture,
  span: number = GROUND_EXTENT.x2 - GROUND_EXTENT.x1,
  hole?: { x1: number; x2: number; y1: number; y2: number },
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ map, roughness: 0.97, metalness: 0 });
  const repeat = span / 3; // a 3 m detail tile
  // Three metres' overlap all round: at a grazing angle any less leaves
  // dashes of sky along the seam.
  const cut = hole
    ? `if ( vGroundAt.x > ${(hole.x1 + 3).toFixed(2)} && vGroundAt.x < ${(hole.x2 - 3).toFixed(2)} && -vGroundAt.y > ${(hole.y1 + 3).toFixed(2)} && -vGroundAt.y < ${(hole.y2 - 3).toFixed(2)} ) discard;`
    : '';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['detailMap'] = { value: detail };
    shader.uniforms['detailRepeat'] = { value: repeat };
    if (hole) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundAt;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGroundAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundAt;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  ${cut}`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform float detailRepeat;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  // Blades and grain up close, calmer with distance (where they would only
  // shimmer); broader patches of lighter and darker, greener and drier
  // ground at the two coarser scales, which also hide the tile's repeat.
  float detailNear = 1.0 - smoothstep( 15.0, 260.0, length( vViewPosition ) );
  vec3 blades = texture2D( detailMap, vMapUv * detailRepeat ).rgb * 2.0;
  diffuseColor.rgb *= mix( vec3( 1.0 ), blades, 0.55 + 0.75 * detailNear );
  diffuseColor.rgb *= mix( 1.0, texture2D( detailMap, vMapUv * detailRepeat / 9.0 + 0.37 ).r * 2.0, 0.8 );
  float patchy = texture2D( detailMap, vMapUv * detailRepeat / 31.0 + 0.71 ).r * 2.0 - 1.0;
  diffuseColor.rgb *= vec3( 1.0 + 0.10 * patchy, 1.0 + 0.02 * patchy, 1.0 - 0.10 * patchy );`,
      );
  };
  mat.customProgramCacheKey = () => (hole ? 'rs-ground-detail-2-holed' : 'rs-ground-detail-2');
  return mat;
}
