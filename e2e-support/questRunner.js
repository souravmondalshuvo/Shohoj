// e2e-support/questRunner.js
//
// A stand-in for Shohoj Quest's Java engine (#981), for browser tests.
//
// The real engine is CheerpJ: about 14 MB from a third-party CDN, and a JVM in
// a worker. A suite that gates deploys cannot depend on that. So the app has
// one seam, `window.__shohojQuestRunner` (src/features/quest/ui/javaEngineStore.ts),
// and this installs a stand-in there that answers a quest's plan the way the
// engine would: "it did not compile", "these tests ran and printed this", "it
// was killed at the time limit".
//
// Only the JVM is replaced. Everything a student's answer passes through on
// either side of it still runs as it ships: the source rules, the harness that
// is built around the code, the grader that reads the results, and the screen.
// What this cannot tell you is whether real Java agrees with the stand-in. That
// is `npm run quest:check` (every reference solution through the real engine)
// and `npm run test:e2e:quest-real` (the real engine in the real page).
//
// A stand-in is a script: an ordered list of "if the student's source contains
// this text, the engine answers that", and what to answer otherwise.

/** The engine ran the tests. `results` is one entry per test that finished. */
export const ran = (results, ending = { kind: 'done' }) => ({
  kind: 'ran',
  results,
  ending,
  noise: [],
  tracked: true,
});

/** A test that ran to the end. `out` is what it printed; `extra` what a method returned. */
export const finished = (index, { out = '', extra = '' } = {}) => ({
  index,
  status: 'OK',
  out,
  detail: '',
  extra,
});

/** A test stopped by an exception on `line` of the student's file. */
export const threw = (index, exception, line) => ({
  index,
  status: 'EXC',
  out: '',
  detail: `java.lang.${exception}|${line}|`,
  extra: '',
});

/** Killed at the time limit while test `index` ran: what an infinite loop gets. */
export const killed = (index = 0, results = []) => ran(results, { kind: 'timeout', index });

/** javac refused the code. `output` is what javac printed. */
export const refused = (output) => ({ kind: 'compileError', output });

/** What a correct program produces for every test of a `write`, `fix` or `fill` quest. */
export function passing(quest) {
  const { grading } = quest;
  return ran(
    grading.tests.map((test, index) =>
      grading.mode === 'stdio'
        ? finished(index, { out: test.expected })
        : finished(index, {
            out: test.expectedStdout ?? '',
            extra: test.expected === undefined ? '' : String(test.expected),
          }),
    ),
  );
}

/** As `passing`, but test `index` prints `out` instead of what was expected. */
export function passingExcept(quest, index, out) {
  const outcome = passing(quest);
  outcome.results[index] = finished(index, { out });
  return outcome;
}

/** A hero run. `report` is `trace|x|y|facing|picked|stop`, as the generated Hero class writes it. */
export const heroRan = (report) => ran([finished(0, { extra: report })]);

/**
 * Install the stand-in before the app loads.
 *
 * `script.rules` is tried in order; the first whose `when` text is in the
 * student's source answers. `script.otherwise` answers the rest. Every plan the
 * app hands over is recorded on `window.__questRuns`, so a test can check what
 * was actually going to be compiled.
 */
export function installQuestRunner(page, script) {
  return page.addInitScript(({ rules, otherwise }) => {
    window.__questRuns = [];
    window.__shohojQuestRunner = {
      async run(plan, hooks) {
        // The student's file is first, and `plainFiles` has it untouched.
        const source = plan.plainFiles[0].content;
        window.__questRuns.push({
          source,
          studentFile: plan.studentFile,
          files: plan.files.map((file) => file.name),
          tests: plan.tests.length,
          timeLimitMs: plan.timeLimitMs,
        });
        const rule = rules.find((candidate) => source.includes(candidate.when));
        const outcome = rule ? rule.outcome : otherwise;
        if (outcome.kind === 'ran') {
          for (const result of outcome.results) hooks?.onTestBegin?.(result.index);
        }
        return outcome;
      },
    };
  }, script);
}
