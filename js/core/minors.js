// Twin of src/features/calculator/minors.ts — hand-maintained, not generated.
// src/features/calculator/minors.ts is the source of truth: change it there
// first, then mirror the change here. tests/twinParity.test.js fails if the two
// drift.
//
// Minor programs (#731), for the legacy calculator's minor tracker (#766). A
// minor is a structure rather than a credit total: named requirements, some
// satisfiable by one of several courses, plus an elective pool given by
// pattern. See the TypeScript original for the full rationale.
//
// build3.py flattens every module into one scope, so the private helpers carry
// a _minor prefix to stay clear of names elsewhere in the bundle.

const _MINOR_MATHEMATICS = {
  code: 'MATH',
  label: 'Minor in Mathematics',
  shortLabel: 'Mathematics',
  department: 'Department of Mathematics and Physical Sciences',
  totalCredits: 27,
  core: [
    { id: 'mat111', title: 'Principles of Mathematics', codes: ['MAT111'], credits: 3 },
    { id: 'mat123', title: 'Calculus I', codes: ['MAT123'], credits: 3 },
    { id: 'mat221', title: 'Real Analysis I', codes: ['MAT221'], credits: 3 },
    { id: 'mat222', title: 'Differential Equations I', codes: ['MAT222'], credits: 3 },
    // The one published alternative: "MAT 223: Numerical Analysis I or CSE 330".
    { id: 'mat223', title: 'Numerical Analysis I', codes: ['MAT223', 'CSE330'], credits: 3 },
    { id: 'mat311', title: 'Abstract Algebra', codes: ['MAT311'], credits: 3 },
    { id: 'mat316', title: 'Operations Research I', codes: ['MAT316'], credits: 3 },
  ],
  electives: {
    credits: 6,
    // CSE490 is listed bare alongside CSE490C: the guide names the topic, the
    // catalogue letters the offerings, and only the quantum-computing topic is
    // listed — so no CSE490 prefix match.
    codes: ['STA301', 'CSE402', 'CSE490', 'CSE490C'],
    patterns: [{ subject: 'MAT', levels: [3, 4] }],
    options: [
      { label: 'Any MAT 3XX or MAT 4XX level course listed on the website' },
      { label: 'STA 301: Modern Probability Theory & Stochastic Processes' },
      { label: 'CSE 402: Optimization' },
      { label: 'CSE 490: Special Topics (Quantum Computing)' },
    ],
  },
  source: 'Course Guide for Math Minor Students — Department of Mathematics and Physical Sciences',
};

// A malformed entry is dropped rather than shown: a core+elective sum that
// disagrees with the published total would draw a bar that can never fill.
function _minorValidate(program) {
  if (!program.code || !program.label || program.totalCredits <= 0) return null;
  if (program.core.length === 0) return null;
  if (program.core.some((r) => r.codes.length === 0 || r.credits <= 0)) return null;
  const coreCredits = program.core.reduce((sum, r) => sum + r.credits, 0);
  if (coreCredits + program.electives.credits !== program.totalCredits) return null;
  return Object.freeze({
    ...program,
    core: Object.freeze(program.core.map((r) => Object.freeze({ ...r }))),
    electives: Object.freeze({ ...program.electives }),
  });
}

function _minorBuildPrograms(authored) {
  const out = [];
  let skipped = 0;
  for (const program of authored) {
    const valid = _minorValidate(program);
    if (valid) out.push(valid);
    else skipped += 1;
  }
  // The shell sends this through its logger; legacy has none, and these are
  // authored constants, so a rejection is a bug in this file worth seeing.
  if (skipped > 0 && typeof console !== 'undefined') {
    console.warn('[Shohoj] minors: skipped malformed entries', { skipped, total: authored.length });
  }
  return Object.freeze(out);
}

/** The frozen, validated minor table, in authored order. */
export const MINOR_PROGRAMS = _minorBuildPrograms([_MINOR_MATHEMATICS]);

const _MINOR_BY_CODE = new Map(MINOR_PROGRAMS.map((m) => [m.code, m]));

/** Program for a code, or null for unknown/empty codes. */
export function getMinorProgram(code) {
  return _MINOR_BY_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/** Whether a course code falls inside an elective pattern, e.g. MAT 3XX/4XX. */
export function matchesPattern(code, pattern) {
  const parsed = /^([A-Z]{2,4})(\d)\d{2}[A-Z]?$/.exec(String(code ?? '').trim().toUpperCase());
  if (!parsed) return false;
  const [, subject, level] = parsed;
  if (subject !== pattern.subject.toUpperCase()) return false;
  return pattern.levels.includes(Number(level));
}

/** Whether a course code may count toward a minor's elective credits. */
export function isElectiveCode(code, electives) {
  const upper = String(code ?? '').trim().toUpperCase();
  if (!upper) return false;
  if (electives.codes.includes(upper)) return true;
  return electives.patterns.some((p) => matchesPattern(upper, p));
}
