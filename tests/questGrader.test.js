// tests/questGrader.test.js — the Shohoj Quest grader (#981): everything
// between a student pressing Run and a verdict, except running the Java.
//
// What the harness prints is reproduced here as text. The javac output and the
// harness lines in these tests are the shapes observed from CheerpJ 5.0 with
// Java 17; the runner slice adds the test that drives the real engine.

import test from 'node:test';
import assert from 'node:assert/strict';

import { findQuest, loadWorld } from '../src/features/quest/content/world.ts';
import { bridgeSolutions } from '../src/features/quest/content/zones/bridge.solutions.ts';
import { compareOutput, normalizeOutput, showSpaces } from '../src/features/quest/grader/compare.ts';
import {
  explainException,
  explainSetup,
  isOnFillAnswer,
  parseJavac,
} from '../src/features/quest/grader/diagnostics.ts';
import { gradePredict, gradeRun } from '../src/features/quest/grader/grade.ts';
import {
  CLASS_DIR,
  SOURCE_DIR,
  TAG_PREFIX,
  buildHeroSource,
  javacArgs,
  planRun,
} from '../src/features/quest/grader/harness.ts';
import { heroStart, judgeHero, replayHero } from '../src/features/quest/grader/hero.ts';
import {
  ELEMENT_SEPARATOR,
  displayActual,
  displayValue,
  javaString,
  matchesExpected,
  toJavaLiteral,
} from '../src/features/quest/grader/javaValues.ts';
import { addLineTracking } from '../src/features/quest/grader/lineTracking.ts';
import { createProtocolReader } from '../src/features/quest/grader/protocol.ts';
import {
  assembleFill,
  checkRules,
  countToken,
  stripCommentsAndStrings,
} from '../src/features/quest/grader/source.ts';

const world = loadWorld();
const quest = (id) => findQuest(world, id);
const toll = quest('bridge-the-toll');
const rope = quest('bridge-rope-counter');
const span = quest('bridge-first-span');
const strength = quest('bridge-plank-strength');
const keystone = quest('bridge-keystone');

// A line as the generated harness prints it.
const b64 = (text) => (text ? Buffer.from(text, 'utf8').toString('base64') : '-');
const TAG = `${TAG_PREFIX}n1`;
const endLine = (index, status, out = '', detail = '', extra = '') =>
  `${TAG} END ${index} ${status} ${b64(out)} ${b64(detail)} ${b64(extra)}\n`;
const result = (index, status, out = '', detail = '', extra = '') => ({ index, status, out, detail, extra });

// ── Source text ─────────────────────────────────────────────────────────────

test('comments and string contents are blanked, with every line kept in place', () => {
  const source = 'int a = 1; // while\n/* for\n   do */ String s = "while \\" x";\nchar c = \'{\';';
  const stripped = stripCommentsAndStrings(source);
  assert.equal(stripped.split('\n').length, source.split('\n').length);
  assert.equal(stripped.length, source.length);
  assert.equal(/while|for|do\b|\{/.test(stripped), false);
  assert.ok(stripped.includes('int a = 1;'));
  assert.ok(stripped.includes('String s = "'));
});

test('an unclosed string ends at the line break, not at the end of the file', () => {
  const stripped = stripCommentsAndStrings('String s = "oops;\nwhile (true) {}');
  assert.ok(stripped.includes('while (true) {}'));
});

test('names are counted as whole words, other tokens ignoring whitespace', () => {
  assert.equal(countToken('while (x) { meanwhile(); } while(y);', 'while'), 2);
  assert.equal(countToken('hero.step(); hero . step ( ); hero.steps();', 'hero.step('), 2);
  assert.equal(countToken('do { } while (x); double d;', 'do'), 1);
});

test('source rules: requires, atMost, and a comment does not satisfy either', () => {
  const rules = [
    { kind: 'requires', anyOf: ['while', 'for'], message: 'needs a loop' },
    { kind: 'atMost', token: 'hero.step(', max: 1, message: 'step once' },
  ];
  assert.deepEqual(checkRules('while (a) { hero.step(); }', rules), []);
  assert.deepEqual(checkRules('hero.step(); hero.step();', rules), ['needs a loop', 'step once']);
  assert.deepEqual(checkRules('// while\nhero.step();', rules), ['needs a loop']);
  assert.deepEqual(checkRules('for (;;) { hero.step(); /* hero.step(); */ }', rules), []);
  assert.deepEqual(checkRules('String s = "for";', rules), ['needs a loop']);
});

test('a fill answer takes the blank\'s place at the surrounding indentation', () => {
  const filled = assembleFill(toll.template, '   } while (toll <= 0);  ');
  const lines = filled.source.split('\n');
  assert.equal(filled.firstLine, 9);
  assert.equal(filled.lineCount, 1);
  assert.equal(lines[8], '            } while (toll <= 0);');
  assert.equal(lines.length, toll.template.split('\n').length);
  assert.equal(filled.source.includes('__BLANK__'), false);
});

test('a fill answer of several lines is kept, and an empty one still holds the line', () => {
  const two = assembleFill('a {\n    x;\n__BLANK__\n}', 'one;\r\n\n  two;');
  assert.equal(two.source, 'a {\n    x;\n    one;\n    two;\n}');
  assert.deepEqual([two.firstLine, two.lineCount], [3, 2]);

  const empty = assembleFill('a {\n__BLANK__\n}', '   ');
  assert.equal(empty.source, 'a {\n\n}');
  assert.deepEqual([empty.firstLine, empty.lineCount], [2, 1]);
});

// ── Output comparison ───────────────────────────────────────────────────────

test('trailing spaces and trailing blank lines are ignored; leading spaces are not', () => {
  assert.deepEqual(normalizeOutput('a  \r\nb\t\n\n\n'), ['a', 'b']);
  assert.equal(compareOutput('1 4 7 10\nplanks = 4', '1 4 7 10 \nplanks = 4\n').pass, true);
  assert.equal(compareOutput('  1\n 121\n', ' 1\n 121\n').pass, false);
  assert.equal(compareOutput('a\n\nb', 'a\nb').pass, false); // a blank line in the middle counts
});

test('a mismatch reports the first differing line, including output that stops short or runs on', () => {
  assert.deepEqual(compareOutput('a\nb\nc', 'a\nX\nc'), {
    pass: false,
    diff: { line: 2, expected: 'b', actual: 'X' },
  });
  assert.deepEqual(compareOutput('a\nb', 'a').diff, { line: 2, expected: 'b', actual: null });
  assert.deepEqual(compareOutput('a', 'a\nb').diff, { line: 2, expected: null, actual: 'b' });
  assert.equal(showSpaces('  1 2'), '··1 2');
});

// ── Java values ─────────────────────────────────────────────────────────────

test('values become Java literals of the right type', () => {
  assert.equal(toJavaLiteral('int', -5), '-5');
  assert.equal(toJavaLiteral('long', 3000000000), '3000000000L');
  assert.equal(toJavaLiteral('double', 3), '3.0');
  assert.equal(toJavaLiteral('double', 2.5), '2.5');
  assert.equal(toJavaLiteral('boolean', true), 'true');
  assert.equal(toJavaLiteral('char', "'"), "'\\''");
  assert.equal(toJavaLiteral('char', 'a'), "'a'");
  assert.equal(toJavaLiteral('String', 'hi'), '"hi"');
  assert.equal(toJavaLiteral('int[]', [1, 2, 3]), 'new int[]{1, 2, 3}');
  assert.equal(toJavaLiteral('String[]', ['a', 'b']), 'new String[]{"a", "b"}');
  assert.equal(toJavaLiteral('double[]', []), 'new double[]{}');
});

test('a Java string literal escapes quotes, backslashes, line breaks and non-ASCII', () => {
  assert.equal(javaString('a"b\\c\n\td'), '"a\\"b\\\\c\\n\\td"');
  assert.equal(javaString('টাকা'), '"\\u099f\\u09be\\u0995\\u09be"');
  assert.equal(javaString('\u0001'), '"\\u0001"');
  // Plain ASCII only, whatever goes in: the generated source never depends on an encoding.
  assert.match(javaString('é — “x”'), /^[\x20-\x7e]*$/);
});

test('a reported return value is matched by type', () => {
  assert.equal(matchesExpected('int', 10, '10'), true);
  assert.equal(matchesExpected('int', 10, '11'), false);
  assert.equal(matchesExpected('boolean', true, 'true'), true);
  assert.equal(matchesExpected('String', 'ab', 'ab'), true);
  assert.equal(matchesExpected('String', 'ab', 'null'), false);
  assert.equal(matchesExpected('double', 0.3, '0.30000000000000004'), true);
  assert.equal(matchesExpected('double', 0.3, '0.31'), false);
  assert.equal(matchesExpected('double', 1, 'NaN'), false);
  const reported = (items) => `[${items.join(ELEMENT_SEPARATOR)}]`;
  assert.equal(matchesExpected('int[]', [1, 2, 3], reported([1, 2, 3])), true);
  assert.equal(matchesExpected('int[]', [1, 2, 3], reported([1, 2])), false);
  assert.equal(matchesExpected('int[]', [], '[]'), true);
  // A comma inside a string is not a separator.
  assert.equal(matchesExpected('String[]', ['a, b', 'c'], reported(['a, b', 'c'])), true);
});

test('values are shown the way a student writes them', () => {
  assert.equal(displayValue('int', 10), '10');
  assert.equal(displayValue('String', 'ab'), '"ab"');
  assert.equal(displayValue('char', 'x'), "'x'");
  assert.equal(displayValue('int[]', [1, 2]), '[1, 2]');
  assert.equal(displayActual('String[]', `[a${ELEMENT_SEPARATOR}b]`), '["a", "b"]');
  assert.equal(displayActual('int', 'null'), 'null');
});

// ── Compiler output ─────────────────────────────────────────────────────────

const JAVAC_TWO_ERRORS = `/str/Main.java:6: error: ';' expected
        int n = sc.nextInt()
                            ^
/str/Main.java:9: error: cannot find symbol
            totl = total + i;
            ^
  symbol:   variable totl
  location: class Main
Note: Some messages have been simplified.
2 errors
`;

test('javac output becomes one diagnostic per error, with line, column and a hint', () => {
  const [semicolon, symbol, ...rest] = parseJavac(JAVAC_TWO_ERRORS, 'Main.java');
  assert.equal(rest.length, 0);

  assert.deepEqual(
    [semicolon.file, semicolon.line, semicolon.column, semicolon.severity, semicolon.message],
    ['Main.java', 6, 29, 'error', "';' expected"],
  );
  assert.match(semicolon.hint, /semicolon/);
  assert.equal(semicolon.inStudentFile, true);

  assert.equal(symbol.line, 9);
  assert.equal(symbol.column, 13);
  assert.deepEqual(symbol.details, ['  symbol:   variable totl', '  location: class Main']);
  assert.match(symbol.hint, /variable called totl/);
});

test('hints name the usual cause for the errors beginners meet', () => {
  const hint = (message, details = '') =>
    parseJavac(`/str/Main.java:3: error: ${message}\n    code\n    ^\n${details}1 error\n`, 'Main.java')[0].hint;
  assert.match(hint('cannot find symbol', '  symbol:   class Scanner\n  location: class Main\n'), /import java\.util\.Scanner/);
  assert.match(hint('cannot find symbol', '  symbol:   method nextint()\n'), /no method called nextint/);
  assert.match(hint('incompatible types: possible lossy conversion from double to int'), /double value cannot go into a int/);
  assert.match(hint('incompatible types: String cannot be converted to int'), /String where a int/);
  assert.match(hint('variable total might not have been initialized'), /int total = 0;/);
  assert.match(hint('variable i is already defined in method main(String[])'), /already declared/);
  assert.match(hint('reached end of file while parsing'), /Count the braces/);
  assert.match(hint('missing return statement'), /return/);
  assert.match(hint("'else' without 'if'"), /stray semicolon/);
  assert.match(hint('class Arch is public, should be declared in a file named Arch.java'), /Rename Arch back/);
  assert.match(hint('non-static method helper() cannot be referenced from a static context'), /static to helper\./);
  assert.match(hint('unreachable statement'), /never reach/);
  // Anything unrecognised still gets advice, and the compiler's message is kept.
  const unknown = parseJavac('/str/Main.java:3: error: something new in Java 30\n', 'Main.java')[0];
  assert.equal(unknown.message, 'something new in Java 30');
  assert.equal(unknown.column, null);
  assert.ok(unknown.hint.length > 0);
});

test('an error in a generated file is marked as not the student\'s', () => {
  const [d] = parseJavac('/str/QuestHarness.java:40: error: cannot find symbol\n', 'Main.java');
  assert.equal(d.inStudentFile, false);
});

test('output with no errors in it parses to nothing', () => {
  assert.deepEqual(parseJavac('', 'Main.java'), []);
  assert.deepEqual(parseJavac('Note: Main.java uses unchecked or unsafe operations.\n', 'Main.java'), []);
});

test('a fill diagnostic on the answer line, or the line after it, belongs to the student', () => {
  const fill = assembleFill(toll.template, '} while (toll <= 0)');
  const at = (line) => ({ line });
  assert.equal(isOnFillAnswer(at(fill.firstLine), fill), true);
  assert.equal(isOnFillAnswer(at(fill.firstLine + 1), fill), true); // where a missing ; is reported
  assert.equal(isOnFillAnswer(at(fill.firstLine - 1), fill), false);
  assert.equal(isOnFillAnswer(at(fill.firstLine + 2), fill), false);
});

test('runtime exceptions are explained, with or without a line or a message', () => {
  const zero = explainException('java.lang.ArithmeticException|8|');
  assert.deepEqual([zero.name, zero.line, zero.message], ['ArithmeticException', 8, '']);
  assert.match(zero.hint, /divided a whole number by zero/);

  const input = explainException('java.util.NoSuchElementException|0|');
  assert.equal(input.line, null);
  assert.match(input.hint, /more input than there was/);

  const own = explainException('java.lang.IllegalStateException|4|bad | state');
  assert.equal(own.message, 'bad | state');
  assert.ok(own.hint.length > 0);
});

test('setup failures are sentences about the first lines of the file', () => {
  assert.match(explainSetup('NoMainClass'), /called Main/);
  assert.match(explainSetup('NoMethod'), /first line has changed/);
  assert.ok(explainSetup('SomethingNew').length > 0);
});

// ── Line tracking ───────────────────────────────────────────────────────────

test('statements that start a line inside a method are marked, on the same line', () => {
  const source = bridgeSolutions['bridge-rope-counter'];
  const tracked = addLineTracking(source);
  const lines = tracked.split('\n');
  assert.equal(lines.length, source.split('\n').length);
  // Nothing outside a method body is touched.
  assert.equal(lines[0], 'import java.util.Scanner;');
  assert.equal(lines[2], 'public class Main {');
  assert.equal(lines[3], '    public static void main(String[] args) {');
  // Statements are, keeping their indentation.
  assert.equal(lines[4], '        QuestHarness.at(5); Scanner sc = new Scanner(System.in);');
  assert.equal(lines[8], '        QuestHarness.at(9); while (i <= n) {');
  assert.equal(lines[9], '            QuestHarness.at(10); total = total + i;');
  // Closing braces are not statements.
  assert.equal(lines[11], '        }');
  // Removing the markers gives back exactly what the student wrote.
  assert.equal(tracked.replace(/QuestHarness\.at\(\d+\); /g, ''), source);
});

test('lines that continue a statement, or are not statements, are left alone', () => {
  const body = [
    'if (a)',
    '    b();', // after a line ending in ")": part of the if
    'else',
    '    c();',
    'int x = f(1,',
    '    2);', // inside brackets
    'for (int i = 0;',
    '     i < 3; i++) {', // inside a for header, after a ;
    '}',
    'int[] data = {',
    '    1, 2,', // an array, not a block
    '};',
    'switch (x) {',
    '    case 1:',
    '        d();',
    '        break;',
    '    default:',
    '        e();',
    '}',
    '// f();',
    'String s = "g();";',
    '++x;',
  ];
  const source = ['class Main {', '  static int field = 1;', '  void run() {', ...body, '  }', '}'].join('\n');
  const marked = addLineTracking(source)
    .split('\n')
    .map((line, i) => (line.includes('QuestHarness.at(') ? source.split('\n')[i].trim() : null))
    .filter(Boolean);
  assert.deepEqual(marked, [
    'if (a)',
    'int x = f(1,',
    'for (int i = 0;',
    'int[] data = {',
    'switch (x) {',
    'd();',
    'break;',
    'e();',
    'String s = "g();";',
    '++x;',
  ]);
});

// ── Planning a run ──────────────────────────────────────────────────────────

test('code that breaks a source rule is refused before anything is compiled', () => {
  const plan = planRun(span, span.starter, 'n1');
  assert.equal(plan.kind, 'rules');
  assert.deepEqual(plan.failures, ['This span needs a loop. Try while (hero.frontIsClear()) { ... }']);
});

test('a stdio quest compiles the student file and a harness that runs main once per test', () => {
  const plan = planRun(rope, bridgeSolutions[rope.id], 'n1');
  assert.equal(plan.kind, 'java');
  assert.deepEqual(plan.files.map((file) => file.name), ['Main.java', 'QuestHarness.java']);
  assert.equal(plan.studentFile, 'Main.java');
  assert.equal(plan.timeLimitMs, 3000);
  assert.deepEqual(
    plan.tests.map((t) => [t.index, t.name, t.hidden]),
    [[0, 'Five planks', false], [1, 'One plank', false], [2, 'Test 3', true], [3, 'Test 4', true]],
  );
  const harness = plan.files[1].content;
  assert.ok(harness.includes('static final String TAG = "\\001Qn1";'));
  assert.ok(harness.includes('test(0, "5\\n", l -> runMain(l));'));
  assert.ok(harness.includes('test(3, "0\\n", l -> runMain(l));'));
  assert.ok(harness.includes(`static final String DIR = "${CLASS_DIR}";`));
});

test('the tracked and plain file sets differ only in the student file', () => {
  const source = bridgeSolutions[rope.id];
  const plan = planRun(rope, source, 'n1');
  assert.equal(plan.plainFiles[0].content, source);
  assert.ok(plan.files[0].content.includes('QuestHarness.at('));
  assert.deepEqual(plan.files.slice(1), plan.plainFiles.slice(1));
});

test('a method quest calls the method by reflection with typed arguments', () => {
  const plan = planRun(strength, bridgeSolutions[strength.id], 'n1');
  assert.deepEqual(plan.files.map((file) => file.name), ['Solution.java', 'QuestHarness.java']);
  const harness = plan.files[1].content;
  assert.ok(
    harness.includes(
      'test(0, "", l -> call(l, "Solution", "digitSum", new Class<?>[] { int.class }, new Object[] { 1234 }, false));',
    ),
  );
  // The harness never names the student's method in code, so renaming it cannot
  // become a compiler error in a file the student has not seen.
  assert.equal(/Solution\.digitSum/.test(harness), false);
});

test('a fill quest compiles the assembled program and remembers where the answer sits', () => {
  const plan = planRun(toll, bridgeSolutions[toll.id], 'n1');
  assert.equal(plan.kind, 'java');
  assert.deepEqual([plan.fill.firstLine, plan.fill.lineCount], [9, 1]);
  assert.ok(plan.plainFiles[0].content.includes('            } while (toll <= 0);'));
});

test('a hero quest adds a Hero class with the level built in', () => {
  const plan = planRun(span, bridgeSolutions[span.id], 'n1');
  assert.deepEqual(plan.files.map((file) => file.name), ['Main.java', 'Hero.java', 'QuestHarness.java']);
  assert.deepEqual(plan.tests, [{ index: 0, name: 'Run', hidden: false, hint: null }]);
  const hero = plan.files[1].content;
  assert.ok(hero.includes('GRID = { "#########", "S.*..*.*G", "#########" };'));
  assert.ok(hero.includes('START_DIR = 1;'));
  assert.ok(hero.includes('MAX_ACTIONS = 200;'));
  for (const method of ['step', 'turnLeft', 'turnRight', 'pick', 'frontIsClear', 'onItem', 'atGoal']) {
    assert.ok(new RegExp(`public (void|boolean) ${method}\\(\\)`).test(hero), `Hero.${method}() is missing`);
  }
  assert.ok(plan.files[2].content.includes('test(0, "", l -> hero(l));'));
  assert.ok(buildHeroSource({ grid: ['S'], facing: 'N' }, 7).includes('MAX_ACTIONS = 7;'));
});

test('javac is given every file, an output directory, and no stale class path', () => {
  const plan = planRun(span, bridgeSolutions[span.id], 'n1');
  const args = javacArgs(plan.files);
  assert.deepEqual(args.slice(0, 4), ['-d', CLASS_DIR, '-cp', SOURCE_DIR]);
  assert.deepEqual(args.slice(-3), ['/str/Main.java', '/str/Hero.java', '/str/QuestHarness.java']);
  // CheerpJ's /str/ mount is flat: a file in a subfolder of it is never found.
  assert.equal(SOURCE_DIR, '/str/');
});

// ── Reading the harness's output ────────────────────────────────────────────

test('protocol lines are read whatever size the chunks are', () => {
  const stream = `${TAG} BEGIN 0\n${endLine(0, 'OK', '15\n')}${TAG} BEGIN 1\n${endLine(1, 'EXC', '', 'java.lang.ArithmeticException|8|')}${TAG} DONE\n`;
  const whole = createProtocolReader('n1');
  const expected = [...whole.push(stream), ...whole.flush()];
  assert.deepEqual(
    expected.map((e) => e.kind),
    ['begin', 'end', 'begin', 'end', 'done'],
  );
  assert.deepEqual(expected[1].result, result(0, 'OK', '15\n'));
  assert.deepEqual(expected[3].result, result(1, 'EXC', '', 'java.lang.ArithmeticException|8|'));

  // One character at a time, as a slow JVM might deliver it.
  const drip = createProtocolReader('n1');
  const dripped = [...stream].flatMap((ch) => drip.push(ch));
  assert.deepEqual([...dripped, ...drip.flush()], expected);
});

test('output is decoded as UTF-8, and an unterminated last line is read on flush', () => {
  const reader = createProtocolReader('n1');
  assert.deepEqual(reader.push(endLine(0, 'OK', 'টাকা ৫\n').trimEnd()), []);
  assert.deepEqual(reader.flush(), [{ kind: 'end', result: result(0, 'OK', 'টাকা ৫\n') }]);
});

test('lines from another run, or from the JVM itself, are noise', () => {
  const reader = createProtocolReader('n1');
  const events = reader.push(
    `Exception in thread "main" java.lang.Error\n${TAG_PREFIX}other END 0 OK - - -\n${TAG} END 0 BOGUS - - -\n\n`,
  );
  assert.deepEqual(events.map((e) => e.kind), ['noise', 'noise', 'noise']);
  assert.equal(events[0].text, 'Exception in thread "main" java.lang.Error');
});

// ── The hero ────────────────────────────────────────────────────────────────

test('a hero report replays into one frame per action', () => {
  const run = replayHero(span.level, 'SSPSRLp|3|1|1|1|');
  assert.deepEqual(heroStart(span.level), { x: 0, y: 1, facing: 'E' });
  assert.deepEqual(
    run.frames.map((f) => [f.event, f.x, f.y, f.facing, f.picked]),
    [
      ['step', 1, 1, 'E', 0],
      ['step', 2, 1, 'E', 0],
      ['pick', 2, 1, 'E', 1],
      ['step', 3, 1, 'E', 1],
      ['turnRight', 3, 1, 'S', 1],
      ['turnLeft', 3, 1, 'E', 1],
      ['pickNothing', 3, 1, 'E', 1],
    ],
  );
  assert.equal(run.stop, null);
  assert.equal(run.reachedGoal, false);
  assert.deepEqual([run.picked, run.totalItems], [1, 3]);
});

test('a report this version did not write replays to nothing', () => {
  assert.equal(replayHero(span.level, ''), null);
  assert.equal(replayHero(span.level, 'SS?|0|0|0|0|'), null);
});

test('the hero is judged against the goal, and each way of failing says why', () => {
  const judge = (report) => judgeHero(span, replayHero(span.level, report));
  assert.deepEqual(judge('SSPSSSPSSPS|8|1|1|3|'), { passed: true, message: 'The hero made it.' });
  assert.match(judge('SSSSSSSS|8|1|1|0|').message, /left 3 items behind/);
  assert.match(judge('SSPSSSPSSP|7|1|1|3|').message, /not at the goal/);
  assert.match(judge('SSSSSSSSB|8|1|1|0|blocked').message, /cannot be crossed/);
  assert.match(judge(`${'L'.repeat(200)}X|0|1|1|0|tired`).message, /worn out after 200 actions/);
  assert.match(judge('|0|1|1|0|dizzy').message, /never moved/);
  assert.equal(judge('SSSSSSSSB|8|1|1|0|blocked').passed, false);
});

// ── Verdicts ────────────────────────────────────────────────────────────────

const ropePlan = planRun(rope, bridgeSolutions[rope.id], 'n1');
const DONE = { kind: 'done' };

test('every test passing is a pass', () => {
  const results = [result(0, 'OK', '15\n'), result(1, 'OK', '1\n'), result(2, 'OK', '5050\n'), result(3, 'OK', '0\n')];
  const verdict = gradeRun(rope, ropePlan, results, DONE);
  assert.equal(verdict.kind, 'tests');
  assert.equal(verdict.passed, true);
  assert.equal(verdict.summary, 'All 4 tests passed.');
  assert.deepEqual(verdict.tests.map((t) => t.outcome), ['pass', 'pass', 'pass', 'pass']);
  // A visible test shows its data even when it passes; a hidden one never does.
  assert.deepEqual([verdict.tests[0].input, verdict.tests[0].expected], ['5\n', '15\n']);
  assert.deepEqual([verdict.tests[2].input, verdict.tests[2].expected], [null, null]);
});

test('a visible failure shows what was expected, what came out, and where they differ', () => {
  const results = [result(0, 'OK', '10\n'), result(1, 'OK', '1\n'), result(2, 'OK', '5050\n'), result(3, 'OK', '0\n')];
  const verdict = gradeRun(rope, ropePlan, results, DONE);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.summary, '3 of 4 tests passed.');
  const failed = verdict.tests[0];
  assert.equal(failed.outcome, 'fail');
  assert.equal(failed.message, 'Line 1 of the output is different.');
  assert.deepEqual(failed.diff, { line: 1, expected: '15', actual: '10' });
  assert.equal(failed.actual, '10\n');
});

test('a hidden failure reveals its hint and nothing about its data', () => {
  const results = [result(0, 'OK', '15\n'), result(1, 'OK', '1\n'), result(2, 'OK', '4950\n'), result(3, 'OK', '0\n')];
  const hidden = gradeRun(rope, ropePlan, results, DONE).tests[2];
  assert.equal(hidden.outcome, 'fail');
  assert.equal(hidden.message, 'A hidden test printed the wrong output.');
  assert.equal(hidden.hint, 'Is the last plank being counted? Trace n = 3 by hand.');
  assert.deepEqual([hidden.input, hidden.expected, hidden.actual, hidden.diff], [null, null, null, null]);
  assert.equal(JSON.stringify(hidden).includes('5050'), false);
  assert.equal(JSON.stringify(hidden).includes('4950'), false);
});

test('a run killed at the time limit times out the running test and never runs the rest', () => {
  const verdict = gradeRun(rope, ropePlan, [result(0, 'OK', '15\n')], { kind: 'timeout', index: 1 });
  assert.deepEqual(verdict.tests.map((t) => t.outcome), ['pass', 'timeout', 'notRun', 'notRun']);
  assert.match(verdict.tests[1].message, /^Stopped after 3 seconds\. A loop is probably never ending/);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.summary, '1 of 4 tests passed.');
});

test('a JVM that exits early is explained, once', () => {
  const verdict = gradeRun(rope, ropePlan, [], { kind: 'exited' });
  assert.deepEqual(verdict.tests.map((t) => t.outcome), ['error', 'notRun', 'notRun', 'notRun']);
  assert.match(verdict.tests[0].message, /System\.exit\(\)/);
});

test('an exception reports its name and line, for hidden tests too', () => {
  const crash = 'java.lang.ArithmeticException|8|';
  const results = [0, 1, 2, 3].map((i) => result(i, 'EXC', '', crash));
  const verdict = gradeRun(rope, ropePlan, results, DONE);
  for (const t of verdict.tests) {
    assert.equal(t.outcome, 'error');
    assert.equal(t.message, 'ArithmeticException at line 8.');
    assert.equal(t.problem.line, 8);
  }
  // The line is in the student's own code, so it is shown; the test's data still is not.
  assert.equal(verdict.tests[2].input, null);
  // When the line is unknown the message does not invent one.
  const noLine = gradeRun(rope, ropePlan, [result(0, 'EXC', '', 'java.util.InputMismatchException|0|')], DONE);
  assert.equal(noLine.tests[0].message, 'InputMismatchException.');
});

test('too much output and code the tests cannot call are errors with a reason', () => {
  const flood = gradeRun(rope, ropePlan, [result(0, 'OLE')], DONE);
  assert.match(flood.tests[0].message, /printed far more/);
  const setup = gradeRun(rope, ropePlan, [result(0, 'SETUP', '', 'NoMainClass')], DONE);
  assert.match(setup.tests[0].message, /called Main/);
});

test('a method test compares the returned value and says what came back', () => {
  const plan = planRun(strength, bridgeSolutions[strength.id], 'n1');
  const ok = [10, 7, 0, 45, 1].map((value, i) => result(i, 'OK', '', '', String(value)));
  assert.equal(gradeRun(strength, plan, ok, DONE).passed, true);

  const wrong = [4, 7, 0, 45, 7].map((value, i) => result(i, 'OK', '', '', String(value)));
  const verdict = gradeRun(strength, plan, wrong, DONE);
  assert.deepEqual(verdict.tests.map((t) => t.outcome), ['fail', 'pass', 'pass', 'pass', 'fail']);
  assert.equal(verdict.tests[0].input, 'digitSum(1234)');
  assert.equal(verdict.tests[0].message, 'Returned 4, expected 10.');
  assert.equal(verdict.tests[4].message, 'A hidden test got the wrong answer.');
  assert.match(verdict.tests[4].hint, /Zeros are digits too/);
});

test('a pattern is compared space for space', () => {
  const plan = planRun(keystone, bridgeSolutions[keystone.id], 'n1');
  const outputs = ['  1\n 121\n12321\n', '1\n', '   1\n  121\n 12321\n1234321\n', ' 1\n121\n'];
  const nine = keystone.grading.tests[4].expected;
  const good = [...outputs, nine].map((out, i) => result(i, 'OK', out));
  assert.equal(gradeRun(keystone, plan, good, DONE).passed, true);

  // The same numbers without the leading spaces.
  const flat = [...outputs, nine].map((out, i) => result(i, 'OK', out.replace(/^ +/gm, '')));
  const verdict = gradeRun(keystone, plan, flat, DONE);
  assert.deepEqual(verdict.tests.map((t) => t.outcome), ['fail', 'pass', 'fail', 'fail', 'fail']);
  assert.deepEqual(verdict.tests[0].diff, { line: 1, expected: '  1', actual: '1' });
});

test('a hero run is graded and kept for replay, even when it ends in a crash', () => {
  const plan = planRun(span, bridgeSolutions[span.id], 'n1');
  const pass = gradeRun(span, plan, [result(0, 'OK', '', '', 'SSPSSSPSSPS|8|1|1|3|')], DONE);
  assert.equal(pass.passed, true);
  assert.equal(pass.hero.frames.length, 11);
  assert.equal(pass.summary, 'The hero made it.');

  const fell = gradeRun(span, plan, [result(0, 'OK', '', '', 'SSSSSSSSB|8|1|1|0|blocked')], DONE);
  assert.equal(fell.passed, false);
  assert.match(fell.summary, /cannot be crossed/);
  assert.equal(fell.hero.frames.at(-1).event, 'blocked');

  const crashed = gradeRun(span, plan, [result(0, 'EXC', '', 'java.lang.ArithmeticException|6|', 'SS|2|1|1|0|')], DONE);
  assert.equal(crashed.tests[0].outcome, 'error');
  assert.equal(crashed.hero.frames.length, 2);

  const killed = gradeRun(span, plan, [], { kind: 'timeout', index: 0 });
  assert.equal(killed.tests[0].outcome, 'timeout');
  assert.equal(killed.hero, null);
});

test('a prediction is right when it matches the output, and a wrong one says only which line', () => {
  const planks = quest('bridge-count-the-planks');
  assert.deepEqual(gradePredict(planks, '1 4 7 10 \nplanks = 4\n'), { kind: 'predict', passed: true, wrongLine: null });
  assert.deepEqual(gradePredict(planks, '1 4 7 10\nplanks = 3'), { kind: 'predict', passed: false, wrongLine: 2 });
  assert.deepEqual(gradePredict(planks, ''), { kind: 'predict', passed: false, wrongLine: 1 });
});
