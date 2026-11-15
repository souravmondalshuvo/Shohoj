// src/features/quest/grader/harness.ts
//
// Turns a quest and a student's answer into the Java files to compile and run
// (#981): the student's own file, a generated test harness, and for a hero
// quest the generated `Hero` class with the level built in.
//
// The harness is Java because the tests have to run inside the same JVM as the
// student's code: one start-up, then every test in a row. It reports over
// standard output, one tagged line when a test begins and one when it ends, and
// the runner turns those lines back into results (protocol.ts). Reporting the
// beginning is what lets the runner say WHICH test was running when a student's
// infinite loop is killed.
//
// Three things in it are there for beginners' code specifically:
//   * Each test loads the student's classes afresh, so a `static Scanner` or a
//     static counter does not carry over from one test to the next.
//   * Output is capped, so `while (true) System.out.println(...)` ends in a
//     message instead of filling the phone's memory before the timer fires.
//   * The student's class and method are found by reflection, so a renamed
//     method is a sentence the student can read, never a compiler error in a
//     file they have not seen.
//   * It records which line is running (lineTracking.ts), because CheerpJ's
//     stack traces have no line numbers to read one from.
//
// Pure string building: nothing here runs Java. The runner does that.

import {
  DEFAULT_MAX_ACTIONS,
  type HeroLevel,
  type HeroQuest,
  type JavaQuest,
  type JavaValue,
  type MethodGrading,
} from '../content/schema.ts';
import { javaString, toJavaClass, toJavaLiteral } from './javaValues.ts';
import { addLineTracking } from './lineTracking.ts';
import { assembleFill, checkRules, type AssembledFill } from './source.ts';

/**
 * Where the runner writes the sources: CheerpJ's JavaScript-to-Java mount. It
 * is flat. A file added under a subfolder of it cannot be found by javac.
 */
export const SOURCE_DIR = '/str/';
/** Where javac writes classes: CheerpJ's one writable mount. */
export const CLASS_DIR = '/files/quest/';
/** The class the runner starts. */
export const HARNESS_CLASS = 'QuestHarness';
/** The byte that opens every protocol line. Student output cannot contain it by accident. */
export const TAG_PREFIX = '\u0001Q';

export interface JavaFile {
  readonly name: string;
  readonly content: string;
}

export interface TestMeta {
  readonly index: number;
  readonly name: string;
  readonly hidden: boolean;
  readonly hint: string | null;
}

export interface RunPlan {
  readonly kind: 'java';
  /**
   * Every file to compile. The student's is first, with line markers added
   * (lineTracking.ts). If this set does not compile, compile `plainFiles`.
   */
  readonly files: readonly JavaFile[];
  /**
   * The same files with the student's source untouched. Compiler errors are
   * always reported from these, so a message never mentions a marker; and if
   * these compile where `files` did not, the markers were the problem and
   * this set is the one to run.
   */
  readonly plainFiles: readonly JavaFile[];
  /** The file compiler errors should be reported against. */
  readonly studentFile: string;
  /** Unique to this run; part of every protocol line. */
  readonly nonce: string;
  readonly tests: readonly TestMeta[];
  /** Per test. */
  readonly timeLimitMs: number;
  /** For a `fill` quest, where the student's line sits in the assembled file. */
  readonly fill: AssembledFill | null;
}

export interface RulesBlocked {
  readonly kind: 'rules';
  /** Why the code was not run, one message per broken rule. */
  readonly failures: readonly string[];
}

export type Plan = RunPlan | RulesBlocked;

const FACING = { N: 0, E: 1, S: 2, W: 3 } as const;

/** The `Hero` class for one level. Its public methods are the whole hero API. */
export function buildHeroSource(
  level: HeroLevel,
  maxActions: number = DEFAULT_MAX_ACTIONS,
): string {
  const rows = level.grid.map((row) => javaString(row)).join(', ');
  return String.raw`public class Hero {
    private static final String[] GRID = { ${rows} };
    private static final int START_DIR = ${FACING[level.facing]};
    private static final int MAX_ACTIONS = ${maxActions};
    private static final int MAX_LOOKS = 100000;
    private static final int[] DX = { 0, 1, 0, -1 };
    private static final int[] DY = { -1, 0, 1, 0 };

    private static StringBuilder trace = new StringBuilder();
    private static boolean[][] taken = new boolean[GRID.length][GRID[0].length()];
    private static int x, y, dir, picked, actions, looks;
    private static String stop = "";

    static void reset() {
        trace = new StringBuilder();
        taken = new boolean[GRID.length][GRID[0].length()];
        picked = 0;
        actions = 0;
        looks = 0;
        stop = "";
        dir = START_DIR;
        for (int r = 0; r < GRID.length; r++) {
            int c = GRID[r].indexOf('S');
            if (c >= 0) {
                x = c;
                y = r;
            }
        }
    }

    static String report() {
        return trace + "|" + x + "|" + y + "|" + dir + "|" + picked + "|" + stop;
    }

    private static char at(int cx, int cy) {
        if (cy < 0 || cy >= GRID.length || cx < 0 || cx >= GRID[cy].length()) return '#';
        return GRID[cy].charAt(cx);
    }

    private static void act() {
        if (!stop.isEmpty()) throw new HeroStop(stop);
        actions++;
        if (actions > MAX_ACTIONS) {
            stop = "tired";
            trace.append('X');
            throw new HeroStop(stop);
        }
    }

    private static void look() {
        if (!stop.isEmpty()) throw new HeroStop(stop);
        looks++;
        if (looks > MAX_LOOKS) {
            stop = "dizzy";
            throw new HeroStop(stop);
        }
    }

    public Hero() {}

    public void step() {
        act();
        if (at(x + DX[dir], y + DY[dir]) == '#') {
            stop = "blocked";
            trace.append('B');
            throw new HeroStop(stop);
        }
        x += DX[dir];
        y += DY[dir];
        trace.append('S');
    }

    public void turnLeft() {
        act();
        dir = (dir + 3) % 4;
        trace.append('L');
    }

    public void turnRight() {
        act();
        dir = (dir + 1) % 4;
        trace.append('R');
    }

    public void pick() {
        act();
        if (at(x, y) == '*' && !taken[y][x]) {
            taken[y][x] = true;
            picked++;
            trace.append('P');
        } else {
            trace.append('p');
        }
    }

    public boolean frontIsClear() {
        look();
        return at(x + DX[dir], y + DY[dir]) != '#';
    }

    public boolean onItem() {
        look();
        return at(x, y) == '*' && !taken[y][x];
    }

    public boolean atGoal() {
        look();
        return at(x, y) == 'G';
    }
}

class HeroStop extends RuntimeException {
    HeroStop(String why) {
        super(why);
    }
}
`;
}

function methodCall(grading: MethodGrading, args: readonly JavaValue[]): string {
  const { name, params, returns } = grading.method;
  const types = params.map((p) => toJavaClass(p.type)).join(', ');
  // The schema has checked there is one argument of the right type per parameter.
  const values = params.map((p, i) => toJavaLiteral(p.type, args[i] ?? 0)).join(', ');
  return (
    `call(l, ${javaString(grading.className)}, ${javaString(name)}, ` +
    `new Class<?>[] { ${types} }, new Object[] { ${values} }, ${returns === 'void'})`
  );
}

function testCalls(quest: JavaQuest | HeroQuest): string[] {
  if (quest.type === 'hero') return ['test(0, "", l -> hero(l));'];
  const grading = quest.grading;
  if (grading.mode === 'stdio') {
    return grading.tests.map((t, i) => `test(${i}, ${javaString(t.stdin)}, l -> runMain(l));`);
  }
  return grading.tests.map((t, i) => `test(${i}, "", l -> ${methodCall(grading, t.args)});`);
}

/** The generated harness: runs every test of one quest and reports each on stdout. */
export function buildHarnessSource(quest: JavaQuest | HeroQuest, nonce: string): string {
  const isHero = quest.type === 'hero';
  const calls = testCalls(quest)
    .map((call) => `        ${call}`)
    .join('\n');
  const heroBody = isHero
    ? String.raw`
    static String hero(ClassLoader loader) throws Throwable {
        Hero.reset();
        try {
            runMain(loader);
        } catch (InvocationTargetException e) {
            if (e.getCause() == null || !e.getCause().getClass().getName().equals("HeroStop")) throw e;
        } finally {
            partial = Hero.report();
        }
        return partial;
    }
`
    : '';
  return String.raw`import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class QuestHarness {
    static final String TAG = "\001Q${nonce}";
    static final String DIR = ${javaString(CLASS_DIR)};
    static final int OUT_LIMIT = 65536;
    static final PrintStream REAL = System.out;
    static final PrintStream REAL_ERR = System.err;
    static String partial = "";
    static int line = 0;

    public static void at(int n) {
        line = n;
    }

    interface Body {
        String run(ClassLoader loader) throws Throwable;
    }

    static class Setup extends Exception {
        Setup(String what) {
            super(what);
        }
    }

    static class OutputLimit extends RuntimeException {
        OutputLimit() {
            super("output limit");
        }
    }

    static class Capped extends ByteArrayOutputStream {
        @Override
        public synchronized void write(int b) {
            if (count >= OUT_LIMIT) throw new OutputLimit();
            super.write(b);
        }

        @Override
        public synchronized void write(byte[] b, int off, int len) {
            if (count + len > OUT_LIMIT) throw new OutputLimit();
            super.write(b, off, len);
        }
    }

    static boolean isStudent(String name) {
        int nested = name.indexOf('$');
        String outer = nested < 0 ? name : name.substring(0, nested);
        return outer.indexOf('.') < 0
            && !outer.equals("QuestHarness")
            && !outer.equals("Hero")
            && !outer.equals("HeroStop");
    }

    static class Fresh extends ClassLoader {
        Fresh() {
            super(QuestHarness.class.getClassLoader());
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            synchronized (getClassLoadingLock(name)) {
                Class<?> c = findLoadedClass(name);
                if (c == null && isStudent(name)) {
                    byte[] bytes = read(name);
                    if (bytes != null) c = defineClass(name, bytes, 0, bytes.length);
                }
                if (c == null) return super.loadClass(name, resolve);
                if (resolve) resolveClass(c);
                return c;
            }
        }

        static byte[] read(String name) {
            File file = new File(DIR + name + ".class");
            if (!file.isFile()) return null;
            try (InputStream in = new FileInputStream(file)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                return out.toByteArray();
            } catch (Exception e) {
                return null;
            }
        }
    }

    static String b64(String s) {
        if (s == null || s.isEmpty()) return "-";
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    static String describe(Throwable t) {
        String message = t.getMessage();
        return t.getClass().getName() + "|" + line + "|" + (message == null ? "" : message);
    }

    static String fmt(Object value) {
        if (value == null) return "null";
        if (value.getClass().isArray()) {
            StringBuilder sb = new StringBuilder("[");
            int n = Array.getLength(value);
            for (int k = 0; k < n; k++) {
                if (k > 0) sb.append('\037');
                sb.append(String.valueOf(Array.get(value, k)));
            }
            return sb.append(']').toString();
        }
        return String.valueOf(value);
    }

    static String runMain(ClassLoader loader) throws Throwable {
        Class<?> c;
        try {
            c = loader.loadClass("Main");
        } catch (ClassNotFoundException e) {
            throw new Setup("NoMainClass");
        }
        Method m;
        try {
            m = c.getDeclaredMethod("main", String[].class);
        } catch (NoSuchMethodException e) {
            throw new Setup("NoMainMethod");
        }
        if (!Modifier.isStatic(m.getModifiers())) throw new Setup("MainNotStatic");
        m.setAccessible(true);
        m.invoke(null, (Object) new String[0]);
        return "";
    }

    static String call(ClassLoader loader, String cls, String name, Class<?>[] types, Object[] args, boolean isVoid)
        throws Throwable {
        Class<?> c;
        try {
            c = loader.loadClass(cls);
        } catch (ClassNotFoundException e) {
            throw new Setup("NoClass");
        }
        Method m;
        try {
            m = c.getDeclaredMethod(name, types);
        } catch (NoSuchMethodException e) {
            throw new Setup("NoMethod");
        }
        m.setAccessible(true);
        Object target = null;
        if (!Modifier.isStatic(m.getModifiers())) {
            Constructor<?> k;
            try {
                k = c.getDeclaredConstructor();
            } catch (NoSuchMethodException e) {
                throw new Setup("NoConstructor");
            }
            k.setAccessible(true);
            target = k.newInstance();
        }
        Object result = m.invoke(target, args);
        if (isVoid) return "";
        if (m.getReturnType() == void.class) throw new Setup("NoMethod");
        return fmt(result);
    }
${heroBody}
    static void test(int index, String input, Body body) {
        REAL.println(TAG + " BEGIN " + index);
        REAL.flush();
        partial = "";
        line = 0;
        String status = "OK";
        String detail = "";
        String extra = "";
        String printed = "";
        InputStream oldIn = System.in;
        Capped captured = new Capped();
        try {
            PrintStream out = new PrintStream(captured, true, "UTF-8");
            System.setIn(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)));
            System.setOut(out);
            System.setErr(new PrintStream(new Capped(), true, "UTF-8"));
            try {
                extra = body.run(new Fresh());
            } catch (InvocationTargetException e) {
                throw e.getCause() == null ? e : e.getCause();
            } finally {
                out.flush();
            }
        } catch (Setup e) {
            status = "SETUP";
            detail = e.getMessage();
        } catch (OutputLimit e) {
            status = "OLE";
        } catch (Throwable t) {
            status = "EXC";
            detail = describe(t);
        } finally {
            System.setOut(REAL);
            System.setErr(REAL_ERR);
            System.setIn(oldIn);
        }
        try {
            printed = captured.toString("UTF-8");
        } catch (Exception e) {
            printed = "";
        }
        if (extra.isEmpty()) extra = partial;
        REAL.println(TAG + " END " + index + " " + status + " " + b64(printed) + " " + b64(detail) + " " + b64(extra));
        REAL.flush();
    }

    public static void main(String[] argv) {
${calls}
        REAL.println(TAG + " DONE");
        REAL.flush();
    }
}
`;
}

function testMetas(quest: JavaQuest | HeroQuest): TestMeta[] {
  if (quest.type === 'hero') return [{ index: 0, name: 'Run', hidden: false, hint: null }];
  return quest.grading.tests.map((test, index) => ({
    index,
    name: test.name ?? `Test ${index + 1}`,
    hidden: test.hidden,
    hint: test.hint ?? null,
  }));
}

/**
 * Decide what to do with an answer: refuse it for breaking a source rule, or
 * lay out the files to compile and the tests to expect.
 *
 * `answer` is the editor's contents, except for a `fill` quest, where it is
 * only the missing line. `nonce` must be letters and digits, new for each run.
 */
export function planRun(quest: JavaQuest | HeroQuest, answer: string, nonce: string): Plan {
  const fill = quest.type === 'fill' ? assembleFill(quest.template, answer) : null;
  const source = fill ? fill.source : answer;

  // Rules are judged on what the student wrote. For a fill quest that is the
  // one line, not the template around it, or a rule requiring `while` would be
  // satisfied by the template's own loop.
  const failures = checkRules(fill ? answer : source, quest.rules);
  if (failures.length > 0) return { kind: 'rules', failures };

  let studentFile = 'Main.java';
  if (quest.type !== 'hero' && quest.grading.mode === 'method') {
    studentFile = `${quest.grading.className}.java`;
  }
  const generated: JavaFile[] = [];
  if (quest.type === 'hero') {
    generated.push({ name: 'Hero.java', content: buildHeroSource(quest.level, quest.maxActions) });
  }
  generated.push({ name: `${HARNESS_CLASS}.java`, content: buildHarnessSource(quest, nonce) });

  return {
    kind: 'java',
    files: [{ name: studentFile, content: addLineTracking(source) }, ...generated],
    plainFiles: [{ name: studentFile, content: source }, ...generated],
    studentFile,
    nonce,
    tests: testMetas(quest),
    timeLimitMs: quest.timeLimitMs,
    fill,
  };
}

/** The arguments for `com.sun.tools.javac.Main` that compile a set of files. */
export function javacArgs(files: readonly JavaFile[]): string[] {
  return [
    '-d',
    CLASS_DIR,
    // Compile against the sources given and nothing else. Without this javac
    // also searches the working directory, where classes from an earlier run
    // could stand in for one the student has since deleted.
    '-cp',
    SOURCE_DIR,
    '-proc:none',
    '-nowarn',
    '-encoding',
    'UTF-8',
    ...files.map((file) => SOURCE_DIR + file.name),
  ];
}
