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

/**
 * Strong confirmation for destructive admin actions. Names the target,
 * spells out that the action is permanent, and requires the operator to
 * type DELETE so an accidental Enter-press on a focused button is not
 * enough to wipe data.
 *
 * Returns true if the user typed DELETE exactly, false otherwise (cancel,
 * empty, wrong text). Pass `label` to identify the target ("CSE220 Final
 * 2024"); omit it for items without a useful name.
 */
export function confirmDestructive(action, label) {
  const head = label ? `${action}\n\nTarget: ${label}` : action;
  const body = '\n\nThis cannot be undone.\n\nType DELETE to confirm.';
  const typed = window.prompt(head + body);
  return typed === 'DELETE';
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

// Strip HTML tags for plain-text contexts (PDF text, labels). Applied
// repeatedly until stable so a single removal can't re-form a tag
// (e.g. "<<b>b>" -> "<b>" -> ""), which a one-pass replace would leave behind.
export function stripTags(s) {
  if (typeof s !== 'string') return '';
  let prev;
  let out = s;
  do { prev = out; out = out.replace(/<[^>]+>/g, ''); } while (out !== prev);
  return out;
}

function sanitizeGradePointValue(value) {
  if (value === undefined || value === null) return '';
  if (value === 'NT') return 'NT';

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 4 ? value : '';
  }

  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.toUpperCase() === 'NT') return 'NT';
  if (!/^(?:\d+(?:\.\d+)?)$/.test(trimmed)) return '';

  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 4 ? trimmed : '';
}

/**
 * Upper bound on tracked components per course (#500). Not a syllabus
 * judgement — a bound on what restore will accept, so a corrupted or hostile
 * document cannot grow the cloud doc without limit.
 */
export const MAX_MARK_COMPONENTS = 20;

/**
 * Validate persisted mark components. Returns undefined rather than an empty
 * array when there is nothing usable, so a course that never tracked marks
 * stays byte-identical through a save/restore cycle.
 */
export function sanitizeMarkComponents(value) {
  if (!Array.isArray(value)) return undefined;

  const out = [];
  for (const raw of value) {
    if (out.length >= MAX_MARK_COMPONENTS) break;
    if (!raw || typeof raw !== 'object') continue;

    const weight = typeof raw.weight === 'number' && Number.isFinite(raw.weight) ? raw.weight : NaN;
    const outOf = typeof raw.outOf === 'number' && Number.isFinite(raw.outOf) ? raw.outOf : NaN;
    // A component with no weight or no denominator cannot contribute to any
    // answer, so it is dropped rather than stored as a broken row.
    if (!(weight > 0) || !(outOf > 0)) continue;

    const score =
      typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, raw.score) : null;

    out.push({
      name: typeof raw.name === 'string' ? stripTags(raw.name).slice(0, 40) : '',
      weight: Math.min(100, weight),
      score,
      outOf,
    });
  }

  return out.length ? out : undefined;
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
    // This map is an allowlist: a field absent here is dropped on restore.
    sem.courses = sem.courses.filter(c => c && typeof c === 'object').map(c => {
      const marks = sanitizeMarkComponents(c.marks);
      return {
        name:       typeof c.name === 'string' ? c.name : '',
        credits:    typeof c.credits === 'number' && isFinite(c.credits) ? c.credits : 0,
        grade:      typeof c.grade === 'string' ? c.grade : '',
        gradePoint: sanitizeGradePointValue(c.gradePoint),
        faculty:    typeof c.faculty === 'string' ? c.faculty.toUpperCase().slice(0, 6) : '',
        ...(marks ? { marks } : {}),
      };
    });
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

// Shared inline refresh icon (arc arrow). A real SVG instead of the unicode ↻
// glyph so the icon matches the label's stroke weight and baseline on every
// platform; stroke follows the button's currentColor. Buttons that show an
// in-flight state can spin it via a CSS class on the button (see
// .admin-btn-ghost--loading svg).
export const REFRESH_ICON_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
  'style="vertical-align:-2px;margin-right:1px;">' +
  '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
