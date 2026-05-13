/**
 * tests/adminDashboard.test.js
 * Pure helper coverage for the admin dashboard. DOM-heavy interactions still
 * need browser/manual QA with a real admin account.
 */

global.window = {
  addEventListener() {},
};

let passed = 0;
let failed = 0;
let total = 0;

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
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(`Expected ${e}, got ${a}`);
      }
    },
    toContain(expected) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
    notToContain(expected) {
      if (String(actual).includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(expected)}`);
      }
    },
  };
}

(async function run() {
  const {
    normalizeAdminStats,
    buildAdminStatsHtml,
  } = await import('../js/ui/adminDashboard.js');

  console.log('\nAdmin dashboard helpers:');

  test('normalizeAdminStats fills missing counts and collection fields', () => {
    expect(normalizeAdminStats(null)).toEqual({
      counts: {
        reviews: 0,
        papers: 0,
        pendingPapers: 0,
        feedback: 0,
        paperReports: 0,
        reviewReports: 0,
      },
      activity: [],
      topFaculty: [],
      topCourses: [],
      paperTypes: {},
      feedbackTypes: {},
    });
  });

  test('normalizeAdminStats preserves valid values and clamps bad counts', () => {
    const stats = normalizeAdminStats({
      counts: {
        reviews: 12,
        papers: '7',
        pendingPapers: -2,
        feedback: Number.NaN,
        paperReports: 1,
      },
      activity: [
        { date: '2026-05-13', reviews: 1 },
        { date: null, reviews: 99 },
      ],
      topFaculty: [{ initials: 'MAK', count: 3 }],
      topCourses: [{ code: 'CSE220', count: 2 }],
      paperTypes: { final: 4 },
      feedbackTypes: { bug: '1' },
    });

    expect(stats.counts).toEqual({
      reviews: 12,
      papers: 7,
      pendingPapers: 0,
      feedback: 0,
      paperReports: 1,
      reviewReports: 0,
    });
    expect(stats.activity.length).toBe(1);
    expect(stats.activity[0].papers).toBe(0);
    expect(stats.paperTypes.final).toBe(4);
    expect(stats.feedbackTypes.bug).toBe(1);
  });

  test('buildAdminStatsHtml sanitizes rendered count values', () => {
    const html = buildAdminStatsHtml({
      counts: {
        reviews: '<script>alert(1)</script>',
        papers: 2,
      },
    });

    expect(html).toContain('Total reviews');
    expect(html).toContain('<div class="admin-stat-value">0</div>');
    expect(html).notToContain('<script>alert(1)</script>');
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
