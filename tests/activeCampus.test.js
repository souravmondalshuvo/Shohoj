/**
 * tests/activeCampus.test.js
 * The legacy calculator's campus switch (#796): every wrapper in
 * js/core/calculator.js, and the grade lookups the UI makes, run on the
 * signed-in student's campus. BRACU is the default and must not move.
 */

// helpers.js reads the start-term inputs from the DOM; activeCampus.js
// announces changes on window. A bare stand-in for both is enough.
const _events = [];
globalThis.document = { getElementById: () => null };
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = e => { _events.push(e); return true; };
// Captured so the admin tests (#807) can replay shohoj:auth-changed.
const _listeners = {};
globalThis.addEventListener = (type, fn) => { (_listeners[type] ||= []).push(fn); };
// Node's own localStorage needs a backing file; a Map-backed one is enough.
const _store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: k => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => { _store.set(k, String(v)); },
    removeItem: k => { _store.delete(k); },
  },
});

const {
  ADMIN_CAMPUS_STORAGE_KEY,
  activeGradePoint,
  activeGradeScale,
  getActiveCampus,
  initActiveCampus,
  isAdminCampusViewer,
  setActiveCampusForEmail,
  setAdminCampusChoice,
} = await import('../js/core/activeCampus.js');
const {
  activeCgpaOptions,
  calcSemGPA,
  getImprovementStrategy,
  getRetakenKeys,
  getSemCreditWarning,
  isRepeatEligible,
  usesBestGradePolicy,
} = await import('../js/core/calculator.js');
const { detectGrade } = await import('../js/core/grades.js');
const { calculateCgpaTotals } = await import('../js/core/gpa-core.js');
const { computeCourseMarks } = await import('../js/core/courseMarks.js');

// ── Minimal test runner (no dependencies) ────────────────────────────────────
let passed = 0, failed = 0, total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${description}`);
    console.error(`    → ${e.message}`);
    failed++;
  }
}

function eq(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function close(actual, expected) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`Expected ~${expected}, got ${actual}`);
}

const course = (name, credits, grade) => ({ name, credits, grade });

// One course taken twice: a C first, then a B-. A later start term puts BRACU
// on latest-attempt; NSU always keeps the best. Same answer here by design —
// the second fixture is the one where they disagree.
const improvedRetake = [
  { id: 1, name: 'Fall 2025', courses: [course('Calculus I (MAT110)', 3, 'C'), course('English (ENG101)', 3, 'A')] },
  { id: 2, name: 'Spring 2026', courses: [course('Calculus I (MAT110)', 3, 'B-')] },
];
// Retake came out worse: B then C. Latest-attempt (BRACU, 2025 start) keeps
// the C; best-attempt (NSU) keeps the B.
const worseRetake = [
  { id: 1, name: 'Fall 2025', courses: [course('Calculus I (MAT110)', 3, 'B')] },
  { id: 2, name: 'Spring 2026', courses: [course('Calculus I (MAT110)', 3, 'C')] },
];

console.log('\nDefault campus');

test('starts on BRACU', () => {
  eq(getActiveCampus().id, 'bracu');
});

test('BRACU still awards A+ and D-', () => {
  eq(activeGradePoint('A+'), 4.0);
  eq(activeGradePoint('D-'), 0.7);
});

test('an unclaimed domain stays on BRACU and announces nothing', () => {
  const before = _events.length;
  eq(setActiveCampusForEmail('someone@gmail.com'), false);
  eq(getActiveCampus().id, 'bracu');
  eq(_events.length, before);
});

test('BRACU keeps its 15-credit ceiling', () => {
  const sem = { id: 9, courses: [course('A', 3, ''), course('B', 3, ''), course('C', 3, ''), course('D', 3, ''), course('E', 3, ''), course('F', 3, '')] };
  eq(getSemCreditWarning(sem)?.type, 'error');
});

test('BRACU: a B is not repeatable', () => {
  eq(isRepeatEligible('B'), false);
  eq(getImprovementStrategy('B'), null);
});

console.log('\nSwitching to NSU');

test('an NSU address switches campus and announces it', () => {
  const before = _events.length;
  eq(setActiveCampusForEmail('Student@NorthSouth.edu'), true);
  eq(getActiveCampus().id, 'nsu');
  eq(_events.length, before + 1);
  eq(_events.at(-1).type, 'shohoj:campus-changed');
  eq(_events.at(-1).detail.campus, 'nsu');
});

test('setting the same campus again is a no-op', () => {
  eq(setActiveCampusForEmail('other@northsouth.edu'), false);
});

test('NSU does not award A+ or D-', () => {
  eq(activeGradePoint('A+'), undefined);
  eq(activeGradePoint('D-'), undefined);
  eq(activeGradePoint('A'), 4.0);
});

test('an A+ row carries no weight in an NSU semester GPA', () => {
  const sem = { id: 1, courses: [course('X', 3, 'A+'), course('Y', 3, 'B')] };
  close(calcSemGPA(sem), 3.0);
});

test('detectGrade maps 0.7 to nothing on NSU (no D-)', () => {
  eq(detectGrade('0.7', activeGradeScale().pointsToGrade), '');
  eq(detectGrade('1.0', activeGradeScale().pointsToGrade), 'D');
});

test('NSU keeps the best attempt regardless of start term', () => {
  eq(usesBestGradePolicy(), true);
  const kept = getRetakenKeys(worseRetake);
  eq(kept.has('2-0'), true);   // the C is superseded
  eq(kept.has('1-0'), false);  // the B counts
});

test('CGPA through activeCgpaOptions counts NSU\'s best attempt', () => {
  const totals = calculateCgpaTotals(worseRetake, activeCgpaOptions({ includeRunning: false }));
  close(totals.cgpa, 3.0);
  close(calculateCgpaTotals(improvedRetake, activeCgpaOptions()).cgpa, (2.7 * 3 + 4 * 3) / 6);
});

test('NSU: a B is repeatable (inclusive), a B+ is not', () => {
  eq(isRepeatEligible('B'), true);
  eq(getImprovementStrategy('B'), 'repeat');
  eq(isRepeatEligible('B+'), false);
});

test('NSU shows no credit-load warning at 18 credits', () => {
  const sem = { id: 9, courses: [course('A', 3, ''), course('B', 3, ''), course('C', 3, ''), course('D', 3, ''), course('E', 3, ''), course('F', 3, '')] };
  eq(getSemCreditWarning(sem), null);
});

test('NSU mark tiers: 87 is a B+, not an A-', () => {
  const r = computeCourseMarks([{ weight: 100, score: 87, outOf: 100 }], getActiveCampus().grades.marks);
  eq(r.projectedLetter, 'B+');
});

console.log('\nSigning out');

test('a null email returns to BRACU', () => {
  eq(setActiveCampusForEmail(null), true);
  eq(getActiveCampus().id, 'bracu');
  eq(isRepeatEligible('B'), false);
  const r = computeCourseMarks([{ weight: 100, score: 87, outOf: 100 }], getActiveCampus().grades.marks);
  eq(r.projectedLetter, 'A-');
});

console.log('\nAdmin campus choice (#807)');

// The two globals firebase.js publishes, driven by hand.
function signIn(email, { admin = false } = {}) {
  window._shohoj_userProfile = () => ({ signedIn: email !== null, email });
  window._shohoj_isAdmin = () => admin;
  for (const fn of _listeners['shohoj:auth-changed'] || []) fn();
}

initActiveCampus();

test('a student cannot set a choice, and a planted one is ignored', () => {
  signIn('student@g.bracu.ac.bd');
  eq(isAdminCampusViewer(), false);
  eq(setAdminCampusChoice('nsu'), false);
  eq(_store.has(ADMIN_CAMPUS_STORAGE_KEY), false);
  _store.set(ADMIN_CAMPUS_STORAGE_KEY, 'nsu');
  signIn('student@g.bracu.ac.bd');
  eq(getActiveCampus().id, 'bracu');
  _store.clear();
});

test('an admin on a non-campus address starts on BRACU', () => {
  signIn('admin@gmail.com', { admin: true });
  eq(isAdminCampusViewer(), true);
  eq(getActiveCampus().id, 'bracu');
});

test('an admin choice switches campus, announces it and is stored', () => {
  const before = _events.length;
  eq(setAdminCampusChoice('nsu'), true);
  eq(getActiveCampus().id, 'nsu');
  eq(_events.length, before + 1);
  eq(_events.at(-1).detail.campus, 'nsu');
  eq(_store.get(ADMIN_CAMPUS_STORAGE_KEY), 'nsu');
  // The rules really moved: a B is repeatable at NSU and not at BRACU.
  eq(isRepeatEligible('B'), true);
});

test('an unregistered campus id is refused', () => {
  eq(setAdminCampusChoice('harvard'), false);
  eq(getActiveCampus().id, 'nsu');
});

test('the stored choice is restored when the admin session returns', () => {
  signIn(null);
  eq(getActiveCampus().id, 'bracu');
  signIn('admin@gmail.com', { admin: true });
  eq(getActiveCampus().id, 'nsu');
});

test('the choice outranks an admin\'s own campus email', () => {
  signIn('admin@g.bracu.ac.bd', { admin: true });
  eq(getActiveCampus().id, 'nsu');
});

test('a stored id the registry no longer knows falls back to the email', () => {
  _store.set(ADMIN_CAMPUS_STORAGE_KEY, 'gone');
  signIn('admin@g.bracu.ac.bd', { admin: true });
  eq(getActiveCampus().id, 'bracu');
});

test('signing out drops the admin view', () => {
  _store.set(ADMIN_CAMPUS_STORAGE_KEY, 'nsu');
  signIn('admin@gmail.com', { admin: true });
  eq(getActiveCampus().id, 'nsu');
  signIn(null);
  eq(isAdminCampusViewer(), false);
  eq(getActiveCampus().id, 'bracu');
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed ✓');
  process.exit(0);
}
