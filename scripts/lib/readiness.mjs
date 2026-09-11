// What production's Worker must be able to do, what it currently cannot, and
// what to do about it.
//
// Pure: no network, no GitHub. scripts/smoke-worker.mjs feeds it /ready's
// capabilities, and .github/workflows/production-check.yml feeds it issue
// states; both then act on what it decides. That split is what lets the
// decisions be unit-tested (tests/productionReadiness.test.js) while the I/O
// stays thin.
//
// The manifest is checked against the Worker's own readinessReport() by
// worker/test/readinessManifest.test.js, so a capability added or renamed in
// the Worker fails a test rather than going silently unmonitored.

/** Capabilities production depends on. Off means a user-facing feature is broken. */
export const REQUIRED = Object.freeze([
  'assistant',
  'papers',
  'email',
  'rateLimits.papers',
  'rateLimits.assistant',
]);

/** Reported, never enforced: nice to have, not a feature by itself. */
export const INFORMATIONAL = Object.freeze(['assistantFallback']);

/**
 * Required capabilities that are off *and already tracked*. A known gap warns
 * instead of failing, so the check does not cry wolf every morning about a
 * problem that has an owner. Delete the entry when its issue is fixed — the
 * check will say so when the capability comes back.
 */
export const KNOWN_GAPS = Object.freeze({
  email: 674, // RESEND_API_KEY / verified EMAIL_FROM not set on the Worker
});

/** `{ a: { b: true } }` → `{ 'a.b': true }`. */
export function flatten(value, prefix = '') {
  const out = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (v !== null && typeof v === 'object' && !Array.isArray(v))
      Object.assign(out, flatten(v, path));
    else out[path] = v;
  }
  return out;
}

/**
 * Judge /ready's capabilities against the manifest.
 *
 * Each required capability comes back as one of:
 *   ok        — true
 *   restored  — true, but still listed as a known gap (its issue can be closed)
 *   known-gap — false, and tracked by an open issue elsewhere
 *   missing   — false, and not tracked: a failure
 *   invalid   — absent or not a boolean: a failure (the endpoint changed shape)
 */
export function evaluateReadiness(
  capabilities,
  { required = REQUIRED, informational = INFORMATIONAL, knownGaps = KNOWN_GAPS } = {},
) {
  const flat = flatten(capabilities);
  const results = required.map((path) => {
    const value = flat[path];
    const issue = knownGaps[path];
    if (typeof value !== 'boolean') return { path, value, status: 'invalid' };
    if (value)
      return issue ? { path, value, status: 'restored', issue } : { path, value, status: 'ok' };
    return issue ? { path, value, status: 'known-gap', issue } : { path, value, status: 'missing' };
  });
  const info = informational.map((path) => ({ path, value: flat[path] }));
  const listed = new Set([...required, ...informational]);
  const unknown = Object.keys(flat).filter((path) => !listed.has(path));
  const failed = results.some((r) => r.status === 'missing' || r.status === 'invalid');
  return { results, info, unknown, failed };
}

/**
 * True if a serialised /ready body looks like it carries key material. /ready is
 * booleans-only by design (worker/index.js), so this is a regression guard, not
 * an expected path.
 */
export function containsKeyMaterial(text) {
  return /sk-|BEGIN [A-Z ]*PRIVATE KEY|re_[A-Za-z0-9]{8}/.test(String(text));
}

/**
 * What the scheduled workflow should do with one run's outcome.
 *
 * @param {object} input
 * @param {boolean} input.pagesOk    the Pages smoke passed
 * @param {boolean} input.workerOk   liveness, readiness shape and the leak check passed
 * @param {{results: object[], unknown: string[]}|null} input.readiness  evaluateReadiness's verdict, if /ready answered
 * @param {Record<number, 'open'|'closed'>} input.gapIssueStates  state of each known gap's issue
 * @param {boolean} input.alertIssueOpen  a "Production check failing" issue is already open
 */
export function decideAlerts({
  pagesOk,
  workerOk,
  readiness,
  gapIssueStates = {},
  alertIssueOpen,
}) {
  const failures = [];
  const warnings = [];
  const restored = [];
  if (!pagesOk) failures.push('The GitHub Pages smoke check failed.');
  if (!workerOk)
    failures.push('The Worker smoke check failed (liveness, readiness or the key-material guard).');
  for (const r of readiness?.results ?? []) {
    if (r.status === 'missing') failures.push(`\`${r.path}\` is off, and no issue tracks it.`);
    if (r.status === 'invalid')
      failures.push(`\`${r.path}\` is absent or not a boolean — /ready changed shape.`);
    if (r.status === 'known-gap') {
      if (gapIssueStates[r.issue] === 'closed') {
        failures.push(
          `\`${r.path}\` is still off, but #${r.issue} — the issue tracking it — is closed.`,
        );
      } else {
        warnings.push(`\`${r.path}\` is off — known gap, tracked in #${r.issue}.`);
      }
    }
    if (r.status === 'restored' && gapIssueStates[r.issue] !== 'closed') {
      restored.push({ path: r.path, issue: r.issue });
    }
  }
  for (const path of readiness?.unknown ?? []) {
    warnings.push(`/ready reports \`${path}\`, which the manifest does not list.`);
  }
  const action = failures.length ? 'open-or-comment' : alertIssueOpen ? 'close' : 'none';
  return { failures, warnings, restored, action };
}
