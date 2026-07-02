// src/features/calculator/demoData.ts
//
// Typed demo dataset for the shell's "Try Demo Mode" (#309), mirroring
// getRecruiterDemoSemesters() + the loadSampleData() start-semester writes in
// js/ui/render.js exactly (same semesters, courses, grades, credits, faculty,
// start Fall 2024). Built fresh on every call so reducer state never aliases
// module constants.
//
// Deviations (documented in the roadmap): the legacy demo also selects the CSE
// department — the shell has no department state until the dept/start setup
// slice — and shows a success toast, which waits on a shell notification
// viewport.

import type { CalculatorState } from './calculatorState.ts';

/** Fresh demo calculator state: two graded semesters + the Fall 2024 start. */
export function demoCalculatorState(): CalculatorState {
  return {
    semesters: [
      {
        id: 1,
        name: 'Fall 2024',
        courses: [
          { name: 'Programming Language I (CSE110)', credits: 3, grade: 'A-', gradePoint: 3.7, faculty: 'ABC' },
          { name: 'Fundamentals of English (ENG101)', credits: 3, grade: 'A', gradePoint: 4.0, faculty: 'XYZ' },
          { name: 'Principles of Physics I (PHY111)', credits: 3, grade: 'B+', gradePoint: 3.3, faculty: 'PHY' },
        ],
      },
      {
        id: 2,
        name: 'Spring 2025',
        courses: [
          { name: 'Programming Language II (CSE111)', credits: 3, grade: 'B+', gradePoint: 3.3, faculty: 'DEF' },
          { name: 'Data Structures (CSE220)', credits: 3, grade: 'A-', gradePoint: 3.7, faculty: 'GHI' },
          { name: 'Differential Calculus (MAT110)', credits: 3, grade: 'B', gradePoint: 3.0, faculty: 'MAT' },
        ],
      },
    ],
    startSeason: 'Fall',
    startYear: '2024',
  };
}
