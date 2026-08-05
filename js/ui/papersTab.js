// ── js/ui/papersTab.js ────────────────────────────────────────────────────────
// Past Papers & Notes browse tab. Course-code search + filtered list of
// approved papers. Upload and reporting flows hang off this view.

import {
  fetchRecentPapers, fetchPapersByCourse, getPaperDownloadUrl,
  uploadPaper, reportPaper, isKnownCourseCode, normalizeCourseCode,
  PAPER_TYPE_LABELS, paperTimestampMs, MAX_FILE_SIZE,
  isPaperAdmin, fetchUnapprovedPapers, fetchPaperReports,
  approvePaper, deletePaper, deletePaperReport,
} from '../core/papers.js';
import { COURSE_DB } from '../core/catalog.js';
import { escHtml, escAttr, confirmDestructive } from '../core/helpers.js';
import { registerAction } from '../core/dispatch.js';
import { openPreviewModal } from './previewModal.js';

registerAction('papers:signin', () => window._shohoj_signIn && window._shohoj_signIn());
registerAction('papers:retry', () => _loadList());

function _isSignedIn() {
  return typeof window._shohoj_currentUid === 'function' && !!window._shohoj_currentUid();
}

function _isAuthReady() {
  return typeof window._shohoj_isAuthReady === 'function' ? !!window._shohoj_isAuthReady() : true;
}

let _state = {
  query: '',
  type: 'all',
  papers: [],
  loading: false,
  error: false,
};

function _formatBytes(n) {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function _formatDate(p) {
  const ms = paperTimestampMs(p);
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function _papersSignInPrompt() {
  return `
    <div class="papers-empty">
      <h3>📚 Past Papers & Notes</h3>
      <p>Sign in with your BRACU email to browse and share past papers, quizzes, and notes.</p>
      <button class="btn-primary" data-action="papers:signin">Sign in with Google</button>
    </div>
  `;
}

function _emptyList(message) {
  return `<div class="papers-empty-list">${escHtml(message)}</div>`;
}

function _skeletonCard() {
  return `
    <div class="paper-card paper-card--skeleton" aria-hidden="true">
      <div class="paper-card-head">
        <div class="paper-skel paper-skel-course"></div>
        <div class="paper-skel paper-skel-type"></div>
      </div>
      <div class="paper-skel paper-skel-title"></div>
      <div class="paper-skel paper-skel-title paper-skel-title--short"></div>
      <div class="paper-card-meta">
        <div class="paper-skel paper-skel-pill"></div>
        <div class="paper-skel paper-skel-pill"></div>
        <div class="paper-skel paper-skel-pill paper-skel-pill--sm"></div>
      </div>
      <div class="paper-card-actions">
        <div class="paper-skel paper-skel-btn"></div>
        <div class="paper-skel paper-skel-btn paper-skel-btn--sm"></div>
      </div>
    </div>
  `;
}

function _skeletonList(count = 6) {
  return Array.from({ length: count }, _skeletonCard).join('');
}

const _ICON_EYE = `<svg class="paper-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const _ICON_DOWNLOAD = `<svg class="paper-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const _ICON_FLAG = `<svg class="paper-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;

const _LBL_PREVIEW  = `${_ICON_EYE}<span>Preview</span>`;
const _LBL_DOWNLOAD = `${_ICON_DOWNLOAD}<span>Download</span>`;

function _paperCard(p) {
  const typeLabel = PAPER_TYPE_LABELS[p.type] || p.type || 'Paper';
  const semester = p.semester ? `<span class="paper-card-meta-pill">${escHtml(p.semester)}</span>` : '';
  const faculty = p.facultyInitials ? `<span class="paper-card-meta-pill">${escHtml(p.facultyInitials)}</span>` : '';
  const size = _formatBytes(p.fileSize);
  const sizePill = size ? `<span class="paper-card-meta-pill">${escHtml(size)}</span>` : '';
  const date = _formatDate(p);
  const datePill = date ? `<span class="paper-card-meta-pill">${escHtml(date)}</span>` : '';
  return `
    <article class="paper-card" data-paper-id="${escAttr(p.id)}">
      <header class="paper-card-head">
        <div class="paper-card-course">${escHtml(p.courseCode || '')}</div>
        <div class="paper-card-type">${escHtml(typeLabel)}</div>
      </header>
      <h4 class="paper-card-title">${escHtml(p.title || 'Untitled')}</h4>
      <div class="paper-card-meta">${semester}${faculty}${sizePill}${datePill}</div>
      <div class="paper-card-actions">
        <button class="paper-card-preview" data-paper-id="${escAttr(p.id || '')}" data-mime="${escAttr(p.mimeType || '')}" data-title="${escAttr([p.courseCode, p.title || 'Untitled'].filter(Boolean).join(' — '))}">${_LBL_PREVIEW}</button>
        <button class="paper-card-download" data-paper-id="${escAttr(p.id || '')}">${_LBL_DOWNLOAD}</button>
        <button class="paper-card-report" data-id="${escAttr(p.id)}" title="Report this paper" aria-label="Report this paper">${_ICON_FLAG}</button>
      </div>
    </article>
  `;
}

function _renderShell() {
  const root = document.getElementById('papersContent');
  if (!root) return;
  const adminBtn = isPaperAdmin()
    ? '<button class="papers-mod-btn" id="papersModBtn" title="Moderation">🛡️ Moderate</button>'
    : '';
  root.innerHTML = `
    <div class="papers-tab-shell">
      <header class="papers-tab-head">
        <div>
          <h3>📚 Past Papers & Notes</h3>
          <p class="papers-tab-sub">Browse student-uploaded papers, quizzes, and notes by course code.</p>
        </div>
        <div class="papers-tab-head-actions">
          ${adminBtn}
          <button class="btn-primary papers-upload-btn" id="papersUploadBtn">＋ Upload</button>
        </div>
      </header>

      <div class="papers-tab-controls">
        <input
          type="text"
          id="papersSearchInput"
          class="papers-search"
          placeholder="Search by course code (e.g. CSE220, MAT110)…"
          autocomplete="off"
        />
        <select id="papersTypeFilter" class="papers-type-filter">
          <option value="all">All types</option>
          <option value="midterm">Midterm</option>
          <option value="final">Final</option>
          <option value="quiz">Quiz</option>
          <option value="notes">Notes</option>
          <option value="assignment">Assignment</option>
          <option value="lab">Lab Report</option>
          <option value="lab-quiz">Lab Quiz</option>
        </select>
      </div>

      <div class="papers-list" id="papersList"></div>
    </div>
  `;
  // Null-safe wiring: a throw here (e.g. an element missing during a re-render
  // race) would reject renderPapersTab before it reaches _loadList(), leaving the
  // shell mounted with a permanently empty #papersList.
  document.getElementById('papersSearchInput')?.addEventListener('input', _onPapersSearchInput);
  document.getElementById('papersTypeFilter')?.addEventListener('change', _onTypeChange);
  document.getElementById('papersUploadBtn')?.addEventListener('click', _openUploadModal);
  document.getElementById('papersModBtn')?.addEventListener('click', _openModerationPanel);
  document.getElementById('papersList')?.addEventListener('click', _onListClick);
}

// ── Admin moderation panel ───────────────────────────────────────────────────
async function _openModerationPanel() {
  if (!isPaperAdmin()) return;
  const wrap = document.createElement('div');
  wrap.className = 'paper-modal-backdrop';
  wrap.innerHTML = `
    <div class="paper-modal paper-modal--wide">
      <header class="paper-modal-head">
        <h4>🛡️ Moderation</h4>
        <button class="paper-modal-close" aria-label="Close">×</button>
      </header>
      <div class="paper-mod-tabs">
        <button class="paper-mod-tab active" data-mod-tab="pending">Pending review</button>
        <button class="paper-mod-tab" data-mod-tab="reports">Reports</button>
      </div>
      <div class="paper-mod-body" id="paperModBody">
        <div class="papers-empty-list">Loading…</div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.paper-modal-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  const body = wrap.querySelector('#paperModBody');
  const tabs = wrap.querySelectorAll('.paper-mod-tab');
  let activeTab = 'pending';

  async function loadTab(name) {
    activeTab = name;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.modTab === name));
    body.innerHTML = '<div class="papers-empty-list">Loading…</div>';
    if (name === 'pending') {
      const list = await fetchUnapprovedPapers();
      body.innerHTML = list.length
        ? list.map(_pendingPaperRow).join('')
        : '<div class="papers-empty-list">No papers waiting for review.</div>';
    } else {
      const reports = await fetchPaperReports();
      body.innerHTML = reports.length
        ? reports.map(_reportRow).join('')
        : '<div class="papers-empty-list">No reports.</div>';
    }
  }

  body.addEventListener('click', async e => {
    const approveBtn = e.target.closest('[data-mod-action="approve"]');
    const deleteBtn  = e.target.closest('[data-mod-action="delete"]');
    const dismissBtn = e.target.closest('[data-mod-action="dismiss"]');
    const previewBtn = e.target.closest('[data-mod-action="preview"]');

    if (previewBtn) {
      const paperId = previewBtn.dataset.id;
      if (!paperId) return;
      previewBtn.disabled = true;
      const url = await getPaperDownloadUrl(paperId);
      previewBtn.disabled = false;
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    if (approveBtn) {
      const id = approveBtn.dataset.id;
      approveBtn.disabled = true;
      const res = await approvePaper(id);
      if (!res.ok) { _toast(res.error || 'Approve failed'); approveBtn.disabled = false; return; }
      _toast('Approved.');
      await loadTab(activeTab);
      // Refresh public list too
      _loadList();
      return;
    }
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const path = deleteBtn.dataset.path;
      if (!confirmDestructive('Delete this paper and its R2 file?', deleteBtn.dataset.label || 'this paper')) return;
      deleteBtn.disabled = true;
      const res = await deletePaper(id, path);
      if (!res.ok) { _toast(res.error || 'Delete failed'); deleteBtn.disabled = false; return; }
      _toast('Deleted.');
      await loadTab(activeTab);
      _loadList();
      return;
    }
    if (dismissBtn) {
      const id = dismissBtn.dataset.id;
      dismissBtn.disabled = true;
      const res = await deletePaperReport(id);
      if (!res.ok) { _toast(res.error || 'Dismiss failed'); dismissBtn.disabled = false; return; }
      await loadTab(activeTab);
      return;
    }
  });

  tabs.forEach(t => t.addEventListener('click', () => loadTab(t.dataset.modTab)));
  loadTab('pending');
}

function _pendingPaperRow(p) {
  const typeLabel = PAPER_TYPE_LABELS[p.type] || p.type;
  const meta = [p.semester, p.facultyInitials].filter(Boolean).map(escHtml).join(' · ');
  const label = [p.courseCode, p.title || 'Untitled'].filter(Boolean).join(' — ');
  return `
    <div class="paper-mod-row">
      <div class="paper-mod-row-main">
        <div class="paper-mod-row-head">
          <span class="paper-card-course">${escHtml(p.courseCode)}</span>
          <span class="paper-card-type">${escHtml(typeLabel)}</span>
        </div>
        <div class="paper-mod-row-title">${escHtml(p.title || 'Untitled')}</div>
        <div class="paper-mod-row-meta">${meta}</div>
      </div>
      <div class="paper-mod-row-actions">
        <button data-mod-action="preview" data-id="${escAttr(p.id || '')}">Preview</button>
        <button data-mod-action="approve" data-id="${escAttr(p.id)}" class="paper-mod-approve">Approve</button>
        <button data-mod-action="delete"  data-id="${escAttr(p.id)}" data-path="${escAttr(p.storagePath || '')}" data-label="${escAttr(label)}" class="paper-mod-delete">Delete</button>
      </div>
    </div>
  `;
}

function _reportRow(r) {
  return `
    <div class="paper-mod-row">
      <div class="paper-mod-row-main">
        <div class="paper-mod-row-head">
          <span class="paper-card-course">Paper ${escHtml(String(r.paperId).slice(0, 12))}…</span>
        </div>
        <div class="paper-mod-row-title">${escHtml(r.reason || '(no reason given)')}</div>
        <div class="paper-mod-row-meta">Reporter: ${escHtml(String(r.reporterUid || '').slice(0, 8))}…</div>
      </div>
      <div class="paper-mod-row-actions">
        <button data-mod-action="dismiss" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

let _searchDebounce = null;
function _onPapersSearchInput(e) {
  _state.query = String(e.target.value || '').toUpperCase().trim();
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(_loadList, 250);
}

function _onTypeChange(e) {
  _state.type = e.target.value;
  _renderPapersList();
}

async function _onListClick(e) {
  const pv = e.target.closest('.paper-card-preview');
  if (pv) {
    const paperId = pv.dataset.paperId;
    if (!paperId) return;
    pv.disabled = true;
    pv.innerHTML = '<span>Loading…</span>';
    const url = await getPaperDownloadUrl(paperId);
    pv.disabled = false;
    pv.innerHTML = _LBL_PREVIEW;
    if (!url) {
      _toast('Could not load preview.');
      return;
    }
    openPreviewModal({ url, title: pv.dataset.title || 'Preview', mimeType: pv.dataset.mime });
    return;
  }
  const dl = e.target.closest('.paper-card-download');
  if (dl) {
    const paperId = dl.dataset.paperId;
    if (!paperId) return;
    dl.disabled = true;
    dl.innerHTML = '<span>Loading…</span>';
    const url = await getPaperDownloadUrl(paperId);
    dl.disabled = false;
    dl.innerHTML = _LBL_DOWNLOAD;
    if (!url) {
      _toast('Could not fetch download link.');
      return;
    }
    window.open(url, '_blank', 'noopener');
    return;
  }
  const rep = e.target.closest('.paper-card-report');
  if (rep) {
    const paperId = rep.dataset.id;
    if (!paperId) return;
    _openReportModal(paperId);
  }
}

// Pure list-body builder. Returns the inner HTML for #papersList given a state
// snapshot, so the loading / error / empty / populated branches are unit-testable
// without a DOM. A swallowed query failure (error) must read differently from a
// genuinely empty library (no papers) — see _loadList.
export function papersListHtml(state) {
  if (state.loading) return _skeletonList(6);

  if (state.error) {
    return `
      <div class="papers-empty-list">
        Couldn't load papers.
        <button class="papers-retry-btn" data-action="papers:retry">Retry</button>
      </div>
    `;
  }

  const filtered = state.type === 'all'
    ? state.papers
    : state.papers.filter(p => p.type === state.type);

  if (!filtered.length) {
    return state.query
      ? _emptyList(`No papers found for ${state.query}. Be the first to upload one!`)
      : _emptyList('No papers yet. Upload yours to get the library started.');
  }

  // Per-card guard: one malformed paper must not throw and blank the whole list.
  return filtered.map(p => {
    try {
      return _paperCard(p);
    } catch (e) {
      console.error('[Shohoj] paper card render failed:', p && p.id, e);
      return '';
    }
  }).join('');
}

function _renderPapersList() {
  const list = document.getElementById('papersList');
  if (!list) return;
  list.innerHTML = papersListHtml(_state);
}

// Monotonic load sequence. shohoj:auth-changed fires repeatedly during Firestore
// sync, so multiple _loadList() calls can overlap; only the newest may paint, or
// a slow stale fetch could clobber a fresher result (or an empty list).
let _loadSeq = 0;

async function _loadList() {
  const seq = ++_loadSeq;
  _state.loading = true;
  _state.error = false;
  _renderPapersList();
  let papers;
  let error = false;
  try {
    if (_state.query && isKnownCourseCode(_state.query)) {
      papers = await fetchPapersByCourse(_state.query);
    } else if (_state.query) {
      papers = [];
    } else {
      papers = await fetchRecentPapers(30);
    }
  } catch {
    papers = [];
    error = true;
  }
  // A newer load superseded this one — drop the stale result.
  if (seq !== _loadSeq) return;
  _state.papers = papers;
  _state.error = error;
  _state.loading = false;
  _renderPapersList();
}

// ── Upload modal ─────────────────────────────────────────────────────────────
// Module-level draft. Survives modal close/reopen (intentional: an accidental
// dismiss should not nuke the user's work). Cleared only on successful upload
// or full page refresh — File objects can't be persisted to localStorage and
// the only sensible discard hatch is the explicit "Clear draft" button below.
let _uploadDraft = null;

function _draftHasContent(d) {
  if (!d) return false;
  return !!(d.courseCode || d.title || d.semester || d.facultyInitials || d.file);
}

function _openUploadModal() {
  if (!_isSignedIn()) {
    _toast('Sign in to upload papers.');
    return;
  }
  const draft = _uploadDraft || {};
  const wrap = document.createElement('div');
  wrap.className = 'paper-modal-backdrop';
  wrap.innerHTML = `
    <div class="paper-modal">
      <header class="paper-modal-head">
        <h4>Upload a paper</h4>
        <button type="button" class="paper-modal-clear-draft" id="paperUploadClearDraft" hidden>Clear draft</button>
        <button class="paper-modal-close" aria-label="Close">×</button>
      </header>
      <form class="paper-modal-form" id="paperUploadForm">
        <label>
          <span>Course code</span>
          <input name="courseCode" placeholder="e.g. CSE220" maxlength="8" required value="${escAttr(draft.courseCode || '')}" />
        </label>
        <label>
          <span>Type</span>
          <select name="type" required>
            <option value="midterm">Midterm</option>
            <option value="final">Final</option>
            <option value="quiz">Quiz</option>
            <option value="notes">Notes</option>
            <option value="assignment">Assignment</option>
            <option value="lab">Lab Report</option>
            <option value="lab-quiz">Lab Quiz</option>
          </select>
        </label>
        <label>
          <span>Title</span>
          <input name="title" placeholder="e.g. CSE220 Midterm Spring 2024" maxlength="120" required value="${escAttr(draft.title || '')}" />
        </label>
        <label>
          <span>Semester (optional)</span>
          <input name="semester" placeholder="e.g. Spring2024" maxlength="40" value="${escAttr(draft.semester || '')}" />
        </label>
        <label>
          <span>Faculty initials (optional)</span>
          <input name="facultyInitials" placeholder="e.g. MAK or MOM, ASH" maxlength="20" value="${escAttr(draft.facultyInitials || '')}" />
        </label>
        <label>
          <span>File (PDF, PNG, JPEG, WebP, or GIF, max 10 MB)</span>
          <input name="file" id="paperUploadFile" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" />
          <span class="paper-modal-file-info" id="paperUploadFileInfo"></span>
        </label>
        <p class="paper-modal-note">By uploading, you confirm you have rights to share this content. Uploads are reviewed before going public.</p>
        <div class="paper-modal-actions">
          <button type="button" class="btn-secondary paper-modal-cancel">Cancel</button>
          <button type="submit" class="btn-primary" id="paperUploadSubmit">Upload</button>
        </div>
        <div class="paper-modal-error" id="paperUploadError"></div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);

  const form     = wrap.querySelector('#paperUploadForm');
  const typeSel  = form.elements.type;
  const fileInput = wrap.querySelector('#paperUploadFile');
  const fileInfo  = wrap.querySelector('#paperUploadFileInfo');
  const errBoxEl  = wrap.querySelector('#paperUploadError');
  const submitEl  = wrap.querySelector('#paperUploadSubmit');
  const clearBtn  = wrap.querySelector('#paperUploadClearDraft');

  if (draft.type) typeSel.value = draft.type;

  // Browsers forbid programmatic population of <input type="file">, so when a
  // draft already has a File we display it ourselves and read from the in-memory
  // draft at submit time. The native input is only consulted for new picks.
  function _renderFileState() {
    fileInfo.textContent = '';
    fileInfo.classList.remove('paper-modal-file-info--error');
    submitEl.disabled = false;
    const picked = fileInput.files && fileInput.files[0];
    const f = picked || (_uploadDraft && _uploadDraft.file);
    if (!f) return;
    const sizeStr = _formatBytes(f.size);
    const restored = !picked && _uploadDraft && _uploadDraft.file;
    const restoredHint = restored ? ' (still selected from earlier)' : '';
    if (f.size <= 0) {
      fileInfo.textContent = `${f.name} — file is empty`;
      fileInfo.classList.add('paper-modal-file-info--error');
      submitEl.disabled = true;
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      const limitMb = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      fileInfo.textContent = `${f.name} — ${sizeStr}. Too large. Limit is ${limitMb} MB. Try compressing the PDF (e.g. macOS Preview → Export → Reduce File Size).`;
      fileInfo.classList.add('paper-modal-file-info--error');
      submitEl.disabled = true;
      return;
    }
    if (!/^application\/pdf$|^image\//.test(f.type || '')) {
      fileInfo.textContent = `${f.name} — only PDFs and images are allowed.`;
      fileInfo.classList.add('paper-modal-file-info--error');
      submitEl.disabled = true;
      return;
    }
    fileInfo.textContent = `${f.name} — ${sizeStr}${restoredHint}`;
  }

  function _refreshClearBtn() {
    clearBtn.hidden = !_draftHasContent(_uploadDraft);
  }

  function _saveDraft() {
    _uploadDraft = _uploadDraft || {};
    _uploadDraft.courseCode      = form.elements.courseCode.value;
    _uploadDraft.type            = form.elements.type.value;
    _uploadDraft.title           = form.elements.title.value;
    _uploadDraft.semester        = form.elements.semester.value;
    _uploadDraft.facultyInitials = form.elements.facultyInitials.value;
    _refreshClearBtn();
  }

  _renderFileState();
  _refreshClearBtn();

  ['courseCode','title','semester','facultyInitials'].forEach(name => {
    form.elements[name].addEventListener('input', _saveDraft);
  });
  typeSel.addEventListener('change', _saveDraft);

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) {
      _uploadDraft = _uploadDraft || {};
      _uploadDraft.file = f;
      _saveDraft();
    }
    errBoxEl.textContent = '';
    _renderFileState();
  });

  clearBtn.addEventListener('click', () => {
    _uploadDraft = null;
    form.reset();
    typeSel.value = 'midterm';
    fileInput.value = '';
    errBoxEl.textContent = '';
    _renderFileState();
    _refreshClearBtn();
  });

  const close = () => wrap.remove();
  wrap.querySelector('.paper-modal-close').addEventListener('click', close);
  wrap.querySelector('.paper-modal-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    _saveDraft();
    const picked = fileInput.files && fileInput.files[0];
    const file = picked || (_uploadDraft && _uploadDraft.file);
    errBoxEl.textContent = '';
    if (!file) {
      errBoxEl.textContent = 'Please choose a file.';
      return;
    }
    submitEl.disabled = true;
    submitEl.textContent = 'Uploading…';
    const res = await uploadPaper({
      file,
      courseCode:      _uploadDraft.courseCode,
      type:            _uploadDraft.type,
      title:           _uploadDraft.title,
      semester:        _uploadDraft.semester,
      facultyInitials: _uploadDraft.facultyInitials,
    });
    submitEl.disabled = false;
    submitEl.textContent = 'Upload';
    if (!res.ok) {
      errBoxEl.textContent = res.error || 'Upload failed';
      return;
    }
    _uploadDraft = null;
    close();
    _toast('Uploaded — pending admin review.');
  });
}

// ── Report modal ─────────────────────────────────────────────────────────────
function _openReportModal(paperId) {
  if (!_isSignedIn()) {
    _toast('Sign in to report papers.');
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'paper-modal-backdrop';
  wrap.innerHTML = `
    <div class="paper-modal">
      <header class="paper-modal-head">
        <h4>Report this paper</h4>
        <button class="paper-modal-close" aria-label="Close">×</button>
      </header>
      <form class="paper-modal-form" id="paperReportForm">
        <label>
          <span>Reason (3–300 chars)</span>
          <textarea name="reason" rows="4" minlength="3" maxlength="300" required></textarea>
        </label>
        <div class="paper-modal-actions">
          <button type="button" class="btn-secondary paper-modal-cancel">Cancel</button>
          <button type="submit" class="btn-primary">Submit report</button>
        </div>
        <div class="paper-modal-error" id="paperReportError"></div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.paper-modal-close').addEventListener('click', close);
  wrap.querySelector('.paper-modal-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#paperReportForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errBox = wrap.querySelector('#paperReportError');
    errBox.textContent = '';
    const res = await reportPaper(paperId, fd.get('reason'));
    if (!res.ok) {
      errBox.textContent = res.error || 'Report failed';
      return;
    }
    close();
    _toast('Report submitted — thank you.');
  });
}

function _toast(msg) {
  if (typeof window._shohoj_showToast === 'function') {
    window._shohoj_showToast(msg);
  } else {
    alert(msg);
  }
}

function _papersAuthLoadingState() {
  return `
    <div class="papers-empty papers-empty--loading">
      <h3>📚 Past Papers & Notes</h3>
      <p class="papers-tab-sub">Checking your sign-in…</p>
      <div class="papers-list" aria-hidden="true">${_skeletonList(3)}</div>
    </div>
  `;
}

export async function renderPapersTab() {
  const root = document.getElementById('papersContent');
  if (!root) return;
  const shellMounted = !!document.getElementById('papersList');
  // Only show the auth-loading / sign-in placeholders before the shell is up.
  // Once it's mounted, a transient auth flap (auth-changed fires repeatedly during
  // Firestore sync) must not wipe the list back to a placeholder.
  if (!_isAuthReady()) {
    if (!shellMounted) root.innerHTML = _papersAuthLoadingState();
    return;
  }
  if (!_isSignedIn()) {
    root.innerHTML = _papersSignInPrompt();
    return;
  }
  // Build the shell only when it isn't already mounted; otherwise reuse it and
  // just refresh the list. Rebuilding on every auth-changed tore down #papersList
  // mid-load and raced the async paint, leaving the list blank.
  if (!shellMounted) _renderShell();
  await _loadList();
}

window.addEventListener('shohoj:auth-changed', () => {
  const panel = document.getElementById('tabPapers');
  const papersVisible = !!panel && panel.classList.contains('active');
  const hash = window.location.hash || '';
  if (papersVisible || hash === '#calculator/papers') {
    renderPapersTab();
  }
});
