/**
 * The frame after the scene is drawn (#996): multisampled, then ambient
 * occlusion, then tone mapping.
 *
 * Ambient occlusion is what makes a model sit on the ground — the soft dark
 * where a wall meets the earth, under the eaves, between balconies, inside
 * the groves. It is computed from the scene's own depth buffer (normals
 * reconstructed from it), not from a second render with a plain material, so
 * leaf cards occlude in the shape of their leaves rather than as squares. It
 * is limited to the mapped area, where the depth buffer is precise enough.
 *
 * A small or low-powered screen skips the occlusion and keeps only the
 * multisampling; the scene is the same.
 */

import {
  Box3,
  type Camera,
  DepthTexture,
  FloatType,
  HalfFloatType,
  type Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

export interface Post {
  render(): void;
  /** CSS pixels; the renderer's pixel ratio is applied. */
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: { ao: boolean; clip: { min: Vector3; max: Vector3 } },
): Post {
  const size = renderer.getDrawingBufferSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, {
    type: HalfFloatType,
    samples: 4,
    depthTexture: new DepthTexture(size.x, size.y, FloatType),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let gtao: GTAOPass | null = null;
  if (options.ao) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    // The scene pass always draws into the composer's read buffer (it does
    // not swap, and the two passes after it swap twice), so its depth is the
    // G-buffer.
    gtao.setGBuffer(composer.readBuffer.depthTexture ?? undefined);
    gtao.updateGtaoMaterial({ radius: 4.5, distanceExponent: 1.4, thickness: 4, scale: 1.7, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.95;
    gtao.setSceneClipBox(new Box3(options.clip.min, options.clip.max));
    composer.addPass(gtao);
  }
  composer.addPass(new OutputPass());
  return {
    render() {
      composer.render();
    },
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    dispose() {
      gtao?.dispose();
      composer.dispose();
      composer.renderTarget1.depthTexture?.dispose();
      composer.renderTarget2.depthTexture?.dispose();
    },
  };
}
