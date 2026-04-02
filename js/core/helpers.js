export const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];

/**
 * HTML-escape a string for safe insertion into innerHTML.
 * Prevents XSS from user-sourced data (PDF import, localStorage, etc.)
 */
export function escHtml(s) {
  if (typeof s !== 'string') return String(s ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for safe use inside an HTML attribute value (double-quoted).
 * Also prevents attribute breakout via event handlers.
 */
export function escAttr(s) {
  return escHtml(s);
}

export function ordinalSup(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suffix}`;
}

/**
 * Strip legacy <sup>...</sup> tags from semester names.
 * Old ordinalSup() produced "1<sup>st</sup>" — now it produces "1st".
 * This migrates existing localStorage data so escHtml() doesn't
 * render literal "&lt;sup&gt;" in the UI.
 */
export function sanitizeSemName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/<sup>(.*?)<\/sup>/gi, '$1');
}

/**
 * Validate and sanitize restored state from localStorage.
 * Prevents malformed/corrupted data from causing runtime errors,
 * and strips any legacy HTML from semester names.
 */
export function sanitizeRestoredState(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (!Array.isArray(saved.semesters)) return null;

  // Validate currentDept is a safe alphanumeric string
  if (saved.currentDept && typeof saved.currentDept === 'string') {
    if (!/^[A-Z]{2,4}$/.test(saved.currentDept)) saved.currentDept = '';
  }

  // Sanitize each semester
  saved.semesters = saved.semesters.filter(sem => {
    if (!sem || typeof sem !== 'object') return false;
    if (typeof sem.id !== 'number') return false;
    // Strip legacy HTML from semester names
    sem.name = sanitizeSemName(sem.name || '');
    // Validate courses array
    if (!Array.isArray(sem.courses)) { sem.courses = []; return true; }
    sem.courses = sem.courses.filter(c => c && typeof c === 'object').map(c => ({
      name:       typeof c.name === 'string' ? c.name : '',
      credits:    typeof c.credits === 'number' && isFinite(c.credits) ? c.credits : 0,
      grade:      typeof c.grade === 'string' ? c.grade : '',
      gradePoint: c.gradePoint !== undefined ? c.gradePoint : '',
    }));
    return true;
  });

  saved.semesterCounter = typeof saved.semesterCounter === 'number'
    ? saved.semesterCounter : saved.semesters.length;

  return saved;
}

export function getCurrentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 4) return 'Spring';
  if (m <= 8) return 'Summer';
  return 'Fall';
}

export function getLastCompletedSemester(seasons) {
  const order = seasons || SEASON_ORDER;
  const now = new Date();
  const curSeason = getCurrentSeason();
  const curYear   = now.getFullYear();
  const idx = order.indexOf(curSeason);
  if (idx === -1) {
    // Current season not in dept cycle (e.g. Fall for pharmacy)
    // Return last season in dept cycle for this year
    return { season: order[order.length - 1], year: curYear };
  }
  if (idx === 0) {
    return { season: order[order.length - 1], year: curYear - 1 };
  }
  return { season: order[idx - 1], year: curYear };
}

export function countSemesters(startSeason, startYear, endSeason, endYear, seasons) {
  const order = seasons || SEASON_ORDER;
  let si = order.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = parseInt(startYear);
  let count = 0;
  while (true) {
    count++;
    if (order[si] === endSeason && yr === parseInt(endYear)) break;
    si++;
    if (si >= order.length) { si = 0; yr++; }
    if (yr > parseInt(endYear) + 1) break;
  }
  return count;
}

export function generateSemesterNames(startSeason, startYear, count, seasons) {
  const order = seasons || SEASON_ORDER;
  const names = [];
  let si = order.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = parseInt(startYear);
  for (let i = 0; i < count; i++) {
    names.push(`${order[si]} ${yr} (${ordinalSup(i + 1)} Semester)`);
    si++;
    if (si >= order.length) { si = 0; yr++; }
  }
  return names;
}

export function getStartSeason() {
  const el = document.getElementById('startSeason');
  return el ? el.value : 'Fall';
}

export function getStartYear() {
  const el = document.getElementById('startYear');
  return el ? el.value : '2024';
}