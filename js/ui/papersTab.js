// ── js/ui/papersTab.js ────────────────────────────────────────────────────────
// Past Papers & Notes browse tab. Course-code search + filtered list of
// approved papers. Upload and reporting flows hang off this view.

import {
  fetchRecentPapers, fetchPapersByCourse, getPaperDownloadUrl,
  uploadPaper, reportPaper, isKnownCourseCode, normalizeCourseCode,
  PAPER_TYPE_LABELS, paperTimestampMs,
  isPaperAdmin, fetchUnapprovedPapers, fetchPaperReports,
  approvePaper, deletePaper, deletePaperReport,
} from '../core/papers.js';
import { COURSE_DB } from '../core/catalog.js';
import { escHtml, escAttr } from '../core/helpers.js';

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

function _signInPrompt() {
  return `
    <div class="papers-empty">
      <h3>📚 Past Papers & Notes</h3>
      <p>Sign in with your BRACU email to browse and share past papers, quizzes, and notes.</p>
      <button class="btn-primary" onclick="window._shohoj_signIn && window._shohoj_signIn()">Sign in with Google</button>
    </div>
  `;
}

function _emptyList(message) {
  return `<div class="papers-empty-list">${escHtml(message)}</div>`;
}

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
        <button class="btn-secondary paper-card-download" data-path="${escAttr(p.storagePath || '')}">⬇ Download</button>
        <button class="paper-card-report" data-id="${escAttr(p.id)}" title="Report this paper">⚑ Report</button>
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
        </select>
      </div>

      <div class="papers-list" id="papersList"></div>
    </div>
  `;
  document.getElementById('papersSearchInput').addEventListener('input', _onSearchInput);
  document.getElementById('papersTypeFilter').addEventListener('change', _onTypeChange);
  document.getElementById('papersUploadBtn').addEventListener('click', _openUploadModal);
  const modBtn = document.getElementById('papersModBtn');
  if (modBtn) modBtn.addEventListener('click', _openModerationPanel);
  const list = document.getElementById('papersList');
  list.addEventListener('click', _onListClick);
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
      const path = previewBtn.dataset.path;
      if (!path) return;
      previewBtn.disabled = true;
      const url = await getPaperDownloadUrl(path);
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
      if (!confirm('Delete this paper and its file? This cannot be undone.')) return;
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
        <button data-mod-action="preview" data-path="${escAttr(p.storagePath || '')}">Preview</button>
        <button data-mod-action="approve" data-id="${escAttr(p.id)}" class="paper-mod-approve">Approve</button>
        <button data-mod-action="delete"  data-id="${escAttr(p.id)}" data-path="${escAttr(p.storagePath || '')}" class="paper-mod-delete">Delete</button>
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
        <button data-mod-action="delete" data-id="${escAttr(r.paperId)}">Delete paper</button>
        <button data-mod-action="dismiss" data-id="${escAttr(r.id)}">Dismiss</button>
      </div>
    </div>
  `;
}

let _searchDebounce = null;
function _onSearchInput(e) {
  _state.query = String(e.target.value || '').toUpperCase().trim();
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(_loadList, 250);
}

function _onTypeChange(e) {
  _state.type = e.target.value;
  _renderList();
}

async function _onListClick(e) {
  const dl = e.target.closest('.paper-card-download');
  if (dl) {
    const path = dl.dataset.path;
    if (!path) return;
    dl.disabled = true;
    dl.textContent = 'Loading…';
    const url = await getPaperDownloadUrl(path);
    dl.disabled = false;
    dl.textContent = '⬇ Download';
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

function _renderList() {
  const list = document.getElementById('papersList');
  if (!list) return;

  if (_state.loading) {
    list.innerHTML = '<div class="papers-empty-list">Loading…</div>';
    return;
  }

  const filtered = _state.type === 'all'
    ? _state.papers
    : _state.papers.filter(p => p.type === _state.type);

  if (!filtered.length) {
    if (_state.query) {
      list.innerHTML = _emptyList(`No papers found for ${_state.query}. Be the first to upload one!`);
    } else {
      list.innerHTML = _emptyList('No papers yet. Upload yours to get the library started.');
    }
    return;
  }

  list.innerHTML = filtered.map(_paperCard).join('');
}

async function _loadList() {
  _state.loading = true;
  _renderList();
  if (_state.query && isKnownCourseCode(_state.query)) {
    _state.papers = await fetchPapersByCourse(_state.query);
  } else if (_state.query) {
    _state.papers = [];
  } else {
    _state.papers = await fetchRecentPapers(30);
  }
  _state.loading = false;
  _renderList();
}

// ── Upload modal ─────────────────────────────────────────────────────────────
function _openUploadModal() {
  if (!_isSignedIn()) {
    _toast('Sign in to upload papers.');
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'paper-modal-backdrop';
  wrap.innerHTML = `
    <div class="paper-modal">
      <header class="paper-modal-head">
        <h4>Upload a paper</h4>
        <button class="paper-modal-close" aria-label="Close">×</button>
      </header>
      <form class="paper-modal-form" id="paperUploadForm">
        <label>
          <span>Course code</span>
          <input name="courseCode" placeholder="e.g. CSE220" maxlength="8" required />
        </label>
        <label>
          <span>Type</span>
          <select name="type" required>
            <option value="midterm">Midterm</option>
            <option value="final">Final</option>
            <option value="quiz">Quiz</option>
            <option value="notes">Notes</option>
            <option value="assignment">Assignment</option>
          </select>
        </label>
        <label>
          <span>Title</span>
          <input name="title" placeholder="e.g. CSE220 Midterm Spring 2024" maxlength="120" required />
        </label>
        <label>
          <span>Semester (optional)</span>
          <input name="semester" placeholder="e.g. Spring2024" maxlength="40" />
        </label>
        <label>
          <span>Faculty initials (optional)</span>
          <input name="facultyInitials" placeholder="e.g. MAK" maxlength="6" />
        </label>
        <label>
          <span>File (PDF or image, max 10 MB)</span>
          <input name="file" type="file" accept="application/pdf,image/*" required />
        </label>
        <p class="paper-modal-note">By uploading, you confirm you have rights to share this content. Uploads are reviewed before going public.</p>
        <div class="paper-modal-actions">
          <button type="button" class="btn-secondary paper-modal-cancel">Cancel</button>
          <button type="submit" class="btn-primary">Upload</button>
        </div>
        <div class="paper-modal-error" id="paperUploadError"></div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.paper-modal-close').addEventListener('click', close);
  wrap.querySelector('.paper-modal-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#paperUploadForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fd.get('file');
    const errBox = wrap.querySelector('#paperUploadError');
    errBox.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';
    const res = await uploadPaper({
      file,
      courseCode: fd.get('courseCode'),
      type: fd.get('type'),
      title: fd.get('title'),
      semester: fd.get('semester'),
      facultyInitials: fd.get('facultyInitials'),
    });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
    if (!res.ok) {
      errBox.textContent = res.error || 'Upload failed';
      return;
    }
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

export async function renderPapersTab() {
  const root = document.getElementById('papersContent');
  if (!root) return;
  if (!_isAuthReady()) {
    root.innerHTML = '<div class="papers-empty"><p>Loading…</p></div>';
    return;
  }
  if (!_isSignedIn()) {
    root.innerHTML = _signInPrompt();
    return;
  }
  _renderShell();
  await _loadList();
}
