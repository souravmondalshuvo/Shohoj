// src/app/routes/LostFoundRoute.tsx
//
// Lost & Found board (Phase 3, #371). Auth-gated: Firestore rules only let
// verified BRACU accounts read/post, so signed-out visitors get a sign-in
// prompt instead of a list. Privacy model (maintainer decision): posts show
// NO contact info; "I found this / this is mine" queues a claim doc that the
// cron Worker turns into an email to the poster, sharing the claimer's own
// address — the two then talk off-platform.
//
// e2e seams (the __shohoj* convention, not the legacy _shohoj_* hooks):
//   window.__shohojLostFoundRepo     — repo injection (like __shohojReviewsRepo)
//   window.__shohojLostFoundIdentity — {uid,email} stand-in for a signed-in user
//
// Admin moderation UI lands separately on the admin dashboard; rules already
// allow admin delete.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import {
  claimLabel,
  postAge,
  validateClaimNote,
  validateDraft,
  visiblePosts,
  type DraftField,
  type LostFoundPost,
  type LostFoundType,
} from '../../core/lostFound.ts';
import { createLostFoundRepo, type LostFoundRepo } from '../../platform/firebase/lostFoundRepo.ts';
import { useAuth } from '../providers/AuthProvider';
import { useConfirm } from '../providers/ModalProvider';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { useNotifications } from '../../state/NotificationProvider';

declare global {
  interface Window {
    __shohojLostFoundRepo?: LostFoundRepo;
    __shohojLostFoundIdentity?: { uid: string; email: string };
  }
}

type Filter = LostFoundType | 'all';

const FILTERS: readonly { readonly key: Filter; readonly label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lost', label: 'Lost' },
  { key: 'found', label: 'Found' },
];

interface PostFormState {
  type: LostFoundType;
  title: string;
  description: string;
  locationHint: string;
  roomCode: string;
}

const EMPTY_FORM: PostFormState = {
  type: 'lost',
  title: '',
  description: '',
  locationHint: '',
  roomCode: '',
};

function PostRow({
  post,
  ownUid,
  onResolve,
  onDelete,
  onClaim,
  claimed,
}: {
  readonly post: LostFoundPost;
  readonly ownUid: string;
  readonly onResolve: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onClaim: (id: string, note: string) => Promise<boolean>;
  readonly claimed: boolean;
}) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const mine = post.creatorUid === ownUid;

  const sendClaim = async () => {
    const checked = validateClaimNote(note);
    if (!checked.ok) {
      setNoteError(checked.error);
      return;
    }
    setNoteError(null);
    setSending(true);
    const ok = await onClaim(post.id, checked.value);
    setSending(false);
    if (ok) setClaimOpen(false);
  };

  return (
    <li className="lf-item" data-testid="lostfound-item">
      <div className="lf-item-head">
        <span
          className={post.type === 'lost' ? 'lf-badge lf-badge--lost' : 'lf-badge lf-badge--found'}
        >
          {post.type === 'lost' ? 'Lost' : 'Found'}
        </span>
        <strong className="lf-title">{post.title}</strong>
        <span className="lf-age shell-muted">{postAge(post.createdAtMs, Date.now())}</span>
      </div>
      {post.description !== undefined && <p className="lf-desc">{post.description}</p>}
      {(post.locationHint !== undefined || post.roomCode !== undefined) && (
        <p className="lf-where shell-muted">
          {post.locationHint}
          {post.locationHint !== undefined && post.roomCode !== undefined && ' · '}
          {post.roomCode !== undefined && (
            <Link to={`/campus?room=${encodeURIComponent(post.roomCode)}`}>
              {post.roomCode} on the campus map
            </Link>
          )}
        </p>
      )}
      <div className="lf-actions">
        {mine ? (
          <>
            <button type="button" className="shell-btn lf-btn" onClick={() => onResolve(post.id)}>
              Mark resolved
            </button>
            <button
              type="button"
              className="shell-btn shell-btn--danger lf-btn"
              onClick={() => onDelete(post.id)}
            >
              Delete
            </button>
          </>
        ) : claimed ? (
          <span className="lf-claimed" role="status">
            Sent — the poster will get an email.
          </span>
        ) : (
          <button
            type="button"
            className="shell-btn shell-btn--primary lf-btn"
            aria-expanded={claimOpen}
            onClick={() => setClaimOpen((open) => !open)}
          >
            {claimLabel(post.type)}
          </button>
        )}
      </div>
      {claimOpen && !claimed && !mine && (
        <div className="lf-claim-box" data-testid="lostfound-claim-box">
          <label className="lf-field">
            <span className="lf-field-label">Message to the poster (optional)</span>
            <textarea
              className="lf-input lf-note"
              value={note}
              maxLength={400}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where you found it / how to verify it's yours…"
            />
          </label>
          {noteError !== null && <p className="lf-error">{noteError}</p>}
          <p className="lf-privacy shell-muted">
            The poster gets an email with your address ({''}
            <strong>they never see it on the board</strong>) so they can reply to you directly.
          </p>
          <button
            type="button"
            className="shell-btn shell-btn--primary lf-btn"
            disabled={sending}
            onClick={() => void sendClaim()}
          >
            {sending ? 'Sending…' : 'Notify the poster'}
          </button>
        </div>
      )}
    </li>
  );
}

export function Component() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const confirm = useConfirm();
  const { notify } = useNotifications();

  const identity = useMemo(() => {
    if (auth.status === 'authenticated' && auth.uid) {
      return { uid: auth.uid, email: auth.email ?? '' };
    }
    return typeof window !== 'undefined' ? (window.__shohojLostFoundIdentity ?? null) : null;
  }, [auth]);

  const repo = useMemo<LostFoundRepo | null>(() => {
    if (typeof window !== 'undefined' && window.__shohojLostFoundRepo) {
      return window.__shohojLostFoundRepo;
    }
    if (!config) return null;
    return createLostFoundRepo({
      config: config.firebase,
      recaptchaV3SiteKey: config.recaptchaV3SiteKey,
    });
  }, [config]);

  const [posts, setPosts] = useState<LostFoundPost[] | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PostFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [claimedIds, setClaimedIds] = useState<ReadonlySet<string>>(new Set());

  const canUse = repo !== null && identity !== null;

  // One load per (repo, identity) pairing; identity flips reload the board.
  const repoRef = useRef(repo);
  repoRef.current = repo;
  useEffect(() => {
    if (!canUse) return;
    let live = true;
    repoRef.current
      ?.listRecent()
      .then((loaded) => {
        if (live) setPosts(loaded);
      })
      .catch(() => {
        if (live) setPosts([]);
      });
    return () => {
      live = false;
    };
  }, [canUse]);

  const visible = useMemo(
    () => (posts ? visiblePosts(posts, Date.now(), filter) : []),
    [posts, filter],
  );

  const setField = (field: keyof PostFormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submitPost = useCallback(async () => {
    if (!repo || !identity) return;
    const checked = validateDraft(form);
    if (!checked.ok) {
      setFormErrors(checked.errors);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const id = await repo.createPost(checked.value, identity.uid, identity.email);
      setPosts((current) => [
        {
          ...checked.value,
          id,
          status: 'open',
          creatorUid: identity.uid,
          createdAtMs: Date.now(),
        },
        ...(current ?? []),
      ]);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      notify({ kind: 'success', message: 'Posted to the board.' });
    } catch {
      notify({ kind: 'error', message: 'Could not post — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [repo, identity, form, notify]);

  const resolvePost = useCallback(
    async (id: string) => {
      if (!repo) return;
      try {
        await repo.resolvePost(id);
        setPosts((current) =>
          current?.map((p) => (p.id === id ? { ...p, status: 'resolved' } : p)),
        );
        notify({ kind: 'success', message: 'Marked resolved.' });
      } catch {
        notify({ kind: 'error', message: 'Could not update the post.' });
      }
    },
    [repo, notify],
  );

  const deletePost = useCallback(
    async (id: string) => {
      if (!repo) return;
      const confirmed = await confirm({
        title: 'Delete this post?',
        message: 'It disappears from the board for everyone.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await repo.deletePost(id);
        setPosts((current) => current?.filter((p) => p.id !== id));
        notify({ kind: 'success', message: 'Post deleted.' });
      } catch {
        notify({ kind: 'error', message: 'Could not delete the post.' });
      }
    },
    [repo, confirm, notify],
  );

  const claimPost = useCallback(
    async (id: string, note: string) => {
      if (!repo || !identity) return false;
      try {
        await repo.createClaim(id, identity.uid, identity.email, note);
        setClaimedIds((current) => new Set(current).add(id));
        notify({ kind: 'success', message: 'The poster will get an email shortly.' });
        return true;
      } catch {
        notify({ kind: 'error', message: 'Could not send — please try again.' });
        return false;
      }
    },
    [repo, identity, notify],
  );

  return (
    <section className="shell-page lf-page" data-testid="lostfound-page">
      <h1>Lost &amp; Found</h1>
      <p className="shell-muted">
        Lost something on campus, or found something that isn&apos;t yours? Post it here — no
        contact info is shown; responses reach the poster by email.
      </p>

      {!repo ? (
        <p className="shell-muted" data-testid="lostfound-offline">
          The board needs the cloud-connected shell — it isn&apos;t configured here.
        </p>
      ) : auth.status === 'loading' && !identity ? (
        <p role="status">Checking sign-in…</p>
      ) : !identity ? (
        <p data-testid="lostfound-signin">
          Sign in with your <strong>g.bracu.ac.bd</strong> account (top right) to browse and post.
        </p>
      ) : (
        <>
          <div className="lf-toolbar">
            <div className="lf-filters" role="group" aria-label="Filter posts">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? 'lf-filter lf-filter--active' : 'lf-filter'}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="shell-btn shell-btn--primary"
              aria-expanded={formOpen}
              onClick={() => setFormOpen((open) => !open)}
            >
              {formOpen ? 'Close form' : 'Report an item'}
            </button>
          </div>

          {formOpen && (
            <form
              className="lf-form"
              data-testid="lostfound-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPost();
              }}
            >
              <fieldset className="lf-type" disabled={submitting}>
                <legend className="lf-field-label">I&hellip;</legend>
                <label>
                  <input
                    type="radio"
                    name="lf-type"
                    checked={form.type === 'lost'}
                    onChange={() => setForm((f) => ({ ...f, type: 'lost' }))}
                  />{' '}
                  lost something
                </label>
                <label>
                  <input
                    type="radio"
                    name="lf-type"
                    checked={form.type === 'found'}
                    onChange={() => setForm((f) => ({ ...f, type: 'found' }))}
                  />{' '}
                  found something
                </label>
              </fieldset>
              <label className="lf-field">
                <span className="lf-field-label">What is it?</span>
                <input
                  className="lf-input"
                  value={form.title}
                  maxLength={120}
                  onChange={setField('title')}
                  placeholder="e.g. Black umbrella with a wooden handle"
                />
                {formErrors.title !== undefined && (
                  <span className="lf-error">{formErrors.title}</span>
                )}
              </label>
              <label className="lf-field">
                <span className="lf-field-label">Details (optional)</span>
                <textarea
                  className="lf-input lf-note"
                  value={form.description}
                  maxLength={600}
                  onChange={setField('description')}
                  placeholder="Anything that helps identify it"
                />
                {formErrors.description !== undefined && (
                  <span className="lf-error">{formErrors.description}</span>
                )}
              </label>
              <div className="lf-form-row">
                <label className="lf-field">
                  <span className="lf-field-label">Where (optional)</span>
                  <input
                    className="lf-input"
                    value={form.locationHint}
                    maxLength={160}
                    onChange={setField('locationHint')}
                    placeholder="e.g. 9th floor lift lobby"
                  />
                  {formErrors.locationHint !== undefined && (
                    <span className="lf-error">{formErrors.locationHint}</span>
                  )}
                </label>
                <label className="lf-field">
                  <span className="lf-field-label">Room code (optional)</span>
                  <input
                    className="lf-input"
                    value={form.roomCode}
                    maxLength={12}
                    onChange={setField('roomCode')}
                    placeholder="e.g. 09G-31T"
                  />
                  {formErrors.roomCode !== undefined && (
                    <span className="lf-error">{formErrors.roomCode}</span>
                  )}
                </label>
              </div>
              <button type="submit" className="shell-btn shell-btn--primary" disabled={submitting}>
                {submitting ? 'Posting…' : 'Post to the board'}
              </button>
            </form>
          )}

          {posts === undefined ? (
            <p role="status">Loading the board…</p>
          ) : visible.length === 0 ? (
            <p className="shell-muted" data-testid="lostfound-empty">
              Nothing here right now
              {filter !== 'all' ? ` under “${filter}”` : ''} — posts expire after 30 days.
            </p>
          ) : (
            <ul className="lf-list" data-testid="lostfound-list">
              {visible.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  ownUid={identity.uid}
                  onResolve={(id) => void resolvePost(id)}
                  onDelete={(id) => void deletePost(id)}
                  onClaim={claimPost}
                  claimed={claimedIds.has(post.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
