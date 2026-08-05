// src/app/routes/PapersRoute.tsx
//
// Past Papers & Notes library on the shell (#440), the React port of the
// legacy js/ui/papersTab.js browse/upload/report flows: auth-gated browse
// (course search + type filter over approved papers), preview/download via the
// papers Worker (with the #375 MIME retype in papersRepo), a catalog-validated
// upload form, and per-paper reporting. The admin approval queue stays on the
// admin dashboard.
//
// Data access lives in platform/firebase/papersRepo. E2E seams:
//   window.__shohojPapersRepo     — repo injection
//   window.__shohojPapersIdentity — {uid,email} signed-in stand-in

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  normalizeCourseCode,
  isKnownCourseCode,
  validatePaperUpload,
  PAPER_TYPES,
  PAPER_TYPE_LABELS,
  type PaperType,
} from '../../core/papers.ts';
import { BRACU_COURSE_DB } from '../../features/calculator/catalog.ts';
import {
  createPapersRepo,
  REPORT_REASON_MAX,
  type PaperRecord,
  type PapersRepo,
} from '../../platform/firebase/papersRepo.ts';
import { useAuth, useIdToken } from '../providers/AuthProvider';
import { useRuntimeConfig } from '../providers/RuntimeConfigProvider';
import { useNotifications } from '../../state/NotificationProvider';

declare global {
  interface Window {
    __shohojPapersRepo?: PapersRepo;
    __shohojPapersIdentity?: { uid: string; email: string };
  }
}

type TypeFilter = PaperType | 'all';

function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface UploadFormState {
  courseCode: string;
  type: PaperType;
  title: string;
  semester: string;
  facultyInitials: string;
}

const EMPTY_UPLOAD: UploadFormState = {
  courseCode: '',
  type: 'midterm',
  title: '',
  semester: '',
  facultyInitials: '',
};

type ListState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; papers: PaperRecord[] };

export function Component() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const { notify } = useNotifications();

  const identity = useMemo(() => {
    if (auth.status === 'authenticated' && auth.uid) return { uid: auth.uid };
    const seam = typeof window !== 'undefined' ? window.__shohojPapersIdentity : undefined;
    return seam ? { uid: seam.uid } : null;
  }, [auth]);

  const getIdToken = useIdToken();
  const repo = useMemo<PapersRepo | null>(() => {
    if (typeof window !== 'undefined' && window.__shohojPapersRepo) {
      return window.__shohojPapersRepo;
    }
    if (!config) return null;
    return createPapersRepo({
      config: config.firebase,
      recaptchaV3SiteKey: config.recaptchaV3SiteKey,
      workerUrl: config.papersWorkerUrl,
      getIdToken,
    });
  }, [config, getIdToken]);

  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportedIds, setReportedIds] = useState<ReadonlySet<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const canUse = repo !== null && identity !== null;

  // The search only queries Firestore for full known course codes (legacy
  // parity: partial text filters the recent list client-side instead).
  const searchCode = normalizeCourseCode(query);
  const isCourseQuery = isKnownCourseCode(searchCode, BRACU_COURSE_DB);

  const repoRef = useRef(repo);
  repoRef.current = repo;
  useEffect(() => {
    if (!canUse) return;
    let live = true;
    setList({ phase: 'loading' });
    const r = repoRef.current!;
    (isCourseQuery ? r.listByCourse(searchCode) : r.listRecent())
      .then((papers) => {
        if (live) setList({ phase: 'ready', papers });
      })
      .catch(() => {
        // Load errors are distinct from "no papers" (missing index, offline…).
        if (live) setList({ phase: 'error' });
      });
    return () => {
      live = false;
    };
  }, [canUse, isCourseQuery, searchCode, reloadKey]);

  const visible = useMemo(() => {
    if (list.phase !== 'ready') return [];
    let papers = list.papers;
    if (!isCourseQuery && searchCode !== '') {
      papers = papers.filter(
        (p) => p.courseCode.includes(searchCode) || p.title.toUpperCase().includes(searchCode),
      );
    }
    if (typeFilter !== 'all') papers = papers.filter((p) => p.type === typeFilter);
    return papers;
  }, [list, isCourseQuery, searchCode, typeFilter]);

  const openPaper = async (paper: PaperRecord, mode: 'preview' | 'download') => {
    if (!repo || busyId !== null) return;
    setBusyId(paper.id);
    try {
      const url = await repo.downloadUrl(paper.id);
      if (!url) {
        notify({ kind: 'error', message: 'Could not fetch the file. Try again shortly.' });
        return;
      }
      if (mode === 'preview') {
        window.open(url, '_blank', 'noopener');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${paper.courseCode}_${paper.title}`.replace(/[^\w.-]+/g, '_');
        a.click();
      }
    } finally {
      setBusyId(null);
    }
  };

  const submitReport = async (paperId: string) => {
    if (!repo || !identity) return;
    try {
      await repo.report(paperId, reportReason.trim(), identity.uid);
      setReportedIds((prev) => new Set(prev).add(paperId));
      setReportingId(null);
      setReportReason('');
      notify({ kind: 'success', message: 'Reported. An admin will take a look.' });
    } catch {
      notify({ kind: 'error', message: 'Report failed. Try again.' });
    }
  };

  const submitUpload = async () => {
    if (!repo || uploading) return;
    const err = validatePaperUpload(
      {
        file: uploadFile,
        courseCode: uploadForm.courseCode,
        type: uploadForm.type,
        title: uploadForm.title,
      },
      BRACU_COURSE_DB,
    );
    if (err) {
      setUploadError(err);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const result = await repo.upload({
        file: uploadFile!,
        courseCode: normalizeCourseCode(uploadForm.courseCode),
        type: uploadForm.type,
        title: uploadForm.title.trim(),
        ...(uploadForm.semester.trim() !== '' ? { semester: uploadForm.semester.trim() } : {}),
        ...(uploadForm.facultyInitials.trim() !== ''
          ? { facultyInitials: uploadForm.facultyInitials.trim() }
          : {}),
      });
      if (result.ok) {
        setUploadForm(EMPTY_UPLOAD);
        setUploadFile(null);
        setUploadOpen(false);
        notify({
          kind: 'success',
          message: 'Uploaded! Your paper appears once an admin approves it.',
        });
      } else {
        setUploadError(result.error);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="shell-page papers-page" data-testid="papers-page">
      <h1>Past Papers &amp; Notes</h1>
      <p className="shell-muted">
        Browse and share past midterms, finals, quizzes, and notes — searchable by course, reviewed
        before they appear.
      </p>

      {!canUse ? (
        <p className="papers-signin shell-muted" data-testid="papers-signin">
          Sign in with your BRACU Google account to browse and share past papers.
        </p>
      ) : (
        <>
          <div className="papers-toolbar">
            <input
              className="papers-search"
              type="search"
              placeholder="Search by course code, e.g. CSE110"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search papers by course code"
              data-testid="papers-search"
            />
            <button
              type="button"
              className="shell-btn shell-btn--primary"
              onClick={() => setUploadOpen((v) => !v)}
              aria-expanded={uploadOpen}
              data-testid="papers-upload-toggle"
            >
              {uploadOpen ? 'Close' : 'Share a paper'}
            </button>
          </div>

          {uploadOpen && (
            <form
              className="papers-upload"
              data-testid="papers-upload-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitUpload();
              }}
            >
              <div className="papers-upload-row">
                <label className="papers-field">
                  <span className="papers-field-label">File (PDF or image, ≤10 MB)</span>
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    data-testid="papers-file"
                  />
                </label>
                <label className="papers-field">
                  <span className="papers-field-label">Course code</span>
                  <input
                    className="papers-input"
                    type="text"
                    placeholder="CSE110"
                    value={uploadForm.courseCode}
                    onChange={(e) => setUploadForm({ ...uploadForm, courseCode: e.target.value })}
                    data-testid="papers-course"
                  />
                </label>
                <label className="papers-field">
                  <span className="papers-field-label">Type</span>
                  <select
                    className="papers-input"
                    value={uploadForm.type}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, type: e.target.value as PaperType })
                    }
                    data-testid="papers-type"
                  >
                    {PAPER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PAPER_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="papers-upload-row">
                <label className="papers-field papers-field--grow">
                  <span className="papers-field-label">Title</span>
                  <input
                    className="papers-input"
                    type="text"
                    maxLength={120}
                    placeholder="e.g. Fall 2025 midterm with solutions"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    data-testid="papers-title"
                  />
                </label>
                <label className="papers-field">
                  <span className="papers-field-label">Semester (optional)</span>
                  <input
                    className="papers-input"
                    type="text"
                    maxLength={40}
                    placeholder="Fall 2025"
                    value={uploadForm.semester}
                    onChange={(e) => setUploadForm({ ...uploadForm, semester: e.target.value })}
                  />
                </label>
                <label className="papers-field">
                  <span className="papers-field-label">Faculty (optional)</span>
                  <input
                    className="papers-input"
                    type="text"
                    maxLength={20}
                    placeholder="ABC"
                    value={uploadForm.facultyInitials}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, facultyInitials: e.target.value })
                    }
                  />
                </label>
              </div>
              {uploadError !== null && (
                <p className="papers-error" role="alert" data-testid="papers-upload-error">
                  {uploadError}
                </p>
              )}
              <button
                type="submit"
                className="shell-btn shell-btn--primary papers-upload-send"
                disabled={uploading}
                data-testid="papers-upload-send"
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
          )}

          <div className="papers-filters" role="group" aria-label="Filter by type">
            {(['all', ...PAPER_TYPES] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={typeFilter === t ? 'papers-chip papers-chip--active' : 'papers-chip'}
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                data-testid={`papers-filter-${t}`}
              >
                {t === 'all' ? 'All' : PAPER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {list.phase === 'loading' ? (
            <p role="status">Loading the library…</p>
          ) : list.phase === 'error' ? (
            <div className="papers-load-error" data-testid="papers-load-error">
              <p>Could not load the library. Try again shortly.</p>
              <button
                type="button"
                className="shell-btn"
                onClick={() => setReloadKey((k) => k + 1)}
                data-testid="papers-retry"
              >
                Retry
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="papers-empty shell-muted" data-testid="papers-empty">
              {searchCode !== ''
                ? `No approved papers for “${searchCode}” yet — be the first to share one.`
                : 'No approved papers yet — be the first to share one.'}
            </p>
          ) : (
            <ul className="papers-list" data-testid="papers-list">
              {visible.map((paper) => (
                <li key={paper.id} className="papers-item" data-testid={`papers-item-${paper.id}`}>
                  <div className="papers-item-head">
                    <span className="papers-item-course">{paper.courseCode}</span>
                    <span className="papers-tag">
                      {PAPER_TYPE_LABELS[paper.type as PaperType] ?? paper.type}
                    </span>
                    <span className="papers-item-date">{formatDate(paper.createdAtMs)}</span>
                  </div>
                  <p className="papers-item-title">{paper.title}</p>
                  <p className="papers-item-meta shell-muted">
                    {[paper.semester, paper.facultyInitials, formatBytes(paper.size)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="papers-item-actions">
                    <button
                      type="button"
                      className="shell-btn"
                      disabled={busyId !== null}
                      onClick={() => void openPaper(paper, 'preview')}
                      data-testid={`papers-preview-${paper.id}`}
                    >
                      {busyId === paper.id ? 'Opening…' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      className="shell-btn"
                      disabled={busyId !== null}
                      onClick={() => void openPaper(paper, 'download')}
                      data-testid={`papers-download-${paper.id}`}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="papers-report"
                      disabled={reportedIds.has(paper.id)}
                      onClick={() => {
                        setReportingId((cur) => (cur === paper.id ? null : paper.id));
                        setReportReason('');
                      }}
                      data-testid={`papers-report-${paper.id}`}
                    >
                      {reportedIds.has(paper.id) ? 'Reported' : 'Report'}
                    </button>
                  </div>
                  {reportingId === paper.id && (
                    <div className="papers-report-box" data-testid="papers-report-box">
                      <label className="papers-field-label" htmlFor={`papers-reason-${paper.id}`}>
                        Why are you reporting this?
                      </label>
                      <textarea
                        id={`papers-reason-${paper.id}`}
                        className="papers-input papers-reason"
                        maxLength={REPORT_REASON_MAX}
                        placeholder="Wrong course, broken file, not a past paper…"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="shell-btn"
                        onClick={() => void submitReport(paper.id)}
                        data-testid="papers-report-send"
                      >
                        Send report
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
