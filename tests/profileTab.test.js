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
