/**
 * tests/campusMap.test.js
 *
 * The campus domain map is generated from src/core/university.ts into the
 * Worker's table and into two functions inside firestore.rules (#571). This
 * covers the three things that would hurt if the generator got them wrong:
 *
 *   1. The patterns are anchored and dot-escaped in BOTH derived languages. An
 *      unanchored or unescaped pattern would admit
 *      `x@g.bracu.ac.bd.attacker.com` as a BRACU student — the whole boundary
 *      these copies exist to enforce.
 *   2. Adding a campus to the registry produces correct output everywhere, with
 *      no hand edits, including a campus with more than one email domain.
 *   3. The files on disk match what the generator produces today, so this fails
 *      alongside CI's --check rather than only in CI.
 *
 * The rules output cannot be executed here (it is CEL, and tests/firestore.
 * rules.test.js needs the emulator), so its patterns are translated back into
 * JavaScript regexes and exercised. That checks the part a mistake would live
 * in — the anchors and the escaping — not the rules engine.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRulesCampusOfEmail,
  buildRulesValidCampus,
  buildWorkerModule,
  campusDomains,
  jsPattern,
  loadUniversities,
  rulesPattern,
  spliceRules,
} from '../scripts/generate_campus_map.mjs';
import {
  CAMPUS_EMAIL_RES,
  campusOfEmail,
  isValidCampus,
} from '../worker/campus.generated.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const registry = campusDomains(await loadUniversities());
assert.ok(registry.length >= 1, 'the registry lists no campuses at all');

// ── The generated Worker table answers for the registry ──────────────────────

for (const campus of registry) {
  for (const domain of campus.domains) {
    assert.equal(campusOfEmail(`student@${domain}`), campus.id, `${domain} should be ${campus.id}`);
  }
  assert.ok(isValidCampus(campus.id), `${campus.id} is in the registry but not a valid campus`);
}

assert.equal(campusOfEmail('someone@gmail.com'), '', 'a public domain is no campus');
assert.equal(campusOfEmail('not-an-email'), '');
assert.equal(campusOfEmail(null), '');
assert.equal(isValidCampus(''), false);
assert.equal(isValidCampus('bracu-but-not-really'), false);

// ── Anchoring: the attack these copies exist to stop ─────────────────────────
//
// Both directions matter. A suffix (`@g.bracu.ac.bd.attacker.com`) is an
// attacker's domain that merely ends the way ours starts; a prefix
// (`@sub.g.bracu.ac.bd`) is a subdomain we never registered.

for (const campus of registry) {
  for (const domain of campus.domains) {
    assert.equal(campusOfEmail(`a@${domain}.attacker.com`), '', `${domain} matched by suffix`);
    assert.equal(campusOfEmail(`a@sub.${domain}`), '', `${domain} matched by subdomain`);
    // A dot must be a literal dot, not "any character".
    assert.equal(campusOfEmail(`a@${domain.replace('.', 'X')}`), '', `${domain}: dot unescaped`);
  }
}

// The same three assertions, against the pattern generated into firestore.rules.
function rulesPatternAsRegExp(domain) {
  return new RegExp(rulesPattern(domain).replace(/\[\.\]/g, '\\.'));
}

for (const campus of registry) {
  for (const domain of campus.domains) {
    const re = rulesPatternAsRegExp(domain);
    assert.ok(re.test(`student@${domain}`), `rules pattern rejects a real ${campus.id} address`);
    assert.ok(!re.test(`a@${domain}.attacker.com`), `rules pattern matches ${domain} by suffix`);
    assert.ok(!re.test(`a@sub.${domain}`), `rules pattern matches ${domain} by subdomain`);
    assert.ok(!re.test(`a@${domain.replace('.', 'X')}`), `rules pattern leaves a dot unescaped`);
  }
}

// ── Escaping is an allow-list, not a list of characters to remember ──────────
//
// DOMAIN_RE already rejects anything but [a-z0-9.-], so in practice only dots
// are ever escaped. The escapers still escape everything non-alphanumeric,
// because an escaper that is correct only because of a check somewhere else is
// one refactor away from being wrong — and this one produces the regex that
// decides who reads whose data.

assert.equal(jsPattern('a-b.edu'), '^[^@]+@a\\-b\\.edu$');
assert.equal(rulesPattern('a-b.edu'), '^[^@]+@a[-]b[.]edu$');
// A backslash is escaped rather than passed through as the start of an escape
// sequence, which is the hole the allow-list closes.
assert.equal(jsPattern('a\\db'), '^[^@]+@a\\\\db$');
assert.ok(!new RegExp(jsPattern('a\\db')).test('axdb'), 'the input is data, never a pattern');

// ── A third campus needs no hand edits ───────────────────────────────────────

const withThird = [
  ...registry,
  { id: 'aiub', domains: ['aiub.edu', 'student.aiub.edu'] },
];

const workerModule = buildWorkerModule(withThird);
assert.match(workerModule, /\['aiub', \/\^\[\^@\]\+@aiub\\\.edu\$\/\]/);
assert.match(workerModule, /\['aiub', \/\^\[\^@\]\+@student\\\.aiub\\\.edu\$\/\]/);
assert.match(workerModule, /VALID_CAMPUS_IDS = new Set\(\[.*'aiub'\]\)/);

const rulesCampusOf = buildRulesCampusOfEmail(withThird);
assert.ok(rulesCampusOf.includes("? 'aiub'"), 'rules campusOfEmail lost the third campus');
assert.ok(
  rulesCampusOf.includes("addr.matches('^[^@]+@aiub[.]edu$') || addr.matches('^[^@]+@student[.]aiub[.]edu$')"),
  'a campus with two domains must match either of them',
);
assert.ok(
  buildRulesValidCampus(withThird).includes("value == 'aiub'"),
  'rules validCampus lost the third campus — client writes would be rejected',
);

// The generated worker module is real JavaScript, and the third campus resolves
// through it exactly like the shipped ones do.
const dataUrl = `data:text/javascript;base64,${Buffer.from(workerModule).toString('base64')}`;
const generated = await import(dataUrl);
assert.equal(generated.campusOfEmail('student@aiub.edu'), 'aiub');
assert.equal(generated.campusOfEmail('student@student.aiub.edu'), 'aiub');
assert.equal(generated.campusOfEmail('student@aiub.edu.attacker.com'), '');
assert.equal(generated.isValidCampus('aiub'), true);
// ...and the campuses already in the registry are untouched by the addition.
for (const campus of registry) {
  for (const domain of campus.domains) {
    assert.equal(generated.campusOfEmail(`student@${domain}`), campus.id);
  }
}

// ── The generator refuses input it cannot escape correctly ───────────────────

assert.throws(
  () => campusDomains([{ id: 'x', domains: [], emailDomains: [] }]),
  /no emailDomains/,
  'a campus with no domains could never sign anyone in',
);
assert.throws(
  () => campusDomains([{ id: 'x', emailDomains: ['not a domain'] }]),
  /not a hostname/,
  'a domain outside the escaped shape must stop the build, not produce a pattern',
);
assert.throws(
  () => campusDomains([
    { id: 'a', emailDomains: ['shared.edu'] },
    { id: 'b', emailDomains: ['shared.edu'] },
  ]),
  /claimed by both/,
  'two campuses claiming one domain is a coin flip over who owns the data',
);

// ── A hand edit inside a generated region cannot survive ─────────────────────

assert.throws(
  () => spliceRules('rules_version = "2";\n', 'campusOfEmail', 'x'),
  /missing the 'campusOfEmail' generated region/,
  'a removed marker must fail loudly rather than silently skipping the region',
);

// ── What is on disk is what the generator produces ───────────────────────────

assert.equal(
  readFileSync(resolve(repoRoot, 'worker/campus.generated.js'), 'utf8'),
  buildWorkerModule(registry),
  'worker/campus.generated.js is stale — run: npm run generate:campus-map',
);

const rulesSource = readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8');
assert.ok(
  rulesSource.includes(buildRulesCampusOfEmail(registry)),
  'firestore.rules campusOfEmail is stale — run: npm run generate:campus-map',
);
assert.ok(
  rulesSource.includes(buildRulesValidCampus(registry)),
  'firestore.rules validCampus is stale — run: npm run generate:campus-map',
);

// The Worker's own table is the one the rules mirror: same ids, same order.
assert.deepEqual(
  CAMPUS_EMAIL_RES.map(([id]) => id),
  registry.flatMap((c) => c.domains.map(() => c.id)),
);

console.log('✓ campus map: anchored, escaped, and derived from the registry alone');
