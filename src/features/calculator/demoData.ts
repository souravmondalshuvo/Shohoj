// src/features/calculator/demoData.ts
//
// Typed demo dataset for the shell's "Try Demo Mode" (#309), mirroring
// getRecruiterDemoSemesters() + the loadSampleData() writes in js/ui/render.js
// exactly: same semesters, courses, grades, credits, faculty, start Fall 2024,
// and the CSE department pre-select (#313). Built fresh on every call so
// reducer state never aliases module constants.

import type { CalculatorState } from './calculatorState.ts';

/** Fresh demo state: two graded semesters, Fall 2024 start, CSE department. */
export function demoCalculatorState(): CalculatorState {
  return {
    currentDept: 'CSE',
    // loadSampleData seeds the planner too (DEMO_PLAN_COURSES in render.js).
    planCourses: ['CSE221', 'MAT120', 'PHY112'],
    semesters: [
      {
        id: 1,
        name: 'Fall 2024',
        courses: [
          {
            name: 'Programming Language I (CSE110)',
            credits: 3,
            grade: 'A-',
            gradePoint: 3.7,
            faculty: 'ABC',
          },
          {
            name: 'Fundamentals of English (ENG101)',
            credits: 3,
            grade: 'A',
            gradePoint: 4.0,
            faculty: 'XYZ',
          },
          {
            name: 'Principles of Physics I (PHY111)',
            credits: 3,
            grade: 'B+',
            gradePoint: 3.3,
            faculty: 'PHY',
          },
        ],
      },
      {
        id: 2,
        name: 'Spring 2025',
        courses: [
          {
            name: 'Programming Language II (CSE111)',
            credits: 3,
            grade: 'B+',
            gradePoint: 3.3,
            faculty: 'DEF',
          },
          {
            name: 'Data Structures (CSE220)',
            credits: 3,
            grade: 'A-',
            gradePoint: 3.7,
            faculty: 'GHI',
          },
          {
            name: 'Differential Calculus (MAT110)',
            credits: 3,
            grade: 'B',
            gradePoint: 3.0,
            faculty: 'MAT',
          },
        ],
      },
    ],
    startSeason: 'Fall',
    startYear: '2024',
  };
}
