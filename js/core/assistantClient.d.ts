// js/core/assistantClient.d.ts
//
// Typed boundary for the Shohoj Assistant transport (js/core/assistantClient.js),
// following the catalogue precedent (js/core/catalog.d.ts): the client is
// authored in vanilla JS because it ships in the production build3.py bundle,
// and the Vite/React shell imports the same implementation through this
// declaration (see src/features/assistant/assistantClient.ts), so there is
// exactly ONE client-side implementation of the Worker contract. This file is a
// declaration only; it is intentionally outside the tsconfig `include` and is
// pulled in as an import dependency.

export interface AssistantMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export type AssistantErrorCode =
  | 'unconfigured'
  | 'unauthenticated'
  | 'invalid'
  | 'rate-limited'
  | 'unavailable';

export type AssistantTurnResult =
  | { readonly ok: true; readonly reply: string }
  | { readonly ok: false; readonly code: AssistantErrorCode; readonly error: string };

export interface AssistantClientOptions {
  /** The Worker base URL (config.papersWorkerUrl). */
  readonly workerUrl: string | null | undefined;
  /** Current Firebase ID token, or null when signed out / unavailable. */
  readonly getToken: () => Promise<string | null>;
  /** Injectable fetch (tests); defaults to the global. */
  readonly fetchImpl?: typeof fetch;
  /**
   * The student's own Routine Builder picks, sent so the Worker's routine tool
   * has something to answer from — they live in this browser only, never in the
   * cloud snapshot the Worker reads (#543). Omit when nothing is picked.
   */
  readonly routine?: { readonly picks: Record<string, number | null> } | null;
}

/**
 * Result of the readiness probe (GET /ready on the Worker).
 *
 * `'ready'`        — the Worker reports the Assistant's dependency configured.
 * `'unconfigured'` — the Worker is reachable and says it is NOT configured.
 * `'unknown'`      — the probe itself failed (offline, CORS, 5xx, bad shape).
 */
export type AssistantAvailability = 'ready' | 'unconfigured' | 'unknown';

export interface AssistantCapabilityOptions {
  readonly workerUrl: string | null | undefined;
  readonly fetchImpl?: typeof fetch;
  /** Abort signal so an unmounting component can cancel the probe. */
  readonly signal?: AbortSignal;
}

export const ASSISTANT_MAX_MESSAGES: number;
export const ASSISTANT_MAX_MESSAGE_CHARS: number;

export function clampTranscript(messages: readonly AssistantMessage[]): AssistantMessage[];

export function fetchAssistantAvailability(
  options: AssistantCapabilityOptions,
): Promise<AssistantAvailability>;

export function sendAssistantTurn(
  transcript: readonly AssistantMessage[],
  options: AssistantClientOptions,
): Promise<AssistantTurnResult>;

export function examplePromptsForTab(tabId: string | null | undefined): readonly string[];
