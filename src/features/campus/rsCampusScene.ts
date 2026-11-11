/**
 * 3D scene for BRAC University's Residential Campus at Savar (#978).
 *
 * Everything here is drawn from src/core/campusBracuRs.ts: OpenStreetMap's
 * wall and footprints, storey counts with their sources, roof forms and
 * colours read off the February 2026 satellite image, and wall finishes from
 * the RS handbook's photographs. Nothing is loaded: no model file, no imagery.
 *
 *   - buildings: each footprint raised storey by storey, its walls wearing a
 *     façade painted per bay and storey, then its roof — hipped, pitched or
 *     flat — on top;
 *   - grounds: Duronto and Durbar with their markings, the basketball court,
 *     the gardens, the campus roads and the trunk road outside the gate;
 *   - the brick wall with its posts and the east gate;
 *   - trees, one per canopy in the satellite image;
 *   - the buildings outside the wall, low and grey, for context only.
 *
 * Click a building to select it. A frame is drawn only when something changed.
 * The canvas is presentation-only: the route mirrors every choice in the DOM.
 */

import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  RS_BUILDINGS,
  RS_CRICKET_STRIP,
  RS_GATE,
  RS_GROUNDS,
  RS_LANDMARKS,
  RS_NEIGHBOURS,
  RS_ROADS,
  RS_STOREY_HEIGHT,
  RS_TREES,
  RS_WALL,
  RS_WALL_HEIGHT,
  corner,
  polygonArea,
  polygonCentre,
  rsSiteBounds,
  rsWallTop,
  type Point,
  type RsBuilding,
  type RsFacade,
  type RsRect,
} from '../../core/campusBracuRs.ts';

export interface RsSceneOptions {
  /** A building was clicked (its id), or empty ground (null). */
  onSelect?: (id: string | null) => void;
}

export interface RsSceneHandle {
  setSelected(id: string | null): void;
  setLabels(on: boolean): void;
  /** Frame the whole campus, or one building. */
  frame(id: string | null): void;
  dispose(): void;
}

// ── Palette: from the satellite image and the handbook photographs ─────────
const COLOR = {
  outside: '#8f9468',
  compound: '#b7a27c',
  grass: '#7aa452',
  garden: '#5f8f43',
  courtSurface: '#8d8e8b',
  pitchLine: '#f4f1e6',
  cricketStrip: '#d5c39a',
  campusRoad: '#cfc6b4',
  trunkRoad: '#45474a',
  lane: '#a99677',
  footway: '#d9d0bd',
  hipRoof: '#c0624b',
  hipRoofLight: '#d07a62',
  hallRoof: '#cf3f34',
  shedRoof: '#9d4a37',
  flatRoof: '#bdb8ad',
  parapet: '#eceae4',
  plinth: '#2f3336',
  brick: '#9a5a43',
  post: '#a7a59f',
  concrete: '#c9c6bf',
  water: '#f0efe9',
  trunk: '#5d4632',
  neighbour: '#9ea39c',
  highlight: '#2ecc71',
} as const;

/** The plain wall colour of each façade, for gable ends. */
const GABLE_COLOR: Readonly<Record<RsFacade, string>> = {
  dorm: '#efeee9',
  fins: '#f1f0eb',
  bands: '#ebe9e3',
  hall: '#e8e2d4',
  shed: '#bfb6a4',
};

const SELECT_EMISSIVE = new Color(COLOR.highlight).multiplyScalar(0.12);
const BAY_WIDTH = 3.6;
const EAVE_OVERHANG = 0.7;
const CLICK_SLOP_PX = 5;
const NEIGHBOUR_HEIGHT = 6.5;

/** Campus metres (x east, y north) to scene space (x east, y up, z south). */
const sx = (p: Point): number => p[0];
const sz = (p: Point): number => -p[1];

/** Ensure counter-clockwise order (seen from above, in campus metres). */
function ccw(points: readonly Point[]): Point[] {
  return polygonArea(points) < 0 ? [...points].reverse() : [...points];
}

/** A cheap repeatable hash for per-instance variety. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Façade textures: one bay × one storey, painted on a canvas ────────────
function paintFacade(kind: RsFacade): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return c;
  const W = 128;
  const H = 128;
  switch (kind) {
    case 'dorm': {
      // White walls, a window per bay, a balcony slab and rail under each.
      g.fillStyle = '#efeee9';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#d9d7d0';
      g.fillRect(0, H - 14, W, 14); // slab edge
      g.fillStyle = '#34424b';
      g.fillRect(26, 30, 76, 54); // window
      g.fillStyle = '#5b6d77';
      g.fillRect(62, 30, 4, 54); // mullion
      g.fillStyle = '#c8c5bc';
      g.fillRect(22, 84, 84, 18); // balcony rail
      break;
    }
    case 'fins': {
      // White walls, yellow vertical fins over the glazing, red-brick sills.
      g.fillStyle = '#f1f0eb';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#2f3b42';
      g.fillRect(12, 18, 104, 70);
      g.fillStyle = '#e2b52c';
      for (let x = 14; x < 116; x += 13) g.fillRect(x, 18, 6, 70);
      g.fillStyle = '#a4553d';
      g.fillRect(8, 88, 112, 20);
      break;
    }
    case 'bands': {
      // White walls with a ribbon window along each storey.
      g.fillStyle = '#ebe9e3';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#3a4950';
      g.fillRect(0, 36, W, 46);
      g.fillStyle = '#6b7b82';
      for (let x = 0; x < W; x += 32) g.fillRect(x, 36, 3, 46);
      g.fillStyle = '#d6d3cb';
      g.fillRect(0, H - 10, W, 10);
      break;
    }
    case 'hall': {
      // A tall hall: pale walls, a clerestory band, doors at the foot.
      g.fillStyle = '#e8e2d4';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#3f4b51';
      g.fillRect(10, 12, 108, 22);
      g.fillStyle = '#6a5a4a';
      g.fillRect(40, 78, 48, 50);
      break;
    }
    case 'shed': {
      g.fillStyle = '#bfb6a4';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#5a4a3d';
      g.fillRect(48, 44, 32, 84);
      break;
    }
  }
  return c;
}

/** Football markings on a pitch `len` × `wid` metres. */
function paintPitch(len: number, wid: number, cricket: boolean): HTMLCanvasElement {
  const scale = 8;
  const c = document.createElement('canvas');
  c.width = Math.round(len * scale);
  c.height = Math.round(wid * scale);
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = COLOR.grass;
  g.fillRect(0, 0, c.width, c.height);
  // Mown stripes.
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < c.width; x += 6 * scale * 2) g.fillRect(x, 0, 6 * scale, c.height);
  g.strokeStyle = COLOR.pitchLine;
  g.lineWidth = 0.15 * scale;
  const m = 1.5 * scale;
  g.strokeRect(m, m, c.width - 2 * m, c.height - 2 * m);
  if (!cricket) {
    g.beginPath();
    g.moveTo(c.width / 2, m);
    g.lineTo(c.width / 2, c.height - m);
    g.stroke();
    g.beginPath();
    g.arc(c.width / 2, c.height / 2, Math.min(6, wid / 4) * scale, 0, Math.PI * 2);
    g.stroke();
    const boxD = Math.min(12, len * 0.14) * scale;
    const boxW = Math.min(28, wid * 0.6) * scale;
    g.strokeRect(m, (c.height - boxW) / 2, boxD, boxW);
    g.strokeRect(c.width - m - boxD, (c.height - boxW) / 2, boxD, boxW);
  }
  return c;
}

function paintCourt(len: number, wid: number): HTMLCanvasElement {
  const scale = 10;
  const c = document.createElement('canvas');
  c.width = Math.round(len * scale);
  c.height = Math.round(wid * scale);
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = COLOR.courtSurface;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2f2ee';
  g.lineWidth = 0.08 * scale;
  const m = 1 * scale;
  g.strokeRect(m, m, c.width - 2 * m, c.height - 2 * m);
  g.beginPath();
  g.moveTo(c.width / 2, m);
  g.lineTo(c.width / 2, c.height - m);
  g.stroke();
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, 1.8 * scale, 0, Math.PI * 2);
  g.stroke();
  for (const end of [m, c.width - m]) {
    g.beginPath();
    g.arc(end, c.height / 2, 6.75 * scale, end === m ? -Math.PI / 2 : Math.PI / 2, end === m ? Math.PI / 2 : (3 * Math.PI) / 2);
    g.stroke();
  }
  return c;
}

function makeLabel(text: string): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '700 40px "DM Sans", system-ui, sans-serif';
  let width = 320;
  if (ctx) {
    ctx.font = font;
    width = Math.ceil(ctx.measureText(text).width) + 48;
  }
  canvas.width = width;
  canvas.height = 72;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,22,15,0.86)';
    g.beginPath();
    g.roundRect(2, 4, width - 4, 64, 20);
    g.fill();
    g.fillStyle = '#f2f7f3';
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, width / 2, 38);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: width / 72 };
}

// ── Geometry builders ──────────────────────────────────────────────────────

/**
 * Vertical walls along a closed outline, from y0 to y1, with UVs in bays
 * (u) and storeys (v) so a one-bay, one-storey texture repeats exactly.
 */
function wallGeometry(outline: readonly Point[], y0: number, y1: number, storey: number, outset = 0): BufferGeometry {
  const pts = ccw(outline);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = corner(pts, i);
    const b = corner(pts, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    // Outward normal of a CCW polygon is (dy, -dx).
    const nx = (dy / len) * outset;
    const ny = (-dx / len) * outset;
    const bays = Math.max(1, Math.round(len / BAY_WIDTH));
    const base = pos.length / 3;
    const A: Point = [a[0] + nx, a[1] + ny];
    const B: Point = [b[0] + nx, b[1] + ny];
    pos.push(sx(A), y0, sz(A), sx(B), y0, sz(B), sx(B), y1, sz(B), sx(A), y1, sz(A));
    uv.push(0, y0 / storey, bays, y0 / storey, bays, y1 / storey, 0, y1 / storey);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A flat, horizontal cap over an outline at height y (holes allowed in outline order). */
function capGeometry(outline: readonly Point[], y: number): BufferGeometry {
  const shape = new Shape(ccw(outline).map((p) => new Vector2(p[0], p[1])));
  const geo = new ShapeGeometry(shape);
  // Shape lies in XY with Y = north; lay it flat: (x, y) → (x, h, -y).
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** The four corners of an oriented rectangle, grown by `grow` metres. */
function rectCorners(r: RsRect, grow = 0): Point[] {
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

/** Push a triangle (scene-space points) with a flat normal. */
function tri(pos: number[], a: Vector3, b: Vector3, c: Vector3): void {
  pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/** Campus point at height y, as a scene vector. */
const at = (p: Point, y: number): Vector3 => new Vector3(sx(p), y, sz(p));

/**
 * A hipped roof over an oriented rectangle: eaves at y, ridge `rise` above,
 * running along the long side and stopping `width / 2` short of each end.
 */
function hipGeometry(r: RsRect, y: number, rise: number, overhang = EAVE_OVERHANG): BufferGeometry {
  const [p0, p1, p2, p3] = rectCorners(r, overhang).map((p) => at(p, y)) as [Vector3, Vector3, Vector3, Vector3];
  const a = (r.angle * Math.PI) / 180;
  const half = Math.max(0, r.length / 2 - r.width / 2);
  const r0 = at([r.cx - half * Math.cos(a), r.cy - half * Math.sin(a)], y + rise);
  const r1 = at([r.cx + half * Math.cos(a), r.cy + half * Math.sin(a)], y + rise);
  const pos: number[] = [];
  // p0-p1 is one long side, p2-p3 the other; p1-p2 and p3-p0 the ends.
  tri(pos, p0, p1, r1);
  tri(pos, p0, r1, r0);
  tri(pos, p2, p3, r0);
  tri(pos, p2, r0, r1);
  tri(pos, p1, p2, r1);
  tri(pos, p3, p0, r0);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A pitched (gable) roof: two slopes meeting at a ridge along the long side, and gable ends. */
function gableGeometry(r: RsRect, y: number, rise: number): { roof: BufferGeometry; gables: BufferGeometry } {
  const [p0, p1, p2, p3] = rectCorners(r, EAVE_OVERHANG * 0.6).map((p) => at(p, y)) as [Vector3, Vector3, Vector3, Vector3];
  const a = (r.angle * Math.PI) / 180;
  const L = r.length / 2 + EAVE_OVERHANG * 0.6;
  const r0 = at([r.cx - L * Math.cos(a), r.cy - L * Math.sin(a)], y + rise);
  const r1 = at([r.cx + L * Math.cos(a), r.cy + L * Math.sin(a)], y + rise);
  const pos: number[] = [];
  tri(pos, p0, p1, r1);
  tri(pos, p0, r1, r0);
  tri(pos, p2, p3, r0);
  tri(pos, p2, r0, r1);
  const roof = new BufferGeometry();
  roof.setAttribute('position', new Float32BufferAttribute(pos, 3));
  roof.computeVertexNormals();
  const gpos: number[] = [];
  tri(gpos, p1, p2, r1);
  tri(gpos, p3, p0, r0);
  const gables = new BufferGeometry();
  gables.setAttribute('position', new Float32BufferAttribute(gpos, 3));
  gables.computeVertexNormals();
  return { roof, gables };
}

/** A flat ribbon along a polyline, `width` metres wide, at height y. */
function ribbonGeometry(path: readonly Point[], width: number, y: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const h = width / 2;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = corner(path, i);
    const b = corner(path, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const nx = (-dy / len) * h;
    const ny = (dx / len) * h;
    // Extend each segment a little so joints overlap without gaps.
    const ex = (dx / len) * h * 0.9;
    const ey = (dy / len) * h * 0.9;
    const base = pos.length / 3;
    const corners: Point[] = [
      [a[0] - ex + nx, a[1] - ey + ny],
      [a[0] - ex - nx, a[1] - ey - ny],
      [b[0] + ex - nx, b[1] + ey - ny],
      [b[0] + ex + nx, b[1] + ey + ny],
    ];
    for (const c of corners) pos.push(sx(c), y, sz(c));
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A quadrilateral ground patch (a pitch or court) with UVs spanning the
 * texture: u along the longer pair of sides.
 */
function patchGeometry(quad: readonly Point[], y: number): { geo: BufferGeometry; len: number; wid: number } {
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => corner(quad, i)) as [Point, Point, Point, Point];
  const d01 = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d12 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const q: Point[] = d12 > d01 ? [b, c, d, a] : [a, b, c, d];
  const len = Math.max(d01, d12);
  const wid = Math.min(d01, d12);
  const pos: number[] = [];
  for (const p of q) pos.push(sx(p), y, sz(p));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // Wind the two triangles so they face up whichever way the quad turns.
  const up = polygonArea(q) > 0;
  geo.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  return { geo, len, wid };
}

interface BuildingEntry {
  building: RsBuilding;
  group: Group;
  /** Materials tinted when the building is selected. */
  tintable: MeshStandardMaterial[];
  label: Sprite;
  top: number;
}

/**
 * Create the scene inside `container`. Returns null when WebGL is unavailable
 * — the route then keeps only its DOM lists, which carry everything.
 */
export function createRsCampusScene(container: HTMLElement, options: RsSceneOptions = {}): RsSceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.35));
  scene.add(new HemisphereLight(new Color('#eef4ff'), new Color('#b4a98e'), 0.7));
  // The morning sun of the satellite pass: high in the south-east.
  const sun = new DirectionalLight(0xffffff, 2.3);
  const sunDir = new Vector3(0.62, 0.78, 0.74).normalize();
  sun.position.copy(sunDir.clone().multiplyScalar(400));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  const disposables: Array<{ dispose(): void }> = [];
  function track<T extends { dispose(): void }>(item: T): T {
    disposables.push(item);
    return item;
  }
  function flat(color: string, extra: { roughness?: number; metalness?: number; doubleSided?: boolean } = {}): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness: extra.roughness ?? 0.85, metalness: extra.metalness ?? 0 });
    if (extra.doubleSided) m.side = DoubleSide;
    return track(m);
  }
  function textureFrom(canvas: HTMLCanvasElement, repeat = false): Texture {
    const t = track(new CanvasTexture(canvas));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
    }
    return t;
  }
  function mesh(geo: BufferGeometry, mat: Material, opts: { cast?: boolean; receive?: boolean } = {}): Mesh {
    track(geo);
    const m = new Mesh(geo, mat);
    m.castShadow = opts.cast ?? false;
    m.receiveShadow = opts.receive ?? true;
    return m;
  }

  // ── Ground ──────────────────────────────────────────────────────────────
  const ground = mesh(new PlaneGeometry(900, 700), flat(COLOR.outside));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  scene.add(mesh(capGeometry(RS_WALL, 0.01), flat(COLOR.compound)));

  for (const g of RS_GROUNDS) {
    if (g.kind === 'garden') {
      scene.add(mesh(capGeometry(g.outline, 0.04), flat(COLOR.garden)));
      continue;
    }
    if (g.outline.length !== 4) {
      scene.add(mesh(capGeometry(g.outline, 0.05), flat(COLOR.grass)));
      continue;
    }
    const { geo, len, wid } = patchGeometry(g.outline, 0.05);
    const canvas =
      g.kind === 'court' ? paintCourt(len, wid) : paintPitch(len, wid, g.id === 'duronto');
    const mat = track(new MeshStandardMaterial({ map: textureFrom(canvas), roughness: 0.95 }));
    scene.add(mesh(geo, mat));
  }
  {
    const strip = mesh(capGeometry(rectCorners(RS_CRICKET_STRIP), 0.07), flat(COLOR.cricketStrip));
    scene.add(strip);
  }

  // ── Roads ───────────────────────────────────────────────────────────────
  const roadMats = {
    trunk: flat(COLOR.trunkRoad, { roughness: 0.95 }),
    lane: flat(COLOR.lane),
    campus: flat(COLOR.campusRoad),
    foot: flat(COLOR.footway),
  };
  for (const r of RS_ROADS) {
    if (r.kind === 'trunk') scene.add(mesh(ribbonGeometry(r.path, 8, 0.03), roadMats.trunk));
    else if (r.kind === 'footway') scene.add(mesh(ribbonGeometry(r.path, 1.8, 0.06), roadMats.foot));
    else if (r.inside) scene.add(mesh(ribbonGeometry(r.path, 3.6, 0.06), roadMats.campus));
    else if (r.kind !== 'service') scene.add(mesh(ribbonGeometry(r.path, 4.5, 0.02), roadMats.lane));
  }

  // ── The wall, its posts and the gate ─────────────────────────────────────
  const brick = flat(COLOR.brick, { roughness: 0.95 });
  const postMat = flat(COLOR.post);
  const postMatrices: Matrix4[] = [];
  const GATE_GAP = 7;
  for (let i = 0; i < RS_WALL.length; i++) {
    const a = corner(RS_WALL, i);
    const b = corner(RS_WALL, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // Leave the gate open where the wall turns at it.
    let s0 = 0;
    let s1 = len;
    if (a[0] === RS_GATE[0] && a[1] === RS_GATE[1]) s0 = GATE_GAP / 2;
    if (b[0] === RS_GATE[0] && b[1] === RS_GATE[1]) s1 = len - GATE_GAP / 2;
    const segLen = s1 - s0;
    if (segLen <= 0) continue;
    const mid: Point = [a[0] + ux * (s0 + segLen / 2), a[1] + uy * (s0 + segLen / 2)];
    const geo = new BoxGeometry(segLen, RS_WALL_HEIGHT, 0.25);
    const wall = mesh(geo, brick, { cast: true });
    wall.position.set(sx(mid), RS_WALL_HEIGHT / 2, sz(mid));
    wall.rotation.y = Math.atan2(dy, dx);
    scene.add(wall);
    for (let s = s0; s <= s1 + 0.01; s += 3.2) {
      const p: Point = [a[0] + ux * s, a[1] + uy * s];
      postMatrices.push(new Matrix4().compose(new Vector3(sx(p), RS_WALL_HEIGHT / 2 + 0.1, sz(p)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(dy, dx)), new Vector3(1, 1, 1)));
    }
  }
  {
    const postGeo = track(new BoxGeometry(0.4, RS_WALL_HEIGHT + 0.2, 0.4));
    const posts = new InstancedMesh(postGeo, postMat, postMatrices.length);
    postMatrices.forEach((m, i) => posts.setMatrixAt(i, m));
    posts.castShadow = true;
    posts.receiveShadow = true;
    scene.add(posts);
    // Gate pillars either side of the opening, and an open steel gate.
    const gi = RS_WALL.findIndex((p) => p[0] === RS_GATE[0] && p[1] === RS_GATE[1]);
    const prev = corner(RS_WALL, gi - 1);
    const next = corner(RS_WALL, gi + 1);
    for (const other of [prev, next]) {
      const dx = other[0] - RS_GATE[0];
      const dy = other[1] - RS_GATE[1];
      const len = Math.hypot(dx, dy);
      const p: Point = [RS_GATE[0] + (dx / len) * (GATE_GAP / 2), RS_GATE[1] + (dy / len) * (GATE_GAP / 2)];
      const pillar = mesh(new BoxGeometry(0.9, 3.6, 0.9), flat(COLOR.concrete), { cast: true });
      pillar.position.set(sx(p), 1.8, sz(p));
      scene.add(pillar);
    }
  }

  // ── Buildings ───────────────────────────────────────────────────────────
  const facadeTextures = new Map<RsFacade, Texture>();
  function facadeTexture(kind: RsFacade): Texture {
    let t = facadeTextures.get(kind);
    if (!t) {
      t = textureFrom(paintFacade(kind), true);
      facadeTextures.set(kind, t);
    }
    return t;
  }
  const plinthMat = flat(COLOR.plinth);
  const entries: BuildingEntry[] = [];
  const pickables: Object3D[] = [];

  for (const b of RS_BUILDINGS) {
    const group = new Group();
    group.userData['buildingId'] = b.id;
    const storey = RS_STOREY_HEIGHT[b.facade];
    const top = rsWallTop(b);
    const tintable: MeshStandardMaterial[] = [];

    const wallMat = track(new MeshStandardMaterial({ map: facadeTexture(b.facade), roughness: 0.8 }));
    tintable.push(wallMat);
    group.add(mesh(wallGeometry(b.footprint, 0, top, storey), wallMat, { cast: true }));
    // The dark plinth the photographs show at the foot of every building.
    if (b.facade !== 'shed') group.add(mesh(wallGeometry(b.footprint, 0, 0.7, 0.7, 0.04), plinthMat));

    let roofTop = top;
    if (b.roof === 'flat' || b.roof === 'flat-stubs') {
      const roofMat = flat(COLOR.flatRoof);
      tintable.push(roofMat);
      group.add(mesh(capGeometry(b.footprint, top), roofMat));
      const parapetMat = flat(COLOR.parapet);
      group.add(mesh(wallGeometry(b.footprint, top, top + 1, 1, 0.02), parapetMat, { cast: true }));
      roofTop = top + 1;
      // A stair head and water tanks near the middle of the roof.
      const [cx, cy] = polygonCentre(b.footprint);
      const head = mesh(new BoxGeometry(5, 3, 4), parapetMat, { cast: true });
      head.position.set(cx, top + 1.5, -cy);
      group.add(head);
      const tankMat = flat('#2e5b8a', { roughness: 0.5 });
      for (let k = 0; k < 2; k++) {
        const tank = mesh(new CylinderGeometry(0.8, 0.8, 1.5, 12), tankMat, { cast: true });
        tank.position.set(cx + 4 + k * 2, top + 0.75, -cy + 3);
        group.add(tank);
      }
      if (b.roof === 'flat-stubs') {
        // Column stubs on a 5 m grid, as the satellite image shows them.
        const stubGeo = track(new BoxGeometry(0.45, 1.1, 0.45));
        const spots: Matrix4[] = [];
        const xs = b.footprint.map((p) => p[0]);
        const ys = b.footprint.map((p) => p[1]);
        for (let x = Math.min(...xs) + 2.5; x < Math.max(...xs); x += 5) {
          for (let y = Math.min(...ys) + 2.5; y < Math.max(...ys); y += 5) {
            if (pointInside([x, y], b.footprint, 1.2)) {
              spots.push(new Matrix4().makeTranslation(x, top + 0.55, -y));
            }
          }
        }
        const stubs = new InstancedMesh(stubGeo, flat(COLOR.concrete), spots.length);
        spots.forEach((m, i) => stubs.setMatrixAt(i, m));
        stubs.castShadow = true;
        group.add(stubs);
      }
    } else {
      // A slab under the roof closes the top and covers any link between parts.
      group.add(mesh(capGeometry(b.footprint, top), flat(COLOR.flatRoof)));
      const roofColor = b.roof === 'hip' ? COLOR.hipRoof : b.kind === 'hall' ? COLOR.hallRoof : COLOR.shedRoof;
      const roofMat = flat(roofColor, { roughness: 0.7, doubleSided: true });
      const gableMat = flat(GABLE_COLOR[b.facade], { doubleSided: true });
      tintable.push(roofMat, gableMat);
      for (const part of b.roofParts ?? []) {
        if (b.roof === 'hip') {
          const rise = Math.min(5, part.width * 0.2);
          group.add(mesh(hipGeometry(part, top, rise), roofMat, { cast: true }));
          roofTop = Math.max(roofTop, top + rise);
          if (b.id === 'nikunja') {
            // Nikunja's raised ridge light: a glazed box with its own small hip roof.
            const inner: RsRect = { ...part, length: part.length * 0.55, width: part.width * 0.32 };
            const lift = rise * 0.62;
            const glass = flat('#3d4f59', { roughness: 0.3 });
            group.add(mesh(wallGeometry(rectCorners(inner), top + lift, top + lift + 1.3, 1.3), glass));
            group.add(mesh(hipGeometry(inner, top + lift + 1.3, 1.1, 0.4), flat(COLOR.hipRoofLight, { roughness: 0.7, doubleSided: true }), { cast: true }));
            roofTop = Math.max(roofTop, top + lift + 2.4);
          }
        } else {
          const rise = Math.min(4, part.width * (b.kind === 'hall' ? 0.14 : 0.18));
          const { roof, gables } = gableGeometry(part, top, rise);
          group.add(mesh(roof, roofMat, { cast: true }));
          group.add(mesh(gables, gableMat, { cast: true }));
          roofTop = Math.max(roofTop, top + rise);
        }
      }
    }

    const { texture, aspect } = makeLabel(b.label);
    track(texture);
    // A constant size on screen, whatever the zoom: 0.042 of the view's height
    // at this field of view, about 18 px on a 420 px canvas.
    const label = new Sprite(
      track(new SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false })),
    );
    const [lx, ly] = polygonCentre(b.footprint);
    const labelH = 0.042;
    label.scale.set(labelH * aspect, labelH, 1);
    label.position.set(lx, roofTop + 3, -ly);
    label.renderOrder = 10;
    label.visible = b.name !== null;
    group.add(label);

    scene.add(group);
    entries.push({ building: b, group, tintable, label, top: roofTop });
    group.traverse((o) => {
      if (o !== label && (o as Mesh).isMesh) pickables.push(o);
    });
  }

  // ── Landmarks ───────────────────────────────────────────────────────────
  for (const l of RS_LANDMARKS) {
    if (l.kind === 'water-tower') {
      const shaft = mesh(new BoxGeometry(3, 13, 3), flat(COLOR.water), { cast: true });
      shaft.position.set(sx(l.at), 6.5, sz(l.at));
      const tank = mesh(new BoxGeometry(5.5, 3.2, 5.5), flat(COLOR.water), { cast: true });
      tank.position.set(sx(l.at), 14.6, sz(l.at));
      scene.add(shaft, tank);
    } else {
      const plinth = mesh(new BoxGeometry(1.6, 0.8, 1.6), flat(COLOR.concrete), { cast: true });
      plinth.position.set(sx(l.at), 0.4, sz(l.at));
      const form = mesh(new CylinderGeometry(0.25, 0.5, 2.6, 8), flat('#8a7a63', { metalness: 0.3, roughness: 0.5 }), { cast: true });
      form.position.set(sx(l.at), 2.1, sz(l.at));
      scene.add(plinth, form);
    }
  }

  // ── Trees ───────────────────────────────────────────────────────────────
  {
    const trunkGeo = track(new CylinderGeometry(0.22, 0.32, 1, 6));
    const crownGeo = track(new IcosahedronGeometry(1, 1));
    const trunks = new InstancedMesh(trunkGeo, flat(COLOR.trunk), RS_TREES.length);
    const crowns = new InstancedMesh(crownGeo, track(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })), RS_TREES.length);
    const greens = ['#3e6b2f', '#4a7a35', '#355e2a', '#5a8a3c', '#2f5526'].map((c) => new Color(c));
    const m = new Matrix4();
    RS_TREES.forEach((p, i) => {
      const h1 = hash(i + 1);
      const h2 = hash(i + 101);
      const trunkH = 3 + h1 * 3.5;
      const r = 2.4 + h2 * 1.8;
      m.compose(new Vector3(sx(p), trunkH / 2, sz(p)), new Quaternion(), new Vector3(1, trunkH, 1));
      trunks.setMatrixAt(i, m);
      m.compose(new Vector3(sx(p), trunkH + r * 0.7, sz(p)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), h1 * 6.28), new Vector3(r, r * (0.8 + h1 * 0.3), r));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, greens[Math.floor(h2 * greens.length) % greens.length] ?? new Color(COLOR.garden));
    });
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    scene.add(trunks, crowns);
  }

  // ── The neighbourhood, for context ──────────────────────────────────────
  {
    const mat = flat(COLOR.neighbour);
    for (const n of RS_NEIGHBOURS) {
      if (Math.abs(polygonArea(n)) < 8) continue;
      const w = mesh(wallGeometry(n, 0, NEIGHBOUR_HEIGHT, NEIGHBOUR_HEIGHT), mat, { cast: true });
      const c = mesh(capGeometry(n, NEIGHBOUR_HEIGHT), mat);
      scene.add(w, c);
    }
  }

  // ── Camera ──────────────────────────────────────────────────────────────
  const camera = new PerspectiveCamera(38, 1, 1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 20;
  controls.maxDistance = 900;
  controls.screenSpacePanning = false;

  function frame(id: string | null): void {
    const entry = id ? entries.find((e) => e.building.id === id) : null;
    if (entry) {
      const [cx, cy] = polygonCentre(entry.building.footprint);
      const xs = entry.building.footprint.map((p) => p[0]);
      const ys = entry.building.footprint.map((p) => p[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), entry.top);
      const d = Math.max(45, span * 1.9);
      controls.target.set(cx, entry.top * 0.4, -cy);
      camera.position.set(cx + d * 0.55, entry.top * 0.4 + d * 0.62, -cy + d * 0.75);
    } else {
      const b = rsSiteBounds();
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      controls.target.set(cx + 10, 0, -cy);
      camera.position.set(cx + 170, 215, -cy + 265);
    }
    controls.update();
    requestRender();
  }

  // ── Rendering on demand ─────────────────────────────────────────────────
  let frameRequested = false;
  let disposed = false;
  function render(): void {
    frameRequested = false;
    if (disposed) return;
    renderer.render(scene, camera);
  }
  function requestRender(): void {
    if (frameRequested || disposed) return;
    frameRequested = true;
    requestAnimationFrame(render);
  }
  controls.addEventListener('change', requestRender);

  function resize(): void {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  resize();
  frame(null);

  // ── Picking ─────────────────────────────────────────────────────────────
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;
  function buildingAt(clientX: number, clientY: number): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    let o: Object3D | null = hit?.object ?? null;
    while (o && o.userData['buildingId'] === undefined) o = o.parent;
    return (o?.userData['buildingId'] as string | undefined) ?? null;
  }
  const onDown = (e: PointerEvent): void => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent): void => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > CLICK_SLOP_PX) return;
    options.onSelect?.(buildingAt(e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent): void => {
    if (downAt) return;
    renderer.domElement.style.cursor = buildingAt(e.clientX, e.clientY) ? 'pointer' : '';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);

  let labelsOn = true;
  let selected: string | null = null;
  function applyLabels(): void {
    for (const e of entries) {
      e.label.visible = e.building.id === selected || (labelsOn && e.building.name !== null);
    }
  }

  return {
    setSelected(id) {
      selected = id;
      for (const e of entries) {
        const on = e.building.id === id;
        for (const m of e.tintable) m.emissive.copy(on ? SELECT_EMISSIVE : new Color(0x000000));
      }
      applyLabels();
      requestRender();
    },
    setLabels(on) {
      labelsOn = on;
      applyLabels();
      requestRender();
    },
    frame,
    dispose() {
      disposed = true;
      observer?.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Inside the polygon and at least `margin` metres from every edge. */
function pointInside(p: Point, polygon: readonly Point[], margin: number): boolean {
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
