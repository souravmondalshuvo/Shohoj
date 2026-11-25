/**
 * The city round a Dhaka campus, for its 3D map: sky, haze and daylight, and
 * the neighbourhood from OpenStreetMap (src/core/campusSurroundings.ts) — the
 * ground with its roads, plots, water and green; the mapped buildings raised
 * on their footprints; street trees; and an illustrative city past the mapped
 * area, out to the horizon.
 *
 * The campus scenes (campusScene.ts for BRACU, nsuCampusScene.ts for NSU)
 * keep their own buildings and their own neutral lights, so each model shows
 * its colours as authored; this adds what stands round them. It borrows the
 * Residential Campus map's pieces: the ground material with its grit and
 * blades (rsGround), the weathered, washed buildings (rsNeighbours), the
 * lobed trees (rsLandscape).
 *
 * Nothing here moves: the scenes draw a frame only when something changes,
 * and so may this.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Fog,
  Group,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  farCity,
  outlineArea,
  roadTraffic,
  seeded,
  streetPoles,
  streetTrees,
  urbanStoreys,
  type Pole,
  type VehicleKind,
  type SiteRect,
  type SPoint,
  type Surroundings,
} from '../../core/campusSurroundings.ts';
import { groundMaterial } from './rsGround.ts';
import { treeMeshes, type CountryTree } from './rsLandscape.ts';
import { buildNeighbours, urbanPlan } from './rsNeighbours.ts';
import { fbm, groundDetail } from './rsTextures.ts';

/** Dry-season haze over Dhaka: a pale blue-grey. */
const HAZE = '#bcc6cc';

export interface Daylight {
  dispose(): void;
}

/**
 * A daytime sky behind the campus, the light it gives (as a dim environment,
 * with warm sunlit ground below the horizon) and haze that starts past the
 * campus. The sun's own light stays the scene's: `sunDirection` only places
 * the sun's glow in the sky. Linear haze, not exponential, so the campus and
 * the buildings next to it stay clear and only the distance greys.
 */
export function addDaylight(
  scene: Scene,
  renderer: WebGLRenderer,
  options: { sunDirection: Vector3; hazeFrom: number; hazeTo: number; skyScale: number; environment?: number },
): Daylight {
  const sky = new Sky();
  sky.scale.setScalar(options.skyScale);
  const u = sky.material.uniforms;
  // Hazier than the country's: a city's dust and smoke.
  if (u['turbidity']) u['turbidity'].value = 7;
  if (u['rayleigh']) u['rayleigh'].value = 1.4;
  if (u['mieCoefficient']) u['mieCoefficient'].value = 0.006;
  if (u['mieDirectionalG']) u['mieDirectionalG'].value = 0.8;
  if (u['sunPosition']) u['sunPosition'].value.copy(options.sunDirection);
  scene.add(sky);

  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(6000);
  for (const k of Object.keys(u)) {
    const from = u[k];
    const to = envSky.material.uniforms[k];
    if (from && to) to.value = from.value;
  }
  const disc = envSky.material.uniforms['showSunDisc'];
  if (disc) disc.value = 0;
  envScene.add(envSky);
  const bounceGeo = new CircleGeometry(5000, 24);
  const bounceMat = new MeshBasicMaterial({ color: new Color(0.45, 0.41, 0.36) });
  const bounce = new Mesh(bounceGeo, bounceMat);
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -5;
  envScene.add(bounce);
  const env = pmrem.fromScene(envScene, 0, 1, 20000);
  envSky.geometry.dispose();
  envSky.material.dispose();
  bounceGeo.dispose();
  bounceMat.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = options.environment ?? 0.08;
  scene.fog = new Fog(HAZE, options.hazeFrom, options.hazeTo);

  return {
    dispose() {
      scene.remove(sky);
      sky.geometry.dispose();
      sky.material.dispose();
      env.texture.dispose();
      if (scene.environment === env.texture) scene.environment = null;
      scene.fog = null;
    },
  };
}

export interface CitySetup {
  data: Surroundings;
  /** The campus's own site (campus metres): no mapped building or street tree stands in it. */
  site: SiteRect;
  /**
   * Where the city's ground is cut away for the campus's own (campus metres;
   * defaults to `site`). The campus can take its ground away there, to open
   * its basements, without the city's going too. BRACU's plot is far larger
   * than its model's site: the plot is painted as campus ground and only the
   * model's site is cut.
   */
  cut?: SiteRect;
  /** Half the side of the painted, mapped ground, metres. */
  extent: number;
  /** How far from the campus origin OSM's buildings were taken, metres. */
  mappedRadius: number;
  /** The illustrative city runs out to this radius, metres. */
  farOuter: number;
  /** Ground level, scene y. */
  groundY: number;
  /** A small or slow device: half the trees and a nearer horizon. */
  light: boolean;
}

export interface City {
  group: Group;
  /** What lies on the ground. It never covers the campus's own site. */
  ground: Object3D[];
  /** How many mapped buildings and trees stand, and how many far blocks. */
  counts: { buildings: number; trees: number; far: number; vehicles: number; poles: number };
  dispose(): void;
}


const WASH_FAR = ['#d6d0c2', '#ded0b0', '#cfc7b8', '#bfc4c2', '#d8c4ae', '#c9c4b8', '#b7b2a6', '#e0dbd0'];

/** Paint the mapped ground: dust and paving, plots, green, water, roads, and contact shade under buildings. */
function paintNearGround(data: Surroundings, extent: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const res = (2 * extent) / size;
  const px = (p: SPoint): [number, number] => [(p[0] + extent) / res, (extent - p[1]) / res];
  const m = (metres: number): number => metres / res;
  const trace = (outline: readonly SPoint[]): void => {
    g.beginPath();
    outline.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
  };
  const path = (pts: readonly SPoint[]): void => {
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
  };

  // Dust, packed earth and broken paving, in blotches a plot or two across:
  // noise worked out at 512 px and scaled up, a sixteenth of the work.
  const NOISE = 512;
  const noise = document.createElement('canvas');
  noise.width = noise.height = NOISE;
  const ng = noise.getContext('2d');
  if (ng) {
    const img = ng.createImageData(NOISE, NOISE);
    for (let j = 0; j < NOISE; j++) {
      for (let i = 0; i < NOISE; i++) {
        const n = fbm(i / NOISE, j / NOISE, 24, 4, 611);
        const k = (j * NOISE + i) * 4;
        const v = 0.86 + 0.28 * n;
        img.data[k] = 146 * v;
        img.data[k + 1] = 138 * v;
        img.data[k + 2] = 122 * v;
        img.data[k + 3] = 255;
      }
    }
    ng.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(noise, 0, 0, size, size);
  }

  // Every building stands in a paved compound.
  g.lineJoin = 'round';
  g.fillStyle = g.strokeStyle = '#a7a194';
  g.lineWidth = m(7);
  for (const b of data.buildings) {
    trace(b.outline);
    g.fill();
    g.stroke();
  }
  // The campus's plot, where it is mapped: its own paved grounds.
  if (data.plot) {
    trace(data.plot);
    g.fillStyle = '#aca698';
    g.fill();
  }
  for (const gr of data.green) {
    trace(gr.outline);
    g.fillStyle = gr.kind === 'pitch' ? '#6b8a42' : '#5c7838';
    g.fill();
  }
  g.fillStyle = '#3f5658';
  for (const w of data.water) {
    trace(w);
    g.fill();
  }
  // Roads: a pale kerb and footpath each side, then the carriageway.
  g.lineCap = 'round';
  const roads = [...data.roads].sort((a, b) => a.width - b.width);
  for (const r of roads) {
    if (r.kind.startsWith('water-')) continue;
    path(r.path);
    g.strokeStyle = r.width >= 6 ? '#b3ada0' : '#9d978a';
    g.lineWidth = m(r.width + (r.width >= 6 ? 3.5 : 1));
    g.stroke();
  }
  for (const r of roads) {
    path(r.path);
    g.strokeStyle = r.kind.startsWith('water-') ? '#3f5658' : r.width >= 6 ? '#47484b' : '#6e6a63';
    g.lineWidth = m(r.width);
    g.stroke();
  }
  // Lane lines on the big roads.
  g.setLineDash([m(3), m(6)]);
  g.strokeStyle = 'rgba(225,221,208,0.75)';
  g.lineWidth = Math.max(1, m(0.18));
  for (const r of roads) {
    if (r.width < 10 || r.kind.startsWith('water-')) continue;
    path(r.path);
    g.stroke();
  }
  g.setLineDash([]);
  // Contact shade: a soft dark skirt round every building's foot. Painted
  // whole on a canvas of its own and blurred once: a blur filter on each of
  // a thousand fills is enough GPU work for the browser to reset the GPU.
  const shade = document.createElement('canvas');
  shade.width = shade.height = size;
  const sg = shade.getContext('2d');
  if (sg) {
    sg.fillStyle = 'rgb(40,34,26)';
    for (const b of data.buildings) {
      sg.beginPath();
      b.outline.forEach((p, i) => {
        const [x, y] = px(p);
        if (i === 0) sg.moveTo(x, y);
        else sg.lineTo(x, y);
      });
      sg.closePath();
      sg.fill();
    }
    g.save();
    g.filter = `blur(${Math.max(1, m(1.6))}px)`;
    g.globalAlpha = 0.55;
    g.drawImage(shade, 0, 0);
    g.restore();
  }
  return canvas;
}

/** Paint the far ground: dark street grey, with each illustrative plot a paler compound. */
function paintFarGround(blocks: ReturnType<typeof farCity>, span: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const res = (2 * span) / size;
  g.fillStyle = '#5f5d58';
  g.fillRect(0, 0, size, size);
  for (const b of blocks) {
    g.save();
    g.translate((b.x + span) / res, (span - b.y) / res);
    g.rotate(-b.turn);
    g.fillStyle = b.tone < 0.5 ? '#8a8476' : '#958f81';
    g.fillRect((-b.length / 2 - 2) / res, (-b.width / 2 - 2) / res, (b.length + 4) / res, (b.width + 4) / res);
    g.restore();
  }
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

/**
 * Far blocks: boxes whose windows are drawn by the shader, from where on the
 * face a fragment falls (in metres, from the box's own scale) — storeys of
 * 3.1 m, bays of 3 m, a darker ground floor of shutters — so thousands of
 * buildings are one instanced draw per tile.
 */
function farMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ roughness: 0.92 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarLocal;\nvarying vec3 vFarNormal;\nvarying vec3 vFarSize;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vFarLocal = position;
  vFarNormal = normal;
  vFarSize = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarLocal;\nvarying vec3 vFarNormal;\nvarying vec3 vFarSize;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if ( abs( vFarNormal.y ) > 0.5 ) {
    // A flat roof: grey concrete, darker than the walls.
    diffuseColor.rgb = vec3( 0.36, 0.35, 0.33 );
  } else {
    float along = abs( vFarNormal.x ) > 0.5 ? ( vFarLocal.z + 0.5 ) * vFarSize.z : ( vFarLocal.x + 0.5 ) * vFarSize.x;
    float up = ( vFarLocal.y + 0.5 ) * vFarSize.y;
    float bay = fract( along / 3.0 );
    float storey = fract( up / 3.1 );
    float pane = step( 0.22, bay ) * step( bay, 0.78 ) * step( 0.3, storey ) * step( storey, 0.78 );
    float shop = 1.0 - step( 3.1, up );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.09, 0.1, 0.11 ), pane * ( 1.0 - shop ) * 0.85 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.19, 0.18 ), shop * 0.7 );
    // Grime gathers toward the foot of the wall.
    diffuseColor.rgb *= 0.8 + 0.2 * smoothstep( 0.0, 12.0, up );
  }`,
      );
  };
  mat.customProgramCacheKey = () => 'city-far-block';
  return mat;
}

/** Boxes merged into one geometry, each with a vertex shade (1 = the paint, less = darker). */
function boxes(parts: Array<{ size: [number, number, number]; at: [number, number, number]; shade: number }>): BufferGeometry {
  const geos = parts.map(({ size, at, shade }) => {
    const g = new BoxGeometry(...size).translate(...at);
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new Float32BufferAttribute(new Array(n * 3).fill(shade), 3));
    return g;
  });
  const merged = mergeGeometries(geos) ?? new BoxGeometry(1, 1, 1);
  for (const g of geos) g.dispose();
  return merged;
}

/**
 * A vehicle at a distance, its length along x, standing on y = 0: blocks of
 * body and darker glass, wheels as dark skirts. Paint comes per instance.
 */
function vehicleGeometry(kind: VehicleKind): BufferGeometry {
  switch (kind) {
    case 'car':
      return boxes([
        { size: [4.3, 0.75, 1.75], at: [0, 0.6, 0], shade: 1 },
        { size: [2.3, 0.6, 1.6], at: [-0.25, 1.27, 0], shade: 0.28 },
        { size: [3.6, 0.32, 1.8], at: [0, 0.18, 0], shade: 0.12 },
      ]);
    case 'cng':
      return boxes([
        { size: [2.6, 1.05, 1.3], at: [0, 0.95, 0], shade: 1 },
        { size: [2.4, 0.1, 1.38], at: [-0.05, 1.53, 0], shade: 0.2 },
        { size: [2.2, 0.35, 1.3], at: [0, 0.22, 0], shade: 0.12 },
      ]);
    case 'rickshaw':
      return boxes([
        { size: [1.1, 0.5, 1.05], at: [-0.3, 0.75, 0], shade: 0.5 },
        { size: [1.0, 0.75, 1.15], at: [-0.35, 1.45, 0], shade: 1 },
        { size: [1.0, 0.25, 0.25], at: [0.55, 0.55, 0], shade: 0.25 },
        { size: [1.9, 0.5, 1.1], at: [0, 0.3, 0], shade: 0.12 },
      ]);
    case 'bus':
      return boxes([
        { size: [10.5, 2.3, 2.5], at: [0, 1.65, 0], shade: 1 },
        { size: [10.55, 0.85, 2.53], at: [0, 2.15, 0], shade: 0.22 },
        { size: [9.4, 0.55, 2.52], at: [0, 0.32, 0], shade: 0.12 },
      ]);
  }
}

/** Dhaka's paint: mostly white, silver and black cars; green CNGs; bright rickshaw hoods; liveried buses. */
function paint(kind: VehicleKind, tone: number): Color {
  const pick = (list: readonly string[]): Color => new Color(list[Math.floor(tone * list.length) % list.length] ?? list[0] ?? '#cccccc');
  switch (kind) {
    case 'car':
      return pick(['#e9e9e6', '#e9e9e6', '#e9e9e6', '#b9bcbf', '#b9bcbf', '#1c1d20', '#1c1d20', '#6d7176', '#8a1f22', '#23406b']);
    case 'cng':
      return pick(['#2f7a3c', '#2f7a3c', '#2f7a3c', '#3c8a46']);
    case 'rickshaw':
      return pick(['#2a4f9a', '#b8312f', '#d8a420', '#2f8f5b', '#6a2d84']);
    case 'bus':
      return pick(['#b42a28', '#2b6c3a', '#2b4f8c', '#d4c9a8']);
  }
}

/** A concrete pole 9 m tall with a crossarm near its top, standing on y = 0. */
function poleGeometry(): BufferGeometry {
  return boxes([
    { size: [0.24, 9, 0.24], at: [0, 4.5, 0], shade: 1 },
    { size: [0.12, 0.12, 1.5], at: [0, 8.35, 0], shade: 0.8 },
  ]);
}

/**
 * Cables between neighbouring poles: three from the crossarm, sagging in the
 * middle, and on most spans a few more slack ones looped between them — the
 * tangle every Dhaka street has overhead. Line segments, one draw.
 */
function cableGeometry(poles: readonly Pole[], spans: ReadonlyArray<readonly [number, number]>, groundY: number, r: () => number): BufferGeometry {
  const pos: number[] = [];
  const STEPS = 8;
  for (const [ia, ib] of spans) {
    const a = poles[ia];
    const b = poles[ib];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    // Across the span, along the crossarm.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const cables: Array<{ off: number; h: number; sag: number }> = [
      { off: -0.65, h: 8.35, sag: 0.35 },
      { off: 0, h: 8.35, sag: 0.4 },
      { off: 0.65, h: 8.35, sag: 0.35 },
    ];
    const extra = Math.floor(r() * 4);
    for (let k = 0; k < extra; k++) cables.push({ off: (r() - 0.5) * 0.8, h: 7.2 + r() * 1.0, sag: 0.6 + r() * 1.4 });
    for (const c of cables) {
      const sag = c.sag * (len / 30);
      let px = a.x + nx * c.off;
      let py = a.y + ny * c.off;
      let ph = c.h;
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const x = a.x + (b.x - a.x) * t + nx * c.off;
        const y = a.y + (b.y - a.y) * t + ny * c.off;
        const h = c.h - sag * 4 * t * (1 - t);
        pos.push(px, groundY + ph, -py, x, groundY + h, -y);
        px = x;
        py = y;
        ph = h;
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return geo;
}

/** Instances batched per tile of `tile` metres, so each batch can be culled. */
function tiled(geo: BufferGeometry, mat: Material, list: Array<{ m: Matrix4; c: Color }>, tile: number): InstancedMesh[] {
  const tiles = new Map<string, Array<{ m: Matrix4; c: Color }>>();
  for (const item of list) {
    const key = `${Math.floor(item.m.elements[12] / tile)},${Math.floor(item.m.elements[14] / tile)}`;
    const t = tiles.get(key) ?? [];
    t.push(item);
    tiles.set(key, t);
  }
  return [...tiles.values()].map((t) => {
    const mesh = new InstancedMesh(geo, mat, t.length);
    t.forEach((x, i) => {
      mesh.setMatrixAt(i, x.m);
      mesh.setColorAt(i, x.c);
    });
    mesh.computeBoundingSphere();
    return mesh;
  });
}

/** One frame's pause, so a long build does not hold the page still. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Build the city round a campus, a step a frame so the page stays responsive
 * on a slow phone. Everything returned is freed by dispose().
 */
export async function buildCity(setup: CitySetup): Promise<City> {
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();
  const ground: Object3D[] = [];
  const { data, site, extent, groundY } = setup;
  const farOuter = setup.light ? setup.farOuter * 0.7 : setup.farOuter;

  // ── Ground: the mapped square, the far city's ground under and round it ──
  const detail = keep(groundDetail(613));
  const nearCanvas = paintNearGround(data, extent, setup.light ? 1536 : 2048);
  const nearMap = keep(canvasTexture(nearCanvas));
  // The campus's site is cut out (groundMaterial insets a hole by 3 m, so
  // grow it by as much): the campus lays its own ground there, and can take
  // it away to open its basements without the city's going too.
  const c = setup.cut ?? site;
  const siteHole = { x1: c.x1 - 3, x2: c.x2 + 3, y1: c.y1 - 3, y2: c.y2 + 3 };
  const near = new Mesh(keep(new PlaneGeometry(2 * extent, 2 * extent)), keep(groundMaterial(nearMap, detail, 2 * extent, siteHole)));
  near.rotation.x = -Math.PI / 2;
  near.position.y = groundY;
  near.receiveShadow = true;
  group.add(near);
  ground.push(near);

  await nextFrame();
  // Past the mapped circle the city is illustrative, inside the painted square too.
  const blocks = farCity(setup.mappedRadius + 8, farOuter, setup.light ? 2 : 1);
  const farSpan = farOuter * 1.25;
  const farMap = keep(canvasTexture(paintFarGround(blocks, farSpan, 1024)));
  const hole = { x1: -extent, x2: extent, y1: -extent, y2: extent };
  const far = new Mesh(keep(new PlaneGeometry(2 * farSpan, 2 * farSpan)), keep(groundMaterial(farMap, detail, 2 * farSpan, hole)));
  far.rotation.x = -Math.PI / 2;
  far.position.y = groundY - 0.05;
  group.add(far);
  ground.push(far);

  await nextFrame();
  // ── Water: dark and glassy, so it carries the sky ─────────────────────────
  const waterMat = keep(new MeshStandardMaterial({ color: '#2f4446', roughness: 0.12, metalness: 0 }));
  for (const w of data.water) {
    const shape = new Shape(w.map((p) => new Vector2(p[0], p[1])));
    const geo = keep(new ShapeGeometry(shape));
    const mesh = new Mesh(geo, waterMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = groundY + 0.04;
    mesh.receiveShadow = true;
    group.add(mesh);
    ground.push(mesh);
  }

  await nextFrame();
  // ── The mapped buildings ──────────────────────────────────────────────────
  const footprints = data.buildings.map((b) => b.outline);
  const plans = data.buildings.map((b, i) => {
    const area = Math.abs(outlineArea(b.outline));
    return urbanPlan(area, urbanStoreys(area, b.levels, i), i);
  });
  const neighbours = buildNeighbours(footprints, plans, { detailRadius: setup.light ? 0 : 300 });
  disposables.push(neighbours);
  neighbours.group.position.y = groundY;
  group.add(neighbours.group);

  await nextFrame();
  // ── Street trees ──────────────────────────────────────────────────────────
  const r = seeded(4400);
  const trees: CountryTree[] = streetTrees(data, site, setup.light ? 2 : 1).map((p) => {
    const palm = r() < 0.08;
    const w = palm ? 3.2 + r() * 1.2 : 2 + r() * 2.2;
    return { x: p[0], y: p[1], palm, w, h: w * (0.75 + r() * 0.2), top: palm ? 8 + r() * 4 : 3.5 + w * 1.1 + r() * 1.5, turn: r() * Math.PI * 2, tone: r() };
  });
  for (const mesh of treeMeshes(trees, keep)) {
    mesh.castShadow = true;
    mesh.position.y = groundY;
    group.add(mesh);
  }

  await nextFrame();
  // ── Traffic: cars, CNGs, rickshaws and buses on the mapped roads ─────────
  await nextFrame();
  const vehicles = roadTraffic(data, site, setup.light ? 2 : 1);
  const vehicleMat = keep(new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }));
  const shapes: Record<VehicleKind, BufferGeometry> = {
    car: keep(vehicleGeometry('car')),
    cng: keep(vehicleGeometry('cng')),
    rickshaw: keep(vehicleGeometry('rickshaw')),
    bus: keep(vehicleGeometry('bus')),
  };
  for (const kind of ['car', 'cng', 'rickshaw', 'bus'] as const) {
    const list = vehicles.filter((v) => v.kind === kind);
    if (list.length === 0) continue;
    const mesh = new InstancedMesh(shapes[kind], vehicleMat, list.length);
    const qv = new Quaternion();
    list.forEach((v, k) => {
      qv.setFromAxisAngle(new Vector3(0, 1, 0), v.turn);
      mesh.setMatrixAt(k, new Matrix4().compose(new Vector3(v.x, groundY, -v.y), qv, new Vector3(1, 1, 1)));
      mesh.setColorAt(k, paint(kind, v.tone));
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // ── Electricity poles, and the cables slung between them ─────────────────
  const { poles, spans } = streetPoles(data, site);
  if (poles.length > 0) {
    const poleGeo = keep(poleGeometry());
    const poleMat = keep(new MeshStandardMaterial({ color: '#8d8a83', roughness: 0.9 }));
    const poleMesh = new InstancedMesh(poleGeo, poleMat, poles.length);
    // Each pole's crossarm squares to the street: turned to its first span.
    const facing = new Map<number, number>();
    for (const [a, b] of spans) {
      const pa = poles[a];
      const pb = poles[b];
      if (!pa || !pb) continue;
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      if (!facing.has(a)) facing.set(a, ang);
      if (!facing.has(b)) facing.set(b, ang);
    }
    const qp = new Quaternion();
    poles.forEach((p, k) => {
      qp.setFromAxisAngle(new Vector3(0, 1, 0), facing.get(k) ?? 0);
      poleMesh.setMatrixAt(k, new Matrix4().compose(new Vector3(p.x, groundY, -p.y), qp, new Vector3(1, 1, 1)));
    });
    poleMesh.castShadow = true;
    poleMesh.computeBoundingSphere();
    group.add(poleMesh);
    const wire = keep(cableGeometry(poles, spans, groundY, seeded(4700)));
    const wires = new LineSegments(wire, keep(new LineBasicMaterial({ color: '#1d1d1f' })));
    group.add(wires);
  }

  // ── The far city: one instanced box per block of flats ───────────────────
  const unit = keep(new BoxGeometry(1, 1, 1));
  const farMat = keep(farMaterial());
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const list = blocks.map((b) => {
    const h = b.storeys * 3.1;
    q.setFromAxisAngle(up, b.turn);
    return {
      m: new Matrix4().compose(new Vector3(b.x, groundY + h / 2, -b.y), q, new Vector3(b.length, h, b.width)),
      c: new Color(WASH_FAR[Math.floor(b.tone * WASH_FAR.length) % WASH_FAR.length] ?? '#d6d0c2'),
    };
  });
  for (const mesh of tiled(unit, farMat, list, 400)) group.add(mesh);

  return {
    group,
    ground,
    counts: { buildings: footprints.length, trees: trees.length, far: blocks.length, vehicles: vehicles.length, poles: poles.length },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
