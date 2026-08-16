// js/core/assistantMorph.d.ts
//
// Typed boundary for the Assistant's pill→panel morph (js/core/assistantMorph.js),
// following the assistantClient.d.ts precedent: the implementation is vanilla JS
// because it ships in the build3.py bundle, and the shell imports the same
// module through this declaration, so the two front-ends share one set of
// timings and one piece of geometry. Declaration only — intentionally outside
// the tsconfig `include`, pulled in as an import dependency.

export interface AssistantMorphRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export declare const ASSISTANT_MORPH_OPEN_MS: number;
export declare const ASSISTANT_MORPH_CLOSE_MS: number;

export declare function pillClipPath(
  panelRect: AssistantMorphRect,
  pillRect: AssistantMorphRect,
): string;

export declare function panelClipPath(radius: string): string;

export declare function canMorphPanel(panel: Element | null, win?: Window): boolean;

export declare function morphPanel(
  panel: HTMLElement,
  pillRect: AssistantMorphRect | null,
  direction: 'open' | 'close',
): Animation | null;
