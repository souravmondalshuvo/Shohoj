// src/features/quest/grader/source.ts
//
// Checks on the student's source text, before anything is compiled (#981):
// a quest's source rules, and putting a `fill` answer back into its template.
//
// These are text checks, not a parser. They exist to stop the two shortcuts
// that make a loop quest pointless (ten pasted lines, or no loop at all), and a
// student who works hard enough to fool them has learnt more than the quest
// teaches. Grading is client-side self-study either way.

import { BLANK, type SourceRule } from '../content/schema.ts';

/**
 * Blank out comments and the insides of string and char literals, keeping
 * every newline, so a rule cannot be satisfied by `// while` or `"for"` and
 * line numbers still line up with what the student typed.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (ch: string) => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);
    if (ch === '/' && next === '/') {
      while (i < n && source.charAt(i) !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i += 1) out += blank(source.charAt(i));
    } else if (ch === '"' || ch === "'") {
      // Keep the quotes, blank the contents. An unclosed literal ends at the
      // line break, which is where javac will complain about it too.
      out += ch;
      i += 1;
      while (i < n && source.charAt(i) !== ch && source.charAt(i) !== '\n') {
        if (source.charAt(i) === '\\' && i + 1 < n && source.charAt(i + 1) !== '\n') {
          out += '  ';
          i += 2;
        } else {
          out += ' ';
          i += 1;
        }
      }
      if (i < n && source.charAt(i) === ch) {
        out += ch;
        i += 1;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const isWord = (token: string) => /^\w+$/.test(token);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * How many times `token` appears in code. A name such as `while` is matched as
 * a whole word, so `meanwhile` does not count. Anything else, such as
 * `hero.step(`, is matched with all whitespace removed from both sides, so
 * `hero . step (` counts too.
 */
export function countToken(strippedSource: string, token: string): number {
  if (isWord(token)) {
    return strippedSource.match(new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g'))?.length ?? 0;
  }
  const haystack = strippedSource.replace(/\s+/g, '');
  const needle = token.replace(/\s+/g, '');
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/** The message of every rule the source breaks, in the order the quest lists them. */
export function checkRules(source: string, rules: readonly SourceRule[]): string[] {
  const stripped = stripCommentsAndStrings(source);
  const failures: string[] = [];
  for (const rule of rules) {
    if (rule.kind === 'requires') {
      if (!rule.anyOf.some((token) => countToken(stripped, token) > 0)) failures.push(rule.message);
    } else if (countToken(stripped, rule.token) > rule.max) {
      failures.push(rule.message);
    }
  }
  return failures;
}

export interface AssembledFill {
  /** The whole program, with the answer in place of the blank. */
  readonly source: string;
  /** 1-based line where the answer starts. */
  readonly firstLine: number;
  /** How many lines the answer takes. One, unless the student typed several. */
  readonly lineCount: number;
}

/**
 * Put a student's answer into a `fill` template. The answer takes the blank's
 * place at the indentation of the lines around it. Several lines are allowed,
 * because "one missing line" is the author's intent, not a reason to reject a
 * student who wrapped theirs.
 */
export function assembleFill(template: string, answer: string): AssembledFill {
  const lines = template.split('\n');
  const at = lines.findIndex((line) => line.trim() === BLANK);
  if (at === -1) return { source: template, firstLine: 1, lineCount: 0 };

  // Indent like the nearest line above that has any code on it.
  let indent = '';
  for (let i = at - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (line.trim()) {
      indent = /^\s*/.exec(line)?.[0] ?? '';
      break;
    }
  }
  const answerLines = answer
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // An empty answer still occupies the line, so the program stays the same
  // shape and the compiler points at the hole instead of somewhere after it.
  const placed = answerLines.length > 0 ? answerLines.map((line) => indent + line) : [''];
  lines.splice(at, 1, ...placed);
  return { source: lines.join('\n'), firstLine: at + 1, lineCount: placed.length };
}
