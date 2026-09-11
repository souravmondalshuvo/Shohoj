/**
 * tests/productionReadiness.test.js
 * The decisions behind the daily production check (#675 follow-up to #674).
 *
 * #674 — production's Worker reporting email: false — went unnoticed because
 * the preflight that could have seen it never ran, and would not have failed on
 * it if it had. These pin the rules that replace that: what counts as a
 * failure, what is an acknowledged gap, and what the workflow should do next.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    REQUIRED, INFORMATIONAL, KNOWN_GAPS,
    flatten, evaluateReadiness, containsKeyMaterial, decideAlerts,
} from '../scripts/lib/readiness.mjs';

// Production's /ready capabilities as observed on 2026-09-10.
const TODAY = {
    assistant: true, assistantFallback: false, papers: true, email: false,
    rateLimits: { papers: true, assistant: true },
};
const statusOf = (verdict, path) => verdict.results.find((r) => r.path === path).status;

// ---- the manifest ---------------------------------------------------------
test('email is a known gap tied to #674', () => {
    assert.equal(KNOWN_GAPS.email, 674);
    assert.ok(REQUIRED.includes('email'), 'a known gap must still be a required capability');
});

test('every known gap is a required capability', () => {
    for (const path of Object.keys(KNOWN_GAPS)) assert.ok(REQUIRED.includes(path), path);
});

test('flatten gives dotted paths for nested capabilities', () => {
    assert.deepEqual(flatten({ a: true, r: { x: false, y: true } }), { a: true, 'r.x': false, 'r.y': true });
    assert.deepEqual(flatten(null), {});
    assert.deepEqual(flatten('nope'), {});
});

// ---- judging /ready ---------------------------------------------------------
test("today's production passes, with email as an acknowledged gap", () => {
    const v = evaluateReadiness(TODAY);
    assert.equal(v.failed, false);
    assert.equal(statusOf(v, 'email'), 'known-gap');
    assert.equal(statusOf(v, 'assistant'), 'ok');
    assert.deepEqual(v.unknown, []);
    assert.deepEqual(v.info, [{ path: 'assistantFallback', value: false }]);
});

test('a required capability going off, untracked, fails', () => {
    const v = evaluateReadiness({ ...TODAY, papers: false });
    assert.equal(v.failed, true);
    assert.equal(statusOf(v, 'papers'), 'missing');
});

test('without the exemption, today would fail on email — the exemption is doing real work', () => {
    const v = evaluateReadiness(TODAY, { knownGaps: {} });
    assert.equal(v.failed, true);
    assert.equal(statusOf(v, 'email'), 'missing');
});

test('a known gap coming back is reported as restored, not ok', () => {
    const v = evaluateReadiness({ ...TODAY, email: true });
    assert.equal(v.failed, false);
    assert.equal(statusOf(v, 'email'), 'restored');
});

test('an absent or non-boolean capability fails as a shape change', () => {
    const noLimits = { ...TODAY };
    delete noLimits.rateLimits;
    assert.equal(statusOf(evaluateReadiness(noLimits), 'rateLimits.papers'), 'invalid');
    assert.equal(statusOf(evaluateReadiness({ ...TODAY, papers: 'yes' }), 'papers'), 'invalid');
    assert.equal(evaluateReadiness(null).failed, true);
});

test('a capability the manifest does not list is surfaced, not ignored', () => {
    assert.deepEqual(evaluateReadiness({ ...TODAY, queue: true }).unknown, ['queue']);
});

test('the key-material guard flags secrets and passes booleans', () => {
    assert.equal(containsKeyMaterial(JSON.stringify({ capabilities: TODAY })), false);
    assert.equal(containsKeyMaterial('{"k":"sk-ant-abc123"}'), true);
    assert.equal(containsKeyMaterial('-----BEGIN PRIVATE KEY-----'), true);
    assert.equal(containsKeyMaterial('re_AbCdEfGh1234'), true);
});

// ---- what the workflow does ---------------------------------------------------
const ok = (over = {}) => ({
    pagesOk: true, workerOk: true, readiness: evaluateReadiness(TODAY),
    gapIssueStates: { 674: 'open' }, alertIssueOpen: false, ...over,
});

test('a healthy day with the gap tracked does nothing, and says why', () => {
    const d = decideAlerts(ok());
    assert.equal(d.action, 'none');
    assert.deepEqual(d.failures, []);
    assert.match(d.warnings.join(' '), /#674/);
});

test('recovery closes the open alert', () => {
    assert.equal(decideAlerts(ok({ alertIssueOpen: true })).action, 'close');
});

test('a Worker or Pages failure opens (or comments on) the alert', () => {
    assert.equal(decideAlerts(ok({ workerOk: false })).action, 'open-or-comment');
    assert.equal(decideAlerts(ok({ pagesOk: false })).action, 'open-or-comment');
});

test('closing the tracking issue does not make the gap go away', () => {
    const d = decideAlerts(ok({ gapIssueStates: { 674: 'closed' } }));
    assert.equal(d.action, 'open-or-comment');
    assert.match(d.failures[0], /#674 .* is closed/);
});

test('a restored gap asks for its issue to be closed, once the workflow acts on it', () => {
    const d = decideAlerts(ok({ readiness: evaluateReadiness({ ...TODAY, email: true }) }));
    assert.deepEqual(d.restored, [{ path: 'email', issue: 674 }]);
    assert.equal(d.action, 'none');
    const already = decideAlerts(ok({
        readiness: evaluateReadiness({ ...TODAY, email: true }), gapIssueStates: { 674: 'closed' },
    }));
    assert.deepEqual(already.restored, [], 'nothing to ask once the issue is closed');
});

test('an untracked capability going off is a failure the alert names', () => {
    const d = decideAlerts(ok({ readiness: evaluateReadiness({ ...TODAY, papers: false }) }));
    assert.equal(d.action, 'open-or-comment');
    assert.match(d.failures.join(' '), /`papers` is off, and no issue tracks it/);
});

test('informational capabilities never alert', () => {
    const v = evaluateReadiness({ ...TODAY, assistantFallback: false });
    assert.equal(decideAlerts(ok({ readiness: v })).action, 'none');
    assert.ok(INFORMATIONAL.includes('assistantFallback'));
});
