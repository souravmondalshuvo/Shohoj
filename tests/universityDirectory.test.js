/**
 * tests/universityDirectory.test.js
 *
 * Drift guard for the legacy bundle's campus list.
 *
 * js/core/universityDirectory.js exists because build3.py concatenates plain JS
 * and cannot pull in src/core/university.ts, so the sign-in portal's campus list
 * is a hand-written copy of the registry's display fields. A hand-written copy
 * that nothing checks is a copy that goes stale — and a stale one here is not
 * cosmetic: a student whose domain is missing from the legacy list is told, on
 * the page they actually land on, that their university is not supported.
 *
 * So this transpiles the real registry and asserts the two agree on id,
 * shortName and emailDomains, entry for entry, in order. Grading scales and
 * feature lists deliberately do NOT appear in the legacy copy and are not
 * compared — src/core/university.ts stays the single source for those.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import {
  LEGACY_CAMPUS_ID,
  UNIVERSITY_DIRECTORY,
  campusOfEmail,
  servedByThisBuild,
} from '../js/core/universityDirectory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcCore = path.join(here, '..', 'src', 'core');

// university.ts imports grades.ts and types.ts, so both come along or the
// import dangles. Same rewrite convention as typedCoreParity.test.js.
const FILES = ['grades.ts', 'types.ts', 'university.ts'];

function rewriteLocalImports(output) {
  return output.replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_m, quote, specifier) => {
    if (/\.[cm]?js$/.test(specifier)) return `from ${quote}${specifier}${quote}`;
    return `from ${quote}${specifier.replace(/\.ts$/, '')}.mjs${quote}`;
  });
}

async function loadTypedRegistry() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shohoj-university-'));
  for (const file of FILES) {
    const sourcePath = path.join(srcCore, file);
    const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        strict: true,
      },
    });
    fs.writeFileSync(
      path.join(tempDir, file.replace(/\.ts$/, '.mjs')),
      rewriteLocalImports(result.outputText),
    );
  }
  const mod = await import(pathToFileURL(path.join(tempDir, 'university.mjs')).href);
  return mod.UNIVERSITIES;
}

const UNIVERSITIES = await loadTypedRegistry();
const typed = Object.values(UNIVERSITIES);

// ── The registries agree ─────────────────────────────────────────────────────

assert.equal(
  UNIVERSITY_DIRECTORY.length,
  typed.length,
  'js/core/universityDirectory.js lists a different number of campuses than '
    + 'src/core/university.ts — add the new campus to both.',
);

typed.forEach((profile, i) => {
  const legacy = UNIVERSITY_DIRECTORY[i];
  assert.equal(legacy.id, profile.id, `campus ${i}: id drifted`);
  assert.equal(legacy.name, profile.name, `campus ${profile.id}: name drifted`);
  assert.equal(legacy.shortName, profile.shortName, `campus ${profile.id}: shortName drifted`);
  assert.deepEqual(
    legacy.emailDomains,
    [...profile.emailDomains],
    `campus ${profile.id}: emailDomains drifted — the portal would tell a real `
      + 'student their university is unsupported',
  );
});

// ── campusOfEmail matches the registry it mirrors ────────────────────────────

for (const profile of typed) {
  for (const domain of profile.emailDomains) {
    assert.equal(campusOfEmail(`student@${domain}`), profile.id);
    // Google returns whatever casing was typed; the same student must resolve.
    assert.equal(campusOfEmail(`Student@${domain.toUpperCase()}`), profile.id);
  }
}

assert.equal(campusOfEmail('someone@gmail.com'), null, 'a public domain is no campus');
assert.equal(campusOfEmail('not-an-email'), null);
assert.equal(campusOfEmail(''), null);
assert.equal(campusOfEmail(null), null);
assert.equal(campusOfEmail(undefined), null);
// A subdomain must NOT match by suffix — evil.g.bracu.ac.bd.attacker.com and
// friends resolve by exact domain only.
assert.equal(campusOfEmail('a@sub.g.bracu.ac.bd'), null);
assert.equal(campusOfEmail('a@g.bracu.ac.bd.attacker.com'), null);

// ── The legacy campus matches what firebase.js actually admits ───────────────
//
// The portal tells a visitor which campuses this build can sign in. That claim
// is only worth anything if it tracks the domain check that does the admitting:
// if someone broadens legacy sign-in and the portal still sends NSU students to
// /app/, the portal is lying. Reading the source is crude, but the alternative
// is importing firebase.js, which pulls in the Firebase SDK over the network.

const legacyProfile = UNIVERSITY_DIRECTORY.find(u => u.id === LEGACY_CAMPUS_ID);
assert.ok(legacyProfile, `LEGACY_CAMPUS_ID '${LEGACY_CAMPUS_ID}' is not in the directory`);
assert.ok(servedByThisBuild(LEGACY_CAMPUS_ID));

const firebaseSource = fs.readFileSync(path.join(here, '..', 'js', 'auth', 'firebase.js'), 'utf8');
for (const domain of legacyProfile.emailDomains) {
  assert.ok(
    firebaseSource.includes(`@${domain}`),
    `js/auth/firebase.js no longer checks for @${domain} — the portal's claim `
      + `that ${legacyProfile.shortName} can sign in here is now unverified.`,
  );
}

for (const profile of typed) {
  if (profile.id === LEGACY_CAMPUS_ID) continue;
  assert.equal(
    servedByThisBuild(profile.id),
    false,
    `${profile.shortName} is not the legacy campus and must be handed off to the shell`,
  );
  for (const domain of profile.emailDomains) {
    assert.ok(
      !firebaseSource.includes(`@${domain}`),
      `js/auth/firebase.js now admits @${domain}, but the portal still tells `
        + `${profile.shortName} students to use /app/. Update the portal.`,
    );
  }
}

console.log('universityDirectory: legacy campus list matches src/core/university.ts');
