// src/app/routes/FeedbackRoute.tsx
//
// App feedback on the shell (#437), the React port of the legacy feedback
// modal (js/ui/feedback.js) as a full route: an auth-gated submit form (type
// picker, bounded text, anonymous toggle) above the community board
// (newest-first, type filter, optimistic upvote toggle, admin-only delete).
//
// Model logic lives in src/core/feedback; Firestore access in
// platform/firebase/feedbackRepo. E2E seams (lost-found parity):
//   window.__shohojFeedbackRepo     — repo injection
//   window.__shohojFeedbackIdentity — {uid,email,isAdmin?} signed-in stand-in

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  boardView,
  feedbackAge,
  validateFeedbackText,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  TEXT_MAX,
  type BoardFilter,
  type FeedbackItem,
  type FeedbackType,
} from '../../core/feedback.ts';
import { createFeedbackRepo, type FeedbackRepo } from '../../platform/firebase/feedbackRepo.ts';
import { useAuth } from '../providers/AuthProvider';
import { useConfirm } from '../providers/ModalProvider';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { useNotifications } from '../../state/NotificationProvider';

declare global {
  interface Window {
    __shohojFeedbackRepo?: FeedbackRepo;
    __shohojFeedbackIdentity?: { uid: string; email: string; isAdmin?: boolean };
  }
}

const FILTERS: readonly { readonly key: BoardFilter; readonly label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bug', label: 'Bug' },
  { key: 'feature', label: 'Feature' },
  { key: 'general', label: 'General' },
];

export function Component() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const confirm = useConfirm();
  const { notify } = useNotifications();

  const identity = useMemo(() => {
    if (auth.status === 'authenticated' && auth.uid) {
      return { uid: auth.uid, isAdmin: auth.isAdmin === true };
    }
    const seam = typeof window !== 'undefined' ? window.__shohojFeedbackIdentity : undefined;
    return seam ? { uid: seam.uid, isAdmin: seam.isAdmin === true } : null;
  }, [auth]);

  const repo = useMemo<FeedbackRepo | null>(() => {
    if (typeof window !== 'undefined' && window.__shohojFeedbackRepo) {
      return window.__shohojFeedbackRepo;
    }
    if (!config) return null;
    return createFeedbackRepo({
      config: config.firebase,
      recaptchaV3SiteKey: config.recaptchaV3SiteKey,
    });
  }, [config]);

  const [items, setItems] = useState<FeedbackItem[] | undefined>(undefined);
  // Distinct from `items === undefined` (loading) and `items.length === 0`
  // (empty): a failed read must not render as an empty board.
  const [loadFailed, setLoadFailed] = useState(false);
  const [myUpvotes, setMyUpvotes] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [draftType, setDraftType] = useState<FeedbackType>('general');
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canUse = repo !== null && identity !== null;

  const repoRef = useRef(repo);
  repoRef.current = repo;
  useEffect(() => {
    if (!canUse || !identity) return;
    let live = true;
    const r = repoRef.current;
    Promise.all([r!.listRecent(), r!.listMyUpvotes(identity.uid)])
      .then(([loaded, votes]) => {
        if (!live) return;
        setItems(loaded);
        setMyUpvotes(new Set(votes.map((v) => v.feedbackId)));
        setLoadFailed(false);
      })
      .catch(() => {
        // The repo logged the machine-readable code; never surface the raw SDK
        // message. Mark the load failed rather than pretending the board is empty.
        if (!live) return;
        setItems([]);
        setLoadFailed(true);
      });
    return () => {
      live = false;
    };
    // identity.uid (not the object) so an auth refresh doesn't re-fetch.
  }, [canUse, identity?.uid, reloadKey]);

  const board = useMemo(() => boardView(items ?? [], filter), [items, filter]);
  const now = Date.now();

  const submit = async () => {
    if (!repo || !identity || submitting) return;
    const checked = validateFeedbackText(text);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await repo.submit({ type: draftType, text: checked.text, anonymous }, identity.uid);
      setText('');
      notify({ kind: 'success', message: 'Sent! Thanks for your feedback.' });
      setReloadKey((k) => k + 1);
    } catch {
      setFormError('Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUpvote = async (feedbackId: string) => {
    if (!repo || !identity) return;
    const wasUpvoted = myUpvotes.has(feedbackId);
    // Optimistic flip; revert if the write fails.
    setMyUpvotes((prev) => {
      const next = new Set(prev);
      if (wasUpvoted) next.delete(feedbackId);
      else next.add(feedbackId);
      return next;
    });
    try {
      await repo.toggleUpvote(feedbackId, identity.uid, wasUpvoted);
    } catch {
      setMyUpvotes((prev) => {
        const next = new Set(prev);
        if (wasUpvoted) next.add(feedbackId);
        else next.delete(feedbackId);
        return next;
      });
    }
  };

  const adminDelete = async (item: FeedbackItem) => {
    if (!repo || !identity?.isAdmin) return;
    const snippet = item.text.slice(0, 60) + (item.text.length > 60 ? '…' : '');
    const ok = await confirm({
      title: 'Delete this feedback entry?',
      message: `${FEEDBACK_TYPE_LABELS[item.type].toUpperCase()}: ${snippet}`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.adminDelete(item.id);
      setItems((prev) => prev?.filter((i) => i.id !== item.id));
      notify({ kind: 'success', message: 'Feedback deleted.' });
    } catch {
      notify({ kind: 'error', message: 'Delete failed.' });
    }
  };

  return (
    <section className="shell-page feedback-page" data-testid="feedback-page">
      <h1>Feedback</h1>
      <p className="shell-muted">
        Found a bug, want a feature, or have a thought? Tell us — and upvote what others have posted
        so we know what matters.
      </p>

      {!canUse ? (
        <p className="feedback-signin shell-muted" data-testid="feedback-signin">
          Sign in with your BRACU Google account to submit and browse feedback.
        </p>
      ) : (
        <>
          <form
            className="feedback-form"
            data-testid="feedback-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="feedback-field">
              <span className="feedback-label" id="feedback-type-label">
                Type
              </span>
              <div className="feedback-types" role="group" aria-labelledby="feedback-type-label">
                {FEEDBACK_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={
                      draftType === t ? 'feedback-chip feedback-chip--active' : 'feedback-chip'
                    }
                    aria-pressed={draftType === t}
                    onClick={() => setDraftType(t)}
                    data-testid={`feedback-type-${t}`}
                  >
                    {FEEDBACK_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="feedback-field">
              <label className="feedback-label" htmlFor="feedback-text">
                Your feedback
              </label>
              <textarea
                id="feedback-text"
                className="feedback-text"
                maxLength={TEXT_MAX}
                placeholder="Describe the bug, request the feature, or share a thought…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="feedback-text"
              />
              <span className="feedback-count" aria-hidden="true">
                {text.length} / {TEXT_MAX}
              </span>
            </div>

            <label className="feedback-anon">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                data-testid="feedback-anon"
              />
              Submit anonymously
            </label>

            {formError !== null && (
              <p className="feedback-error" role="alert" data-testid="feedback-error">
                {formError}
              </p>
            )}

            <button
              type="submit"
              className="shell-btn shell-btn--primary feedback-send"
              disabled={submitting}
              data-testid="feedback-send"
            >
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </form>

          <div className="feedback-board-head">
            <h2>Board</h2>
            <div className="feedback-filters" role="group" aria-label="Filter by type">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={
                    filter === f.key ? 'feedback-chip feedback-chip--active' : 'feedback-chip'
                  }
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  data-testid={`feedback-filter-${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {items === undefined ? (
            <p role="status">Loading the board…</p>
          ) : loadFailed ? (
            <div
              className="feedback-empty shell-muted"
              data-testid="feedback-unavailable"
              role="alert"
            >
              <div>The feedback board is unavailable right now.</div>
              <button
                type="button"
                className="rv-dir-retry"
                onClick={() => setReloadKey((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          ) : board.length === 0 ? (
            <p className="feedback-empty shell-muted" data-testid="feedback-empty">
              No feedback yet{filter !== 'all' ? ' in this category' : ''}.
            </p>
          ) : (
            <ul className="feedback-list" data-testid="feedback-list">
              {board.map((item) => {
                const voted = myUpvotes.has(item.id);
                return (
                  <li
                    key={item.id}
                    className="feedback-item"
                    data-testid={`feedback-item-${item.id}`}
                  >
                    <button
                      type="button"
                      className={voted ? 'feedback-vote feedback-vote--on' : 'feedback-vote'}
                      aria-pressed={voted}
                      aria-label={voted ? 'Remove upvote' : 'Upvote'}
                      onClick={() => void toggleUpvote(item.id)}
                      data-testid={`feedback-vote-${item.id}`}
                    >
                      {voted ? '▲' : '△'}
                    </button>
                    <div className="feedback-item-body">
                      <div className="feedback-item-meta">
                        <span className={`feedback-tag feedback-tag--${item.type}`}>
                          {FEEDBACK_TYPE_LABELS[item.type]}
                        </span>
                        <span className="feedback-age">{feedbackAge(item.createdAtMs, now)}</span>
                        {identity.isAdmin && (
                          <button
                            type="button"
                            className="feedback-del"
                            aria-label="Delete feedback"
                            title="Delete"
                            onClick={() => void adminDelete(item)}
                            data-testid={`feedback-del-${item.id}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="feedback-item-text">{item.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
