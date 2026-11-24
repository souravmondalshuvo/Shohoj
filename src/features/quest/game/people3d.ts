// src/features/quest/game/people3d.ts
//
// The people of the 3D zone (#981): modelled, rigged and animated bodies in
// place of the block figures zoneGame3d.ts builds from shapes.
//
// The bodies are Quaternius's CC0 Universal Base Characters and the movement
// his CC0 Universal Animation Library, on one shared skeleton. Both are turned
// into two small files by scripts/build_quest_people.sh: a man, who also
// carries the animations, and a woman. Neither has a texture. Each body vertex
// instead says which part of the body it is (in its colour's red channel) and
// how light or dark the skin is there (green), and this module dresses every
// person from their outfit: a shirt is torso and upper arms in one colour, a
// lungi rolled to the knee is hips and thighs, a sari's end is its own band.
//
// The files are fetched only when the 3D zone opens, gzipped, and gunzipped by
// the browser itself (as the Campus Map's building is): no WebAssembly, no
// blob: images, nothing the page's Content-Security-Policy does not already
// allow. If they cannot be loaded, the zone keeps its block figures.

import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import { fetchExteriorGlb } from '../../campus/campusModel.ts';
import manUrl from '../assets/people/man.glb.gz?url';
import womanUrl from '../assets/people/woman.glb.gz?url';

/** Metres in the files to squares in the zone: a man is about 1.15 squares tall. */
export const PEOPLE_SCALE = 0.66;

/** The jog's own speed, in squares a second at PEOPLE_SCALE (5.26 m/s in the file). */
export const JOG_SPEED = 5.26 * PEOPLE_SCALE;

export type Build = 'man' | 'woman';
export type Clip = 'idle' | 'talk' | 'sit' | 'kneel';

const CLIP_NAMES: Readonly<Record<Clip | 'jog', string>> = {
  idle: 'Idle_Loop',
  talk: 'Idle_Talking_Loop',
  sit: 'Sitting_Idle_Loop',
  kneel: 'Fixing_Kneeling',
  jog: 'Jog_Fwd_Loop',
};

/** How someone is dressed and what they are doing. */
export interface Outfit {
  readonly build: Build;
  readonly skin: string;
  /** Shirt, vest or blouse: the torso and the upper arms. */
  readonly top: string;
  /** Lungi, sari or trousers: hips and thighs, and the calves unless rolled. */
  readonly lower: string;
  /**
   * How the lower half is worn. "skirt": a lungi or a sari's skirt to the
   * ankle (only for people who stand: it hangs from the hips). "rolled": a
   * lungi folded up to the knee. "trousers": to the ankle.
   */
  readonly legs: 'skirt' | 'rolled' | 'trousers';
  readonly hair: string;
  /** A hairstyle in the build's file, or none. */
  readonly hairstyle: string | null;
  readonly beard?: boolean;
  /** A sari's end, over the left shoulder (woman). */
  readonly pallu?: string;
  /** A straw hat. */
  readonly hat?: string;
  /** A cane stool to sit on (with the "sit" clip). */
  readonly stool?: string;
  readonly clip: Clip;
}

/** One person: a model to place, and its animation to advance. */
export interface Figure {
  /** Put this in the person's group: the zone moves and turns the group. */
  readonly root: Object3D;
  /**
   * How fast the person is moving, in squares a second; 0 is standing. A
   * moving person jogs, at a pace that matches their speed.
   */
  move(speed: number): void;
  update(dt: number): void;
}

export interface People {
  figure(outfit: Outfit): Figure;
  dispose(): void;
}

// Parts of the body, as scripts/quest_people_export.py numbers them.
const enum Part {
  Head = 1,
  Hand = 2,
  Forearm = 3,
  UpperArm = 4,
  Torso = 5,
  Hips = 6,
  Thigh = 7,
  Calf = 8,
  Foot = 9,
  Pallu = 10,
}

/** The model files, fetched and parsed, ready to be copied per person. */
interface Source {
  readonly scene: Group;
  readonly parts: Uint8Array;
  readonly detail: Float32Array;
}

/**
 * Only rotations, and the pelvis's position: the two bodies have different
 * bone lengths, and the clips were made on a third. Rotations fit all of them;
 * a bone moved to another body's length would pull the mesh out of shape.
 */
function fitClip(clip: AnimationClip): AnimationClip {
  clip.tracks = clip.tracks.filter(
    (track) => track.name.endsWith('.quaternion') || track.name === 'pelvis.position',
  );
  return clip;
}

function readSource(scene: Group): Source {
  const body = scene.getObjectByName('Body');
  if (!(body instanceof SkinnedMesh)) throw new Error('people: no Body in the model');
  const colour = body.geometry.getAttribute('color');
  if (!colour) throw new Error('people: the Body has no parts');
  const parts = new Uint8Array(colour.count);
  const detail = new Float32Array(colour.count);
  for (let i = 0; i < colour.count; i += 1) {
    parts[i] = Math.round(colour.getX(i) * 15);
    // The skin texture's shading, softened: lips and brows, not blotches.
    detail[i] = 1 + (colour.getY(i) * 1.5 - 1) * 0.7;
  }
  return { scene, parts, detail };
}

/** Load both builds. Rejects if either cannot be fetched or read. */
export async function loadPeople(signal?: AbortSignal): Promise<People> {
  const loader = new GLTFLoader();
  const [man, woman] = await Promise.all(
    [manUrl, womanUrl].map(async (url) =>
      loader.parseAsync(await fetchExteriorGlb(url, signal), ''),
    ),
  );
  if (!man || !woman) throw new Error('people: a model is missing');
  const clips = new Map<string, AnimationClip>();
  for (const clip of man.animations) clips.set(clip.name, fitClip(clip));
  for (const name of Object.values(CLIP_NAMES)) {
    if (!clips.has(name)) throw new Error(`people: no ${name} clip`);
  }
  return new PeopleKit({ man: readSource(man.scene), woman: readSource(woman.scene) }, clips);
}

class PeopleKit implements People {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly owned: { dispose(): void }[] = [];

  constructor(
    private readonly sources: Readonly<Record<Build, Source>>,
    private readonly clips: ReadonlyMap<string, AnimationClip>,
  ) {}

  private material(colour: string, vertexColors = false): MeshStandardMaterial {
    const id = `${colour}|${vertexColors}`;
    let material = this.materials.get(id);
    if (!material) {
      material = new MeshStandardMaterial({ color: colour, roughness: 0.82, vertexColors });
      this.materials.set(id, material);
      this.owned.push(material);
    }
    return material;
  }

  private dressBody(source: Source, body: SkinnedMesh, outfit: Outfit): void {
    const skin = new Color(outfit.skin);
    const top = new Color(outfit.top);
    const lower = new Color(outfit.lower);
    const pallu = new Color(outfit.pallu ?? outfit.top);
    const colours = new Float32Array(source.parts.length * 3);
    const tint = new Color();
    for (let i = 0; i < source.parts.length; i += 1) {
      const part = source.parts[i];
      let fabric: Color | null = null;
      if (part === Part.Torso || part === Part.UpperArm) fabric = top;
      else if (part === Part.Pallu) fabric = pallu;
      else if (part === Part.Hips || part === Part.Thigh) fabric = lower;
      else if (part === Part.Calf && outfit.legs !== 'rolled') fabric = lower;
      if (fabric) tint.copy(fabric);
      else tint.copy(skin).multiplyScalar(source.detail[i] ?? 1);
      tint.toArray(colours, i * 3);
    }
    // Everything but the colours is shared with the file's copy.
    const shared = body.geometry;
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(shared.attributes)) {
      if (name !== 'color') geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(shared.index);
    geometry.setAttribute('color', new BufferAttribute(colours, 3));
    geometry.boundingSphere = shared.boundingSphere;
    geometry.boundingBox = shared.boundingBox;
    this.owned.push(geometry);
    body.geometry = geometry;
    body.material = this.material('#ffffff', true);
  }

  figure(outfit: Outfit): Figure {
    const source = this.sources[outfit.build];
    const model = cloneSkinned(source.scene) as Group;
    model.scale.setScalar(PEOPLE_SCALE);
    const root = new Group();
    root.add(model);

    const hairstyles = new Set([outfit.hairstyle, outfit.beard ? 'Hair_Beard' : null]);
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const name = node.name;
      if (name === 'Body' && node instanceof SkinnedMesh) this.dressBody(source, node, outfit);
      else if (name === 'Eyes') node.material = this.material('#ffffff', true);
      else if (name === 'Brows') node.material = this.material(outfit.hair);
      else if (name === 'Skirt') {
        node.visible = outfit.legs === 'skirt';
        node.material = this.material(outfit.lower);
      } else if (name.startsWith('Hair_')) {
        node.visible = hairstyles.has(name);
        node.material = this.material(outfit.hair);
      }
    });

    if (outfit.hat) this.hat(model, outfit.hat);
    if (outfit.stool) root.add(this.stool(outfit.stool));

    const mixer = new AnimationMixer(model);
    const play = (name: string): AnimationAction => {
      const clip = this.clips.get(name);
      if (!clip) throw new Error(`people: no ${name} clip`);
      const action = mixer.clipAction(clip);
      action.setLoop(LoopRepeat, Infinity);
      action.play();
      return action;
    };
    const rest = play(CLIP_NAMES[outfit.clip]);
    // Each person starts somewhere else in their loop, so a crowd is not in step.
    rest.time = Math.random() * rest.getClip().duration;
    let jog: AnimationAction | null = null;
    let moving = 0;
    let speed = 0;

    return {
      root,
      move: (value: number) => {
        speed = value;
        if (value > 0 && !jog) {
          jog = play(CLIP_NAMES.jog);
          jog.weight = 0;
        }
      },
      update: (dt: number) => {
        // Ease between standing and jogging rather than snapping.
        const target = speed > 0 ? 1 : 0;
        moving += (target - moving) * (1 - Math.exp(-dt * 12));
        if (jog) {
          jog.weight = moving;
          jog.timeScale = speed > 0 ? speed / JOG_SPEED : jog.timeScale;
          rest.weight = 1 - moving;
        }
        mixer.update(dt);
      },
    };
  }

  /** A bamboo-and-straw hat, on the head bone so it moves with the head. */
  private hat(model: Group, colour: string): void {
    const head = model.getObjectByName('Head');
    if (!head) return;
    const geometry = new ConeGeometry(0.32, 0.17, 14);
    this.owned.push(geometry);
    const hat = new Mesh(geometry, this.material(colour));
    hat.castShadow = true;
    // Placed in the model's own rest pose, then handed to the head, which
    // keeps it where it is: just above the crown, whatever the bone's axes.
    model.updateMatrixWorld(true);
    model.add(hat);
    const crown = head.getWorldPosition(hat.position.clone());
    model.worldToLocal(crown);
    hat.position.set(0, crown.y + 0.2, crown.z + 0.01);
    head.attach(hat);
  }

  /** A low cane stool (mora), for someone sitting by the water. */
  private stool(colour: string): Mesh {
    const geometry = new CylinderGeometry(0.13, 0.15, 0.27, 12);
    this.owned.push(geometry);
    const stool = new Mesh(geometry, this.material(colour));
    stool.position.set(0, 0.135, -0.06);
    stool.castShadow = true;
    stool.receiveShadow = true;
    return stool;
  }

  dispose(): void {
    for (const thing of this.owned) thing.dispose();
    this.owned.length = 0;
    this.materials.clear();
    for (const source of Object.values(this.sources)) {
      source.scene.traverse((node) => {
        if (node instanceof Mesh) {
          (node.geometry as BufferGeometry).dispose();
          const materials: Material[] = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) material.dispose();
        }
      });
    }
  }
}
