// ── js/ui/tasksDigest.js ──────────────────────────────────────────────────────
// Shohoj Tasks on the legacy Calculator tab (#767 phase 5): the legacy
// rendering of the shell's TaskDigest. A few open tasks — overdue, today, then
// coming up — below the results, as a reminder on the way past rather than the
// headline. It renders NOTHING when there is nothing to show, when the student
// is signed out, or when the load fails: someone who does not use Tasks sees
// no change to the calculator.

import { registerAction } from '../core/dispatch.js';
import { escHtml } from '../core/helpers.js';
import { fetchToday, fetchUpcoming, listEnrollments, setTaskCompleted, tasksWorkerUrl } from '../core/tasksApi.js';
import { buildDigest, digestLink, groupHeading } from '../core/taskDigest.js';
import { courseLabel, dueLabel, toneClass, typeLabel } from '../core/taskView.js';
import { openTasksView } from './tasksTab.js';

// A fresh read at most this often from tab switches; completing a task forces one.
const _DIGEST_REFRESH_MS = 60_000;

const _digest = { uid: null, digest: null, enrollments: [], lastAt: 0, seq: 0 };

function _digestUid() {
  return typeof window._shohoj_currentUid === 'function' ? window._shohoj_currentUid() : null;
}

function _digestBox() {
  return document.getElementById('tasksDigestBox');
}

function _hideDigest() {
  const box = _digestBox();
  if (box) box.hidden = true;
}

function _digestHTML(digest) {
  let previous = null;
  const items = digest.entries.map((entry) => {
    const heading = groupHeading(entry.group, previous);
    previous = entry.group;
    const course = courseLabel(entry.task, _digest.enrollments);
    return `
      <li class="tasks-digest-item" data-testid="tasks-digest-item">
        ${heading !== null ? `<p class="tasks-digest-group tasks-digest-group-${entry.group}">${escHtml(heading)}</p>` : ''}
        <div class="tasks-digest-row">
          <label class="tasks-check">
            <input type="checkbox" data-action="tasks:digestComplete" data-id="${escHtml(entry.task.id)}" aria-label="${escHtml(`Mark ${entry.task.title} as done`)}">
            <span class="tasks-check-box" aria-hidden="true"></span>
          </label>
          <div class="tasks-digest-body">
            <p class="tasks-digest-item-title">${escHtml(entry.task.title)}</p>
            <p class="tasks-digest-meta">
              ${course !== null ? `<span class="tasks-course">${escHtml(course)}</span>` : ''}
              <span class="tasks-type">${escHtml(typeLabel(entry.task))}</span>
              <span class="tasks-due ${toneClass(entry.task)}">${escHtml(dueLabel(entry.task))}</span>
            </p>
          </div>
        </div>
      </li>`;
  }).join('');
  const view = digestLink(digest) === '/tasks' ? 'today' : 'upcoming';
  return `
    <section class="tasks-digest lg-panel lg-surface" data-testid="tasks-digest" aria-label="Your tasks">
      <div class="lg-shine"></div>
      <header class="tasks-digest-head">
        <h3 class="tasks-digest-title">Coming up</h3>
        ${digest.overdueCount > 0 ? `<span class="tasks-digest-overdue" data-testid="tasks-digest-overdue">${digest.overdueCount} overdue</span>` : ''}
      </header>
      <ul class="tasks-digest-list">${items}</ul>
      <button type="button" class="tasks-digest-link" data-action="tasks:digestOpen" data-view="${view}">${digest.hiddenCount > 0 ? `View all tasks (${digest.hiddenCount} more)` : 'View all tasks'}</button>
    </section>`;
}

function _paintDigest() {
  const box = _digestBox();
  if (!box) return;
  const d = _digest.digest;
  if (d === null || d.isEmpty || _digest.uid !== _digestUid()) {
    box.hidden = true;
    return;
  }
  // Every interpolation is escaped (escHtml) or a count we produced.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method
  // nosemgrep: javascript.browser.security.insecure-innerhtml.insecure-innerhtml
  box.innerHTML = _digestHTML(d);
  box.hidden = false;
}

/** Refresh the digest; called when the Calculator tab shows and on sign-in changes. */
export async function renderTasksDigest(force = false) {
  const uid = _digestUid();
  if (!uid || tasksWorkerUrl() === null) {
    _digest.uid = null;
    _digest.digest = null;
    _hideDigest();
    return;
  }
  if (uid !== _digest.uid) {
    _digest.uid = uid;
    _digest.digest = null;
    _digest.enrollments = [];
    _digest.lastAt = 0;
    _hideDigest();
  }
  if (!force && Date.now() - _digest.lastAt < _DIGEST_REFRESH_MS) {
    _paintDigest();
    return;
  }
  _digest.lastAt = Date.now();
  const seq = ++_digest.seq;
  const [today, upcoming, enrollments] = await Promise.all([fetchToday(), fetchUpcoming(), listEnrollments()]);
  if (seq !== _digest.seq || uid !== _digestUid()) return;
  // Enrolments only label rows; without them the digest still stands.
  _digest.enrollments = enrollments.ok ? enrollments.value : [];
  // A failure is silence, as on the shell: the calculator is what they came for.
  _digest.digest = today.ok && upcoming.ok
    ? buildDigest({ overdue: today.value.overdue, dueToday: today.value.dueToday, upcoming: upcoming.value })
    : null;
  _paintDigest();
}

registerAction('tasks:digestComplete', async (el, event) => {
  if (event?.type !== 'change') return;
  const id = el.dataset.id;
  // The row leaving is the confirmation.
  if (_digest.digest) {
    _digest.digest = { ..._digest.digest, entries: _digest.digest.entries.filter((e) => e.task.id !== id) };
    _paintDigest();
  }
  await setTaskCompleted(id, true);
  renderTasksDigest(true);
});

registerAction('tasks:digestOpen', (el) => openTasksView(el.dataset.view));

if (typeof window !== 'undefined') {
  window.addEventListener('shohoj:auth-changed', () => renderTasksDigest(true));
}
