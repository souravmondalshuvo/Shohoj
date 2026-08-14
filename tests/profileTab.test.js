/**
 * tests/profileTab.test.js
 * Pure view-builder coverage for the Profile account hub (#196). DOM wiring
 * (renderProfileTab, the auth-changed repaint) still needs browser/e2e QA.
 *
 * The module registers a profile:signout action and a window listener at import
 * time, so stub a minimal window first.
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

(async function run() {
  const {
    profileSignedOutHtml,
    profileSignedInHtml,
    seatAlertsSectionHtml,
    routineSummarySectionHtml,
    reviewsSectionHtml,
    dangerZoneSectionHtml,
    academicProfileSectionHtml,
    pfFormatLastSync,
    pfCleanName,
    pfSameName,
    pfSemesterGpaSeries,
    pfGpaTrend,
  } = await import('../js/ui/profileTab.js');

  console.log('\nProfile tab view builders:');

  test('signed-out view prompts sign-in (acceptance #1)', () => {
    const html = profileSignedOutHtml();
    expect(html).toContain('Sign in to view your profile');
    expect(html).toContain('data-action="auth:signin"');
  });

  test('signed-out view has no CONNECT credential field (acceptance #4)', () => {
    const html = profileSignedOutHtml();
    expect(html).notToContain('<input');
    expect(html).notToContain('password');
    expect(html.toLowerCase()).notToContain('connect');
  });

  test('signed-in view shows name, email and a sign-out action', () => {
    const html = profileSignedInHtml({
      signedIn: true, displayName: 'Ayesha Rahman', email: 'ayesha@g.bracu.ac.bd', photoURL: null,
    });
    expect(html).toContain('Ayesha Rahman');
    expect(html).toContain('ayesha@g.bracu.ac.bd');
    expect(html).toContain('data-action="profile:signout"');
  });

  test('signed-in view has no credential field anywhere (acceptance #4)', () => {
    const html = profileSignedInHtml({
      signedIn: true, displayName: 'X', email: 'x@g.bracu.ac.bd', photoURL: null,
    });
    expect(html).notToContain('<input');
    expect(html).notToContain('password');
    expect(html.toLowerCase()).notToContain('connect');
  });

  test('missing display name falls back without leaking an empty email line', () => {
    const html = profileSignedInHtml({ signedIn: true, displayName: null, email: '', photoURL: null });
    expect(html).toContain('BRACU student');
    expect(html).notToContain('class="pf-email"');
  });

  test('safe photoURL renders an avatar image; absence uses the initial fallback', () => {
    const withPhoto = profileSignedInHtml({
      signedIn: true, displayName: 'Bored Cat', email: 'b@g.bracu.ac.bd', photoURL: 'https://example.com/a.png',
    });
    expect(withPhoto).toContain('<img class="pf-avatar-img"');
    expect(withPhoto).toContain('https://example.com/a.png');

    const noPhoto = profileSignedInHtml({
      signedIn: true, displayName: 'Bored Cat', email: 'b@g.bracu.ac.bd', photoURL: null,
    });
    expect(noPhoto).notToContain('<img');
    expect(noPhoto).toContain('pf-avatar-fallback');
    expect(noPhoto).toContain('>B<'); // first initial of "Bored Cat"
  });

  test('a hostile display name is HTML-escaped, not injected', () => {
    const html = profileSignedInHtml({
      signedIn: true, displayName: '<img src=x onerror=alert(1)>', email: 'e@g.bracu.ac.bd', photoURL: null,
    });
    expect(html).notToContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('seat-alert card: empty watchlist shows a friendly prompt and 0 count', () => {
    const html = seatAlertsSectionHtml({ watches: [], alertsEnabled: true });
    expect(html).toContain('0 watched');
    expect(html).toContain("You're not watching any sections yet");
    expect(html).toContain('data-action="profile:toggleAlerts"');
  });

  test('seat-alert card: lists each watched section with its code and number', () => {
    const html = seatAlertsSectionHtml({
      watches: [
        { sectionId: 1, courseCode: 'CSE110', sectionName: '04' },
        { sectionId: 2, courseCode: 'MAT110', sectionName: '12' },
      ],
      alertsEnabled: true,
    });
    expect(html).toContain('2 watched');
    expect(html).toContain('CSE110');
    expect(html).toContain('Section 04');
    expect(html).toContain('MAT110');
    expect(html).toContain('Section 12');
  });

  test('seat-alert toggle reflects the on state (no paused tag, aria-checked true)', () => {
    const html = seatAlertsSectionHtml({ watches: [], alertsEnabled: true });
    expect(html).toContain('pf-toggle is-on');
    expect(html).toContain('aria-checked="true"');
    expect(html).notToContain('(paused)');
  });

  test('seat-alert toggle reflects the off state (paused tag, aria-checked false)', () => {
    const html = seatAlertsSectionHtml({ watches: [{ sectionId: 1, courseCode: 'X', sectionName: '1' }], alertsEnabled: false });
    expect(html).notToContain('pf-toggle is-on');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('(paused)');
  });

  test('seat-alert card escapes hostile section fields', () => {
    const html = seatAlertsSectionHtml({
      watches: [{ sectionId: 1, courseCode: '<b>x</b>', sectionName: '"><img>' }],
      alertsEnabled: true,
    });
    expect(html).notToContain('<b>x</b>');
    expect(html).notToContain('"><img>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  test('signed-in view embeds the seat-alert card when given watch data', () => {
    const html = profileSignedInHtml(
      { signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null },
      { watches: [{ sectionId: 9, courseCode: 'PHY111', sectionName: '03' }], alertsEnabled: true },
    );
    expect(html).toContain('🪑 Seat alerts');
    expect(html).toContain('PHY111');
    expect(html).toContain('data-action="profile:toggleAlerts"');
  });

  test('routine card: empty routine + empty plan show friendly prompts and 0 counts', () => {
    const html = routineSummarySectionHtml({ pickedCourses: [], plannerCourses: [] });
    expect(html).toContain('🗓️ Routine');
    expect(html).toContain('0 courses');
    expect(html).toContain('No saved routine yet');
    expect(html).toContain('No courses planned');
  });

  test('routine card: lists picked sections and planner courses as chips', () => {
    const html = routineSummarySectionHtml({ pickedCourses: ['CSE220', 'MAT110'], plannerCourses: ['PHY111'] });
    expect(html).toContain('2 courses');
    expect(html).toContain('>CSE220<');
    expect(html).toContain('>MAT110<');
    expect(html).toContain('Semester plan');
    expect(html).toContain('1 course');
    expect(html).toContain('>PHY111<');
  });

  test('routine card: singular vs plural count and no credential surface', () => {
    const html = routineSummarySectionHtml({ pickedCourses: ['CSE110'], plannerCourses: [] });
    expect(html).toContain('1 course');
    expect(html).notToContain('1 courses');
    expect(html).notToContain('<input');
    expect(html.toLowerCase()).notToContain('connect');
  });

  test('routine card escapes hostile course codes', () => {
    const html = routineSummarySectionHtml({ pickedCourses: ['<img src=x>'], plannerCourses: [] });
    expect(html).notToContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  test('reviews card: empty state prompts the user to write one', () => {
    const html = reviewsSectionHtml([]);
    expect(html).toContain('✍️ Your reviews');
    expect(html).toContain('0 written');
    expect(html).toContain("You haven't written any reviews yet");
  });

  test('reviews card: lists each review with faculty, course and semester', () => {
    const html = reviewsSectionHtml([
      { facultyInitials: 'ABC', courseCode: 'CSE220', semester: 'Spring 2026' },
      { facultyInitials: 'XYZ', courseCode: 'MAT110', semester: '' },
    ]);
    expect(html).toContain('2 written');
    expect(html).toContain('ABC');
    expect(html).toContain('CSE220');
    expect(html).toContain('Spring 2026');
    expect(html).toContain('XYZ');
    expect(html).toContain('pseudonymous');
  });

  test('reviews card escapes hostile review fields', () => {
    const html = reviewsSectionHtml([{ facultyInitials: '<b>x</b>', courseCode: '"><img>', semester: '' }]);
    expect(html).notToContain('<b>x</b>');
    expect(html).notToContain('"><img>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  test('signed-in view embeds the routine and reviews cards', () => {
    const html = profileSignedInHtml(
      { signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null },
      { watches: [], alertsEnabled: true },
      { pickedCourses: ['CSE110'], plannerCourses: [] },
      [{ facultyInitials: 'ABC', courseCode: 'CSE110', semester: 'Fall 2025' }],
    );
    expect(html).toContain('🗓️ Routine');
    expect(html).toContain('✍️ Your reviews');
    expect(html).toContain('CSE110');
    expect(html).toContain('ABC');
    expect(html).notToContain('routine summary and reviews will appear here');
  });

  test('signed-in view tolerates missing routine/reviews args (renders empty cards)', () => {
    const html = profileSignedInHtml({ signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null });
    expect(html).toContain('🗓️ Routine');
    expect(html).toContain('✍️ Your reviews');
    expect(html).notToContain('<input');
  });

  test('danger-zone card offers a delete-cloud action and no credential surface', () => {
    const html = dangerZoneSectionHtml();
    expect(html).toContain('⚠️ Danger zone');
    expect(html).toContain('data-action="profile:deleteCloud"');
    expect(html).toContain('Delete cloud data');
    expect(html).notToContain('<input');
    expect(html.toLowerCase()).notToContain('connect');
  });

  test('danger-zone copy reassures that local data on this device is kept', () => {
    const html = dangerZoneSectionHtml();
    expect(html).toContain('this device');
    expect(html).toContain("can't be undone");
  });

  test('signed-in view embeds the danger zone', () => {
    const html = profileSignedInHtml(
      { signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null },
      { watches: [], alertsEnabled: true },
    );
    expect(html).toContain('⚠️ Danger zone');
    expect(html).toContain('data-action="profile:deleteCloud"');
  });

  test('pfFormatLastSync: never-synced / invalid timestamps read as "Not synced yet"', () => {
    expect(pfFormatLastSync(null)).toBe('Not synced yet');
    expect(pfFormatLastSync(0)).toBe('Not synced yet');
    expect(pfFormatLastSync(NaN)).toBe('Not synced yet');
  });

  test('pfFormatLastSync: recent / minutes / hours / days buckets', () => {
    const now = 1_000_000_000_000;
    expect(pfFormatLastSync(now - 5_000, now)).toBe('Synced just now');
    expect(pfFormatLastSync(now - 5 * 60_000, now)).toBe('Synced 5m ago');
    expect(pfFormatLastSync(now - 3 * 3_600_000, now)).toBe('Synced 3h ago');
    expect(pfFormatLastSync(now - 2 * 86_400_000, now)).toBe('Synced 2d ago');
  });

  test('signed-in header surfaces the last-synced line from a timestamp', () => {
    const now = 1_000_000_000_000;
    const html = profileSignedInHtml(
      { signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null },
      { watches: [], alertsEnabled: true }, { pickedCourses: [], plannerCourses: [] }, [],
      now - 10 * 60_000,
    );
    expect(html).toContain('pf-synced');
    // The label itself is computed against the real clock at render; just assert
    // the line exists and renders some "Synced …"/"Not synced" copy without throwing.
    expect(html.includes('Synced') || html.includes('Not synced')).toBe(true);
  });

  console.log('\nAcademic-profile card:');

  test('academic card: no snapshot shows the import CTA, no credential surface', () => {
    const empty = academicProfileSectionHtml(null);
    expect(empty).toContain('🎓 Academic profile');
    expect(empty).toContain('Import your transcript');
    expect(empty).notToContain('<input');
    expect(empty.toLowerCase()).notToContain('password');
  });

  test('academic card: renders SID, program, CGPA, credits and the GPA history', () => {
    const html = academicProfileSectionHtml({
      sid: '20301234', name: 'Ayesha Rahman',
      program: 'B.Sc. in Computer Science and Engineering (CSE)',
      cgpa: 3.745, earnedCredits: 96,
      semesters: [
        { name: 'Fall 2023', courses: [{ name: 'CSE110', credits: 3, grade: 'A' }] },
        { name: 'Spring 2024', courses: [{ name: 'CSE111', credits: 3, grade: 'B' }] },
      ],
    }, 'Ayesha Rahman');
    expect(html).toContain('20301234');
    expect(html).toContain('Computer Science and Engineering');
    expect(html).toContain('3.75');        // CGPA rounded to 2 dp
    expect(html).toContain('96');          // credits earned
    expect(html).toContain('Fall 2023');
    expect(html).toContain('Semester GPA');
    expect(html).toContain('4.00');        // Fall 2023 semester GPA
    expect(html).toContain('3.00');        // Spring 2024 semester GPA
  });

  test('academic card: CGPA is stated once, and the chip carries the trend instead', () => {
    const html = academicProfileSectionHtml({
      sid: '1', program: 'CSE', cgpa: 3.5, earnedCredits: 30,
      semesters: [
        { name: 'Fall 2023', courses: [{ credits: 3, grade: 'B' }] },
        { name: 'Spring 2024', courses: [{ credits: 3, grade: 'A' }] },
      ],
    }, '');
    expect(html).notToContain('CGPA 3.50');
    expect(html.match(/3\.50/g).length).toBe(1); // the gauge, and nowhere else
    expect(html).toContain('▲ 1.00 last term');
  });

  test('academic card: a single graded semester gets no invented trend', () => {
    const html = academicProfileSectionHtml({
      sid: '1', program: 'CSE', cgpa: 3, earnedCredits: 3,
      semesters: [{ name: 'Fall 2023', courses: [{ credits: 3, grade: 'B' }] }],
    }, '');
    expect(html).notToContain('last term');
    expect(html).notToContain('pf-trend');
  });

  test('academic card: an ungraded semester reads as such, not as a 0.00 crash', () => {
    const html = academicProfileSectionHtml({
      sid: '1', program: 'CSE', cgpa: 3, earnedCredits: 3,
      semesters: [
        { name: 'Fall 2023', courses: [{ credits: 3, grade: 'B' }] },
        { name: 'Summer 2024', courses: [{ credits: 3, grade: '' }] },
      ],
    }, '');
    expect(html).toContain('no grades yet');
    expect(html).notToContain('0.00');
    expect(html).notToContain('last term'); // one graded semester is not a trend
  });

  test('academic card: the transcript name shows only when it differs from the account', () => {
    const same = academicProfileSectionHtml({
      sid: '24201402', name: 'Sourav Mondal UNDERGRADUATE',
      program: 'B.Sc. in CSE', cgpa: 2.39, earnedCredits: 48, semesters: [],
    }, 'Sourav Mondal');
    expect(same).notToContain('Name on transcript');
    expect(same).notToContain('UNDERGRADUATE');

    const different = academicProfileSectionHtml({
      sid: '24201402', name: 'Sourav Mondal UNDERGRADUATE',
      program: 'B.Sc. in CSE', cgpa: 2.39, earnedCredits: 48, semesters: [],
    }, 'Shuvo');
    expect(different).toContain('Name on transcript');
    expect(different).toContain('Sourav Mondal');
    expect(different).notToContain('UNDERGRADUATE');
  });

  test('pfSemesterGpaSeries applies the calculator grade rules, not its own', () => {
    const series = pfSemesterGpaSeries([
      // F(NT) is attempted-but-zero; P is outside the average entirely.
      { name: 'Fall 2023', courses: [{ credits: 3, grade: 'A' }, { credits: 3, grade: 'F(NT)' }] },
      { name: 'Spring 2024', courses: [{ credits: 3, grade: 'A' }, { credits: 1, grade: 'P' }] },
      { name: 'Summer 2024', courses: [] },
    ]);
    expect(series[0].gpa).toBe(2);   // (4.00×3 + 0×3) / 6
    expect(series[1].gpa).toBe(4);   // the P credit is excluded, not counted as 0
    expect(series[2].gpa).toBe(null);
    expect(series[2].courseCount).toBe(0);
  });

  test('pfGpaTrend measures the last two graded semesters, skipping ungraded ones', () => {
    const trend = pfGpaTrend([
      { name: 'Fall 2023', gpa: 3 },
      { name: 'Spring 2024', gpa: 3.5 },
      { name: 'Summer 2024', gpa: null },
    ]);
    expect(Math.round(trend.delta * 100)).toBe(50);
    expect(trend.from).toBe('Fall 2023');
    expect(trend.to).toBe('Spring 2024');

    expect(pfGpaTrend([{ name: 'Fall 2023', gpa: 3 }])).toBe(null);
    expect(pfGpaTrend([])).toBe(null);
    expect(pfGpaTrend(null)).toBe(null);
  });

  test('pfSameName ignores case and spacing, and never matches an empty name', () => {
    expect(pfSameName('SOURAV MONDAL', 'Sourav  Mondal')).toBe(true);
    expect(pfSameName('Sourav Mondal', 'Shuvo')).toBe(false);
    expect(pfSameName('', '')).toBe(false);
    expect(pfSameName(null, undefined)).toBe(false);
  });

  test('pfCleanName drops UNDERGRADUATE/GRADUATE suffixes, keeps clean names', () => {
    expect(pfCleanName('Sourav Mondal UNDERGRADUATE')).toBe('Sourav Mondal');
    expect(pfCleanName('Jane Doe GRADUATE')).toBe('Jane Doe');
    expect(pfCleanName('Ayesha Rahman')).toBe('Ayesha Rahman');
    expect(pfCleanName('')).toBe('');
  });

  test('academic card: missing CGPA degrades to an em-dash, not a crash', () => {
    const html = academicProfileSectionHtml({ sid: '20301234', cgpa: null, earnedCredits: 0, semesters: [] });
    expect(html).toContain('20301234');
    expect(html).toContain('—');
  });

  test('academic card escapes hostile transcript fields', () => {
    const html = academicProfileSectionHtml({
      sid: '1', name: '<img src=x onerror=alert(1)>', program: '', cgpa: 4, earnedCredits: 0,
      semesters: [{ name: '"><script>', courses: [] }],
    });
    expect(html).notToContain('<img src=x onerror=alert(1)>');
    expect(html).notToContain('"><script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('signed-in view embeds the academic card and honours includeSeatAlerts:false', () => {
    const html = profileSignedInHtml(
      { signedIn: true, displayName: 'Z', email: 'z@g.bracu.ac.bd', photoURL: null },
      { watches: [{ sectionId: 9, courseCode: 'PHY111', sectionName: '03' }], alertsEnabled: true },
      { pickedCourses: [], plannerCourses: [] }, [], null,
      { sid: '20301234', name: 'Z', program: '', cgpa: 3.5, earnedCredits: 30, semesters: [] },
      { includeSeatAlerts: false },
    );
    expect(html).toContain('🎓 Academic profile');
    expect(html).toContain('20301234');
    expect(html).notToContain('🪑 Seat alerts');
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
