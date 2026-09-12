/**
 * tests/bundleBudget.test.js
 * The bundle size ratchet (#677).
 *
 * The deployed page is 1.66 MB gzipped and had no limit; Vite's own 500 kB
 * warning blocks nothing. These pin the comparison itself — that over budget
 * fails, that headroom and drift are computed the way the table prints them,
 * and that the target list still covers the artifact users actually download.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, judge } from '../scripts/check_bundle_budget.mjs';

const target = { label: 't', measured: { raw: 100, gzip: 40 }, budget: { raw: 110, gzip: 45 } };

test('within budget passes, and reports headroom', () => {
    const v = judge(target, { raw: 99, gzip: 40 });
    assert.equal(v.failed, false);
    const gzipCheck = v.checks.find((c) => c.kind === 'gzip');
    assert.equal(gzipCheck.over, false);
    assert.ok(Math.abs(gzipCheck.headroomPct - 11.11) < 0.01, 'headroom is budget-relative');
});

test('over budget in either dimension fails', () => {
    assert.equal(judge(target, { raw: 111, gzip: 40 }).failed, true, 'raw over');
    assert.equal(judge(target, { raw: 99, gzip: 46 }).failed, true, 'gzip over');
});

test('exactly at budget passes — the ratchet catches growth past it, not up to it', () => {
    assert.equal(judge(target, { raw: 110, gzip: 45 }).failed, false);
});

test('drift since the budget was set is reported in both directions', () => {
    const grew = judge(target, { raw: 105, gzip: 42 });
    assert.equal(grew.checks.find((c) => c.kind === 'raw').grewSinceMeasured, 5);
    const shrank = judge(target, { raw: 90, gzip: 38 });
    assert.equal(shrank.checks.find((c) => c.kind === 'raw').grewSinceMeasured, -10);
});

test('a dimension with no budget is not judged', () => {
    const gzipOnly = { label: 'g', budget: { gzip: 45 } };
    const v = judge(gzipOnly, { raw: 9999, gzip: 40 });
    assert.deepEqual(v.checks.map((c) => c.kind), ['gzip']);
    assert.equal(v.failed, false);
});

test('the deployed page is still covered, with a gzip budget', () => {
    const deployed = TARGETS.find((t) => t.file === 'shohoj.html');
    assert.ok(deployed, 'shohoj.html — what GitHub Pages serves — must stay in the list');
    assert.ok(deployed.budget.gzip > 0, 'the wire cost is the one users pay');
});

test('every target declares a budget, a build command, and what it measured', () => {
    for (const t of TARGETS) {
        assert.ok(t.budget && Object.keys(t.budget).length > 0, `${t.label}: no budget`);
        assert.ok(t.build, `${t.label}: no build command to name when the artifact is missing`);
        assert.ok(t.measured && Object.keys(t.measured).length > 0, `${t.label}: no measured baseline`);
        for (const kind of Object.keys(t.budget)) {
            assert.ok(t.budget[kind] >= (t.measured[kind] ?? 0), `${t.label} ${kind}: budget below what it measured`);
        }
    }
});
