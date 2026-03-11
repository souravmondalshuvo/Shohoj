// ── COURSE AUTOCOMPLETE / SUGGESTIONS ────────────────

import { COURSE_DB, ALL_COURSES } from '../core/catalog.js';
import { state, saveState }       from '../core/state.js';
import { app }                    from '../core/registry.js';

// currentDept → use state.currentDept

// ── AUTOCOMPLETE LOGIC ────────────────────────────────
// portal is fetched lazily so this module is safe at import time
function getPortal() { return document.getElementById('suggestions-portal'); }
let activeInput = null;

    function showPortalSuggestions(inputEl, semId, cIdx, matches) {
      const rect = inputEl.getBoundingClientRect();
      const top  = rect.bottom + 4;
      const left = rect.left;
      const w    = rect.width;
      let html = `<div class="course-suggestions" id="sug-${semId}-${cIdx}"
        style="top:${top}px;left:${left}px;width:${w}px;">`;
      html += matches.map((c, i) => `
        <div class="suggestion-item" data-idx="${i}"
          onmousedown="pickSuggestion(${semId},${cIdx},'${c.full.replace(/'/g,"\\'")}',${c.credits})">
          <span class="suggestion-code">${c.code}</span>
          <span class="suggestion-name">${c.name}</span>
          <span class="suggestion-credits">${c.credits} cr</span>
        </div>`).join('');
      html += '</div>';
      getPortal().innerHTML = html;
    }

    function onCourseBlur(e, semId, cIdx) {
      const sem = state.semesters.find(s => s.id === semId);
      if (!sem || !sem.courses[cIdx]) return;
      const val = e.target.value.trim();
      if (sem.courses[cIdx].name !== val) {
        sem.courses[cIdx].name = val;
        app.recalc(); // re-renders DOM — e.target is now detached
        // Flash saved-tick on the LIVE (re-rendered) input via stable id
        if (val) {
          const liveInput = document.getElementById(`course-input-${semId}-${cIdx}`);
          const wrap = liveInput ? liveInput.closest('.course-input-wrap') : null;
          if (wrap) {
            let tick = wrap.querySelector('.course-saved-tick');
            if (!tick) {
              tick = document.createElement('span');
              tick.className = 'course-saved-tick';
              tick.textContent = '✓';
              wrap.appendChild(tick);
            }
            tick.classList.add('visible');
            clearTimeout(tick._hideTimer);
            tick._hideTimer = setTimeout(() => tick.classList.remove('visible'), 1400);
          }
        }
      }
    }

    function onCourseInput(e, semId, cIdx) {
      const raw = e.target.value.trim();
      const val = raw.toLowerCase();
      activeInput = e.target;

      if (!val) { getPortal().innerHTML = ''; return; }

      const exactMatch = COURSE_DB[raw.toUpperCase()];
      const t1 = exactMatch ? [exactMatch] : [];
      const t2 = ALL_COURSES.filter(c => c !== exactMatch && c.code.toLowerCase().startsWith(val));
      const t3 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && c.code.toLowerCase().includes(val));
      const t4 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && !t3.includes(c) && c.name.toLowerCase().includes(val));

      const matches = [...t1, ...t2, ...t3, ...t4].slice(0, 8);
      if (!matches.length) { getPortal().innerHTML = ''; return; }
      showPortalSuggestions(e.target, semId, cIdx, matches);
    }

    function onCourseKey(e, semId, cIdx) {
      const box = getPortal().querySelector('.course-suggestions');
      if (!box) return;
      const items = box.querySelectorAll('.suggestion-item');
      let active = box.querySelector('.suggestion-item.active');
      let idx = active ? parseInt(active.dataset.idx) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        active.dispatchEvent(new MouseEvent('mousedown'));
        return;
      } else if (e.key === 'Escape') {
        getPortal().innerHTML = ''; return;
      } else { return; }

      items.forEach(el => el.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    }

    function closeSuggestions(id) {
      getPortal().innerHTML = '';
    }

    window.addEventListener('scroll', () => {
      if (activeInput && getPortal().innerHTML) getPortal().innerHTML = '';
    }, { passive: true });

    function pickSuggestion(semId, cIdx, fullName, credits) {
      getPortal().innerHTML = '';
      const sem = state.semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].name    = fullName;
      sem.courses[cIdx].credits = credits;
      sem.courses[cIdx].grade      = '';
      sem.courses[cIdx].gradePoint = '';

      // Full re-render so P/F dropdown appears immediately for 0-credit courses
      app.renderSemesters();
      app.recalc();
      app.updateSetupWizard();

      // Restore focus to the grade input of the picked row
      setTimeout(() => {
        const block = document.getElementById(`sem-${semId}`);
        if (!block) return;
        const rows = block.querySelectorAll('.course-row:not(.course-header)');
        const row  = rows[cIdx];
        if (!row) return;
        const gpInput = row.querySelector('input[inputmode="decimal"]');
        const pfSelect = row.querySelector('.pf-select');
        if (pfSelect) pfSelect.focus();
        else if (gpInput) gpInput.focus();
      }, 30);
    }

export {
  showPortalSuggestions, onCourseBlur,
  onCourseInput, onCourseKey, closeSuggestions, pickSuggestion,
};