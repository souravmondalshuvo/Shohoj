// ── HELPER UTILITIES ─────────────────────────────────

import { GRADES, POINTS_TO_GRADE } from './grades.js';
import { semesters }               from './state.js';

function detectGrade(val) {
      const n = parseFloat(val);
      if (isNaN(n)) return '';
      for (const [pt, letter] of POINTS_TO_GRADE) {
        if (Math.abs(n - pt) < 0.01) return letter;
      }
      let closest = null, minDiff = Infinity;
      for (const [pt, letter] of POINTS_TO_GRADE) {
        const diff = Math.abs(n - pt);
        if (diff < minDiff) { minDiff = diff; closest = letter; }
      }
      return minDiff <= 0.20 ? closest : '';
    }

    // ── SEMESTER NAME GENERATOR ──────────────────────────
    // Format: "Spring 25", "Summer 25", "Fall 25", "Spring 26" ...
    const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];
    function ordinalSup(n) {
      const s = ['th','st','nd','rd'];
      const v = n % 100;
      const suffix = s[(v - 20) % 10] || s[v] || s[0];
      return `${n}<sup>${suffix}</sup>`;
    }

    // Returns which season is currently running based on today's date
    // Spring: Jan–Apr, Summer: May–Aug, Fall: Sep–Dec
    function getCurrentSeason() {
      const m = new Date().getMonth() + 1; // 1-12
      if (m <= 4) return 'Spring';
      if (m <= 8) return 'Summer';
      return 'Fall';
    }

    // Returns the last COMPLETED semester {season, year}
    // i.e. the one before the currently running semester
    function getLastCompletedSemester() {
      const now = new Date();
      const curSeason = getCurrentSeason();
      const curYear   = now.getFullYear();
      const idx = SEASON_ORDER.indexOf(curSeason);
      if (idx === 0) {
        // Spring running → last completed = Fall of previous year
        return { season: SEASON_ORDER[SEASON_ORDER.length - 1], year: curYear - 1 };
      }
      return { season: SEASON_ORDER[idx - 1], year: curYear };
    }

    // Count semesters from start (inclusive) to end (inclusive)
    function countSemesters(startSeason, startYear, endSeason, endYear) {
      let si = SEASON_ORDER.indexOf(startSeason);
      let yr = parseInt(startYear);
      let count = 0;
      while (true) {
        count++;
        if (SEASON_ORDER[si] === endSeason && yr === parseInt(endYear)) break;
        si++;
        if (si >= SEASON_ORDER.length) { si = 0; yr++; }
        if (yr > parseInt(endYear) + 1) break; // safety valve
      }
      return count;
    }

    function generateSemesterNames(startSeason, startYear, count) {
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
    function getStartSeason() {
      const el = document.getElementById('startSeason');
      return el ? el.value : 'Fall';
    }
    function getStartYear() {
      const el = document.getElementById('startYear');
      return el ? el.value : '2024';
    }

export {
  detectGrade, ordinalSup,
  getCurrentSeason, getLastCompletedSemester,
  countSemesters, generateSemesterNames,
  getStartSeason, getStartYear,
};