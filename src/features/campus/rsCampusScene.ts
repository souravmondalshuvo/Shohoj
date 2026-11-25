/**
 * 3D scene for BRAC University's Residential Campus at Savar (#978).
 *
 * Everything is drawn from src/core/campusBracuRs.ts — OpenStreetMap's wall
 * and footprints, storey counts with their sources — and modelled in code
 * for a near-real look:
 *
 *   - a physical sky with the haze of the Dhaka plain, which also lights the
 *     scene and is reflected in the glass (rsBuildings.ts);
 *   - the morning sun of the satellite pass, high in the south-east, with
 *     soft shadows from buildings, sunshades and every leaf;
 *   - buildings with real window, sunshade, balcony and fin geometry and
 *     textured roofs (rsBuildings.ts);
 *   - the ground painted as one map: earth, grass, fields, paving and shade
 *     (rsGround.ts), with clumps of grass standing up off it near the camera
 *     (rsGrass.ts);
 *   - rain trees, mast trees, coconut palms and bananas (rsTrees.ts);
 *   - the brick boundary wall with its posts, the east gate, goals, hoops,
 *     cricket stumps, the water tower and the ring sculptures;
 *   - the buildings outside the wall, plainer, for context.
 *
 * Nothing is fetched: every texture is painted on a canvas, so the page's CSP
 * (no blob: images, no WASM) is never in question. Click a building to select
 * it. A frame is drawn only when something changed. The canvas is
 * presentation-only: the route mirrors every choice in the DOM.
 */

import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

import {
  RS_BUILDINGS,
  RS_CRICKET_STRIP,
  RS_GATE,
  RS_GROUNDS,
  RS_LANDMARKS,
  RS_NEIGHBOURS,
  RS_ROADS,
  RS_TREES,
  RS_WATER,
  RS_WALL,
  RS_WALL_HEIGHT,
  corner,
  polygonCentre,
  rsSiteBounds,
  type Point,
} from '../../core/campusBracuRs.ts';
import { SELECT_TINT, buildBuildings, type BuiltBuilding } from './rsBuildings.ts';
import { GROUND_EXTENT, groundMaterial, groundTexture, paintGround } from './rsGround.ts';
import { buildCountry, countryPlan, countryScatter, drawNearCrop, paintCountry } from './rsLandscape.ts';
import { buildNeighbours } from './rsNeighbours.ts';
import { createPost } from './rsPost.ts';
import { brick, groundDetail, plaster, rng } from './rsTextures.ts';
import { buildTrees } from './rsTrees.ts';
import { buildGrass, grassScatter } from './rsGrass.ts';
import { buildPonds } from './rsWater.ts';

export interface RsSceneOptions {
  /** A building was clicked (its id), or empty ground (null). */
  onSelect?: (id: string | null) => void;
}

export interface RsSceneHandle {
  setSelected(id: string | null): void;
  setLabels(on: boolean): void;
  /** Frame the whole campus, or one building. */
  frame(id: string | null): void;
  /** Stand at the gate at eye level, looking into the campus. */
  eyeLevel(): void;
  dispose(): void;
}

const CLICK_SLOP_PX = 5;
const NO_TINT = new Color(0x000000);

/**
 * Where the sun is: a winter morning at 23.9° N, east-south-east (azimuth
 * 110°) at 35°. Shadows fall to the west-north-west, across the default view
 * rather than behind the buildings. (x east, y up, z south.)
 */
const SUN_DIRECTION = new Vector3(0.77, 0.57, 0.28).normalize();
const HAZE = '#b9c6cf';

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
    g.fillStyle = 'rgba(10,22,15,0.82)';
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

/**
 * Both faces and the top of a free-standing wall along a polyline, with UVs
 * in metres along it (u) and in `vTile` metres up it (v).
 */
function wallRibbon(path: readonly Point[], height: number, thick: number, vTile: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  let run = 0;
  const push = (p: Point, y: number, u: number, v: number): void => {
    pos.push(p[0], y, -p[1]);
    uv.push(u, v);
  };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const nx = (dy / len) * (thick / 2);
    const ny = (-dx / len) * (thick / 2);
    const aO: Point = [a[0] + nx, a[1] + ny];
    const bO: Point = [b[0] + nx, b[1] + ny];
    const aI: Point = [a[0] - nx, a[1] - ny];
    const bI: Point = [b[0] - nx, b[1] - ny];
    const u0 = run;
    const u1 = run + len;
    const vh = height / vTile;
    // Outer face (facing +n).
    push(aO, 0, u0, 0); push(bO, 0, u1, 0); push(bO, height, u1, vh);
    push(aO, 0, u0, 0); push(bO, height, u1, vh); push(aO, height, u0, vh);
    // Inner face (facing −n).
    push(bI, 0, u1, 0); push(aI, 0, u0, 0); push(aI, height, u0, vh);
    push(bI, 0, u1, 0); push(aI, height, u0, vh); push(bI, height, u1, vh);
    // Top.
    push(aO, height, u0, 0); push(bO, height, u1, 0); push(bI, height, u1, 0.3);
    push(aO, height, u0, 0); push(bI, height, u1, 0.3); push(aI, height, u0, 0.3);
    run += len;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** A device that reports at most four cores or 4 GB of memory. */
function lowPowered(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}

/**
 * Create the scene inside `container`. Returns null when WebGL is unavailable
 * — the route then keeps only its DOM lists, which carry everything.
 */
export function createRsCampusScene(container: HTMLElement, options: RsSceneOptions = {}): RsSceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  // A phone gets fewer pixels and a smaller shadow map; the look is the same.
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  // The costly extras (ambient occlusion, pond mirrors, the full country)
  // also go on a device that reports few cores or little memory.
  const light = small || lowPowered();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Nothing casting a shadow ever moves: draw the shadow map once, not on
  // every frame (or every mirror render).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const disposables: Array<{ dispose(): void }> = [];
  function track<T extends { dispose(): void }>(item: T): T {
    disposables.push(item);
    return item;
  }

  // Built inside a guard: if any allocation fails part-way (a canvas, a
  // render target, memory on a small device), everything made so far is freed
  // and the route keeps its DOM lists, as when WebGL is missing.
  function build(): RsSceneHandle {
    const scene = new Scene();

    // ── Sky, haze and light ─────────────────────────────────────────────────
    const sky = new Sky();
    sky.scale.setScalar(6000);
    const u = sky.material.uniforms;
    if (u['turbidity']) u['turbidity'].value = 4.5;
    if (u['rayleigh']) u['rayleigh'].value = 1.9;
    if (u['mieCoefficient']) u['mieCoefficient'].value = 0.005;
    if (u['mieDirectionalG']) u['mieDirectionalG'].value = 0.82;
    if (u['sunPosition']) u['sunPosition'].value.copy(SUN_DIRECTION);
    track(sky.geometry);
    track(sky.material);
    scene.add(sky);
    // The sky lights the scene and is what the glass and water reflect.
    const envTex: Texture = (() => {
      const pmrem = new PMREMGenerator(renderer);
      const envScene = new Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(6000);
      for (const k of Object.keys(u)) {
        const from = u[k];
        const to = envSky.material.uniforms[k];
        if (from && to) to.value = from.value;
      }
      // Without the sun's disc: the sun lights the scene once, through the
      // shadowed directional light, not again through the environment.
      const disc = envSky.material.uniforms['showSunDisc'];
      if (disc) disc.value = 0;
      envScene.add(envSky);
      // Below the horizon, sunlit dry ground rather than the sky model's dark
      // continuation: what lights a shaded wall in the tropics is as much
      // the warm bounce off the ground in front of it as the blue sky above.
      const bounceGeo = new CircleGeometry(5000, 24);
      const bounceMat = new MeshBasicMaterial({ color: new Color(0.5, 0.41, 0.3) });
      const bounce = new Mesh(bounceGeo, bounceMat);
      bounce.rotation.x = -Math.PI / 2;
      bounce.position.y = -5;
      envScene.add(bounce);
      const env = pmrem.fromScene(envScene, 0, 1, 20000);
      bounceGeo.dispose();
      bounceMat.dispose();
      const texture = track(env.texture);
      scene.environment = texture;
      // Low: the sky model is a clear one, bluer than the haze over Savar; a
      // neutral fill (below) carries most of the light in the shade.
      scene.environmentIntensity = 0.08;
      envSky.geometry.dispose();
      envSky.material.dispose();
      pmrem.dispose();
      return texture;
    })();
    const FOG_DENSITY = 0.001;
    const fog = new FogExp2(HAZE, FOG_DENSITY);
    scene.fog = fog;
    // A dry-season sky is hazy, and haze scatters white: shade under it is a
    // soft grey, not the deep blue a clear sky alone would light it.
    scene.add(new HemisphereLight(new Color('#e8e6e0'), new Color('#8a7a5c'), 0.8));
    const sun = new DirectionalLight(new Color('#fff0d8'), 3.6);
    sun.position.copy(SUN_DIRECTION.clone().multiplyScalar(420));
    sun.castShadow = true;
    sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
    const sc = sun.shadow.camera;
    sc.left = -250;
    sc.right = 250;
    sc.top = 190;
    sc.bottom = -190;
    sc.near = 100;
    sc.far = 800;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.25;
    scene.add(sun);
    scene.add(sun.target);

    // ── Ground: the country to the horizon, the mapped area on top ──────────
    {
      const plan = countryPlan();
      const scatter = countryScatter(plan, light ? 2 : 1);
      const countryCanvas = paintCountry(plan, scatter);
      const country = buildCountry(countryCanvas, plan, scatter);
      disposables.push(country);
      scene.add(country.group);
      const nearCanvas = paintGround((g, w, h) => drawNearCrop(g, countryCanvas, w, h));
      const map = track(groundTexture(nearCanvas));
      const detail = track(groundDetail(405));
      const w = GROUND_EXTENT.x2 - GROUND_EXTENT.x1;
      const h = GROUND_EXTENT.y2 - GROUND_EXTENT.y1;
      // The country's plane leaves this rectangle to it (see groundMaterial).
      const nearMat = track(groundMaterial(map, detail));
      const ground = new Mesh(track(new PlaneGeometry(w, h)), nearMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set((GROUND_EXTENT.x1 + GROUND_EXTENT.x2) / 2, 0, -(GROUND_EXTENT.y1 + GROUND_EXTENT.y2) / 2);
      ground.receiveShadow = true;
      scene.add(ground);

      // Grass standing up off the lawns, tinted from the map under it.
      const pixels = nearCanvas.getContext('2d')?.getImageData(0, 0, nearCanvas.width, nearCanvas.height);
      if (pixels) {
        const res = w / nearCanvas.width;
        const sample = (x: number, y: number): [number, number, number] | null => {
          const i = Math.floor((x - GROUND_EXTENT.x1) / res);
          const j = Math.floor((GROUND_EXTENT.y2 - y) / res);
          if (i < 0 || j < 0 || i >= pixels.width || j >= pixels.height) return null;
          const k = (j * pixels.width + i) * 4;
          return [pixels.data[k] ?? 0, pixels.data[k + 1] ?? 0, pixels.data[k + 2] ?? 0];
        };
        const grass = buildGrass(grassScatter(sample, light ? 2 : 1));
        disposables.push(grass);
        scene.add(grass.group);
      }
    }

    // ── The wall, its posts and the gate ─────────────────────────────────────
    {
      const brickTex = brick(501);
      track(brickTex.map);
      if (brickTex.normalMap) track(brickTex.normalMap);
      const brickMat = track(new MeshStandardMaterial({ map: brickTex.map, roughness: 0.95 }));
      if (brickTex.normalMap) brickMat.normalMap = brickTex.normalMap;
      // Rendered posts, greyed by the weather: they line the horizon from outside.
      const concreteMat = track(new MeshStandardMaterial({ color: '#9a958a', roughness: 0.95 }));
      // Walk the wall as one path, opening at the gate.
      const gi = RS_WALL.findIndex((p) => p[0] === RS_GATE[0] && p[1] === RS_GATE[1]);
      const GAP = 7;
      const path: Point[] = [];
      const n = RS_WALL.length;
      for (let k = 0; k <= n; k++) path.push(corner(RS_WALL, gi + k));
      // Shorten both ends of the path by half the gate's width.
      const trim = (from: Point, toward: Point): Point => {
        const d = Math.hypot(toward[0] - from[0], toward[1] - from[1]);
        return [from[0] + ((toward[0] - from[0]) / d) * (GAP / 2), from[1] + ((toward[1] - from[1]) / d) * (GAP / 2)];
      };
      const p1 = path[1];
      const pn = path[path.length - 2];
      if (p1 && pn) {
        path[0] = trim(RS_GATE, p1);
        path[path.length - 1] = trim(RS_GATE, pn);
      }
      const wall = new Mesh(track(wallRibbon(path, RS_WALL_HEIGHT, 0.25, 0.6)), brickMat);
      wall.castShadow = wall.receiveShadow = true;
      scene.add(wall);
      // Concrete posts every 3.2 m, as in the handbook photograph.
      const posts: Matrix4[] = [];
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (!a || !b) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let s = 0; s <= len; s += 3.2) {
          const x = a[0] + ((b[0] - a[0]) * s) / len;
          const y = a[1] + ((b[1] - a[1]) * s) / len;
          posts.push(new Matrix4().compose(new Vector3(x, (RS_WALL_HEIGHT + 0.25) / 2, -y), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ang), new Vector3(0.38, RS_WALL_HEIGHT + 0.25, 0.38)));
        }
      }
      const unit = track(new BoxGeometry(1, 1, 1));
      const postMesh = new InstancedMesh(unit, concreteMat, posts.length);
      posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
      postMesh.castShadow = postMesh.receiveShadow = true;
      scene.add(postMesh);
      // Gate pillars and two steel leaves, swung open.
      const steel = track(new MeshStandardMaterial({ color: '#2c3236', roughness: 0.45, metalness: 0.7 }));
      for (const end of [path[0], path[path.length - 1]]) {
        if (!end) continue;
        const pillar = new Mesh(unit, concreteMat);
        pillar.scale.set(1, 3.8, 1);
        pillar.position.set(end[0], 1.9, -end[1]);
        pillar.castShadow = pillar.receiveShadow = true;
        scene.add(pillar);
        const leaf = new Mesh(unit, steel);
        leaf.scale.set(0.08, 2.2, 3.3);
        // Swung inward, toward the campus (west).
        leaf.position.set(end[0] - 1.7, 1.2, -end[1]);
        leaf.rotation.y = Math.PI / 2;
        leaf.castShadow = true;
        scene.add(leaf);
      }
    }

    // ── Buildings ───────────────────────────────────────────────────────────
    const buildings = buildBuildings(RS_BUILDINGS, { envMap: envTex });
    disposables.push(buildings);
    const entries: Array<BuiltBuilding & { label: Sprite }> = [];
    const pickables: Object3D[] = [];
    for (const b of buildings.built) {
      const { texture, aspect } = makeLabel(b.building.label);
      track(texture);
      // A constant size on screen, whatever the zoom.
      const label = new Sprite(track(new SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false, fog: false })));
      const [lx, ly] = polygonCentre(b.building.footprint);
      label.scale.set(0.042 * aspect, 0.042, 1);
      label.position.set(lx, b.top + 3, -ly);
      label.renderOrder = 10;
      label.visible = b.building.name !== null;
      b.group.add(label);
      scene.add(b.group);
      entries.push({ ...b, label });
      pickables.push(...b.pickables);
    }

    // ── Grounds: goals, hoops, stumps ───────────────────────────────────────
    {
      const white = track(new MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.5 }));
      const dark = track(new MeshStandardMaterial({ color: '#2b2f33', roughness: 0.5, metalness: 0.6 }));
      const board = track(new MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.4 }));
      const orange = track(new MeshStandardMaterial({ color: '#d0571d', roughness: 0.5, metalness: 0.4 }));
      const post = track(new CylinderGeometry(0.06, 0.06, 1, 8));
      const unit = track(new BoxGeometry(1, 1, 1));
      const rim = track(new TorusGeometry(0.23, 0.02, 6, 20));
      const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, s: [number, number, number], ry = 0, rx = 0): void => {
        const m = new Mesh(geo, mat);
        m.position.set(x, y, z);
        m.scale.set(...s);
        m.rotation.set(rx, ry, 0);
        m.castShadow = true;
        scene.add(m);
      };
      for (const g of RS_GROUNDS) {
        if (g.kind === 'garden' || g.outline.length !== 4) continue;
        const q = [0, 1, 2, 3].map((i) => corner(g.outline, i));
        const [a, b, c, d] = q as [Point, Point, Point, Point];
        const long = Math.hypot(b[0] - a[0], b[1] - a[1]) >= Math.hypot(c[0] - b[0], c[1] - b[1]);
        // The two short ends: their midpoints and directions.
        const ends: Array<[Point, Point]> = long ? [[a, d], [b, c]] : [[a, b], [d, c]];
        for (const [p, r] of ends) {
          const mx = (p[0] + r[0]) / 2;
          const my = (p[1] + r[1]) / 2;
          const ang = Math.atan2(r[1] - p[1], r[0] - p[0]);
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          // Pull 1.2 m in from the end line, toward the middle of the ground.
          const [cx, cy] = polygonCentre(g.outline);
          const inx = cx - mx;
          const iny = cy - my;
          const il = Math.hypot(inx, iny);
          const ox = mx + (inx / il) * 1.2;
          const oy = my + (iny / il) * 1.2;
          if (g.kind === 'pitch') {
            const half = g.id === 'duronto' ? 2.5 : 1.6; // goals scaled to the ground
            const h = g.id === 'duronto' ? 2.2 : 2;
            for (const s of [-1, 1]) add(post, white, ox + ux * half * s, h / 2, -(oy + uy * half * s), [1, h, 1]);
            add(unit, white, ox, h, -oy, [half * 2 + 0.12, 0.12, 0.12], ang);
          } else {
            // A basketball hoop: pole, backboard, ring.
            const bx = ox - (inx / il) * 0.4;
            const by = oy - (iny / il) * 0.4;
            add(post, dark, bx, 1.7, -by, [1.6, 3.4, 1.6]);
            add(unit, board, ox, 3.35, -oy, [1.8, 1.05, 0.05], ang);
            add(rim, orange, ox + (inx / il) * 0.45, 3.05, -(oy + (iny / il) * 0.45), [1, 1, 1], 0, Math.PI / 2);
          }
        }
      }
      // Cricket stumps at both ends of Duronto's strip.
      const s = RS_CRICKET_STRIP;
      const a = (s.angle * Math.PI) / 180;
      for (const dir of [-1, 1]) {
        const ex = s.cx + Math.cos(a) * (s.length / 2 - 0.5) * dir;
        const ey = s.cy + Math.sin(a) * (s.length / 2 - 0.5) * dir;
        for (const k of [-1, 0, 1]) {
          add(post, white, ex - Math.sin(a) * 0.11 * k, 0.36, -(ey + Math.cos(a) * 0.11 * k), [0.3, 0.72, 0.3]);
        }
      }
    }

    // ── Landmarks ───────────────────────────────────────────────────────────
    {
      const plasterTex = plaster([228, 226, 220], 601, 1.5);
      track(plasterTex.map);
      if (plasterTex.normalMap) track(plasterTex.normalMap);
      const towerMat = track(new MeshStandardMaterial({ map: plasterTex.map, roughness: 0.9 }));
      const steelRing = track(new MeshStandardMaterial({ color: '#c9ccce', roughness: 0.22, metalness: 0.95 }));
      const plinthMat = track(new MeshStandardMaterial({ color: '#1f2224', roughness: 0.6 }));
      const unit = track(new BoxGeometry(1, 1, 1));
      for (const l of RS_LANDMARKS) {
        const [x, y] = l.at;
        if (l.kind === 'water-tower') {
          for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]] as const) {
            const leg = new Mesh(unit, towerMat);
            leg.scale.set(0.45, 13, 0.45);
            leg.position.set(x + dx, 6.5, -y + dz);
            leg.castShadow = true;
            scene.add(leg);
          }
          for (const h of [4.5, 9]) {
            const brace = new Mesh(unit, towerMat);
            brace.scale.set(3.1, 0.3, 3.1);
            brace.position.set(x, h, -y);
            brace.castShadow = true;
            scene.add(brace);
          }
          const tank = new Mesh(unit, towerMat);
          tank.scale.set(5.6, 3.4, 5.6);
          tank.position.set(x, 14.7, -y);
          tank.castShadow = tank.receiveShadow = true;
          scene.add(tank);
        } else {
          // The steel ring sculpture of the BRACU photograph, on a dark plinth.
          const plinth = new Mesh(unit, plinthMat);
          plinth.scale.set(1.3, 1.1, 1.3);
          plinth.position.set(x, 0.55, -y);
          plinth.castShadow = true;
          scene.add(plinth);
          const ring = new Mesh(track(new TorusGeometry(1.05, 0.22, 16, 48)), steelRing);
          ring.position.set(x, 2.35, -y);
          ring.rotation.y = rng(Math.round(x * 10))() * Math.PI;
          ring.castShadow = true;
          scene.add(ring);
        }
      }
    }

    // ── Trees ───────────────────────────────────────────────────────────────
    const trees = buildTrees(small ? 2 : 1);
    disposables.push(trees);
    scene.add(trees.group);

    // ── The neighbourhood, for context ──────────────────────────────────────
    {
      const neighbours = buildNeighbours(RS_NEIGHBOURS);
      disposables.push(neighbours);
      scene.add(neighbours.group);
    }

    // ── Ponds ───────────────────────────────────────────────────────────────
    const drawing = renderer.getDrawingBufferSize(new Vector2());
    const ponds = buildPonds(
      RS_WATER.map((w) => w.outline),
      { mirror: !light, env: envTex, width: drawing.x, height: drawing.y },
    );
    if (ponds) {
      disposables.push(ponds);
      scene.add(ponds.mesh);
    }

    // ── Camera ──────────────────────────────────────────────────────────────
    const camera = new PerspectiveCamera(40, 1, 0.5, 8000);
    // Multisampling everywhere; ambient occlusion where the screen can afford it.
    const site = rsSiteBounds();
    const post = createPost(renderer, scene, camera, {
      ao: !light,
      clip: { min: new Vector3(site.x1 - 400, -2, -(site.y2 + 400)), max: new Vector3(site.x2 + 400, 80, -(site.y1 - 400)) },
    });
    disposables.push(post);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 4;
    controls.maxDistance = 1100;
    controls.screenSpacePanning = false;

    // What the camera was last framed on, and whether the reader has moved it
    // since: a resize re-frames an untouched view so it still fits.
    type View = { kind: 'frame'; id: string | null } | { kind: 'eye' };
    let view: View = { kind: 'frame', id: null };
    let movedByReader = false;
    controls.addEventListener('start', () => {
      movedByReader = true;
    });

    function frame(id: string | null): void {
      view = { kind: 'frame', id };
      movedByReader = false;
      // The views below are set for a landscape canvas (aspect 1.6 or wider).
      // A narrower one needs the camera further back to keep the same width.
      const widen = Math.max(1, 1.6 / camera.aspect);
      const entry = id ? entries.find((e) => e.building.id === id) : null;
      if (entry) {
        const [cx, cy] = polygonCentre(entry.building.footprint);
        const xs = entry.building.footprint.map((p) => p[0]);
        const ys = entry.building.footprint.map((p) => p[1]);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), entry.top);
        const d = Math.max(45, span * 1.9) * widen;
        controls.target.set(cx, entry.top * 0.4, -cy);
        camera.position.set(cx + d * 0.55, entry.top * 0.4 + d * 0.62, -cy + d * 0.75);
      } else {
        const b = rsSiteBounds();
        const cx = (b.x1 + b.x2) / 2;
        const cy = (b.y1 + b.y2) / 2;
        controls.target.set(cx + 10, 0, -cy);
        camera.position.set(cx + 10 + 160 * widen, 215 * widen, -cy + 265 * widen);
      }
      controls.update();
      requestRender();
    }

    function eyeLevel(): void {
      view = { kind: 'eye' };
      movedByReader = false;
      // On the campus drive that leaves the gate, a few steps in, clear of any
      // tree trunk or low crown, looking down the drive.
      const [gx, gy] = RS_GATE;
      let drive: readonly Point[] | null = null;
      let best = Infinity;
      for (const r of RS_ROADS) {
        if (!r.inside || r.kind === 'footway') continue;
        for (const end of [r.path[0], r.path[r.path.length - 1]]) {
          if (!end) continue;
          const d = Math.hypot(end[0] - gx, end[1] - gy);
          if (d < best) {
            best = d;
            drive = end === r.path[0] ? r.path : [...r.path].reverse();
          }
        }
      }
      const a = drive?.[0] ?? RS_GATE;
      const b = drive?.[1] ?? [gx - 40, gy];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      let s = 6;
      const clear = (x: number, y: number): boolean => RS_TREES.every((t) => Math.hypot(t[0] - x, t[1] - y) > 5);
      while (s < Math.min(len, 40) && !clear(a[0] + ux * s, a[1] + uy * s)) s += 2;
      const ex = a[0] + ux * s;
      const ey = a[1] + uy * s;
      camera.position.set(ex, 1.7, -ey);
      controls.target.set(ex + ux * 30, 4, -(ey + uy * 30));
      controls.update();
      requestRender();
    }

    // ── Rendering on demand ─────────────────────────────────────────────────
    let frameRequested = false;
    let disposed = false;
    function render(): void {
      frameRequested = false;
      if (disposed) return;
      // A narrow screen stands the camera further back to fit the campus in;
      // thin the haze with it, so the campus reads the same on a phone.
      const back = camera.position.distanceTo(controls.target);
      fog.density = FOG_DENSITY * Math.min(1, Math.max(0.4, 400 / back));
      post.render();
    }
    function requestRender(): void {
      if (frameRequested || disposed) return;
      frameRequested = true;
      requestAnimationFrame(render);
    }
    controls.addEventListener('change', requestRender);

    let ready = false;
    function resize(): void {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 400;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      ponds?.setSize(buffer.x, buffer.y);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (ready && !movedByReader) {
        if (view.kind === 'eye') eyeLevel();
        else frame(view.id);
      }
      requestRender();
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    resize();
    frame(null);
    ready = true;

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
          for (const m of e.tintable) m.emissive.copy(on ? SELECT_TINT : NO_TINT);
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
      eyeLevel,
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

  try {
    return build();
  } catch (err) {
    console.warn('The campus scene could not be built', err);
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // Already freed, or never allocated.
      }
    }
    renderer.dispose();
    renderer.domElement.remove();
    return null;
  }
}
