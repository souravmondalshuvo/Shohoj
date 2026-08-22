// src/features/assistant/AssistantDrawer.tsx
//
// Shohoj Assistant (#435): a floating launcher pill + right-side chat drawer,
// available on every shell route. Signed-in students ask natural-language
// questions about their own data; the Worker (POST /api/assistant) runs the
// uid-scoped Claude tool loop and returns one reply per turn.
//
// Deliberate v1 limits (documented, not bugs): the transcript lives only in
// drawer state — closing the drawer or reloading clears it, nothing is
// persisted anywhere. No streaming: one request, one reply, with loading /
// error / empty states per the design brief.
//
// The launcher renders only when the shell is cloud-capable (papersWorkerUrl
// configured) AND the student is signed in — the endpoint requires a BRACU
// token, so an anonymous FAB would only lead to a dead end.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ASSISTANT_MORPH_CLOSE_MS,
  morphPanel,
  type AssistantMorphRect,
} from '../../../js/core/assistantMorph.js';
import { useAuth, useIdToken } from '../../app/providers/AuthProvider';
import {
  fetchAssistantAvailability,
  sendAssistantTurn,
  type AssistantAvailability,
  type AssistantMessage,
} from './assistantClient.ts';

const EXAMPLE_PROMPTS: readonly string[] = [
  'What GPA do I need to reach a 3.5 CGPA?',
  'Can I take CSE370 next semester?',
  'Are there open seats in MAT216?',
];

/** Safety net for the closing morph — see the effect below. */
const EXIT_FALLBACK_MS = ASSISTANT_MORPH_CLOSE_MS + 400;

/**
 * Where the panel is in the pill→panel→pill cycle.
 *
 * `opening` and `closing` are the two morphs; the launcher stays mounted
 * through both of them, because the pill is one end of the shape being
 * animated and it has to be measurable and on screen.
 */
type AssistantPhase = 'idle' | 'opening' | 'open' | 'closing';

interface AssistantDrawerProps {
  readonly workerUrl: string | null | undefined;
  readonly phase: AssistantPhase;
  /** The launcher's rect, measured while it was still visible. */
  readonly pillRect: AssistantMorphRect | null;
  readonly onClose: () => void;
  readonly onOpened: () => void;
  readonly onClosed: () => void;
}

function AssistantDrawer({
  workerUrl,
  phase,
  pillRect,
  onClose,
  onOpened,
  onClosed,
}: AssistantDrawerProps) {
  const getIdToken = useIdToken();
  const [transcript, setTranscript] = useState<readonly AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest message in view as turns land.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [transcript, pending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The opening morph: the panel is mounted at full size and clipped back to
  // the pill, and the clip grows. It runs once, on mount.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const morph = morphPanel(panel, pillRect, 'open');
    if (!morph) {
      // Reduced motion, or no Web Animations API: the panel simply appears.
      onOpened();
      return;
    }
    morph.finished.then(
      () => {
        morph.cancel();
        onOpened();
      },
      () => {},
    );
    return () => morph.cancel();
    // Mount-only by design: pillRect is captured at the click and never
    // changes for this panel, and onOpened is stable (useCallback below).
  }, []);

  // The closing morph, back down into the pill. The panel stays mounted until
  // it finishes; the timer is the fallback for the cases where `finished`
  // never settles (a backgrounded tab pauses the animation), so the panel
  // can't get stuck open.
  useEffect(() => {
    if (phase !== 'closing') return;
    const panel = panelRef.current;
    const morph = panel ? morphPanel(panel, pillRect, 'close') : null;
    if (!morph) {
      onClosed();
      return;
    }
    morph.finished.then(onClosed, onClosed);
    const timer = window.setTimeout(onClosed, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pillRect, onClosed]);

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || pending) return;
    const next = [...transcript, { role: 'user', content } as AssistantMessage];
    setTranscript(next);
    setDraft('');
    setError(null);
    setPending(true);
    try {
      const result = await sendAssistantTurn(next, { workerUrl, getToken: getIdToken });
      if (result.ok) {
        setTranscript([...next, { role: 'assistant', content: result.reply }]);
      } else {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <aside
      ref={panelRef}
      className={
        phase === 'closing'
          ? 'assistant-drawer assistant-drawer--closing'
          : phase === 'opening'
            ? 'assistant-drawer assistant-drawer--morphing'
            : 'assistant-drawer'
      }
      role="dialog"
      aria-label="Shohoj Assistant"
      aria-modal="false"
    >
      <header className="assistant-drawer-header">
        <h2 className="assistant-drawer-title">Shohoj Assistant</h2>
        <button
          type="button"
          className="assistant-drawer-close"
          onClick={onClose}
          aria-label="Close assistant"
        >
          ✕
        </button>
      </header>
      {/* Twin of DRAWER_NOTE in js/ui/assistantFab.js — change both. */}
      <p className="assistant-drawer-note">
        Answers use your own saved data and Shohoj’s faculty ratings. Chats aren’t saved — they
        reset when you close this panel.
      </p>

      <div className="assistant-log" ref={logRef} aria-live="polite">
        {transcript.length === 0 && (
          <div className="assistant-empty">
            <p>Ask about your CGPA goals, prerequisites, seats, or faculty ratings. Try one:</p>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="assistant-example"
                onClick={() => void ask(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {transcript.map((message, index) => (
          <div
            // Stateless append-only transcript: index identity is stable.
            key={index}
            className={
              message.role === 'user'
                ? 'assistant-bubble assistant-bubble--user'
                : 'assistant-bubble assistant-bubble--reply'
            }
          >
            {message.content}
          </div>
        ))}
        {pending && (
          <div className="assistant-bubble assistant-bubble--reply assistant-bubble--pending">
            {/* Motion, not a static word: several seconds of unchanging text
                reads as a frozen panel. The word stays for screen readers,
                which cannot see a pulse. */}
            <span className="assistant-sr-only">Thinking…</span>
            <span className="assistant-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {error && (
          <div className="assistant-error" role="alert">
            {error}
          </div>
        )}
      </div>

      <form className="assistant-composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          className="assistant-input"
          value={draft}
          rows={2}
          maxLength={4000}
          placeholder="Ask about your courses…"
          aria-label="Message the assistant"
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
        />
        <button type="submit" className="assistant-send" disabled={pending || !draft.trim()}>
          {pending ? '…' : 'Send'}
        </button>
      </form>
    </aside>
  );
}

export interface AssistantLauncherProps {
  readonly workerUrl: string | null | undefined;
}

/**
 * Floating launcher + drawer.
 *
 * Renders nothing unless ALL of these hold:
 *   - the shell is cloud-capable (papersWorkerUrl configured),
 *   - the student is signed in (the endpoint requires a BRACU token), and
 *   - the Worker reports the Assistant's backend dependency as configured.
 *
 * That last check is #455: the drawer shipped while ANTHROPIC_API_KEY was
 * unset, so the feature was visibly present and failed on every single turn.
 * A launcher we cannot stand behind is worse than no launcher, so the probe
 * must affirmatively say "ready" before the entry point appears — an
 * inconclusive probe keeps it hidden.
 */
export function AssistantLauncher({ workerUrl }: AssistantLauncherProps) {
  const auth = useAuth();
  // Not a boolean: the pill and the panel are two ends of one shape, so both
  // are on screen during either morph, and only a fully open panel gets the
  // corner to itself.
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const fabRef = useRef<HTMLButtonElement>(null);
  const pillRectRef = useRef<AssistantMorphRect | null>(null);
  const [availability, setAvailability] = useState<AssistantAvailability>('unknown');

  // Stable identities: the drawer runs its morphs from effects keyed on these,
  // and a fresh closure on every render would start a second closing morph
  // partway through the first — visibly, from the wrong shape.
  const close = useCallback(() => setPhase('closing'), []);
  const opened = useCallback(
    () => setPhase((current) => (current === 'opening' ? 'open' : current)),
    [],
  );
  const closed = useCallback(() => setPhase('idle'), []);

  const signedIn = auth.status === 'authenticated';

  useEffect(() => {
    if (!workerUrl || !signedIn) return;
    const controller = new AbortController();
    let active = true;
    void fetchAssistantAvailability({ workerUrl, signal: controller.signal }).then((next) => {
      if (active) setAvailability(next);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workerUrl, signedIn]);

  if (!workerUrl || !signedIn) return null;
  if (availability !== 'ready') return null;

  return (
    <>
      {phase !== 'open' && (
        <button
          ref={fabRef}
          type="button"
          className={
            phase === 'opening'
              ? 'assistant-fab assistant-fab--morphing'
              : phase === 'closing'
                ? 'assistant-fab assistant-fab--returning'
                : 'assistant-fab'
          }
          // Hidden from assistive tech and from the tab order mid-morph: it is
          // scenery for those few hundred milliseconds, and the panel behind it
          // is the thing that now matters.
          aria-hidden={phase === 'idle' ? undefined : true}
          tabIndex={phase === 'idle' ? undefined : -1}
          onClick={() => {
            // Measured while the pill is still on screen — this rect is the
            // starting shape of the morph.
            pillRectRef.current = fabRef.current?.getBoundingClientRect() ?? null;
            setPhase('opening');
          }}
          aria-label="Open Shohoj Assistant"
        >
          <span aria-hidden="true">✦</span> Assistant
        </button>
      )}
      {phase !== 'idle' && (
        <AssistantDrawer
          workerUrl={workerUrl}
          phase={phase}
          pillRect={pillRectRef.current}
          onClose={close}
          onOpened={opened}
          onClosed={closed}
        />
      )}
    </>
  );
}
