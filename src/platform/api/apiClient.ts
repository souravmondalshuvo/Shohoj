// src/platform/api/apiClient.ts
//
// The one place Shohoj talks to its own API (#710).
//
// Before this there was no such place. `papersRepo.ts` builds its own URLs and
// calls `fetch` directly; `js/core/assistantClient.js` does the same; each
// invents its own error handling and its own idea of what a failure looks like.
// That was survivable for two endpoints. Shohoj Tasks is a dozen across four
// entities, and it is the feature whose API contract is expected to outlive its
// backend — see docs/architecture/decisions/0002-*.md. Scattering `fetch` calls
// through components would make that swap a search-and-replace across the app
// instead of a change to one module.
//
// So this module holds, in one place:
//
//   * the base URL, from validated runtime config;
//   * the Firebase ID token, attached to exactly the requests that need it;
//   * the decision that a request needing auth without a token fails BEFORE it
//     reaches the network, rather than arriving unauthenticated;
//   * response validation — every body is `unknown` until a Zod schema accepts
//     it, per the rule in src/shared/validation/schema.ts;
//   * the mapping from HTTP status and transport failure onto the typed error
//     hierarchy in src/core/errors.ts, so callers branch on `code` and always
//     have a `userMessage` that is safe to display.
//
// Everything is injected — `fetch`, the token getter, the clock's timeout — so
// this is unit-testable with no network and no browser.
//
// NOT in scope here: caching, retries, request deduplication. Those belong to
// whatever server-state layer sits above (TanStack Query, or the existing
// provider pattern). A transport that also caches is a transport nobody can
// reason about.

import { NotFoundError, PermissionError, ShohojError, WorkerError } from '../../core/errors.ts';
import { type Result, err, ok } from '../../core/result.ts';
import { validate, z } from '../../shared/validation/schema.ts';

/** The versioned API prefix. Every path this client takes is relative to it. */
export const API_V1_PREFIX = '/api/v1';

/**
 * Error codes the API's own envelope can carry, mirroring
 * `API_ERROR_CODES` in worker/apiV1.js.
 *
 * Duplicated rather than imported because the Worker is a separate npm package
 * built for a different runtime, and the shell must not pull its module graph
 * into the browser bundle. The set is small, closed and slow-moving; the
 * response schema below is what actually enforces agreement at runtime, and an
 * unrecognised code degrades to a generic failure rather than a crash.
 */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  /** A dependency Shohoj does not control is down, or a spend ceiling is reached. */
  | 'unavailable'
  | 'internal';

/**
 * How a request relates to the signed-in student.
 *
 * `required` — the default, and the right answer for every /api/v1 endpoint
 * that exists today. Without a token the call fails locally; it is never sent.
 * `none` — public endpoints (`/health`, `/ready`, the semester archive). No
 * Authorization header is attached even if a token happens to be available.
 */
export type AuthMode = 'required' | 'none';

export interface ApiRequestOptions {
  /** Defaults to `'required'`. */
  readonly auth?: AuthMode;
  /** Query parameters. Undefined and null values are omitted, not stringified. */
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /** Abort the request from the caller's side (component unmount, navigation). */
  readonly signal?: AbortSignal;
}

export interface ApiClientOptions {
  /**
   * Absolute origin of the API, without a trailing slash — the Worker URL from
   * validated runtime config (`papersWorkerUrl`). The config schema already
   * guarantees it is an absolute http(s) URL, which is what keeps this from
   * being a place a bearer token could be sent somewhere unintended.
   */
  readonly baseUrl: string;
  /** The current Firebase ID token, or null when signed out. Never throws. */
  readonly getIdToken: () => Promise<string | null>;
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetchFn?: typeof fetch;
  /**
   * Abandon a request after this long. A student on campus wifi that has
   * silently stopped forwarding packets should see "couldn't reach the server"
   * in a few seconds, not a spinner that never resolves.
   */
  readonly timeoutMs?: number;
}

export interface ApiClient {
  get<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<Result<T, ShohojError>>;
  post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<Result<T, ShohojError>>;
  patch<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<Result<T, ShohojError>>;
  /**
   * PUT, for endpoints that set a value rather than merge a change — a task's
   * completion, say. Distinct from PATCH because it is idempotent by contract:
   * sending it twice is the same as sending it once, which is what a retried
   * checkbox needs.
   */
  put<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<Result<T, ShohojError>>;
  /**
   * DELETE. Takes a schema like the rest: the API answers deletions with a body
   * (the deleted id, or the updated parent), and a method that silently
   * discarded it would make that unreachable.
   */
  delete<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<Result<T, ShohojError>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

// ── Error mapping ───────────────────────────────────────────────────────────

/**
 * The error envelope every /api/v1 response uses on failure.
 *
 * `message` is contractually user-safe — the Worker never puts a stack, a token
 * or an internal path in it — which is why it is promoted to `userMessage`
 * below instead of being replaced by a generic line. That is a real contract,
 * not an assumption about the current implementation: an API that cannot
 * promise this must send a code and let the client write the prose.
 */
const ApiErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/** Map an HTTP status onto the typed error hierarchy. */
function errorForStatus(status: number, message: string, detail: string): ShohojError {
  if (status === 401 || status === 403) {
    return new PermissionError(detail, { userMessage: message });
  }
  if (status === 404) {
    return new NotFoundError(detail, { userMessage: message });
  }
  // Everything else — 400, 409, 429, 5xx — is a Worker-layer failure from the
  // client's point of view. They differ in what the user should do about it,
  // and the server's own message is what says so.
  return new WorkerError(detail, { userMessage: message });
}

/**
 * Turn a failed response into a typed error, preferring the API's own envelope.
 *
 * A response that is not the envelope (an edge 502 with an HTML body, a
 * proxy's plain-text timeout) still has to produce something displayable, so
 * the status-derived fallback is not optional.
 */
async function errorForResponse(response: Response, path: string): Promise<ShohojError> {
  const fallback = `API ${response.status} for ${path}`;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Not JSON. The status alone has to carry it.
    return errorForStatus(response.status, genericMessageFor(response.status), fallback);
  }
  const parsed = validate(ApiErrorEnvelope, payload, 'api error envelope');
  if (!parsed.ok) {
    return errorForStatus(response.status, genericMessageFor(response.status), fallback);
  }
  const { code, message } = parsed.value.error;
  return errorForStatus(response.status, message, `${fallback} (${code})`);
}

/** Displayable prose for a response that did not carry its own. */
function genericMessageFor(status: number): string {
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item couldn't be found.";
  if (status === 429) return "You're doing that too quickly. Please wait a moment.";
  if (status >= 500) return 'Shohoj is having trouble right now. Please try again shortly.';
  return 'That request could not be completed.';
}

// ── URL building ────────────────────────────────────────────────────────────

/**
 * Build the request URL.
 *
 * `path` is joined to the configured base rather than parsed as a URL of its
 * own, so a caller cannot — by accident or through unvalidated input — send a
 * request carrying the student's bearer token to another origin.
 */
function buildUrl(baseUrl: string, path: string, query: ApiRequestOptions['query']): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${API_V1_PREFIX}${suffix}`;
  if (query === undefined) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Absent means absent. Serialising undefined as the string "undefined" is
    // the classic way a filter silently matches nothing.
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs === '' ? url : `${url}?${qs}`;
}

/**
 * Combine the caller's abort signal with the timeout.
 *
 * `AbortSignal.any` is the clean way and is widely available, but this runs in
 * whatever browser a student has; without it the timeout still applies and the
 * caller's signal is used alone, which is the safer of the two to lose.
 */
function requestSignal(timeoutMs: number, callerSignal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (callerSignal === undefined) return timeout;
  const any = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  return typeof any === 'function' ? any([timeout, callerSignal]) : callerSignal;
}

// ── Client ──────────────────────────────────────────────────────────────────

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    requestOptions: ApiRequestOptions = {},
  ): Promise<Result<T, ShohojError>> {
    const auth: AuthMode = requestOptions.auth ?? 'required';

    const headers = new Headers({ Accept: 'application/json' });

    if (auth === 'required') {
      const token = await options.getIdToken();
      if (token === null || token === '') {
        // Fail here rather than send it. An unauthenticated call to a protected
        // endpoint can only come back 401, and doing it locally keeps a
        // signed-out student off the network entirely.
        return err(
          new PermissionError(`No ID token for ${method} ${path}`, {
            userMessage: 'Please sign in to continue.',
          }),
        );
      }
      headers.set('Authorization', `Bearer ${token}`);
    }

    const init: RequestInit = {
      method,
      headers,
      signal: requestSignal(timeoutMs, requestOptions.signal),
    };
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchFn(buildUrl(options.baseUrl, path, requestOptions.query), init);
    } catch (cause) {
      // Offline, DNS failure, CORS rejection, timeout — indistinguishable from
      // the browser and all the same thing to the student.
      const aborted = cause instanceof Error && cause.name === 'TimeoutError';
      return err(
        new WorkerError(`${method} ${path} failed: ${String(cause)}`, {
          cause,
          userMessage: aborted
            ? 'That took too long. Check your connection and try again.'
            : "Couldn't reach the server. Please try again in a moment.",
        }),
      );
    }

    if (!response.ok) {
      return err(await errorForResponse(response, path));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      return err(
        new WorkerError(`${method} ${path} returned a non-JSON body`, {
          cause,
          userMessage: 'Shohoj got an unexpected response. Please try again.',
        }),
      );
    }

    // The contract is only real if it is checked. A server that starts
    // returning a differently-shaped success must fail here, loudly and
    // locally, rather than half-render a screen of undefined.
    const parsed = validate(schema, payload, `${method} ${API_V1_PREFIX}${path}`);
    if (!parsed.ok) return err(parsed.error);
    return ok(parsed.value);
  }

  return {
    get: (path, schema, requestOptions) => request('GET', path, undefined, schema, requestOptions),
    post: (path, body, schema, requestOptions) =>
      request('POST', path, body, schema, requestOptions),
    patch: (path, body, schema, requestOptions) =>
      request('PATCH', path, body, schema, requestOptions),
    put: (path, body, schema, requestOptions) => request('PUT', path, body, schema, requestOptions),
    delete: (path, schema, requestOptions) =>
      request('DELETE', path, undefined, schema, requestOptions),
  };
}
