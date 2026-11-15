// src/features/quest/grader/diagnostics.ts
//
// Turns what javac and the JVM say into something a first-semester student can
// act on (#981): which line, and a hint in plain words.
//
// javac's messages are accurate and written for people who already know Java.
// "';' expected" is clear to a second-year and noise to someone in week four,
// who needs to be told where to look and what a semicolon is for. The compiler's
// own message is always kept and shown beside the hint: the hint is a guess at
// the usual cause, and students need to learn to read the real thing.

import type { AssembledFill } from './source.ts';

export interface Diagnostic {
  /** The file javac named, without its directory. */
  readonly file: string;
  /** 1-based line in that file. */
  readonly line: number;
  /** 1-based column of javac's caret, or `null` when it drew none. */
  readonly column: number | null;
  readonly severity: 'error' | 'warning';
  /** javac's message, unchanged. */
  readonly message: string;
  /** The lines javac adds after the caret: `symbol:`, `location:`, `required:` … */
  readonly details: readonly string[];
  /** What usually causes this, in plain words. */
  readonly hint: string;
  /** False for a problem in a generated file, which the student never sees. */
  readonly inStudentFile: boolean;
}

const HEADER = /^(?:.*[/\\])?([A-Za-z_$][\w$]*\.java):(\d+): (error|warning): (.*)$/;
// What ends an error's block besides the next error: the closing count, and
// javac's "Note:" lines, which are about the whole compile and not the error
// they happen to follow.
const SUMMARY = /^(?:\d+ (?:error|warning)s?$|Note: )/;
const CARET = /^\s*\^\s*$/;

const detailValue = (details: readonly string[], key: string): string | null => {
  for (const line of details) {
    const match = new RegExp(`^\\s*${key}:\\s*(.*)$`).exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return null;
};

/** The name out of a detail such as `variable totl` or `method jump()`. */
const symbolName = (symbol: string | null): string | null => {
  if (!symbol) return null;
  const match = /^(?:variable|method|class)\s+([\w$]+)/.exec(symbol);
  return match?.[1] ?? null;
};

interface HintRule {
  readonly when: RegExp;
  readonly say: (match: RegExpExecArray, details: readonly string[]) => string;
}

// Ordered: the first rule that matches wins, so specific ones come first.
const HINTS: readonly HintRule[] = [
  {
    when: /^';' expected/,
    say: () =>
      'A statement is missing its semicolon. Look at the end of this line, and at the end of the line just above it.',
  },
  {
    when: /^cannot find symbol/,
    say: (_m, details) => {
      const symbol = detailValue(details, 'symbol');
      const name = symbolName(symbol);
      if (symbol?.startsWith('variable') && name) {
        return `Java does not know any variable called ${name}. Check the spelling and the capital letters, and that it was declared (with a type) before this line.`;
      }
      if (symbol?.startsWith('method') && name) {
        return `There is no method called ${name} here. Check the spelling and the capital letters: Java treats nextInt and nextint as different names.`;
      }
      if (symbol?.startsWith('class') && name) {
        return name === 'Scanner'
          ? 'Scanner needs an import. Put import java.util.Scanner; on the first line of the file.'
          : `Java does not know the type ${name}. Check the capital letters: String and System start with a capital.`;
      }
      return 'Java does not recognise a name on this line. Check its spelling and capital letters, and that it was declared before it is used.';
    },
  },
  {
    when: /^incompatible types: possible lossy conversion from (\w+) to (\w+)/,
    say: (m) =>
      `A ${m[1]} value cannot go into a ${m[2]} variable without losing something. Change the variable's type to ${m[1]}, or cast with (${m[2]}) if dropping the extra is what you want.`,
  },
  {
    when: /^incompatible types: (.+) cannot be converted to (.+)$/,
    say: (m) =>
      `This line puts a ${m[1]} where a ${m[2]} is needed. Check the type the variable was declared with, and what is on the right of the = sign.`,
  },
  {
    when: /^incompatible types: missing return value/,
    say: () => 'This method must give back a value. Write the value after the word return.',
  },
  {
    when: /^missing return statement/,
    say: () =>
      'This method promises to return a value, but there is a way to reach its end without a return. Add a return after the loop or if.',
  },
  {
    when: /^variable (\w+) might not have been initialized/,
    say: (m) =>
      `${m[1]} is used before it has a value. Give it a starting value where it is declared, for example int ${m[1]} = 0;`,
  },
  {
    when: /^variable (\w+) is already defined/,
    say: (m) =>
      `${m[1]} was already declared above. Declare a variable once; afterwards use its name without the type.`,
  },
  {
    when: /^reached end of file while parsing/,
    say: () =>
      'The file ends before every { has its matching }. Count the braces: each opening one needs a closing one.',
  },
  {
    when: /^class, interface, enum, or record expected|^class, interface, or enum expected/,
    say: () =>
      'There is code outside the class, usually because of one } too many. Check that the braces are balanced.',
  },
  {
    when: /^'\)' expected|^'\(' expected|^'\)' or ',' expected/,
    say: () => 'The brackets on this line do not match. Every ( needs a ).',
  },
  {
    when: /^'\{' expected|^'\}' expected/,
    say: () => 'A brace is missing near this line. Every { needs a }.',
  },
  {
    when: /^not a statement/,
    say: () =>
      'This line is not a complete instruction. A lone value or comparison does nothing; did you mean to assign it or print it?',
  },
  {
    when: /^unclosed string literal/,
    say: () =>
      'A piece of text is missing its closing ". Text must start and end with a double quote on the same line.',
  },
  {
    when: /^unclosed character literal|^empty character literal/,
    say: () =>
      "Single quotes hold exactly one character, like 'a'. For more than one character, use double quotes.",
  },
  {
    when: /^'else' without 'if'/,
    say: () =>
      'This else has no if to belong to. Look for a stray semicolon right after the if (...) above, or a brace in the wrong place.',
  },
  {
    when: /^illegal start of (expression|type)/,
    say: () =>
      'Java found something it did not expect here, often caused by a missing } or ) on an earlier line.',
  },
  {
    when: /^class (\w+) is public, should be declared in a file named/,
    say: (m) => `Keep the class name the quest started with. Rename ${m[1]} back and try again.`,
  },
  {
    when: /^non-static (method|variable) (\S+) cannot be referenced from a static context/,
    say: (m) =>
      `main is static, so it can only use static ${m[1]}s directly. Add the word static to ${(m[2] ?? '').replace(/\(.*$/, '')}.`,
  },
  {
    when: /^unreachable statement/,
    say: () =>
      'Java can never reach this line. It comes after a return or break, or after a loop that never ends.',
  },
  {
    when: /^bad operand types for binary operator '(.+)'/,
    say: (m) =>
      `${m[1]} cannot be used between these two types. Compare numbers with numbers, and join conditions with && or ||.`,
  },
  {
    when: /^incomparable types|cannot be compared/,
    say: () =>
      'These two values are of different kinds and cannot be compared. For text, use .equals(...) rather than ==.',
  },
  {
    when: /^method (\w+) in class \w+ cannot be applied to given types/,
    say: (m) =>
      `${m[1]} was called with the wrong number or kind of values. Compare the call with how the method is declared.`,
  },
  {
    when: /^<identifier> expected/,
    say: () =>
      'Java expected a name here. A statement may be sitting outside any method, or a type is missing before a variable name.',
  },
  {
    when: /^array required, but (\w+) found/,
    say: (m) => `Square brackets only work on arrays, and this is a ${m[1]}.`,
  },
  {
    when: /^break outside switch or loop|^continue outside of loop/,
    say: () =>
      "break and continue only make sense inside a loop. Check where this loop's braces end.",
  },
];

const FALLBACK_HINT =
  'Read the message against this line and the one above it. Most compiler errors are a missing symbol or a misspelt name.';

function hintFor(message: string, details: readonly string[]): string {
  for (const rule of HINTS) {
    const match = rule.when.exec(message);
    if (match) return rule.say(match, details);
  }
  return FALLBACK_HINT;
}

/**
 * Parse everything javac printed into diagnostics.
 *
 * javac writes a header (`Main.java:5: error: …`), then the source line, a
 * caret under the spot, and sometimes detail lines, then a count. Anything that
 * does not fit that shape, such as its "Note:" lines, is skipped.
 */
export function parseJavac(output: string, studentFile: string): Diagnostic[] {
  const lines = output.replace(/\r\n?/g, '\n').split('\n');
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = HEADER.exec(lines[i] ?? '');
    if (!header) {
      i += 1;
      continue;
    }
    const body: string[] = [];
    i += 1;
    while (
      i < lines.length &&
      !HEADER.test(lines[i] ?? '') &&
      !SUMMARY.test((lines[i] ?? '').trim())
    ) {
      body.push(lines[i] ?? '');
      i += 1;
    }
    const caretAt = body.findIndex((line) => CARET.test(line));
    const column = caretAt === -1 ? null : (body[caretAt] ?? '').indexOf('^') + 1;
    // Before the source line javac may continue the message; after the caret
    // come the details.
    const continuation = caretAt > 1 ? body.slice(0, caretAt - 1) : [];
    const details = (caretAt === -1 ? body : body.slice(caretAt + 1)).filter((line) => line.trim());
    const message = [header[4] ?? '', ...continuation.map((line) => line.trim())].join(' ').trim();
    const file = header[1] ?? '';
    diagnostics.push({
      file,
      line: Number(header[2]),
      column,
      severity: header[3] === 'warning' ? 'warning' : 'error',
      message,
      details,
      hint: hintFor(message, details),
      inStudentFile: file === studentFile,
    });
  }
  return diagnostics;
}

/**
 * For a `fill` quest: whether a diagnostic's line is the student's own line,
 * or part of the template around it. A missing semicolon on their line is
 * often reported on the line after, so that line counts as theirs too.
 */
export function isOnFillAnswer(diagnostic: Diagnostic, fill: AssembledFill): boolean {
  return diagnostic.line >= fill.firstLine && diagnostic.line <= fill.firstLine + fill.lineCount;
}

export interface RuntimeProblem {
  /** The exception's simple name: `ArithmeticException`. */
  readonly name: string;
  /**
   * 1-based line in the student's file that was running, or `null` if unknown.
   * It is the last line that began a statement, so the fault is on it or on a
   * line that continues it.
   */
  readonly line: number | null;
  /** The exception's own message. Empty for the ones the JVM raises itself under CheerpJ. */
  readonly message: string;
  readonly hint: string;
}

const RUNTIME_HINTS: Readonly<Record<string, (message: string) => string>> = {
  ArithmeticException: () =>
    'The program divided a whole number by zero. Check the value on the right of / or % before dividing.',
  ArrayIndexOutOfBoundsException: () =>
    'The program used a position that is not in the array. Positions run from 0 to length - 1, so a loop that reaches length goes one too far.',
  StringIndexOutOfBoundsException: () =>
    'The program asked for a character position that is not in the text. Positions run from 0 to length() - 1.',
  NullPointerException: () =>
    'The program used a variable that holds nothing yet (null). Give it a value with new, or an assignment, before using it.',
  InputMismatchException: () =>
    'The program read a different kind of input from what was there, for example nextInt() when the next thing is a word or a decimal.',
  NoSuchElementException: () =>
    'The program asked for more input than there was. Check how many times the loop reads: it may be reading once too often.',
  NumberFormatException: () =>
    'The program tried to turn text into a number, but the text is not a number.',
  StackOverflowError: () =>
    'A method kept calling itself and never stopped. Check that it has a case where it does not call itself.',
  OutOfMemoryError: () =>
    'The program used up all the memory, usually by adding to something inside a loop that never ends.',
  NegativeArraySizeException: () =>
    'An array was created with a negative size. Check the number inside the [ ].',
  ClassCastException: () => 'A value was treated as a type it is not.',
};

/** Explain an exception from the harness's `class|line|message` description. */
export function explainException(detail: string): RuntimeProblem {
  const [className = '', lineText = '0', ...rest] = detail.split('|');
  const name = className.slice(className.lastIndexOf('.') + 1) || 'Exception';
  const message = rest.join('|');
  const line = Number(lineText) > 0 ? Number(lineText) : null;
  const explain = RUNTIME_HINTS[name];
  return {
    name,
    line,
    message,
    hint: explain
      ? explain(message)
      : 'The program stopped with an error while running. The line shown is where it happened.',
  };
}

const SETUP_MESSAGES: Readonly<Record<string, string>> = {
  NoMainClass: 'The class must be called Main. Keep the first line the quest started with.',
  NoMainMethod:
    'Java could not find public static void main(String[] args). Keep that line exactly as it was.',
  MainNotStatic: 'main must be static: public static void main(String[] args).',
  NoClass: 'The class has been renamed. Keep the class name the quest started with.',
  NoMethod:
    'The method the tests call is missing or its first line has changed. Keep the name, the parameters and the return type the quest started with.',
  NoConstructor: 'The class needs a constructor that takes no values, or make the method static.',
};

/** A sentence for a `SETUP` result: the tests could not even call the student's code. */
export function explainSetup(code: string): string {
  return (
    SETUP_MESSAGES[code] ??
    'The tests could not start your program. Check that its first lines are unchanged.'
  );
}
