// src/features/quest/grader/lineTracking.ts
//
// Tells the harness which line of the student's code is running (#981).
//
// CheerpJ's stack traces carry no line numbers: every frame is "Unknown
// Source", measured on 5.0 with Java 17 and with `javac -g`. Without help, a
// runtime error could only be reported as "ArithmeticException, somewhere",
// which is no use to someone who has written twenty lines in their life.
//
// So the student's source is compiled with a marker in front of each statement
// that starts a line: `QuestHarness.at(12);`. The marker records the line, and
// when an exception escapes, the last line recorded is where to look. Markers
// go on the same line as the statement, never on a new one, so the compiler's
// line numbers are unchanged.
//
// This is a text transformation, not a parser, and it is deliberately timid:
// it marks only lines it is confident begin a statement inside a method body.
// When it is wrong the marked source does not compile, and the runner falls
// back to the untouched source and reports errors without a line. A wrong guess
// costs a line number, never a correct program.

import { stripCommentsAndStrings } from './source.ts';

/** The call placed before a statement. `QuestHarness.at` is defined in harness.ts. */
export const marker = (line: number) => `QuestHarness.at(${line}); `;

// A line starting with one of these continues the statement before it, or is a
// declaration that only looks like a statement.
const NOT_A_STATEMENT =
  /^(?:else\b|catch\b|finally\b|case\b|default\b|public\b|private\b|protected\b|static\b|abstract\b|class\b|interface\b|enum\b|@|(?:this|super)\s*\(|[^\w(+-]|[+-](?![+-]))/;

type Brace = 'code' | 'data';

/**
 * Add a line marker before each statement that starts a line inside a method.
 * Returns the source with the same number of lines.
 */
export function addLineTracking(source: string): string {
  const original = source.split('\n');
  const code = stripCommentsAndStrings(source).split('\n');
  const braces: Brace[] = [];
  let parens = 0;
  // The last character of code seen so far, and the line it ended.
  let lastChar = '';
  let lastLine = '';

  return original
    .map((line, i) => {
      const text = code[i] ?? '';
      const trimmed = text.trim();

      // A statement can start here if the previous code ended one (`;`), opened
      // or closed a block, or was a `case` label; we are inside a method body
      // (a class body is depth 1), not inside an array's braces, and not in the
      // middle of a bracketed expression such as a `for` header.
      const afterStatement =
        lastChar === ';' ||
        lastChar === '{' ||
        lastChar === '}' ||
        (lastChar === ':' && /^(?:case|default)\b/.test(lastLine));
      const inMethod = braces.length >= 2 && braces[braces.length - 1] === 'code';
      const mark =
        trimmed !== '' &&
        afterStatement &&
        inMethod &&
        parens === 0 &&
        !NOT_A_STATEMENT.test(trimmed);

      for (let c = 0; c < text.length; c += 1) {
        const ch = text.charAt(c);
        if (ch === '{') {
          // Braces after `=`, `,`, `{` or `]` hold values (an array's contents),
          // not statements.
          braces.push(/[=,{\]]/.test(lastChar) ? 'data' : 'code');
        } else if (ch === '}') {
          braces.pop();
        } else if (ch === '(') {
          parens += 1;
        } else if (ch === ')') {
          parens = Math.max(0, parens - 1);
        }
        if (ch.trim() !== '') lastChar = ch;
      }
      if (trimmed !== '') lastLine = trimmed;

      if (!mark) return line;
      const indent = text.length - text.trimStart().length;
      return line.slice(0, indent) + marker(i + 1) + line.slice(indent);
    })
    .join('\n');
}
