// src/features/quest/game/effects3d.ts
//
// How the 3D zone is lit and finished (#981): the sky's light on everything,
// and on a capable screen a few passes after the scene is drawn.
//
//   Sky light     three.js's physical sky, with the sun low in the west, is
//                 rendered once into an environment map. Every surface takes
//                 its ambient light from it, so shade is blue-ish from the sky
//                 and light is warm from the sun, as late afternoon is.
//   Ambient       GTAO darkens where things meet: a hut's foot on the ground,
//   occlusion     the underside of a canopy, the gap between bamboo poles.
//                 More than anything, it is what makes a scene look solid.
//   Bloom         Only what is brighter than the scene's whites glows: the
//                 lanterns, the sun's glints on the river.
//   Tilt-shift    The top and bottom of the view soften, as a photograph of a
//                 miniature does. The middle, where the hero walks, is sharp.
//   Grade         Warmer, slightly richer colour and a soft vignette.
//
// Quality: "high" is all of the above. "low" draws the scene straight to the
// screen with the sky light only. A touch screen, a software renderer (no
// graphics card: a CI runner, a locked-down laptop; it only gets 3D when
// ?quest3d=1 forces it) or ?quest3dq=low gets "low"; so does any device whose frames run slow for about three seconds on
// "high" (a device that does not name its renderer starts on "high").
// ?quest3dq=high forces "high".
//
// No textures are fetched and nothing is compiled outside the graphics card,
// so the page's Content-Security-Policy needs nothing new.
//
// Compiling ahead (Finish.compile). A shader three.js has not built when a
// frame first needs it is built then, and the page stops until it is: on a
// first visit, with no shader cached, about 2 s on a laptop on "high". So the
// zone compiles everything before its first frame, keyed exactly as the frame
// will ask for it. On "high" that is not what compileAsync(scene) gives:
// the scene is drawn into the composer's buffer, not the screen (no tone
// mapping, linear colour: different shaders); GTAO draws it again in its own
// normal material, which compile() never sees (it ignores overrideMaterial);
// and each pass has full-screen shaders of its own.

import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  ColorManagement,
  CustomToneMapping,
  Group,
  HalfFloatType,
  LinearToneMapping,
  Mesh,
  NeutralToneMapping,
  PlaneGeometry,
  ReinhardToneMapping,
  ShaderMaterial,
  SRGBTransfer,
  PMREMGenerator,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

import type { Quality } from './ground3d.ts';
import { isSoftwareRenderer } from './rendererChoice.ts';

/** The quality to start at, from the device and the address. */
export function pickQuality(renderer: WebGLRenderer, coarse: boolean): Quality {
  try {
    const asked = new URLSearchParams(window.location.search).get('quest3dq');
    if (asked === 'high' || asked === 'low') return asked;
  } catch {
    /* no address to read */
  }
  if (coarse) return 'low';
  // Reached on a software renderer only when the address forced 3D
  // (?quest3d=1): by default such a browser gets the 2D zone.
  if (isSoftwareRenderer(renderer.getContext())) return 'low';
  // A device that does not say what it is starts on "high": Safari often hides
  // the name, and most of those are capable Macs. A slow one is moved to
  // "low" after about three seconds of slow frames (Finish.render).
  return 'high';
}

/**
 * The sky, rendered once into an environment map that lights the scene.
 * `sun` points from the ground towards the sun.
 */
export function skyLight(renderer: WebGLRenderer, sun: Vector3): WebGLRenderTarget {
  const sky = new Sky();
  sky.scale.setScalar(100);
  const uniforms = sky.material.uniforms;
  uniforms['turbidity']!.value = 5;
  uniforms['rayleigh']!.value = 1.8;
  uniforms['mieCoefficient']!.value = 0.006;
  uniforms['mieDirectionalG']!.value = 0.82;
  uniforms['sunPosition']!.value.copy(sun);
  const scene = new Scene();
  scene.add(sky);
  const pmrem = new PMREMGenerator(renderer);
  // The render target, not just its texture: the caller must dispose the
  // target to free its framebuffer when the zone closes.
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  return target;
}

/** Warmth, richness and a soft vignette, after tone mapping. */
const GradeShader = {
  name: 'QuestGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.12 },
    uWarmth: { value: 0.035 },
    uVignette: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uWarmth;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      float grey = dot(colour.rgb, vec3(0.299, 0.587, 0.114));
      colour.rgb = mix(vec3(grey), colour.rgb, uSaturation);
      colour.rgb += vec3(uWarmth, uWarmth * 0.45, -uWarmth * 0.6);
      vec2 centred = vUv - 0.5;
      colour.rgb *= 1.0 - uVignette * smoothstep(0.32, 0.85, length(centred * vec2(1.15, 1.0)));
      gl_FragColor = colour;
    }
  `,
};

/** The defines OutputPass gives its shader for this renderer (as in its render()). */
function outputDefines(renderer: WebGLRenderer): Record<string, string> {
  const defines: Record<string, string> = {};
  if (ColorManagement.getTransfer(renderer.outputColorSpace) === SRGBTransfer) {
    defines['SRGB_TRANSFER'] = '';
  }
  const tone = TONE_MAPPING_DEFINES.get(renderer.toneMapping);
  if (tone) defines[tone] = '';
  return defines;
}

const TONE_MAPPING_DEFINES = new Map<ToneMapping, string>([
  [LinearToneMapping, 'LINEAR_TONE_MAPPING'],
  [ReinhardToneMapping, 'REINHARD_TONE_MAPPING'],
  [CineonToneMapping, 'CINEON_TONE_MAPPING'],
  [ACESFilmicToneMapping, 'ACES_FILMIC_TONE_MAPPING'],
  [AgXToneMapping, 'AGX_TONE_MAPPING'],
  [NeutralToneMapping, 'NEUTRAL_TONE_MAPPING'],
  [CustomToneMapping, 'CUSTOM_TONE_MAPPING'],
]);

/** The full-screen shaders a pass holds: its own fields, and lists of them. */
function shaderMaterials(pass: object): ShaderMaterial[] {
  const found = new Set<ShaderMaterial>();
  for (const value of Object.values(pass)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item instanceof ShaderMaterial) found.add(item);
    }
  }
  return [...found];
}

/** Draws a frame, with or without the finishing passes. */
export class Finish {
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  /** The passes' own shaders are compiled once; the scene's, per call. */
  private passesCompiled = false;
  private tiltH: ShaderPass | null = null;
  private tiltV: ShaderPass | null = null;
  /** Seconds spent on slow frames lately, less a little for each quick one. */
  private slowTime = 0;
  private size = new Vector2(1, 1);

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
    private quality: Quality,
    private readonly onQuality: (quality: Quality) => void = () => undefined,
  ) {
    if (quality === 'high') this.buildComposer();
  }

  get level(): Quality {
    return this.quality;
  }

  private buildComposer(): void {
    const { x: width, y: height } = this.size;
    const target = new WebGLRenderTarget(width, height, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const gtao = new GTAOPass(this.scene, this.camera, width, height);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({
      radius: 0.55,
      distanceExponent: 1.4,
      thickness: 1.2,
      scale: 1,
      samples: 12,
    });
    composer.addPass(gtao);
    this.gtao = gtao;
    composer.addPass(new UnrealBloomPass(new Vector2(width, height), 0.18, 0.4, 1.6));
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    composer.addPass(this.tiltH);
    composer.addPass(this.tiltV);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    this.composer = composer;
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    this.size.set(width, height);
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    // Blur grows towards the top and bottom; the focus band is the middle.
    const blur = 3.0;
    if (this.tiltH) {
      this.tiltH.uniforms['h']!.value = blur / width;
      this.tiltH.uniforms['r']!.value = 0.52;
    }
    if (this.tiltV) {
      this.tiltV.uniforms['v']!.value = blur / height;
      this.tiltV.uniforms['r']!.value = 0.52;
    }
  }

  /**
   * Compile the shaders drawing `root` will need, as the next frame will ask
   * for them (see "Compiling ahead" above). `root` is the scene, or a group
   * about to join it (its lights and fog are the scene's). Where the browser
   * compiles in the background (KHR_parallel_shader_compile), the page stays
   * responsive until this settles.
   */
  async compile(root: Object3D): Promise<void> {
    const { renderer, camera, scene, composer } = this;
    if (!composer) {
      await renderer.compileAsync(root, camera, scene);
      return;
    }
    // three keys a shader by the render target bound when it is compiled.
    const previous = renderer.getRenderTarget();
    const jobs: Promise<unknown>[] = [];
    try {
      renderer.setRenderTarget(composer.readBuffer);
      // As RenderPass draws it.
      jobs.push(renderer.compileAsync(root, camera, scene));
      // As GTAO draws it: every mesh in the normal material.
      if (this.gtao) jobs.push(this.compileIn(root, this.gtao.normalMaterial));
      if (!this.passesCompiled) {
        this.passesCompiled = true;
        jobs.push(this.compilePasses(composer, previous));
      }
    } finally {
      renderer.setRenderTarget(previous);
    }
    await Promise.all(jobs);
  }

  /** compileAsync(root), with every mesh in `material` for the call. */
  private compileIn(root: Object3D, material: Material): Promise<unknown> {
    const own: [Mesh, Mesh['material']][] = [];
    root.traverse((object) => {
      if (object instanceof Mesh) {
        own.push([object, object.material]);
        object.material = material;
      }
    });
    // compile() runs within the call; only the wait for the GPU is later.
    try {
      return this.renderer.compileAsync(root, this.camera, this.scene);
    } finally {
      for (const [mesh, material] of own) mesh.material = material;
    }
  }

  /**
   * Every pass's full-screen shaders: the last pass's as drawn to the screen
   * (`screen`, the target bound outside the composer), the rest into a buffer.
   */
  private compilePasses(
    composer: EffectComposer,
    screen: WebGLRenderTarget | null,
  ): Promise<unknown> {
    const { renderer, camera } = this;
    const quad = new PlaneGeometry(2, 2);
    const offscreen = new Group();
    const onscreen = new Group();
    const passes = composer.passes.filter((pass) => pass.enabled);
    passes.forEach((pass, index) => {
      // OutputPass sets its defines inside its first render(), from the
      // renderer. The same defines now let that frame reuse this shader.
      if (pass instanceof OutputPass) pass.material.defines = outputDefines(renderer);
      const into = index === passes.length - 1 ? onscreen : offscreen;
      for (const material of shaderMaterials(pass)) into.add(new Mesh(quad, material));
    });
    const empty = new Scene();
    const jobs: Promise<unknown>[] = [];
    renderer.setRenderTarget(composer.readBuffer);
    jobs.push(renderer.compileAsync(offscreen, camera, empty));
    renderer.setRenderTarget(screen);
    jobs.push(renderer.compileAsync(onscreen, camera, empty));
    return Promise.all(jobs).finally(() => quad.dispose());
  }

  /** Draw a frame. `dt` is the last frame's length, for noticing a slow device. */
  render(dt = 0): void {
    if (this.composer) {
      this.composer.render(dt);
      // A device that cannot keep up with "high" for about three seconds is
      // moved to "low" for the rest of the visit. Counted in time, not frames:
      // at 10 frames a second, three seconds is thirty frames, not ninety.
      if (dt > 0.045) this.slowTime += dt;
      else this.slowTime = Math.max(0, this.slowTime - dt * 2);
      if (this.slowTime > 3) this.lower();
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private lower(): void {
    if (this.quality === 'low') return;
    this.quality = 'low';
    this.dropComposer();
    this.onQuality('low');
  }

  /**
   * Free everything the passes hold on the graphics card, then the composer.
   * The composer's own dispose() frees only its buffers; GTAO and bloom keep
   * render targets and materials of their own, and on a device moved to "low"
   * for being slow, that memory is exactly what it needs back.
   */
  private dropComposer(): void {
    const composer = this.composer;
    if (!composer) return;
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
    this.composer = null;
    this.gtao = null;
    this.passesCompiled = false;
    this.tiltH = null;
    this.tiltV = null;
  }

  dispose(): void {
    this.dropComposer();
  }
}
