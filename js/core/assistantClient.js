// js/core/assistantClient.js
//
// Transport for the Shohoj Assistant Worker endpoint (#435, POST
// /api/assistant, worker/index.js handleAssistant). One stateless chat turn:
// the caller sends the visible transcript plus the new user message and gets a
// single reply string back.
//
// Authored here, in vanilla JS, because BOTH front-ends need it: the legacy
// bundle (build3.py flattens js/ into shohoj.html, which cannot load .ts) and
// the React shell, which imports it through js/core/assistantClient.d.ts —
// the same catalog.js / departments.js precedent. src/features/assistant/
// assistantClient.ts is a typed re-export of this file, so there is exactly ONE
// implementation of the Worker contract on the client side.
//
// Mirrors the Worker's transcript contract (≤20 messages, ≤4000 chars each,
// first and last must be user turns) so a payload built here is never rejected
// as malformed. Config, token getter, and fetch are injected so the module is
// unit-testable offline (the reviewsWriteRepo pattern).

export const ASSISTANT_MAX_MESSAGES = 20;
export const ASSISTANT_MAX_MESSAGE_CHARS = 4000;

const ASSISTANT_UNAVAILABLE_MESSAGE =
  'The assistant is temporarily unavailable. Please try again in a bit.';

/**
 * Trim a transcript to what the Worker accepts: at most the last
 * ASSISTANT_MAX_MESSAGES entries, starting on a user turn (leading assistant
 * turns left over from the cut are dropped), each within the char limit.
 */
export function clampTranscript(messages) {
  const sane = (Array.isArray(messages) ? messages : []).filter(
    m =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0 &&
      m.content.length <= ASSISTANT_MAX_MESSAGE_CHARS,
  );
  let tail = sane.slice(-ASSISTANT_MAX_MESSAGES);
  while (tail.length > 0 && tail[0].role !== 'user') tail = tail.slice(1);
  return tail;
}

/**
 * Ask the Worker whether the Assistant's backend dependency is configured.
 *
 * Unauthenticated on purpose: readiness is not user-specific, so the probe can
 * run before/without a token and the endpoint exposes booleans only — never key
 * material. See `readinessReport()` in worker/index.js.
 *
 * Returns 'ready' | 'unconfigured' | 'unknown'. Callers treat 'unknown' the
 * same as 'unconfigured' when deciding whether to show an entry point. That is
 * the conservative direction: #455 was a live feature that looked available and
 * failed on every turn, and showing a button we cannot stand behind is worse
 * than briefly hiding one that works. The probe is cheap and re-runs on mount,
 * so a transient blip self-heals.
 */
export async function fetchAssistantAvailability(options) {
  const { workerUrl, fetchImpl = fetch, signal } = options || {};
  if (!workerUrl) return 'unconfigured';

  let res;
  try {
    res = await fetchImpl(`${String(workerUrl).replace(/\/$/, '')}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (_e) {
    return 'unknown';
  }
  if (!res.ok) return 'unknown';

  const body = await res.json().catch(() => null);
  const configured = body?.capabilities?.assistant;
  if (typeof configured !== 'boolean') return 'unknown';
  return configured ? 'ready' : 'unconfigured';
}

/** POST one chat turn to the Worker; maps transport/HTTP failures to typed codes. */
export async function sendAssistantTurn(transcript, options) {
  const { workerUrl, getToken, fetchImpl = fetch, routine } = options || {};
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

  let token;
  try {
    token = await getToken();
  } catch (_e) {
    token = null;
  }
  if (!token) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in to use the assistant.' };
  }

  let res;
  try {
    res = await fetchImpl(`${String(workerUrl).replace(/\/$/, '')}/api/assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // The routine tool answers from the student's own picks, and those live
      // only in this browser — the cloud snapshot the Worker reads carries
      // semesters, never the Routine Builder's selections. So they travel with
      // the turn (#543). Omitted entirely when nothing is picked.
      body: JSON.stringify(routine ? { messages, routine } : { messages }),
    });
  } catch (_e) {
    return { ok: false, code: 'unavailable', error: ASSISTANT_UNAVAILABLE_MESSAGE };
  }

  if (res.ok) {
    const body = await res.json().catch(() => null);
    if (body && typeof body.reply === 'string' && body.reply.trim()) {
      return { ok: true, reply: body.reply };
    }
    return { ok: false, code: 'unavailable', error: ASSISTANT_UNAVAILABLE_MESSAGE };
  }
  if (res.status === 401) {
    return {
      ok: false,
      code: 'unauthenticated',
      error: 'Your session expired — sign in again to continue.',
    };
  }
  if (res.status === 429) {
    return { ok: false, code: 'rate-limited', error: 'Slow down a little — try again in a minute.' };
  }
  if (res.status === 400) {
    return { ok: false, code: 'invalid', error: 'That message could not be sent. Try rephrasing it.' };
  }
  return { ok: false, code: 'unavailable', error: ASSISTANT_UNAVAILABLE_MESSAGE };
}

// ── Starter prompts ───────────────────────────────────────────────────────────
// The empty drawer offers three examples. Which three depends on where the
// student is: on the Seats/Routine tabs a seat question is the likely one, on
// the calculator a CGPA goal is. These are ordinary user messages — no Worker
// change is involved, only which text the chip sends.

const ASSISTANT_DEFAULT_PROMPTS = Object.freeze([
  'What GPA do I need to reach a 3.5 CGPA?',
  'How many credits until I graduate?',
  'Can I take CSE370 next semester?',
]);

const ASSISTANT_TAB_PROMPTS = Object.freeze({
  // Seats and routine are the two tabs where faculty initials and the ★ are on
  // screen, so that is where the rating question is worth offering (#579). The
  // prompt names a course rather than a person on purpose — a starter chip
  // should not put a particular teacher's name in front of every student.
  seats: Object.freeze([
    'Are there open seats in MAT216?',
    'Which sections of CSE370 still have room?',
    'Who teaches CSE221, and how are they rated?',
  ]),
  // The routine tool reads the student's own picks, so this tab is where
  // schedule questions are worth offering (#543).
  routine: Object.freeze([
    'When is my first class on Sunday?',
    'Do any of my picked courses clash?',
    'Who teaches CSE221, and how are they rated?',
  ]),
  planner: Object.freeze([
    'Can I take CSE370 next semester?',
    'What are the prerequisites for CSE470?',
    'What GPA do I need to reach a 3.5 CGPA?',
  ]),
  tracker: Object.freeze([
    'What GPA do I need to reach a 3.5 CGPA?',
    'How many credits until I graduate?',
    'What happens to my CGPA if I get a 3.7 next semester?',
  ]),
});

/** The three starter prompts for a calculator tab id; falls back to the defaults. */
export function examplePromptsForTab(tabId) {
  const key = typeof tabId === 'string' ? tabId : '';
  return ASSISTANT_TAB_PROMPTS[key] || ASSISTANT_DEFAULT_PROMPTS;
}
