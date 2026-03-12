export const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];

export function ordinalSup(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}<sup>${suffix}</sup>`;
}

export function getCurrentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 4) return 'Spring';
  if (m <= 8) return 'Summer';
  return 'Fall';
}

export function getLastCompletedSemester() {
  const now = new Date();
  const curSeason = getCurrentSeason();
  const curYear   = now.getFullYear();
  const idx = SEASON_ORDER.indexOf(curSeason);
  if (idx === 0) {
    return { season: SEASON_ORDER[SEASON_ORDER.length - 1], year: curYear - 1 };
  }
  return { season: SEASON_ORDER[idx - 1], year: curYear };
}

export function countSemesters(startSeason, startYear, endSeason, endYear) {
  let si = SEASON_ORDER.indexOf(startSeason);
  let yr = parseInt(startYear);
  let count = 0;
  while (true) {
    count++;
    if (SEASON_ORDER[si] === endSeason && yr === parseInt(endYear)) break;
    si++;
    if (si >= SEASON_ORDER.length) { si = 0; yr++; }
    if (yr > parseInt(endYear) + 1) break;
  }
  return count;
}

export function generateSemesterNames(startSeason, startYear, count) {
  const names = [];
  let si = SEASON_ORDER.indexOf(startSeason);
  if (si === -1) si = 0;
  let yr = parseInt(startYear);
  for (let i = 0; i < count; i++) {
    names.push(`${SEASON_ORDER[si]} ${yr} (${ordinalSup(i + 1)} Semester)`);
    si++;
    if (si >= SEASON_ORDER.length) { si = 0; yr++; }
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
