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
  };
}

(async function run() {
  const {
    profileSignedOutHtml,
    profileSignedInHtml,
    seatAlertsSectionHtml,
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
