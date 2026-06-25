/**
 * tests/papersTab.test.js
 * Pure view-builder coverage for the Past Papers & Notes browse list. The key
 * regression guarded here: a swallowed query failure (state.error) must read
 * differently from a genuinely empty approved library — otherwise a missing
 * Firestore composite index masquerades as "No papers yet". DOM wiring
 * (renderPapersTab, upload/report modals, the auth-changed repaint) still needs
 * browser/e2e QA.
 *
 * The module registers actions and a window listener at import time, so stub a
 * minimal window first.
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
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
  };
}

// Defaults for a state snapshot; override per-test.
function st(overrides = {}) {
  return { query: '', type: 'all', papers: [], loading: false, error: false, ...overrides };
}

(async function run() {
  const { papersListHtml } = await import('../js/ui/papersTab.js');

  console.log('\nPapers tab list builder:');

  test('loading state renders skeleton cards, not an empty message', () => {
    const html = papersListHtml(st({ loading: true }));
    expect(html).toContain('paper-card--skeleton');
    expect(html).notToContain('No papers yet');
    expect(html).notToContain("Couldn't load papers");
  });

  test('error state shows a load-error message with a Retry action (the bug fix)', () => {
    const html = papersListHtml(st({ error: true }));
    expect(html).toContain("Couldn't load papers");
    expect(html).toContain('data-action="papers:retry"');
  });

  test('error state is distinct from the empty-library state', () => {
    const errorHtml = papersListHtml(st({ error: true }));
    // A real load failure must NOT read as "no papers" — that was the masking bug.
    expect(errorHtml).notToContain('No papers yet');
  });

  test('error wins over papers already in state (stale data is not shown)', () => {
    const html = papersListHtml(st({
      error: true,
      papers: [{ id: 'p1', courseCode: 'CSE220', title: 'Old', type: 'final' }],
    }));
    expect(html).toContain("Couldn't load papers");
    expect(html).notToContain('CSE220');
  });

  test('empty library (no query) prompts the user to seed the library', () => {
    const html = papersListHtml(st());
    expect(html).toContain('No papers yet. Upload yours to get the library started.');
    expect(html).notToContain("Couldn't load papers");
  });

  test('empty result for a search query names the course and invites an upload', () => {
    const html = papersListHtml(st({ query: 'CSE220', papers: [] }));
    expect(html).toContain('No papers found for CSE220');
    expect(html).toContain('Be the first to upload one!');
  });

  test('populated list renders a card per paper with code, title and type', () => {
    const html = papersListHtml(st({
      papers: [
        { id: 'a', courseCode: 'CSE220', title: 'Midterm Spring 2024', type: 'midterm' },
        { id: 'b', courseCode: 'MAT110', title: 'Final notes', type: 'notes' },
      ],
    }));
    expect(html).toContain('class="paper-card"');
    expect(html).toContain('CSE220');
    expect(html).toContain('Midterm Spring 2024');
    expect(html).toContain('Midterm');   // PAPER_TYPE_LABELS lookup
    expect(html).toContain('MAT110');
    expect(html).toContain('Notes');
  });

  test('type filter narrows the list and can empty it', () => {
    const papers = [
      { id: 'a', courseCode: 'CSE220', title: 'M', type: 'midterm' },
      { id: 'b', courseCode: 'CSE220', title: 'Q', type: 'quiz' },
    ];
    const onlyQuiz = papersListHtml(st({ type: 'quiz', papers }));
    expect(onlyQuiz).toContain('>Q<');
    expect(onlyQuiz).notToContain('>M<');

    const noMatch = papersListHtml(st({ type: 'final', papers }));
    // Filtered to empty with no search query → falls back to the seed prompt.
    expect(noMatch).toContain('No papers yet');
  });

  test('paper card escapes hostile title and course fields', () => {
    const html = papersListHtml(st({
      papers: [{ id: 'x', courseCode: '<b>x</b>', title: '<img src=x onerror=alert(1)>', type: 'final' }],
    }));
    expect(html).notToContain('<img src=x onerror=alert(1)>');
    expect(html).notToContain('<b>x</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
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
