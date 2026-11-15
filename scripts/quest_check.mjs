#!/usr/bin/env node
// scripts/quest_check.mjs — run every quest's reference solution through the
// real Java engine (#981).
//
//   npm run quest:check                 # every quest
//   npm run quest:check -- bridge       # quests whose id contains "bridge"
//   npm run quest:check -- --preload    # also print the runtime preload list
//
// The unit tests prove the grader on text that looks like the harness's output.
// This proves the other half: that the generated Java compiles, that CheerpJ
// runs it, and that each quest can actually be solved. For every quest it
// checks two things:
//
//   * the reference solution passes;
//   * for a code quest, the starter does NOT pass, because a quest that can be
//     cleared by pressing Run on what it opens with teaches nothing.
//
// It is an author's tool, not a CI gate: it downloads about 14 MB from
// CheerpJ's CDN and would make every deploy depend on that CDN being up. Run
// it after writing or changing quests, and after changing the CheerpJ version.
//
// It serves scripts/quest-check/ with Vite's dev server, so the page uses the
// same worker and engine modules the game ships, and drives it with Playwright.

import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { SOLUTIONS } from '../src/features/quest/content/solutions.ts';
import { loadWorld } from '../src/features/quest/content/world.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const printPreload = args.includes('--preload');
const filter = args.find((arg) => !arg.startsWith('--')) ?? '';

/** What a student would submit unchanged, for quests where that is code. */
function untouched(quest) {
  if (quest.type === 'predict') return null;
  // A fill quest opens with an empty line.
  return quest.type === 'fill' ? '' : quest.starter;
}

function describe(result) {
  if (result.kind === 'tests') {
    const failed = result.tests.filter((t) => t.outcome !== 'pass');
    return failed.length === 0
      ? result.summary
      : `${result.summary} ${failed.map((t) => `[${t.name}: ${t.outcome}${t.message ? `, ${t.message}` : ''}]`).join(' ')}`;
  }
  if (result.kind === 'compile') {
    return `does not compile: ${result.diagnostics.map((d) => `${d.file}:${d.line} ${d.message}`).join('; ') || result.raw.trim()}`;
  }
  if (result.kind === 'rules') return `breaks a source rule: ${result.failures.join(' ')}`;
  if (result.kind === 'engine') return `engine error: ${result.message}`;
  return result.passed ? 'correct' : `wrong on line ${result.wrongLine}`;
}

const server = await createServer({
  configFile: false,
  root: path.join(ROOT, 'scripts/quest-check'),
  logLevel: 'error',
  // Its own cache, so a run never rewrites the project's node_modules/.vite.
  cacheDir: path.join(os.tmpdir(), 'shohoj-quest-check-vite'),
  // A dev server reloads the page when it sees a file change or finishes
  // optimising a dependency. A reload mid-run throws the JVM away, so both are
  // off: nothing is watched, and the one dependency is named up front.
  optimizeDeps: { include: ['zod'] },
  server: { port: 0, host: '127.0.0.1', hmr: false, watch: null, fs: { allow: [ROOT] } },
});
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch();
let failures = 0;

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(`  page error: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => Boolean(globalThis.questCheck));

  const started = Date.now();
  await page.evaluate(() => globalThis.questCheck.load());
  const steps = await page.evaluate(
    () => globalThis.questCheck.statuses.filter((s) => s.phase === 'loading').length,
  );
  console.log(
    `Java engine ready in ${((Date.now() - started) / 1000).toFixed(1)} s (${steps} progress updates)\n`,
  );

  const attempt = async (questId, answer) => {
    const at = Date.now();
    const result = await page.evaluate(
      ([id, text]) => globalThis.questCheck.attempt(id, text),
      [questId, answer],
    );
    return { result, seconds: ((Date.now() - at) / 1000).toFixed(1) };
  };

  for (const zone of loadWorld().zones) {
    for (const quest of zone.quests) {
      if (filter && !quest.id.includes(filter)) continue;
      console.log(`${quest.id} (${quest.type})`);

      const solution = SOLUTIONS[quest.id];
      if (typeof solution !== 'string') {
        failures += 1;
        console.log('  FAIL  no reference solution');
        continue;
      }
      const solved = await attempt(quest.id, solution);
      if (!solved.result.passed) failures += 1;
      console.log(
        `  ${solved.result.passed ? 'ok  ' : 'FAIL'}  solution: ${describe(solved.result)} (${solved.seconds} s)`,
      );

      const starter = untouched(quest);
      if (starter === null) continue;
      const unsolved = await attempt(quest.id, starter);
      if (unsolved.result.passed || unsolved.result.kind === 'engine') failures += 1;
      console.log(
        `  ${unsolved.result.passed || unsolved.result.kind === 'engine' ? 'FAIL' : 'ok  '}  starter:  ${describe(unsolved.result)} (${unsolved.seconds} s)`,
      );
    }
  }

  if (printPreload) {
    const resources = await page.evaluate(() => globalThis.questCheck.resources());
    console.log(`\nPRELOAD_RESOURCES for src/features/quest/runner/cheerpj.ts:\n${resources}`);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(
  failures === 0
    ? '\nEvery quest can be solved, and none is solved by its starter.'
    : `\n${failures} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
