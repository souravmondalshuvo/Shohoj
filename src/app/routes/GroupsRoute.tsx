// src/app/routes/GroupsRoute.tsx
//
// Study Group Finder on the shell (#443), the React port of the legacy
// js/ui/groupsTab.js: an auth-gated board of open groups (newest first, course
// + mode filters), a validated create form, join/leave, a member-only email
// roster, creator delete behind the shared ConfirmDialog, and an inline report
// box. Admin moderation stays on the admin dashboard.
//
// Model logic lives in src/core/studyGroups; Firestore access in
// platform/firebase/studyGroupsRepo. E2E seams (lost-found parity):
//   window.__shohojGroupsRepo     — repo injection
//   window.__shohojGroupsIdentity — {uid,email} signed-in stand-in

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  groupAge,
  groupsView,
  normalizeCourseCode,
  summarizeMembers,
  validateGroupDraft,
  MODES,
  MODE_LABELS,
  MIN_CAPACITY,
  MAX_CAPACITY,
  type GroupMember,
  type GroupMode,
  type StudyGroup,
} from '../../core/studyGroups.ts';
import { BRACU_COURSE_DB } from '../../features/calculator/catalog.ts';
import {
  createStudyGroupsRepo,
  REPORT_REASON_MAX,
  type StudyGroupsRepo,
} from '../../platform/firebase/studyGroupsRepo.ts';
import { useAuth } from '../providers/AuthProvider';
import { useConfirm } from '../providers/ModalProvider';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { useNotifications } from '../../state/NotificationProvider';

declare global {
  interface Window {
    __shohojGroupsRepo?: StudyGroupsRepo;
    __shohojGroupsIdentity?: { uid: string; email: string };
  }
}

interface CreateFormState {
  courseCode: string;
  title: string;
  description: string;
  mode: GroupMode;
  schedule: string;
  contactLink: string;
  capacity: string;
}

const EMPTY_FORM: CreateFormState = {
  courseCode: '',
  title: '',
  description: '',
  mode: 'in-person',
  schedule: '',
  contactLink: '',
  capacity: '6',
};

export function Component() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const confirm = useConfirm();
  const { notify } = useNotifications();

  const identity = useMemo(() => {
    if (auth.status === 'authenticated' && auth.uid) {
      return { uid: auth.uid, email: auth.email ?? '' };
    }
    return typeof window !== 'undefined' ? (window.__shohojGroupsIdentity ?? null) : null;
  }, [auth]);

  const repo = useMemo<StudyGroupsRepo | null>(() => {
    if (typeof window !== 'undefined' && window.__shohojGroupsRepo) {
      return window.__shohojGroupsRepo;
    }
    if (!config) return null;
    return createStudyGroupsRepo({
      config: config.firebase,
      recaptchaV3SiteKey: config.recaptchaV3SiteKey,
    });
  }, [config]);

  const [groups, setGroups] = useState<StudyGroup[] | undefined>(undefined);
  const [myGroupIds, setMyGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [rosters, setRosters] = useState<ReadonlyMap<string, GroupMember[]>>(new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<GroupMode | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const canUse = repo !== null && identity !== null;

  const repoRef = useRef(repo);
  repoRef.current = repo;
  useEffect(() => {
    if (!canUse || !identity) return;
    let live = true;
    const r = repoRef.current!;
    Promise.all([r.listGroups(), r.listMyMemberships(identity.uid)])
      .then(([loaded, memberships]) => {
        if (!live) return;
        setGroups(loaded);
        setMyGroupIds(new Set(memberships.map((m) => m.groupId)));
      })
      .catch(() => {
        if (live) setGroups([]);
      });
    return () => {
      live = false;
    };
  }, [canUse, identity?.uid, reloadKey]);

  const visible = useMemo(
    () => groupsView(groups ?? [], modeFilter, courseFilter),
    [groups, modeFilter, courseFilter],
  );
  const now = Date.now();

  const submitCreate = async () => {
    if (!repo || !identity || submitting) return;
    const draft = {
      courseCode: normalizeCourseCode(form.courseCode),
      title: form.title.trim(),
      description: form.description.trim(),
      mode: form.mode,
      schedule: form.schedule.trim(),
      contactLink: form.contactLink.trim(),
      capacity: Number(form.capacity),
    };
    const err = validateGroupDraft(draft, BRACU_COURSE_DB);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await repo.create(draft, identity.uid);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      notify({ kind: 'success', message: 'Study group posted.' });
      setReloadKey((k) => k + 1);
    } catch {
      setFormError('Could not post group. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const join = async (group: StudyGroup) => {
    if (!repo || !identity) return;
    try {
      await repo.join(group.id, identity.uid, identity.email);
      setMyGroupIds((prev) => new Set(prev).add(group.id));
      setRosters((prev) => {
        const next = new Map(prev);
        next.delete(group.id);
        return next;
      });
    } catch {
      notify({ kind: 'error', message: 'Could not join. Try again.' });
    }
  };

  const leave = async (group: StudyGroup) => {
    if (!repo || !identity) return;
    try {
      await repo.leave(group.id, identity.uid);
      setMyGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(group.id);
        return next;
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(group.id);
        return next;
      });
    } catch {
      notify({ kind: 'error', message: 'Could not leave. Try again.' });
    }
  };

  const remove = async (group: StudyGroup) => {
    if (!repo) return;
    const ok = await confirm({
      title: 'Delete this study group?',
      message: group.title || group.courseCode,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.remove(group.id);
      setGroups((prev) => prev?.filter((g) => g.id !== group.id));
      notify({ kind: 'success', message: 'Group deleted.' });
    } catch {
      notify({ kind: 'error', message: 'Delete failed.' });
    }
  };

  const submitReport = async (group: StudyGroup) => {
    if (!repo || !identity) return;
    const reason = reportReason.trim();
    if (reason.length < 3) {
      notify({ kind: 'error', message: 'Please add a short reason.' });
      return;
    }
    try {
      await repo.report(group.id, reason, identity.uid);
      setReportingId(null);
      setReportReason('');
      notify({ kind: 'success', message: 'Reported. Thanks — an admin will review it.' });
    } catch {
      notify({ kind: 'error', message: 'Report failed. Try again.' });
    }
  };

  const toggleRoster = async (group: StudyGroup) => {
    if (!repo) return;
    if (expanded.has(group.id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(group.id);
        return next;
      });
      return;
    }
    setExpanded((prev) => new Set(prev).add(group.id));
    if (!rosters.has(group.id)) {
      const members = await repo.listMembers(group.id);
      setRosters((prev) => new Map(prev).set(group.id, members));
    }
  };

  return (
    <section className="shell-page groups-page" data-testid="groups-page">
      <h1>Study Groups</h1>
      <p className="shell-muted">
        Find classmates for a course, or post your own group — join a group to see its member
        roster.
      </p>

      {!canUse ? (
        <p className="groups-signin shell-muted" data-testid="groups-signin">
          Sign in with your BRACU Google account to post, browse, and join study groups.
        </p>
      ) : (
        <>
          <div className="groups-toolbar">
            <input
              className="groups-search"
              type="search"
              placeholder="Filter by course code…"
              autoComplete="off"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filter groups by course code"
              data-testid="groups-course-filter"
            />
            <div className="groups-modes" role="group" aria-label="Meeting mode">
              {(['all', ...MODES] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={modeFilter === m ? 'groups-chip groups-chip--active' : 'groups-chip'}
                  aria-pressed={modeFilter === m}
                  onClick={() => setModeFilter(m)}
                  data-testid={`groups-mode-${m}`}
                >
                  {m === 'all' ? 'All' : MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="shell-btn shell-btn--primary"
              onClick={() => setFormOpen((v) => !v)}
              aria-expanded={formOpen}
              data-testid="groups-create-toggle"
            >
              {formOpen ? 'Close' : '+ Post a group'}
            </button>
          </div>

          {formOpen && (
            <form
              className="groups-form"
              data-testid="groups-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitCreate();
              }}
            >
              <div className="groups-form-row">
                <label className="groups-field">
                  <span className="groups-field-label">Course code</span>
                  <input
                    className="groups-input"
                    type="text"
                    placeholder="e.g. CSE220"
                    value={form.courseCode}
                    onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
                    data-testid="groups-course"
                  />
                </label>
                <label className="groups-field groups-field--grow">
                  <span className="groups-field-label">Group name</span>
                  <input
                    className="groups-input"
                    type="text"
                    maxLength={80}
                    placeholder="e.g. Algorithms midterm grind"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    data-testid="groups-title"
                  />
                </label>
              </div>
              <label className="groups-field">
                <span className="groups-field-label">Description (optional)</span>
                <textarea
                  className="groups-input groups-desc"
                  maxLength={500}
                  placeholder="What you'll work on, who it's for…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <div className="groups-field">
                <span className="groups-field-label" id="groups-mode-label">
                  Meeting mode
                </span>
                <div className="groups-modes" role="group" aria-labelledby="groups-mode-label">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={
                        form.mode === m ? 'groups-chip groups-chip--active' : 'groups-chip'
                      }
                      aria-pressed={form.mode === m}
                      onClick={() => setForm({ ...form, mode: m })}
                      data-testid={`groups-form-mode-${m}`}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="groups-form-row">
                <label className="groups-field groups-field--grow">
                  <span className="groups-field-label">When / where (optional)</span>
                  <input
                    className="groups-input"
                    type="text"
                    maxLength={120}
                    placeholder="e.g. Sun & Tue, 4–6pm, Library 3rd floor"
                    value={form.schedule}
                    onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  />
                </label>
                <label className="groups-field">
                  <span className="groups-field-label">
                    Capacity ({MIN_CAPACITY}–{MAX_CAPACITY})
                  </span>
                  <input
                    className="groups-input groups-capacity"
                    type="number"
                    min={MIN_CAPACITY}
                    max={MAX_CAPACITY}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    data-testid="groups-capacity"
                  />
                </label>
              </div>
              <label className="groups-field">
                <span className="groups-field-label">Contact link (group chat)</span>
                <input
                  className="groups-input"
                  type="url"
                  maxLength={300}
                  placeholder="https://m.me/… or https://discord.gg/…"
                  value={form.contactLink}
                  onChange={(e) => setForm({ ...form, contactLink: e.target.value })}
                  data-testid="groups-contact"
                />
              </label>
              {formError !== null && (
                <p className="groups-error" role="alert" data-testid="groups-form-error">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                className="shell-btn shell-btn--primary groups-form-send"
                disabled={submitting}
                data-testid="groups-form-send"
              >
                {submitting ? 'Posting…' : 'Post study group'}
              </button>
            </form>
          )}

          {groups === undefined ? (
            <p role="status">Loading study groups…</p>
          ) : visible.length === 0 ? (
            <p className="groups-empty shell-muted" data-testid="groups-empty">
              {(groups?.length ?? 0) === 0
                ? 'No study groups yet. Be the first to post one!'
                : 'No groups match your filters.'}
            </p>
          ) : (
            <ul className="groups-list" data-testid="groups-list">
              {visible.map((group) => {
                const joined = myGroupIds.has(group.id);
                const isCreator = group.creatorUid === identity.uid;
                const roster = rosters.get(group.id);
                const sum = summarizeMembers(
                  joined && roster ? roster.length : null,
                  group.capacity,
                );
                return (
                  <li
                    key={group.id}
                    className="groups-item"
                    data-testid={`groups-item-${group.id}`}
                  >
                    <div className="groups-item-head">
                      <span className="groups-item-course">{group.courseCode}</span>
                      <span className="groups-tag">{MODE_LABELS[group.mode]}</span>
                      <span className="groups-item-count">{sum.label}</span>
                      {joined && (
                        <span className="groups-joined" data-testid={`groups-joined-${group.id}`}>
                          ✓ Joined
                        </span>
                      )}
                      <span className="groups-item-age">{groupAge(group.createdAtMs, now)}</span>
                    </div>
                    <p className="groups-item-title">{group.title || 'Untitled group'}</p>
                    {group.description && <p className="groups-item-desc">{group.description}</p>}
                    {group.schedule && (
                      <p className="groups-item-schedule shell-muted">🕑 {group.schedule}</p>
                    )}
                    {group.contactLink && (
                      <a
                        className="groups-item-link"
                        href={group.contactLink}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        data-testid={`groups-link-${group.id}`}
                      >
                        🔗 Open group chat
                      </a>
                    )}
                    <div className="groups-item-actions">
                      {joined ? (
                        <button
                          type="button"
                          className="shell-btn"
                          onClick={() => void leave(group)}
                          data-testid={`groups-leave-${group.id}`}
                        >
                          Leave
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="shell-btn shell-btn--primary"
                          onClick={() => void join(group)}
                          data-testid={`groups-join-${group.id}`}
                        >
                          Join
                        </button>
                      )}
                      {joined && (
                        <button
                          type="button"
                          className="shell-btn"
                          onClick={() => void toggleRoster(group)}
                          aria-expanded={expanded.has(group.id)}
                          data-testid={`groups-roster-toggle-${group.id}`}
                        >
                          {expanded.has(group.id) ? 'Hide members' : 'Members'}
                        </button>
                      )}
                      {isCreator ? (
                        <button
                          type="button"
                          className="groups-danger-link"
                          onClick={() => void remove(group)}
                          data-testid={`groups-delete-${group.id}`}
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="groups-muted-link"
                          onClick={() => {
                            setReportingId((cur) => (cur === group.id ? null : group.id));
                            setReportReason('');
                          }}
                          data-testid={`groups-report-${group.id}`}
                        >
                          Report
                        </button>
                      )}
                    </div>
                    {joined && expanded.has(group.id) && (
                      <div className="groups-roster" data-testid={`groups-roster-${group.id}`}>
                        <span className="groups-field-label">Members</span>
                        {roster === undefined ? (
                          <p className="shell-muted groups-roster-note">Loading members…</p>
                        ) : roster.length === 0 ? (
                          <p className="shell-muted groups-roster-note">No members yet.</p>
                        ) : (
                          <ul className="groups-roster-list">
                            {roster.map((m) => (
                              <li key={m.uid}>{m.email || '—'}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {reportingId === group.id && (
                      <div className="groups-report-box" data-testid="groups-report-box">
                        <label className="groups-field-label" htmlFor={`groups-reason-${group.id}`}>
                          What&apos;s wrong? (spam, abuse, dead link…)
                        </label>
                        <textarea
                          id={`groups-reason-${group.id}`}
                          className="groups-input groups-reason"
                          maxLength={REPORT_REASON_MAX}
                          value={reportReason}
                          onChange={(e) => setReportReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className="shell-btn"
                          onClick={() => void submitReport(group)}
                          data-testid="groups-report-send"
                        >
                          Send report
                        </button>
                      </div>
                    )}
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
