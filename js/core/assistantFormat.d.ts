// js/core/assistantFormat.d.ts
//
// Typed boundary for the Assistant reply formatter (js/core/assistantFormat.js),
// following the assistantClient.d.ts precedent: the implementation is vanilla JS
// because it ships in the build3.py bundle, and the shell imports the same
// module through this declaration, so both front-ends strip and render markdown
// identically. Declaration only — intentionally outside the tsconfig `include`,
// pulled in as an import dependency.
//
// The shell only ever needs the parser: it maps blocks to JSX itself, and never
// calls renderAssistantReply, which exists for the legacy DOM front-end.

export interface AssistantSpan {
  readonly text: string;
  readonly bold: boolean;
}

export interface AssistantParagraphBlock {
  readonly type: 'p';
  readonly spans: readonly AssistantSpan[];
}

export interface AssistantListBlock {
  readonly type: 'ul' | 'ol';
  readonly items: readonly (readonly AssistantSpan[])[];
}

export type AssistantBlock = AssistantParagraphBlock | AssistantListBlock;

export declare function parseSpans(line: string): AssistantSpan[];

export declare function parseAssistantReply(text: string): AssistantBlock[];

export declare function renderAssistantReply(text: string, doc?: Document): DocumentFragment;
