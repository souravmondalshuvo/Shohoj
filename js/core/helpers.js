export const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];

/**
 * HTML-escape a string for safe insertion into innerHTML.
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

export function escAttr(s) {
  return escHtml(s);
}

export function ordinalSup(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suffix}`;
}

export function sanitizeSemName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/<sup>(.*?)<\/sup>/gi, '$1');
}

export function sanitizeRestoredState(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (!Array.isArray(saved.semesters)) return null;

  if (saved.currentDept && typeof saved.currentDept === 'string') {
    if (!/^[A-Z]{2,4}$/.test(saved.currentDept)) saved.currentDept = '';
  }

  saved.semesters = saved.semesters.filter(sem => {
    if (!sem || typeof sem !== 'object') return false;
    if (typeof sem.id !== 'number') return false;

    // ── Summary blocks pass through as-is after basic validation ──────────
    if (sem.summary === true) {
      const cgpa = parseFloat(sem.summaryCGPA);
      const cr   = parseFloat(sem.summaryCredits);
      if (isNaN(cgpa) || cgpa < 0 || cgpa > 4.0) return false;
      if (isNaN(cr)   || cr < 0)                  return false;
      // Normalize attempted credits — default to earned if missing
      const att = parseFloat(sem.summaryAttempted);
      sem.summaryAttempted = (!isNaN(att) && att >= 0) ? att : cr;
      // normalise optional semesters count
      sem.summarySemesters = typeof sem.summarySemesters === 'number'
        ? sem.summarySemesters : 0;
      sem.courses = [];   // always empty
      sem.running = false;
      return true;
    }

    sem.name = sanitizeSemName(sem.name || '');
    if (!Array.isArray(sem.courses)) { sem.courses = []; return true; }
    sem.courses = sem.courses.filter(c => c && typeof c === 'object').map(c => ({
      name:       typeof c.name === 'string' ? c.name : '',
      credits:    typeof c.credits === 'number' && isFinite(c.credits) ? c.credits : 0,
      grade:      typeof c.grade === 'string' ? c.grade : '',
      gradePoint: c.gradePoint !== undefined ? c.gradePoint : '',
      faculty:    typeof c.faculty === 'string' ? c.faculty.toUpperCase().slice(0, 6) : '',
    }));
    return true;
  });

  saved.semesterCounter = typeof saved.semesterCounter === 'number'
    ? saved.semesterCounter : saved.semesters.length;

  saved.planCourses = Array.isArray(saved.planCourses)
    ? saved.planCourses.filter(c => typeof c === 'string' && /^[A-Z]{2,4}\d{3}[A-Z]?$/.test(c))
    : [];

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
  const curSeason = getCurrentSeason();
  const curYear = new Date().getFullYear();
  const curGlobalIdx = SEASON_ORDER.indexOf(curSeason);

  const offeredBeforeCurrent = order.filter(season =>
    SEASON_ORDER.indexOf(season) < curGlobalIdx
  );

  if (offeredBeforeCurrent.length > 0) {
    return { season: offeredBeforeCurrent[offeredBeforeCurrent.length - 1], year: curYear };
  }

  return { season: order[order.length - 1], year: curYear - 1 };
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
