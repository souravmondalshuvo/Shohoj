// src/features/quest/game/rendererChoice.ts
//
// Whether a zone is drawn in 3D or in 2D (#981).
//
// 3D is the default wherever the host offers it (the main site does; the
// shell's /quest does not, to keep its bundle small). A student gets the 2D
// zone instead when their browser cannot draw 3D well:
//
//   - it cannot start WebGL 2 at all, or
//   - its WebGL runs in software, with no graphics card behind it (a CI
//     runner, a locked-down lab or office machine): 3D there is a few frames
//     a second, and the 2D zone plays properly.
//
// The address can decide instead: ?quest3d=0 asks for 2D, ?quest3d=1 for 3D
// even on a software renderer (to compare, or to test). A forced 3D zone that
// still fails to start falls back to 2D (QuestScreen).
//
// This module stays free of three.js: it runs before the 3D chunk is fetched,
// so a student who will get 2D never downloads it.

export type RendererAsk = '3d' | '2d' | 'auto';
export type Renderer = '3d' | '2d';

/** What the browser can do, as far as drawing in 3D goes. */
export interface WebGLProbe {
  /** WebGL 2 starts. */
  readonly webgl: boolean;
  /** It runs without a graphics card. */
  readonly software: boolean;
}

/** The names a renderer gives when there is no graphics card behind it. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/** What the page's address asks for: ?quest3d=1 is 3D, ?quest3d=0 is 2D. */
export function askedRenderer(search: string): RendererAsk {
  try {
    const value = new URLSearchParams(search).get('quest3d');
    if (value === '1') return '3d';
    if (value === '0') return '2d';
  } catch {
    /* an address that cannot be read asks for nothing */
  }
  return 'auto';
}

/**
 * How to draw the zone. `offered` is whether the host hands the screen the 3D
 * module; `probe` is only called when the choice is the browser's to make.
 */
export function chooseRenderer(
  asked: RendererAsk,
  offered: boolean,
  probe: () => WebGLProbe,
): Renderer {
  if (!offered || asked === '2d') return '2d';
  if (asked === '3d') return '3d';
  const { webgl, software } = probe();
  return webgl && !software ? '3d' : '2d';
}

/** Whether the renderer of `gl` names itself as one with no graphics card. */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return SOFTWARE_RENDERER.test(name);
  } catch {
    // The name is not ours to read. Most browsers that hide it (Safari) are
    // on capable hardware, and a slow one drops to the low quality level.
    return false;
  }
}

/** Ask this browser, with a throwaway canvas that is given back at once. */
export function probeWebGL(): WebGLProbe {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl: false, software: false };
    const software = isSoftwareRenderer(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, software };
  } catch {
    return { webgl: false, software: false };
  }
}
