/**
 * tests/render.test.js
 * Regression tests for summary-aware semester generation in render.js.
 */

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

function expect(actual) {
  return {
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(`Expected ${e}, got ${a}`);
      }
    },
  };
}

(async function run() {
  const {
    getCurrentSemesterForDeptSeasons,
    findCurrentSemesterIdForSummaryView,
  } = await import('../js/ui/render.js');

  console.log('\nRender semester calendar logic:');

  test('keeps the same year when the next offered season is later in the same year', () => {
    const result = getCurrentSemesterForDeptSeasons(new Date('2026-06-15T00:00:00Z'), ['Spring', 'Fall']);
    expect(result).toEqual({ season: 'Fall', year: 2026 });
  });

  test('rolls over to the next year when the next offered season wraps around', () => {
    const result = getCurrentSemesterForDeptSeasons(new Date('2026-10-15T00:00:00Z'), ['Spring', 'Summer']);
    expect(result).toEqual({ season: 'Spring', year: 2027 });
  });

  test('returns the real current season when the department offers it', () => {
    const result = getCurrentSemesterForDeptSeasons(new Date('2026-02-15T00:00:00Z'), ['Spring', 'Summer', 'Fall']);
    expect(result).toEqual({ season: 'Spring', year: 2026 });
  });

  test('finds the actual current semester by date instead of array order', () => {
    const result = findCurrentSemesterIdForSummaryView([
      { id: 2, name: 'Spring 2027 (2nd Semester)', courses: [] },
      { id: 1, name: 'Fall 2026 (1st Semester)', courses: [] },
    ], { season: 'Fall', year: 2026 });
    expect(result).toEqual(1);
  });

  test('returns null when only future semesters remain after the current one is removed', () => {
    const result = findCurrentSemesterIdForSummaryView([
      { id: 2, name: 'Spring 2027 (2nd Semester)', courses: [] },
    ], { season: 'Fall', year: 2026 });
    expect(result).toEqual(null);
  });

  console.log('\n──────────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);

  if (failed > 0) {
    console.error('\nSome tests failed ✗');
    process.exitCode = 1;
  } else {
    console.log('\nAll tests passed ✓');
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
