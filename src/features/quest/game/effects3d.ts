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

import {
  HalfFloatType,
  PMREMGenerator,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
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

/** Draws a frame, with or without the finishing passes. */
export class Finish {
  private composer: EffectComposer | null = null;
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
    this.tiltH = null;
    this.tiltV = null;
  }

  dispose(): void {
    this.dropComposer();
  }
}
