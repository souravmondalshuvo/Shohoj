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

import { useEffect, useRef, useState } from 'react';

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

/** Safety net for the exit animation — see the effect below. */
const EXIT_FALLBACK_MS = 600;

interface AssistantDrawerProps {
  readonly workerUrl: string | null | undefined;
  /** True once the panel is animating out; it stays mounted until `onClosed`. */
  readonly closing: boolean;
  readonly onClose: () => void;
  readonly onClosed: () => void;
}

function AssistantDrawer({ workerUrl, closing, onClose, onClosed }: AssistantDrawerProps) {
  const getIdToken = useIdToken();
  const [transcript, setTranscript] = useState<readonly AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // The unmount normally rides on animationend. This is the fallback for the
  // cases where that event never arrives — a backgrounded tab, or animations
  // switched off at the browser level — so the panel can't get stuck open.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClosed, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClosed]);

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
      className={closing ? 'assistant-drawer assistant-drawer--closing' : 'assistant-drawer'}
      role="dialog"
      aria-label="Shohoj Assistant"
      aria-modal="false"
      // Rows animate too and their events bubble, so only the panel's own
      // animation ends the close.
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClosed();
      }}
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
      <p className="assistant-drawer-note">
        Answers use only your own saved data. Chats aren’t saved — they reset when you close this
        panel.
      </p>

      <div className="assistant-log" ref={logRef} aria-live="polite">
        {transcript.length === 0 && (
          <div className="assistant-empty">
            <p>Ask about your CGPA goals, prerequisites, or seat availability. Try one:</p>
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
  const [open, setOpen] = useState(false);
  // The drawer owns its exit animation, so closing is a two-step: mark it
  // closing, then unmount when the animation reports back.
  const [closing, setClosing] = useState(false);
  const [availability, setAvailability] = useState<AssistantAvailability>('unknown');

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
      {!open && (
        <button
          type="button"
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label="Open Shohoj Assistant"
        >
          <span aria-hidden="true">✦</span> Assistant
        </button>
      )}
      {open && (
        <AssistantDrawer
          workerUrl={workerUrl}
          closing={closing}
          onClose={() => setClosing(true)}
          onClosed={() => {
            setClosing(false);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
