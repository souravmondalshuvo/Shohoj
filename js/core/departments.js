// ── BRACU'S PROGRAMS AND SEMESTER PRESETS ────────────────────────────────────
//
// The data is not written here. It is generated from data/campuses/bracu/
// (programs.json, plans.json) into departmentsBracu.generated.js; to change a
// program or a preset, edit those files and run
// `npm run generate:legacy-catalog`.
//
// This module expands the generated rows into the shape the app reads:
// program → { label, totalCredits, seasons, presets: [{ name, courses }] }.

import { BRACU_PROGRAM_ROWS } from './departmentsBracu.generated.js';

export const DEPARTMENTS = {};

Object.entries(BRACU_PROGRAM_ROWS).forEach(([code, program]) => {
  DEPARTMENTS[code] = {
    label: program.label,
    totalCredits: program.totalCredits,
    seasons: program.seasons,
    presets: program.presets.map(([name, rows]) => ({
      name,
      courses: rows.map(([course, credits]) => ({ name: course, credits, grade: '' })),
    })),
  };
});
