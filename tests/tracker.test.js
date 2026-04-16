/**
 * tests/tracker.test.js
 * Regression tests for summary-semester estimation in the degree tracker.
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
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

(async function run() {
  const { estimateSummaryCompletedSemesters } = await import('../js/ui/tracker.js');

  console.log('\nDegree tracker summary estimation:');

  test('counts the last completed semester for tri-semester departments', () => {
    const count = estimateSummaryCompletedSemesters({
      hasSummary: true,
      startSeason: 'Fall',
      startYear: 2024,
      deptSeasons: ['Spring', 'Summer', 'Fall'],
      completedSemCount: 0,
      lastCompleted: { season: 'Fall', year: 2025 },
    });

    expect(count).toBe(4);
  });

  test('subtracts already tracked completed semesters from the summary estimate', () => {
    const count = estimateSummaryCompletedSemesters({
      hasSummary: true,
      startSeason: 'Fall',
      startYear: 2024,
      deptSeasons: ['Spring', 'Summer', 'Fall'],
      completedSemCount: 1,
      lastCompleted: { season: 'Fall', year: 2025 },
    });

    expect(count).toBe(3);
  });

  test('works for bi-semester department calendars', () => {
    const count = estimateSummaryCompletedSemesters({
      hasSummary: true,
      startSeason: 'Spring',
      startYear: 2025,
      deptSeasons: ['Spring', 'Fall'],
      completedSemCount: 0,
      lastCompleted: { season: 'Fall', year: 2025 },
    });

    expect(count).toBe(2);
  });

  test('returns zero when the selected start semester is in the future', () => {
    const count = estimateSummaryCompletedSemesters({
      hasSummary: true,
      startSeason: 'Fall',
      startYear: 2026,
      deptSeasons: ['Spring', 'Summer', 'Fall'],
      completedSemCount: 0,
      lastCompleted: { season: 'Spring', year: 2026 },
    });

    expect(count).toBe(0);
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
