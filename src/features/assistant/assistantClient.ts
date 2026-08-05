// src/features/assistant/assistantClient.ts
//
// Pure client for the Shohoj Assistant Worker endpoint (#435, POST
// /api/assistant, worker/index.js handleAssistant). One stateless chat turn:
// the drawer sends the visible transcript plus the new user message and gets
// a single reply string back — no history persists anywhere (an explicit v1
// limitation, documented in the drawer UI).
//
// Mirrors the Worker's transcript contract (≤20 messages, ≤4000 chars each,
// first and last must be user turns) so a payload the client builds is never
// rejected as malformed. Config, token getter, and fetch are injected so the
// module is unit-testable offline (the reviewsWriteRepo pattern).

export interface AssistantMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export const ASSISTANT_MAX_MESSAGES = 20;
export const ASSISTANT_MAX_MESSAGE_CHARS = 4000;

export type AssistantErrorCode =
  'unconfigured' | 'unauthenticated' | 'invalid' | 'rate-limited' | 'unavailable';

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
}

/**
 * Trim a transcript to what the Worker accepts: at most the last
 * ASSISTANT_MAX_MESSAGES entries, starting on a user turn (leading assistant
 * turns left over from the cut are dropped), each within the char limit.
 */
export function clampTranscript(messages: readonly AssistantMessage[]): AssistantMessage[] {
  const sane = messages.filter(
    (m) =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0 &&
      m.content.length <= ASSISTANT_MAX_MESSAGE_CHARS,
  );
  let tail = sane.slice(-ASSISTANT_MAX_MESSAGES);
  while (tail.length > 0 && tail[0].role !== 'user') tail = tail.slice(1);
  return tail;
}

const UNAVAILABLE_MESSAGE = 'The assistant is temporarily unavailable. Please try again in a bit.';

/**
 * Result of the readiness probe (GET /ready on the Worker).
 *
 * `'ready'`        — the Worker reports the Assistant's dependency configured.
 * `'unconfigured'` — the Worker is reachable and says it is NOT configured.
 * `'unknown'`      — the probe itself failed (offline, CORS, 5xx, bad shape).
 *
 * Callers treat `'unknown'` the same as `'unconfigured'` for the purpose of
 * showing the entry point. That is the conservative direction: #455 was a live
 * feature that looked available and failed on every turn, and showing a button
 * we cannot stand behind is worse than briefly hiding one that works. The probe
 * is cheap and re-runs on mount, so a transient blip self-heals on navigation.
 */
export type AssistantAvailability = 'ready' | 'unconfigured' | 'unknown';

export interface AssistantCapabilityOptions {
  readonly workerUrl: string | null | undefined;
  readonly fetchImpl?: typeof fetch;
  /** Abort signal so an unmounting component can cancel the probe. */
  readonly signal?: AbortSignal;
}

/**
 * Ask the Worker whether the Assistant's backend dependency is configured.
 *
 * Unauthenticated on purpose: readiness is not user-specific, so the probe can
 * run before/without a token and the endpoint exposes booleans only — never key
 * material. See `readinessReport()` in worker/index.js.
 */
export async function fetchAssistantAvailability(
  options: AssistantCapabilityOptions,
): Promise<AssistantAvailability> {
  const { workerUrl, fetchImpl = fetch, signal } = options;
  if (!workerUrl) return 'unconfigured';

  let res: Response;
  try {
    res = await fetchImpl(`${workerUrl.replace(/\/$/, '')}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch {
    return 'unknown';
  }
  if (!res.ok) return 'unknown';

  const body = (await res.json().catch(() => null)) as {
    capabilities?: { assistant?: unknown };
  } | null;
  const configured = body?.capabilities?.assistant;
  if (typeof configured !== 'boolean') return 'unknown';
  return configured ? 'ready' : 'unconfigured';
}

/** POST one chat turn to the Worker; maps transport/HTTP failures to typed codes. */
export async function sendAssistantTurn(
  transcript: readonly AssistantMessage[],
  options: AssistantClientOptions,
): Promise<AssistantTurnResult> {
  const { workerUrl, getToken, fetchImpl = fetch } = options;
  if (!workerUrl) {
    return {
      ok: false,
      code: 'unconfigured',
      error: 'The assistant is not configured on this build.',
    };
  }

  const messages = clampTranscript(transcript);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return { ok: false, code: 'invalid', error: 'Type a question to ask the assistant.' };
  }

  let token: string | null;
  try {
    token = await getToken();
  } catch {
    token = null;
  }
  if (!token) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in to use the assistant.' };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${workerUrl.replace(/\/$/, '')}/api/assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
  } catch {
    return { ok: false, code: 'unavailable', error: UNAVAILABLE_MESSAGE };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { reply?: unknown } | null;
    if (body && typeof body.reply === 'string' && body.reply.trim()) {
      return { ok: true, reply: body.reply };
    }
    return { ok: false, code: 'unavailable', error: UNAVAILABLE_MESSAGE };
  }
  if (res.status === 401) {
    return {
      ok: false,
      code: 'unauthenticated',
      error: 'Your session expired — sign in again to continue.',
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      code: 'rate-limited',
      error: 'Slow down a little — try again in a minute.',
    };
  }
  if (res.status === 400) {
    return {
      ok: false,
      code: 'invalid',
      error: 'That message could not be sent. Try rephrasing it.',
    };
  }
  return { ok: false, code: 'unavailable', error: UNAVAILABLE_MESSAGE };
}
