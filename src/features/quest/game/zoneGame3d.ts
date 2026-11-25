// src/features/quest/game/zoneGame3d.ts
//
// The walkable zone in 3D (#981), what students get on the main site. The 2D
// game (zoneGame.ts) is the fallback: for a browser that cannot draw 3D well,
// for ?quest3d=0, and on the shell (rendererChoice.ts says which).
//
// It is the same game, drawn differently. It takes the same options and gives
// the same ZoneGame back, so the quest screen, panels, progress and Java are
// untouched. Where the hero may walk is still decided only by world/zoneMap.ts,
// and what stands where is read from the same Tiled map (world/sceneKinds.ts).
//
// The place is modelled here from simple shapes: a Bengal river village late
// in the afternoon. Bamboo piles stand in the
// river and each quest lays a span of bamboo deck across them; boats bob at
// the jetty; kash and reeds sway; Karim Majhi waits at the head of the bridge
// in his straw hat. Shadows are real, the sun is low in the west.
//
// The people are rigged, animated models (people3d.ts), fetched when the zone
// opens. Until they arrive, and for good if they cannot be loaded, everyone is
// drawn from shapes as well, so the zone never waits on them.
//
// What the page's Content-Security-Policy allows, this keeps to: no textures
// fetched (the one texture, the stall's awning, is drawn on a canvas), the
// people's files gunzipped by the browser itself, no workers, no eval.
// three.js is first-party code from npm, as on the Campus Map.
//
// For phones: the pixel ratio and the shadow map are smaller on a touch
// screen, and nothing is drawn while a panel covers the zone. With
// prefers-reduced-motion, nothing sways or bobs and the water is still.

import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Clock,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';

import type { ZoneEvent, ZoneGame, ZoneGameOptions, ZoneState } from './zoneGame.ts';
import { describeScene, type Prop, type ZoneScene } from '../world/sceneKinds.ts';
import { Finish, pickQuality, skyLight } from './effects3d.ts';
import { BEYOND, buildGround, type Ground } from './ground3d.ts';
import { loadPeople, type Figure, type Outfit, type People } from './people3d.ts';
import {
  canWalk,
  findRoute,
  gateAt,
  inRect,
  shutGates,
  walkGrid,
  type Cell,
  type Gate,
  type WalkGrid,
} from '../world/zoneMap.ts';

/** Seconds to walk one square. */
const STEP_S = 0.16;
/** Arrow presses kept while the hero is still walking the last one. */
const MAX_QUEUED_PRESSES = 3;
const WATER_Y = -0.22;
/** Towards the sun: low in the west, late in the afternoon. Shadows fall long to the east. */
const SUN = new Vector3(-16, 8, 4).normalize();
const RIVERBED_Y = -0.9;
/** The top of the jetty's planks (0.08 thick). */
const JETTY_TOP = 0.06;

const KEY_STEPS: Readonly<Record<string, Cell>> = {
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
};

/** The same picture every time: variety comes from the square, not chance. */
const hash = (x: number, y: number, salt = 0) => {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const centre = (cell: Cell) => new Vector3(cell.x + 0.5, 0, cell.y + 0.5);

function gapTo(gate: Gate, cell: Cell): number {
  const dx = Math.max(gate.x - cell.x, 0, cell.x - (gate.x + gate.w - 1));
  const dy = Math.max(gate.y - cell.y, 0, cell.y - (gate.y + gate.h - 1));
  return dx + dy;
}

// ── Palette ────────────────────────────────────────────────────────────────
// Late afternoon in Bengal: warm light, deep greens, red earth, straw.

const SKIN = ['#c68e62', '#a8714a', '#8d5b3b'] as const;

interface PersonLook {
  readonly skin: string;
  readonly shirt: string;
  readonly lower: string;
  readonly hair: string;
  readonly hat?: string;
  readonly long?: boolean;
  readonly beard?: string;
}

/** The same people as rigged models (people3d.ts), when those have loaded. */
const OUTFITS: Readonly<Record<string, Outfit>> = {
  hero: {
    build: 'man',
    skin: SKIN[0],
    top: '#2ecc71',
    lower: '#2f3b4c',
    legs: 'trousers',
    hair: '#1c1814',
    hairstyle: 'Hair_SimpleParted',
    clip: 'idle',
  },
  boatman: {
    build: 'man',
    skin: SKIN[2],
    top: '#efe6d2',
    lower: '#3b7f86',
    legs: 'skirt',
    hair: '#dcd6cc',
    hairstyle: 'Hair_SimpleParted',
    beard: true,
    hat: '#d8b264',
    clip: 'idle',
  },
  seller: {
    build: 'man',
    skin: SKIN[1],
    top: '#d9622b',
    lower: '#efe6d2',
    legs: 'skirt',
    hair: '#1c1814',
    hairstyle: 'Hair_SimpleParted',
    clip: 'talk',
  },
  fisher: {
    build: 'man',
    skin: SKIN[2],
    top: '#5f9e48',
    lower: '#3b5f86',
    legs: 'rolled',
    hair: '#1c1814',
    hairstyle: 'Hair_SimpleParted',
    hat: '#2d8a7a',
    stool: '#b98a4e',
    clip: 'sit',
  },
  farmer: {
    build: 'man',
    skin: SKIN[2],
    top: '#f1ece2',
    lower: '#7d5a9e',
    legs: 'rolled',
    hair: '#1c1814',
    hairstyle: 'Hair_SimpleParted',
    hat: '#d8b264',
    clip: 'kneel',
  },
  villager: {
    build: 'woman',
    skin: SKIN[0],
    top: '#e0742e',
    lower: '#b8392b',
    legs: 'skirt',
    pallu: '#b8392b',
    hair: '#1c1814',
    hairstyle: 'Hair_Buns',
    clip: 'idle',
  },
};

const PEOPLE: Readonly<Record<string, PersonLook>> = {
  hero: { skin: SKIN[0], shirt: '#2ecc71', lower: '#2f3b4c', hair: '#1c1814' },
  boatman: {
    skin: SKIN[2],
    shirt: '#efe6d2',
    lower: '#3b7f86',
    hair: '#dcd6cc',
    hat: '#d8b264',
    beard: '#e8e2d8',
  },
  seller: { skin: SKIN[1], shirt: '#d9622b', lower: '#efe6d2', hair: '#1c1814' },
  fisher: { skin: SKIN[2], shirt: '#5f9e48', lower: '#3b5f86', hair: '#1c1814', hat: '#2d8a7a' },
  farmer: { skin: SKIN[2], shirt: '#f1ece2', lower: '#7d5a9e', hair: '#1c1814', hat: '#d8b264' },
  villager: { skin: SKIN[0], shirt: '#e0742e', lower: '#b8392b', hair: '#1c1814', long: true },
};

// ── Shared materials and shapes ───────────────────────────────────────────

class Kit {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  readonly disposables: { dispose(): void }[] = [];

  mat(colour: string, options: { emissive?: string; rough?: number } = {}): MeshStandardMaterial {
    const id = `${colour}|${options.emissive ?? ''}|${options.rough ?? 0.9}`;
    let material = this.materials.get(id);
    if (!material) {
      material = new MeshStandardMaterial({
        color: colour,
        roughness: options.rough ?? 0.9,
        metalness: 0,
        flatShading: true,
        ...(options.emissive ? { emissive: options.emissive, emissiveIntensity: 0.9 } : {}),
      });
      this.materials.set(id, material);
      this.disposables.push(material);
    }
    return material;
  }

  keep<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  mesh(geometry: BufferGeometry, material: Material, shadow = true): Mesh {
    this.keep(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// ── Beyond the map ──────────────────────────────────────────────────────────

/** Land beyond the map's edges, so the world runs on into the haze. */
function buildSurroundings(kit: Kit, scene: ZoneScene, river: { west: number; east: number }) {
  const group = new Group();
  const reach = 40;
  const land = kit.mat('#5a8f38', { rough: 1 });
  // Only past the ground the terrain already draws (ground3d.ts carries it
  // BEYOND squares out): a plane laid over the terrain would hide the road.
  const west = kit.mesh(new PlaneGeometry(reach, scene.height + reach * 2), land, false);
  west.rotation.x = -Math.PI / 2;
  west.position.set(-BEYOND - reach / 2, -0.03, scene.height / 2);
  const east = kit.mesh(new PlaneGeometry(reach, scene.height + reach * 2), land, false);
  east.rotation.x = -Math.PI / 2;
  east.position.set(scene.width + BEYOND + reach / 2, -0.03, scene.height / 2);
  // The land beyond the top and bottom, either side of the river.
  for (const [from, to] of [
    [-BEYOND, river.west],
    [river.east, scene.width + BEYOND],
  ] as const) {
    for (const z of [-BEYOND - reach / 2, scene.height + BEYOND + reach / 2]) {
      const strip = kit.mesh(new PlaneGeometry(to - from, reach), land, false);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set((from + to) / 2, -0.03, z);
      group.add(strip);
    }
  }
  const bed = kit.mesh(
    new PlaneGeometry(river.east - river.west + 2, scene.height + reach * 2),
    kit.mat('#4f7a52'),
    false,
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set((river.west + river.east) / 2, RIVERBED_Y - 0.02, scene.height / 2);
  group.add(west, east, bed);
  return group;
}

// ── The river ───────────────────────────────────────────────────────────────

function buildWater(kit: Kit, scene: ZoneScene, river: { west: number; east: number }) {
  const material = kit.keep(
    new ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDeep: { value: new Color('#2d7f8c') },
          uShallow: { value: new Color('#3f9f98') },
          uFoam: { value: new Color('#f4f1e4') },
          uBanks: { value: new Vector2(river.west + 0.55, river.east - 0.55) },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          world.y += (sin(world.x * 1.4 + uTime * 1.1) + cos(world.z * 1.1 + uTime * 0.9)) * 0.015;
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform vec2 uBanks;
        varying vec3 vWorld;
        void main() {
          float edge = min(vWorld.x - uBanks.x, uBanks.y - vWorld.x);
          float shallow = 1.0 - smoothstep(0.0, 2.8, edge);
          vec3 colour = mix(uDeep, uShallow, 0.15 + shallow * 0.75);
          // Slow bands of light on the current, and low sun glinting off it.
          float flow = sin(vWorld.z * 0.9 - uTime * 0.6 + sin(vWorld.x * 0.7) * 1.5);
          colour += vec3(0.04, 0.06, 0.05) * flow;
          float ripple = sin(vWorld.x * 3.1 + uTime * 1.3) * sin(vWorld.z * 2.3 - uTime * 0.9)
            + sin((vWorld.x + vWorld.z) * 4.7 + uTime * 1.7) * 0.5;
          // Glints: thin, stretched along the current, and few.
          float streak = smoothstep(1.3, 1.48, ripple) * (0.5 + 0.5 * sin(vWorld.x * 9.0));
          colour += vec3(1.0, 0.86, 0.62) * streak * 0.08;
          float foam = 1.0 - smoothstep(0.02, 0.16, edge + sin(vWorld.z * 3.0 + uTime) * 0.04);
          colour = mix(colour, uFoam, foam * 0.18);
          gl_FragColor = vec4(colour, 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    }),
  );
  const reach = 40;
  const geometry = new PlaneGeometry(river.east - river.west, scene.height + reach * 2, 28, 80);
  const water = kit.mesh(geometry, material, false);
  water.rotation.x = -Math.PI / 2;
  water.position.set((river.west + river.east) / 2, WATER_Y, scene.height / 2);
  water.receiveShadow = false;
  return { water, material };
}

// ── Things in the place ─────────────────────────────────────────────────────

/** A length of bamboo from `from` to `to`, with a node ring halfway. */
function bamboo(kit: Kit, length: number, radius: number, colour = '#c7a45a'): Group {
  const group = new Group();
  const pole = kit.mesh(new CylinderGeometry(radius, radius * 1.05, length, 7), kit.mat(colour));
  group.add(pole);
  for (const at of [-0.3, 0.2]) {
    const node = kit.mesh(
      new CylinderGeometry(radius * 1.25, radius * 1.25, Math.min(0.05, length * 0.05), 7),
      kit.mat('#9c7c3c'),
    );
    node.position.y = at * length;
    group.add(node);
  }
  return group;
}

function tree(kit: Kit, prop: Prop): Group {
  const group = new Group();
  const r = hash(prop.x, prop.y);
  const scale = 0.85 + r * 0.35;
  const banana = prop.kind === 'tree' && hash(prop.x, prop.y, 9) < 0.34;
  if (banana) {
    // A banana plant: a soft trunk and long leaves arching out.
    const trunk = kit.mesh(new CylinderGeometry(0.08, 0.12, 1.1, 6), kit.mat('#8a9a4a'));
    trunk.position.y = 0.55;
    group.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      // Each leaf leans out and droops, as a banana leaf's weight pulls it.
      const leaf = new Group();
      const blade = kit.mesh(
        new BoxGeometry(0.26, 0.02, 0.85),
        kit.mat(i % 2 ? '#4f9a30' : '#62ad3a'),
      );
      blade.position.z = 0.42;
      leaf.add(blade);
      const angle = (i / 6) * Math.PI * 2 + r;
      leaf.position.y = 1.08 + (i % 3) * 0.08;
      leaf.rotation.set(-0.35 + (i % 2) * 0.25, angle, 0, 'YXZ');
      group.add(leaf);
    }
  } else if (prop.kind === 'pine') {
    // A betel-nut palm: tall, thin, a tuft at the top.
    const trunk = kit.mesh(new CylinderGeometry(0.05, 0.08, 2.4, 6), kit.mat('#8b7355'));
    trunk.position.y = 1.2;
    group.add(trunk);
    for (let i = 0; i < 7; i += 1) {
      const frond = kit.mesh(new BoxGeometry(0.12, 0.02, 0.75), kit.mat('#4f8a31'));
      const angle = (i / 7) * Math.PI * 2;
      frond.position.set(Math.sin(angle) * 0.3, 2.35, Math.cos(angle) * 0.3);
      frond.rotation.set(0.7, angle, 0);
      group.add(frond);
    }
  } else {
    const flame = prop.kind === 'krishnachura';
    const trunk = kit.mesh(
      new CylinderGeometry(0.09, 0.14, flame ? 0.9 : 0.8, 6),
      kit.mat('#6e4b2e'),
    );
    trunk.position.y = flame ? 0.45 : 0.4;
    group.add(trunk);
    const greens = prop.variant === 1 ? ['#2f7d5b', '#357f5e'] : ['#4f8f32', '#5a9c38', '#467f2c'];
    const reds = ['#e2552d', '#d8462a', '#ef6a35'];
    const palette = flame ? reds : greens;
    const blobs = flame ? 4 : 3;
    for (let i = 0; i < blobs; i += 1) {
      const size = flame ? 0.42 : 0.48 - i * 0.06;
      const blob = kit.mesh(
        new IcosahedronGeometry(size, 0),
        kit.mat(palette[i % palette.length] ?? '#4f8f32'),
      );
      const angle = (i / blobs) * Math.PI * 2 + r * 3;
      const spread = flame ? 0.38 : 0.2;
      blob.position.set(
        Math.sin(angle) * spread,
        (flame ? 1.05 : 1.0) + i * (flame ? 0.02 : 0.2),
        Math.cos(angle) * spread,
      );
      if (flame) blob.scale.set(1.2, 0.55, 1.2);
      group.add(blob);
    }
    if (prop.kind === 'fruit-tree') {
      for (let i = 0; i < 6; i += 1) {
        const fruit = kit.mesh(new SphereGeometry(0.06, 6, 4), kit.mat('#f0a32e'), false);
        const angle = (i / 6) * Math.PI * 2;
        fruit.position.set(Math.sin(angle) * 0.42, 0.95 + (i % 2) * 0.25, Math.cos(angle) * 0.42);
        group.add(fruit);
      }
    }
  }
  group.scale.setScalar(scale);
  group.rotation.y = r * Math.PI * 2;
  return group;
}

function swayingGrass(kit: Kit, prop: Prop, sway: Object3D[]): Group {
  const group = new Group();
  const kash = prop.kind === 'kash';
  const blades = kash ? 7 : 6;
  for (let i = 0; i < blades; i += 1) {
    const stalk = new Group();
    const h = (kash ? 0.75 : 0.55) + hash(prop.x, prop.y, i) * 0.3;
    const blade = kit.mesh(
      new ConeGeometry(0.03, h, 4),
      kit.mat(kash ? '#9fb36a' : '#5e8f3a'),
      false,
    );
    blade.position.y = h / 2;
    stalk.add(blade);
    if (kash) {
      const plume = kit.mesh(new SphereGeometry(0.07, 5, 4), kit.mat('#f6f3ea'), false);
      plume.scale.set(0.7, 1.9, 0.7);
      plume.position.y = h + 0.08;
      stalk.add(plume);
    }
    const angle = (i / blades) * Math.PI * 2;
    stalk.position.set(Math.sin(angle) * 0.18, 0, Math.cos(angle) * 0.18);
    stalk.rotation.z = (hash(prop.x, i) - 0.5) * 0.3;
    stalk.userData['phase'] = hash(prop.x, prop.y, i + 20) * Math.PI * 2;
    sway.push(stalk);
    group.add(stalk);
  }
  return group;
}

function hut(kit: Kit): Group {
  const group = new Group();
  const walls = kit.mesh(new BoxGeometry(1.7, 1.05, 2.2), kit.mat('#c9955e'));
  walls.position.y = 0.52;
  group.add(walls);
  const plinth = kit.mesh(new BoxGeometry(1.9, 0.12, 2.4), kit.mat('#a87a4a'));
  plinth.position.y = 0.06;
  group.add(plinth);
  // A thatched roof: a long ridge with deep eaves.
  const roof = kit.mesh(new ConeGeometry(1.55, 1.0, 4, 1), kit.mat('#c9a050'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 1.55);
  roof.position.y = 1.5;
  group.add(roof);
  const door = kit.mesh(new BoxGeometry(0.45, 0.72, 0.06), kit.mat('#5b3a22'), false);
  door.position.set(0.25, 0.4, 1.11);
  group.add(door);
  const window_ = kit.mesh(new BoxGeometry(0.3, 0.25, 0.06), kit.mat('#3b2a1a'), false);
  window_.position.set(-0.45, 0.6, 1.11);
  group.add(window_);
  return group;
}

function stall(kit: Kit): Group {
  const group = new Group();
  for (const [x, z] of [
    [-0.85, -0.4],
    [0.85, -0.4],
    [-0.85, 0.45],
    [0.85, 0.45],
  ] as const) {
    const post = kit.mesh(new CylinderGeometry(0.04, 0.04, 1.3, 5), kit.mat('#7a5232'));
    post.position.set(x, 0.65, z);
    group.add(post);
  }
  const counter = kit.mesh(new BoxGeometry(1.8, 0.5, 0.6), kit.mat('#9a6a3e'));
  counter.position.set(0, 0.25, 0.3);
  group.add(counter);
  // A striped awning, drawn on a canvas: the one texture in the scene.
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (context) {
    for (let i = 0; i < 8; i += 1) {
      context.fillStyle = i % 2 ? '#f2e8d2' : '#d9622b';
      context.fillRect(i * 8, 0, 8, 8);
    }
  }
  const texture = kit.keep(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  const awningMaterial = kit.keep(
    new MeshStandardMaterial({ map: texture, roughness: 0.9, side: DoubleSide }),
  );
  const awning = kit.mesh(new PlaneGeometry(2.0, 1.1), awningMaterial);
  awning.rotation.x = -Math.PI / 2 + 0.35;
  awning.position.set(0, 1.32, 0.05);
  group.add(awning);
  for (const [i, colour] of ['#f2c230', '#8bc34a', '#e8732c', '#f2c230'].entries()) {
    const heap = kit.mesh(new SphereGeometry(0.16, 6, 4), kit.mat(colour), false);
    heap.scale.y = 0.6;
    heap.position.set(-0.6 + i * 0.4, 0.55, 0.3);
    group.add(heap);
  }
  return group;
}

function boat(kit: Kit, roofed: boolean): Group {
  const group = new Group();
  // A nouka: a long hull, its ends drawn up to points.
  const geometry = new BoxGeometry(0.62, 0.28, 2.0, 1, 1, 10);
  const position = geometry.attributes['position'] as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i);
    const t = Math.abs(z) / 1.0;
    position.setX(i, position.getX(i) * (1 - t * t * 0.92));
    if (position.getY(i) > 0) position.setY(i, position.getY(i) + t * t * 0.28);
    else position.setY(i, position.getY(i) * (1 - t * 0.5));
  }
  geometry.computeVertexNormals();
  const hull = kit.mesh(geometry, kit.mat('#6e4326'));
  group.add(hull);
  const inside = kit.mesh(new BoxGeometry(0.42, 0.05, 1.3), kit.mat('#8a5a33'), false);
  inside.position.y = 0.1;
  group.add(inside);
  if (roofed) {
    // A chhoi: the curved cane roof over the middle.
    const roof = kit.mesh(
      new CylinderGeometry(0.34, 0.34, 0.8, 8, 1, true, 0, Math.PI),
      kit.mat('#b68e4c'),
    );
    roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    roof.rotation.order = 'YXZ';
    roof.rotation.set(0, 0, 0);
    roof.rotation.x = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = 0.16;
    roof.scale.set(1, 1, 1);
    const holder = new Group();
    holder.add(roof);
    holder.rotation.y = Math.PI / 2;
    group.add(holder);
  }
  return group;
}

interface Person {
  readonly group: Group;
  readonly legs: readonly Object3D[];
  readonly arms: readonly Object3D[];
  /** Which of PEOPLE / OUTFITS this is. */
  readonly look: string;
  /** The rigged model, once loaded; until then the shapes above. */
  figure: Figure | null;
}

function person(kit: Kit, name: string): Person {
  const look = PEOPLE[name] as PersonLook;
  const group = new Group();
  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new Group();
    const shape = kit.mesh(new BoxGeometry(0.11, 0.36, 0.12), kit.mat(look.lower));
    shape.position.y = -0.18;
    leg.add(shape);
    leg.position.set(side * 0.08, 0.38, 0);
    legs.push(leg);
    group.add(leg);
  }
  const body = kit.mesh(new CylinderGeometry(0.15, 0.19, 0.42, 7), kit.mat(look.shirt));
  body.position.y = 0.58;
  group.add(body);
  if (look.long) {
    // A sari's fall, from the shoulder.
    const drape = kit.mesh(new CylinderGeometry(0.19, 0.24, 0.42, 7), kit.mat(look.lower));
    drape.position.y = 0.3;
    group.add(drape);
  }
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = new Group();
    const shape = kit.mesh(new BoxGeometry(0.08, 0.34, 0.09), kit.mat(look.skin));
    shape.position.y = -0.17;
    arm.add(shape);
    arm.position.set(side * 0.21, 0.76, 0);
    arm.rotation.z = side * 0.12;
    arms.push(arm);
    group.add(arm);
  }
  const head = kit.mesh(new SphereGeometry(0.14, 8, 6), kit.mat(look.skin));
  head.position.y = 0.95;
  group.add(head);
  const hair = kit.mesh(
    new SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    kit.mat(look.hair),
  );
  hair.position.y = 0.97;
  hair.rotation.x = -0.25;
  group.add(hair);
  if (look.long) {
    const braid = kit.mesh(new BoxGeometry(0.07, 0.4, 0.07), kit.mat(look.hair));
    braid.position.set(0, 0.72, -0.15);
    group.add(braid);
  }
  if (look.beard) {
    const beard = kit.mesh(new BoxGeometry(0.16, 0.12, 0.08), kit.mat(look.beard));
    beard.position.set(0, 0.86, 0.1);
    group.add(beard);
  }
  if (look.hat) {
    const brim = kit.mesh(new ConeGeometry(0.34, 0.16, 10), kit.mat(look.hat));
    brim.position.y = 1.12;
    group.add(brim);
  }
  // Eyes, so a face has a front.
  for (const side of [-1, 1]) {
    const eye = kit.mesh(new BoxGeometry(0.025, 0.03, 0.02), kit.mat('#1a1410'), false);
    eye.position.set(side * 0.05, 0.97, 0.135);
    group.add(eye);
  }
  return { group, legs, arms, look: name, figure: null };
}

// ── The scene ─────────────────────────────────────────────────────────────

class Zone3d implements ZoneGame {
  private readonly options: ZoneGameOptions;
  private readonly kit = new Kit();
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(34, 1, 0.1, 200);
  private readonly sun: DirectionalLight;
  private readonly ground: Ground;
  private readonly finish: Finish;
  private readonly skyTarget: { dispose(): void };
  private readonly clock = new Clock();
  private readonly calm: boolean;
  private readonly coarse: boolean;
  private readonly description: ZoneScene;
  private readonly waterMaterial: ShaderMaterial;
  private readonly hero: Person;
  private readonly heroShadow: Mesh;
  private readonly idlers: { person: Person; base: number; phase: number }[] = [];
  /** Everyone, the hero first: dressed as models when those arrive. */
  private readonly people: Person[] = [];
  private peopleKit: People | null = null;
  private readonly peopleAbort = new AbortController();
  /** The people's models, requested as soon as the zone starts to be built. */
  private readonly peopleLoad: Promise<People>;
  /** The scene's shaders are compiled and the zone is drawing. */
  private prepared = false;
  /** Squares of the jetty, "x,y": people there stand on its planks. */
  private jettyCells = new Set<string>();
  /** Which way the hero faces; the model turns towards it. */
  private heroYaw = 0;
  private readonly floaters: { group: Group; base: number; phase: number }[] = [];
  private readonly sway: Object3D[] = [];
  private readonly spans = new Map<string, Group>();
  private readonly barriers: Group;
  private readonly marks = new Map<string, Mesh>();
  private readonly hover: Mesh;
  private readonly tapRing: Mesh;
  private readonly growing: { group: Group; t: number }[] = [];

  private state: ZoneState;
  private grid: WalkGrid;
  private cell: Cell;
  private route: Cell[] = [];
  private intent: { kind: 'giver' } | { kind: 'gate'; gate: Gate } | null = null;
  private stepFrom: Vector3 | null = null;
  private stepTo: Vector3 | null = null;
  private stepT = 0;
  private walkPhase = 0;
  /**
   * Key presses not yet walked, oldest first. A press made mid-step waits its
   * turn instead of replacing the one before it, so three taps of an arrow
   * are three steps even on a phone drawing a few frames a second.
   */
  private presses: Cell[] = [];
  private readonly held = new Set<string>();
  private paused = false;
  private destroyed = false;
  private tapT = 1;
  private framed = false;
  /** The next frame is a milestone: its start and end are marked (mark). */
  private timing: string | null = 'first-frame';
  private readonly cameraTarget = new Vector3();
  private readonly resize: ResizeObserver;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: ZoneGameOptions) {
    mark('start');
    // The models download while the place is built, not after it is drawn.
    mark('people-requested');
    this.peopleLoad = loadPeople(this.peopleAbort.signal);
    // Settled here so a failure before setup finishes is never "unhandled";
    // dressPeople reads the outcome.
    this.peopleLoad.catch(() => undefined);
    this.options = options;
    this.state = options.state;
    this.grid = walkGrid(options.map, options.state.completed);
    const start = options.start;
    this.cell = start && canWalk(this.grid, start) ? start : options.map.spawn;
    this.calm =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    // Throws where WebGL is unavailable; the quest screen falls back to 2D.
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // What setup has made so far, so a failure partway leaves nothing behind
    // beside the 2D zone that takes over.
    const undo: (() => void)[] = [];
    try {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.coarse ? 1.5 : 2));
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.touchAction = 'none';
      // Says which version is drawing, for the browser tests.
      this.renderer.domElement.dataset['questRenderer'] = '3d';
      options.parent.append(this.renderer.domElement);
      undo.push(() => this.renderer.domElement.remove());

      const haze = new Color('#f3d8ac');
      this.scene.background = haze;
      this.scene.fog = new Fog(haze, 20, 52);

      const quality = pickQuality(this.renderer, this.coarse);
      mark('renderer');

      // Late afternoon: the sky's own light on everything (effects3d.ts), a
      // low warm sun in the west for shadows, a little green bounce from below.
      const sky = skyLight(this.renderer, SUN);
      this.skyTarget = sky;
      undo.push(() => sky.dispose());
      this.scene.environment = sky.texture;
      this.scene.environmentIntensity = 0.14;
      mark('sky');
      this.scene.add(new HemisphereLight('#dfe9ff', '#5a7a3a', 0.55));
      this.sun = new DirectionalLight('#ffd49a', 2.7);
      this.sun.castShadow = true;
      const shadowSize = quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const reach = 16;
      Object.assign(this.sun.shadow.camera, {
        left: -reach,
        right: reach,
        top: reach,
        bottom: -reach,
        near: 1,
        far: 60,
      });
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.02;
      this.scene.add(this.sun, this.sun.target);

      this.description = describeScene(options.mapJson);
      this.jettyCells = new Set(
        this.description.props.filter((p) => p.kind === 'jetty').map((p) => `${p.x},${p.y}`),
      );
      const banks = this.riverBanks();
      const ground = buildGround(this.description, { quality, occupied: this.occupiedSquares() });
      this.ground = ground;
      undo.push(() => ground.dispose());
      this.scene.add(...this.ground.objects);
      mark('ground');
      this.scene.add(buildSurroundings(this.kit, this.description, banks));
      const { water, material } = buildWater(this.kit, this.description, banks);
      this.waterMaterial = material;
      this.scene.add(water);

      this.barriers = new Group();
      this.scene.add(this.barriers);
      this.buildProps();
      this.buildBridge();
      this.buildPeople();

      this.hero = person(this.kit, 'hero');
      this.people.unshift(this.hero);
      mark('built');
      const heroAt = this.standing(this.cell);
      this.hero.group.position.copy(heroAt);
      this.scene.add(this.hero.group);
      this.heroShadow = this.kit.mesh(
        new RingGeometry(0, 0.24, 16),
        this.kit.keep(
          new MeshBasicMaterial({
            color: '#000000',
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
          }),
        ),
        false,
      );
      this.heroShadow.rotation.x = -Math.PI / 2;
      this.scene.add(this.heroShadow);

      this.hover = this.kit.mesh(
        new RingGeometry(0.36, 0.46, 4, 1, Math.PI / 4),
        this.kit.keep(
          new MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
          }),
        ),
        false,
      );
      this.hover.rotation.x = -Math.PI / 2;
      this.hover.visible = false;
      this.scene.add(this.hover);
      this.tapRing = this.kit.mesh(
        new RingGeometry(0.3, 0.38, 24),
        this.kit.keep(
          new MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        ),
        false,
      );
      this.tapRing.rotation.x = -Math.PI / 2;
      this.scene.add(this.tapRing);

      const finish = new Finish(this.renderer, this.scene, this.camera, quality, () => {
        // Moved to "low" for running slow: everything else that costs comes
        // down with it. A lighter screen, a smaller shadow map (the old one is
        // freed and redrawn at the new size), a third of the grass.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.ground.lower();
        this.fit();
      });
      this.finish = finish;
      undo.push(() => finish.dispose());

      this.cameraTarget.copy(this.clampTarget(heroAt));
      this.showState(false);
      this.listen();

      const resize = new ResizeObserver(() => this.fit());
      this.resize = resize;
      undo.push(() => resize.disconnect());
      resize.observe(options.parent);
      this.fit();
    } catch (error) {
      this.peopleAbort.abort();
      for (const step of undo.reverse()) step();
      for (const cleanup of this.cleanups) cleanup();
      for (const thing of this.kit.disposables) thing.dispose();
      this.renderer.dispose();
      throw error;
    }
    this.renderer.domElement.dataset['questPeople'] = 'loading';
    void this.prepare();
    void this.dressPeople();
  }

  /**
   * Compile the scene's shaders before its first frame, then start drawing.
   * Compiled on the first frame instead, they hold the page still for a
   * second on a laptop and several on a phone. Where the browser compiles in
   * the background (KHR_parallel_shader_compile: Safari, Chrome), the page
   * stays responsive meanwhile, the "Loading…" note showing, and the people's
   * models are read in the same time.
   */
  private async prepare(): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // They are compiled on the first frame instead.
    }
    if (this.destroyed) return;
    mark('compiled');
    this.prepared = true;
    if (!this.paused) this.renderer.setAnimationLoop(() => this.frame());
    else this.finish.render();
    mark('ready');
    this.options.onEvent({ kind: 'ready' });
  }

  /**
   * Swap the shapes for rigged models, if they load. If not, keep the shapes.
   * Their shaders are compiled before the swap, so they step in without the
   * zone stopping for it.
   */
  private async dressPeople(): Promise<void> {
    const canvas = this.renderer.domElement;
    let kit: People;
    try {
      kit = await this.peopleLoad;
    } catch (error) {
      if (this.destroyed) return;
      canvas.dataset['questPeople'] = 'shapes';
      // The shapes are a fine fallback for a student, but a broken asset
      // deployment should not look like one in the console.
      console.warn('Shohoj Quest: the people models did not load; drawing shapes.', error);
      return;
    }
    mark('people-arrived');
    if (this.destroyed) {
      kit.dispose();
      return;
    }
    this.peopleKit = kit;
    const dressed: { someone: Person; figure: Figure }[] = [];
    const waiting = new Group();
    for (const someone of this.people) {
      const outfit = OUTFITS[someone.look];
      if (!outfit) continue;
      const figure = kit.figure(outfit);
      waiting.add(figure.root);
      dressed.push({ someone, figure });
    }
    try {
      await this.renderer.compileAsync(waiting, this.camera, this.scene);
    } catch {
      // Compiled when they are first drawn instead.
    }
    if (this.destroyed) return;
    mark('people-compiled');
    for (const { someone, figure } of dressed) {
      // The shapes' geometry stays with the kit, freed with the zone.
      someone.group.clear();
      someone.group.add(figure.root);
      someone.figure = figure;
    }
    // The shapes stood a little high for their bob; models stand on the ground.
    for (const idler of this.idlers) idler.person.group.position.y = idler.base;
    canvas.dataset['questPeople'] = 'models';
    mark('people-swapped');
    this.timing = 'people-frame';
    if (this.paused && this.prepared) this.finish.render();
  }

  // ── Called by the page ────────────────────────────────────────────────────

  setState(state: ZoneState): void {
    this.state = state;
    this.grid = walkGrid(this.options.map, state.completed);
    this.showState(true);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.route = [];
    this.intent = null;
    this.presses = [];
    this.held.clear();
    this.hover.visible = false;
    // Until its shaders are compiled the zone is not drawn (prepare).
    if (!this.prepared) return;
    // Nothing moves behind a panel: stop drawing, for a phone's battery.
    if (paused) {
      this.renderer.setAnimationLoop(null);
      this.finish.render();
    } else {
      this.clock.getDelta();
      this.renderer.setAnimationLoop(() => this.frame());
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.peopleAbort.abort();
    this.peopleKit?.dispose();
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    for (const thing of this.kit.disposables) thing.dispose();
    this.ground.dispose();
    this.finish.dispose();
    this.skyTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Building the place ────────────────────────────────────────────────────

  private riverBanks(): { west: number; east: number } {
    const { width, height, ground } = this.description;
    let west = width;
    let east = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const kind = ground[y * width + x];
        if (kind === 'water' || kind === 'bank-west' || kind === 'bank-east') {
          west = Math.min(west, x);
          east = Math.max(east, x + 1);
        }
      }
    }
    return west < east ? { west, east } : { west: 0, east: 0 };
  }

  /**
   * Put something on a square, a little off centre. `y` is above the ground
   * there, unless `grounded` is false (a boat on the water, a jetty plank):
   * then it is the height itself.
   */
  private place(object: Object3D, prop: Cell, y = 0, jitter = 0.12, grounded = true): void {
    const x = prop.x + 0.5 + (hash(prop.x, prop.y, 5) - 0.5) * jitter;
    const z = prop.y + 0.5 + (hash(prop.x, prop.y, 6) - 0.5) * jitter;
    object.position.set(x, grounded ? this.ground.heightAt(x, z) + y : y, z);
    this.scene.add(object);
  }

  /** Squares where something stands, so the grass leaves them clear. */
  private occupiedSquares(): Set<string> {
    const taken = new Set<string>();
    const add = (x: number, y: number) => taken.add(`${x},${y}`);
    for (const prop of this.description.props) {
      if (prop.kind === 'rice' || prop.kind === 'flowers') continue;
      add(prop.x, prop.y);
      // A hut stands on the four rows above its door, two squares wide.
      if (prop.kind === 'hut')
        for (let dy = -3; dy <= 0; dy += 1) for (const dx of [-1, 0]) add(prop.x + dx, prop.y + dy);
      if (prop.kind === 'stall')
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const)
          add(prop.x + dx, prop.y + dy);
    }
    return taken;
  }

  private buildProps(): void {
    const kit = this.kit;
    for (const prop of this.description.props) {
      switch (prop.kind) {
        case 'tree':
        case 'krishnachura':
        case 'pine':
        case 'fruit-tree':
          this.place(tree(kit, prop), prop, 0, 0.3);
          break;
        case 'bush': {
          const bush = kit.mesh(
            new IcosahedronGeometry(0.38, 0),
            kit.mat(['#4f8a31', '#3f7a2a', '#5a9a3a'][prop.variant] ?? '#4f8a31'),
          );
          bush.scale.set(1.2, 0.75, 1.1);
          this.place(bush, prop, 0.22);
          break;
        }
        case 'rock':
        case 'river-rock': {
          const rock = kit.mesh(
            new DodecahedronGeometry(0.3, 0),
            kit.mat(prop.variant === 0 ? '#9a948a' : '#8a8378'),
          );
          rock.scale.set(1.2, 0.6, 1);
          rock.rotation.y = hash(prop.x, prop.y) * 6;
          if (prop.kind === 'river-rock') this.place(rock, prop, WATER_Y + 0.05, 0.3, false);
          else this.place(rock, prop, 0.1, 0.3);
          break;
        }
        case 'reeds':
        case 'kash':
          this.place(swayingGrass(kit, prop, this.sway), prop, prop.x > 0 ? -0.05 : 0, 0.4);
          break;
        case 'flowers': {
          // A low clump of leaves with flowers held up on stems.
          const group = new Group();
          const colour = ['#e8452a', '#9a55d0', '#fff4d6'][prop.variant] ?? '#e8452a';
          const clump = kit.mesh(new IcosahedronGeometry(0.2, 0), kit.mat('#4f9a30'));
          clump.scale.set(1.4, 0.5, 1.4);
          clump.position.y = 0.06;
          group.add(clump);
          for (let i = 0; i < 6; i += 1) {
            const angle = (i / 6) * Math.PI * 2 + hash(prop.x, prop.y) * 3;
            const reach = 0.08 + hash(prop.x, i) * 0.16;
            const stem = kit.mesh(
              new CylinderGeometry(0.01, 0.01, 0.22, 3),
              kit.mat('#3f7f28'),
              false,
            );
            stem.position.set(Math.sin(angle) * reach, 0.13, Math.cos(angle) * reach);
            const head = kit.mesh(
              new IcosahedronGeometry(0.055, 0),
              kit.mat(colour, { rough: 0.7 }),
              false,
            );
            head.position.set(Math.sin(angle) * reach, 0.26, Math.cos(angle) * reach);
            group.add(stem, head);
          }
          this.place(group, prop);
          break;
        }
        case 'rice':
          // Rice grows as part of the ground (ground3d.ts), in its water.
          break;
        case 'hut': {
          // Named by its door; the hut stands on the four rows above it.
          const building = hut(kit);
          building.position.set(
            prop.x,
            this.ground.heightAt(prop.x, prop.y - 0.6) - 0.04,
            prop.y - 0.6,
          );
          this.scene.add(building);
          break;
        }
        case 'stall': {
          const shop = stall(kit);
          shop.position.set(prop.x + 1, this.ground.heightAt(prop.x + 1, prop.y + 1), prop.y + 1);
          this.scene.add(shop);
          break;
        }
        case 'sacks': {
          const sack = kit.mesh(new SphereGeometry(0.22, 7, 5), kit.mat('#e0d2ae'));
          sack.scale.set(1, 1.15, 0.9);
          this.place(sack, prop, 0.22);
          break;
        }
        case 'basket': {
          const basket = kit.mesh(new CylinderGeometry(0.24, 0.18, 0.22, 8), kit.mat('#b08542'));
          this.place(basket, prop, 0.11);
          break;
        }
        case 'barrel': {
          const barrel = kit.mesh(new CylinderGeometry(0.2, 0.2, 0.45, 9), kit.mat('#7a5232'));
          this.place(barrel, prop, 0.22);
          break;
        }
        case 'lantern': {
          const group = new Group();
          const post = kit.mesh(new CylinderGeometry(0.035, 0.045, 1.2, 5), kit.mat('#5b3a22'));
          post.position.y = 0.6;
          const light = kit.mesh(
            new BoxGeometry(0.16, 0.2, 0.16),
            kit.mat('#ffd27a', { emissive: '#ffb347' }),
          );
          light.position.y = 1.25;
          group.add(post, light);
          this.place(group, prop, 0, 0);
          break;
        }
        case 'signpost': {
          const group = new Group();
          const post = kit.mesh(new CylinderGeometry(0.04, 0.05, 1, 5), kit.mat('#6e4b2e'));
          post.position.y = 0.5;
          const board = kit.mesh(new BoxGeometry(0.6, 0.22, 0.05), kit.mat('#a5784a'));
          board.position.set(0.12, 0.85, 0);
          group.add(post, board);
          this.place(group, prop, 0, 0);
          break;
        }
        case 'pile': {
          const pile = bamboo(kit, 1.4, 0.07);
          pile.position.y = 0.7;
          const holder = new Group();
          holder.add(pile);
          // The bridge's piles stand at the deck's edge, not mid-square.
          const towardDeck = prop.variant === 0 ? 0.4 : -0.4;
          holder.position.set(prop.x + 0.5, RIVERBED_Y + 0.25, prop.y + 0.5 + towardDeck);
          this.scene.add(holder);
          break;
        }
        case 'jetty': {
          const plank = kit.mesh(
            new BoxGeometry(1.0, 0.08, 1.0),
            kit.mat(prop.variant ? '#8a5f38' : '#94673d'),
          );
          this.place(plank, prop, JETTY_TOP - 0.04, 0, false);
          if ((prop.x + prop.y) % 2 === 0) {
            const leg = bamboo(kit, 1.0, 0.06, '#7a5232');
            leg.position.set(prop.x + 0.1, RIVERBED_Y + 0.45, prop.y + 0.1);
            this.scene.add(leg);
          }
          break;
        }
        case 'fence': {
          const group = new Group();
          const post = kit.mesh(new BoxGeometry(0.1, 0.7, 0.1), kit.mat('#7a5232'));
          post.position.set(-0.45, 0.35, 0);
          group.add(post);
          for (const y of [0.28, 0.55]) {
            const rail = kit.mesh(new BoxGeometry(1.0, 0.06, 0.06), kit.mat('#8a6040'));
            rail.position.y = y;
            group.add(rail);
          }
          this.place(group, prop, 0, 0);
          break;
        }
        case 'boat': {
          const vessel = boat(kit, prop.variant === 0);
          vessel.rotation.y = hash(prop.x, prop.y) * 0.4 - 0.2;
          this.place(vessel, prop, WATER_Y + 0.05, 0.2, false);
          this.floaters.push({
            group: vessel,
            base: vessel.position.y,
            phase: hash(prop.x, prop.y, 7) * 6,
          });
          break;
        }
      }
    }
  }

  /** One group of bamboo deck and rails per gate; shown when its quest is solved. */
  private buildBridge(): void {
    const kit = this.kit;
    for (const gate of this.options.map.gates) {
      const deckCells = this.description.deck.filter((cell) => inRect(gate, cell));
      if (deckCells.length === 0) continue;
      const group = new Group();
      const xs = [...new Set(deckCells.map((cell) => cell.x))];
      const zs = deckCells.map((cell) => cell.y);
      const top = Math.min(...zs);
      const bottom = Math.max(...zs) + 1;
      const length = bottom - top + 0.4;
      // Bamboo poles laid side by side across the river's flow.
      for (const x of xs) {
        for (let k = 0; k < 6; k += 1) {
          const pole = bamboo(kit, length, 0.075, k % 2 ? '#c9a65c' : '#bf9a50');
          pole.rotation.x = Math.PI / 2;
          pole.position.set(x + 0.09 + k * 0.165, 0.1, (top + bottom) / 2);
          group.add(pole);
        }
      }
      // Rails: a pole along each side, on posts.
      const west = Math.min(...xs);
      const east = Math.max(...xs) + 1;
      for (const z of [top - 0.12, bottom + 0.12]) {
        const rail = bamboo(kit, east - west, 0.05);
        rail.rotation.z = Math.PI / 2;
        rail.position.set((west + east) / 2, 0.72, z);
        group.add(rail);
        for (let x = west; x <= east; x += 1) {
          const post = bamboo(kit, 0.75, 0.045, '#a8874a');
          post.position.set(x, 0.42, z);
          group.add(post);
        }
      }
      group.visible = false;
      this.scene.add(group);
      this.spans.set(`${gate.quest}@${gate.x},${gate.y}`, group);
    }
    // What a quest removes: a gate in the far fence.
    for (const cell of this.description.barriers) {
      const gate = new Group();
      for (const y of [0.25, 0.5, 0.75]) {
        const bar = kit.mesh(new BoxGeometry(1.0, 0.08, 0.08), kit.mat('#8a5a33'));
        bar.position.y = y;
        gate.add(bar);
      }
      for (const x of [-0.45, 0.45]) {
        const post = kit.mesh(new BoxGeometry(0.12, 1.0, 0.12), kit.mat('#6e4326'));
        post.position.set(x, 0.5, 0);
        gate.add(post);
      }
      gate.position.set(cell.x + 0.5, 0, cell.y + 0.5);
      gate.userData['cell'] = cell;
      this.barriers.add(gate);
    }
  }

  private buildPeople(): void {
    const giver = person(this.kit, 'boatman');
    this.people.push(giver);
    giver.group.position.copy(this.standing(this.options.map.giver));
    // Facing the road, where the student comes from.
    giver.group.rotation.y = Math.PI * 0.75;
    this.scene.add(giver.group);
    this.idlers.push({ person: giver, base: giver.group.position.y, phase: 0.4 });

    for (const item of this.options.map.scenery) {
      if (item.kind !== 'figure') continue;
      if (!PEOPLE[item.look]) continue;
      const someone = person(this.kit, item.look);
      this.people.push(someone);
      someone.group.position.copy(this.standing(item.at));
      // On the jetty, out towards the open river (east); elsewhere, any way.
      someone.group.rotation.y = this.jettyCells.has(`${item.at.x},${item.at.y}`)
        ? Math.PI / 2
        : hash(item.at.x, item.at.y) * Math.PI * 2;
      this.scene.add(someone.group);
      this.idlers.push({
        person: someone,
        base: someone.group.position.y,
        phase: hash(item.at.x, item.at.y, 2) * 6,
      });
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private showState(animate: boolean): void {
    const shut = shutGates(this.options.map, this.state.completed);
    const isShut = (key: string) =>
      shut.some((gate) => `${gate.quest}@${gate.x},${gate.y}` === key);
    for (const [key, group] of this.spans) {
      const open = !isShut(key);
      if (open && !group.visible) {
        group.visible = true;
        if (animate && !this.calm) {
          group.position.y = -0.8;
          this.growing.push({ group, t: 0 });
        }
      } else if (!open) {
        group.visible = false;
      }
    }
    for (const gate of this.barriers.children) {
      const cell = gate.userData['cell'] as Cell;
      gate.visible = shut.some((rect) => inRect(rect, cell));
    }

    const wanted = new Map<string, Vector3>();
    if (this.state.open.size > 0) wanted.set('giver', centre(this.options.map.giver).setY(1.75));
    for (const gate of shut) {
      const key = `gate:${gate.quest}`;
      if (!this.state.open.has(gate.quest) || wanted.has(key)) continue;
      wanted.set(key, new Vector3(gate.x + gate.w / 2, 1.1, gate.y + gate.h / 2));
    }
    for (const [key, mark] of this.marks) {
      if (wanted.has(key)) continue;
      this.scene.remove(mark);
      this.marks.delete(key);
    }
    for (const [key, at] of wanted) {
      if (this.marks.has(key)) continue;
      const mark = this.kit.mesh(
        new OctahedronGeometry(0.17, 0),
        this.kit.mat('#f5c542', { emissive: '#f0a020', rough: 0.4 }),
        false,
      );
      mark.scale.set(0.8, 1.3, 0.8);
      mark.position.copy(at);
      mark.userData['base'] = at.y;
      this.scene.add(mark);
      this.marks.set(key, mark);
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private listen(): void {
    const canvas = this.renderer.domElement;
    const raycaster = new Raycaster();
    const floor = new Plane(new Vector3(0, 1, 0), 0);
    const hit = new Vector3();
    const cellAt = (event: PointerEvent): Cell | null => {
      const box = canvas.getBoundingClientRect();
      const ndc = new Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.camera);
      if (!raycaster.ray.intersectPlane(floor, hit)) return null;
      const cell = { x: Math.floor(hit.x), y: Math.floor(hit.z) };
      const { width, height } = this.options.map;
      return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height ? cell : null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      const start = down;
      down = null;
      if (this.paused || !start) return;
      // A drag is not a tap.
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
      const cell = cellAt(event);
      if (cell) this.walkTo(cell);
    };
    const onMove = (event: PointerEvent) => {
      if (this.paused || event.pointerType !== 'mouse') {
        this.hover.visible = false;
        return;
      }
      const cell = cellAt(event);
      this.hover.visible = cell !== null;
      if (cell)
        this.hover.position.set(
          cell.x + 0.5,
          this.groundUnder(cell.x + 0.5, cell.y + 0.5) + 0.04,
          cell.y + 0.5,
        );
    };
    const onLeave = () => {
      this.hover.visible = false;
    };
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const onKeyDown = (event: KeyboardEvent) => {
      if (this.paused || editable(event.target)) return;
      const step = KEY_STEPS[event.code];
      if (!step) return;
      this.held.add(event.code);
      if (!event.repeat && this.presses.length < MAX_QUEUED_PRESSES) this.presses.push(step);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      this.held.delete(event.code);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.cleanups.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  // ── Walking ───────────────────────────────────────────────────────────────

  private walkTo(target: Cell): void {
    const map = this.options.map;
    const gate = gateAt(map, this.state.completed, target);
    this.intent = sameCell(target, map.giver)
      ? { kind: 'giver' }
      : gate
        ? { kind: 'gate', gate }
        : null;
    this.route = [...findRoute(this.grid, this.cell, target).steps];
    if (!this.calm) {
      this.tapRing.position.set(
        target.x + 0.5,
        this.groundUnder(target.x + 0.5, target.y + 0.5) + 0.05,
        target.y + 0.5,
      );
      this.tapT = 0;
    }
    if (!this.stepTo) this.advance();
  }

  private advance(): void {
    const next = this.route.shift();
    if (!next || !canWalk(this.grid, next)) {
      this.route = [];
      this.stepFrom = null;
      this.stepTo = null;
      this.arrive();
      return;
    }
    this.stepFrom = centre(this.cell);
    this.stepTo = centre(next);
    this.stepT = 0;
    this.heroYaw = Math.atan2(next.x - this.cell.x, next.y - this.cell.y);
    this.cell = next;
  }

  private arrive(): void {
    const intent = this.intent;
    this.intent = null;
    const map = this.options.map;
    const emit = (event: ZoneEvent) => this.options.onEvent(event);
    emit({ kind: 'moved', at: this.cell });
    if (inRect(map.exit, this.cell)) {
      emit({ kind: 'exit' });
    } else if (intent?.kind === 'giver') {
      if (Math.abs(map.giver.x - this.cell.x) + Math.abs(map.giver.y - this.cell.y) === 1)
        emit({ kind: 'giver' });
    } else if (intent?.kind === 'gate' && gapTo(intent.gate, this.cell) === 1) {
      emit({ kind: 'gate', quest: intent.gate.quest });
    }
  }

  private heldStep(): Cell | null {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const step = KEY_STEPS[code];
      if (step) {
        x += step.x;
        y += step.y;
      }
    }
    if (x !== 0) return { x: Math.sign(x), y: 0 };
    if (y !== 0) return { x: 0, y: Math.sign(y) };
    return null;
  }

  private keyboard(): void {
    if (this.stepTo || this.route.length > 0) return;
    const press = this.presses.shift() ?? null;
    const step = press ?? this.heldStep();
    if (!step) return;
    const next = { x: this.cell.x + step.x, y: this.cell.y + step.y };
    if (canWalk(this.grid, next)) {
      this.route = [next];
      this.advance();
      return;
    }
    // Walking into the giver or something unbuilt is how a keyboard says "this one".
    if (!press) return;
    const map = this.options.map;
    if (sameCell(next, map.giver)) {
      this.heroYaw = Math.atan2(step.x, step.y);
      this.options.onEvent({ kind: 'giver' });
      return;
    }
    const gate = gateAt(map, this.state.completed, next);
    if (gate) this.options.onEvent({ kind: 'gate', quest: gate.quest });
  }

  // ── Each frame ────────────────────────────────────────────────────────────

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    if (!this.paused) this.keyboard();

    const hero = this.hero;
    if (this.stepFrom && this.stepTo) {
      this.stepT = Math.min(1, this.stepT + dt / STEP_S);
      hero.group.position.lerpVectors(this.stepFrom, this.stepTo, this.stepT);
      this.walkPhase += dt * 14;
      if (this.stepT >= 1) {
        this.stepFrom = null;
        this.stepTo = null;
        this.advance();
      }
    } else {
      this.walkPhase *= 0.8;
    }
    // Turn towards where the hero is going, the short way round: a model
    // snapping round reads as a glitch. The shapes turned at once.
    const turn = Math.atan2(
      Math.sin(this.heroYaw - hero.group.rotation.y),
      Math.cos(this.heroYaw - hero.group.rotation.y),
    );
    hero.group.rotation.y += hero.figure ? turn * (1 - Math.exp(-dt * 18)) : turn;
    const under = this.groundUnder(hero.group.position.x, hero.group.position.z);
    if (hero.figure) {
      // The hero's real speed: the figure plays its jog faster or slower to
      // match it, so the feet keep pace with the ground (people3d.ts).
      hero.figure.move(this.stepTo ? 1 / STEP_S : 0);
      hero.group.position.y = under;
    } else {
      const swing = Math.sin(this.walkPhase) * (this.stepTo ? 0.6 : 0);
      hero.legs[0]?.rotation.set(swing, 0, 0);
      hero.legs[1]?.rotation.set(-swing, 0, 0);
      hero.arms[0]?.rotation.set(-swing * 0.8, 0, -0.12);
      hero.arms[1]?.rotation.set(swing * 0.8, 0, 0.12);
      hero.group.position.y = under + (this.stepTo ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0);
    }
    // With reduced motion, only the hero moves: everyone else holds still.
    for (const someone of this.people) {
      someone.figure?.update(someone === hero || !this.calm ? dt : 0);
    }
    this.heroShadow.position.set(hero.group.position.x, under + 0.03, hero.group.position.z);

    if (!this.calm) {
      this.waterMaterial.uniforms['uTime']!.value = time;
      this.ground.update(time);
      for (const idler of this.idlers) {
        // A model breathes in its own idle; only the shapes bob.
        if (idler.person.figure) continue;
        idler.person.group.position.y = idler.base + Math.sin(time * 1.6 + idler.phase) * 0.012;
      }
      for (const f of this.floaters) {
        f.group.position.y = f.base + Math.sin(time * 1.3 + f.phase) * 0.035;
        f.group.rotation.z = Math.sin(time * 1.1 + f.phase) * 0.04;
      }
      for (const stalk of this.sway) {
        const phase = stalk.userData['phase'] as number;
        stalk.rotation.x = Math.sin(time * 1.4 + phase) * 0.12;
      }
      for (const mark of this.marks.values()) {
        mark.rotation.y = time * 1.6;
        mark.position.y = (mark.userData['base'] as number) + Math.sin(time * 2.4) * 0.08;
      }
      if (this.tapT < 1) {
        this.tapT = Math.min(1, this.tapT + dt * 2.5);
        this.tapRing.scale.setScalar(1 + this.tapT * 0.8);
        (this.tapRing.material as MeshBasicMaterial).opacity = (1 - this.tapT) * 0.8;
      }
    }
    for (let i = this.growing.length - 1; i >= 0; i -= 1) {
      const rising = this.growing[i];
      if (!rising) continue;
      rising.t = Math.min(1, rising.t + dt * 1.6);
      const ease = 1 - (1 - rising.t) ** 3;
      rising.group.position.y = -0.8 * (1 - ease);
      if (rising.t >= 1) this.growing.splice(i, 1);
    }

    // The camera eases after the hero; the sun's shadows follow it.
    const wanted = this.clampTarget(hero.group.position);
    this.cameraTarget.lerp(wanted, 1 - Math.exp(-dt * 5));
    this.placeCamera();
    const timing = this.timing;
    if (timing) mark(`${timing}-start`);
    this.finish.render(dt);
    if (timing) {
      mark(timing);
      this.timing = null;
    }
  }

  /**
   * Where the camera looks: at the hero, but held back from the map's edges
   * by about half of what the view shows across, so the world never runs out
   * on screen. A narrow phone view is held back less, so the hero stays in it.
   */
  private clampTarget(at: Vector3): Vector3 {
    const { width, height } = this.options.map;
    const halfAcross =
      this.cameraDistance() * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const marginX = Math.min(width / 2, Math.max(1.5, halfAcross * 0.75));
    return new Vector3(
      Math.min(width - marginX, Math.max(marginX, at.x)),
      0,
      Math.min(height - 3, Math.max(4, at.z)),
    );
  }

  private cameraDistance(): number {
    const aspect = this.camera.aspect;
    // A phone held upright sees from further back, so the road still fits.
    return aspect < 0.9 ? 17 : aspect < 1.3 ? 15 : 13.5;
  }

  private placeCamera(): void {
    const distance = this.cameraDistance();
    const t = this.cameraTarget;
    // About 40 degrees down: enough to read the ground, low enough to feel
    // like standing in a place rather than looking at a map.
    this.camera.position.set(t.x, t.y + distance * 0.64, t.z + distance * 0.77);
    this.camera.lookAt(t.x, t.y, t.z - 1.2);
    this.sun.position.set(t.x + SUN.x * 22, SUN.y * 22, t.z + SUN.z * 22);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  private fit(): void {
    const parent = this.options.parent;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.finish.setSize(width, height);
    // The first time the view's shape is known, start the camera on the hero
    // rather than easing over from wherever a square view would have put it.
    if (!this.framed) {
      this.framed = true;
      this.cameraTarget.copy(this.clampTarget(this.hero.group.position));
    }
    this.placeCamera();
    if (this.paused) this.finish.render();
  }

  /**
   * What someone stands on: on the bridge the deck, on the jetty its planks,
   * not the river bed far below either.
   */
  private groundUnder(x: number, z: number): number {
    const square = { x: Math.floor(x), y: Math.floor(z) };
    // The jetty first: a square that is both is a jetty plank, not bridge deck.
    if (this.jettyCells.has(`${square.x},${square.y}`)) return JETTY_TOP;
    if (this.description.deck.some((cell) => sameCell(cell, square))) return 0.17;
    return this.ground.heightAt(x, z);
  }

  /** A person standing on a square: on its ground, deck or planks. */
  private standing(cell: Cell): Vector3 {
    const at = centre(cell);
    return at.setY(this.groundUnder(at.x, at.z));
  }
}

/**
 * Marks a step of setting the zone up on the page's performance timeline, as
 * "quest3d:<name>", so a device's load can be measured step by step.
 */
function mark(name: string): void {
  try {
    performance.mark(`quest3d:${name}`);
  } catch {
    /* no timeline to mark */
  }
}

export function createZoneGame(options: ZoneGameOptions): ZoneGame {
  return new Zone3d(options);
}
