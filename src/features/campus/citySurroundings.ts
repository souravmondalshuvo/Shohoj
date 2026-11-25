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
  InstancedMesh,
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

import {
  farCity,
  outlineArea,
  seeded,
  streetTrees,
  urbanStoreys,
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
  /** The campus's own site (campus metres): the city leaves it to the campus. */
  site: SiteRect;
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
  counts: { buildings: number; trees: number; far: number };
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
  const siteHole = { x1: site.x1 - 3, x2: site.x2 + 3, y1: site.y1 - 3, y2: site.y2 + 3 };
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
  const neighbours = buildNeighbours(footprints, plans, true);
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
    counts: { buildings: footprints.length, trees: trees.length, far: blocks.length },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
