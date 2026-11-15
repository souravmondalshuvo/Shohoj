// src/features/quest/grader/compare.ts
//
// Comparing what a program printed with what it should have printed (#981).
//
// The rule is the one a CSE110 lab marker applies by eye: every visible
// character counts, including the spaces at the start of a pattern's rows, but
// spaces at the end of a line and blank lines at the end of the output do not,
// because nobody can see them and no student should lose a quest to them.

/** Line endings unified, trailing spaces per line and trailing blank lines dropped. */
export function normalizeOutput(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface OutputDiff {
  /** 1-based line where the two first differ. */
  readonly line: number;
  /** The expected line, or `null` when the program printed more than expected. */
  readonly expected: string | null;
  /** The line printed, or `null` when the program stopped short. */
  readonly actual: string | null;
}

export type OutputComparison =
  { readonly pass: true } | { readonly pass: false; readonly diff: OutputDiff };

/** Compare two outputs and, when they differ, say where. */
export function compareOutput(expected: string, actual: string): OutputComparison {
  const want = normalizeOutput(expected);
  const got = normalizeOutput(actual);
  const length = Math.max(want.length, got.length);
  for (let i = 0; i < length; i += 1) {
    const w = want[i] ?? null;
    const g = got[i] ?? null;
    if (w !== g) return { pass: false, diff: { line: i + 1, expected: w, actual: g } };
  }
  return { pass: true };
}

/**
 * Make leading spaces visible in a line shown to the student. In a pattern
 * quest the difference between two rows is often only how many spaces start
 * them, which is invisible in a plain diff.
 */
export function showSpaces(line: string): string {
  return line.replace(/^ +/, (spaces) => '·'.repeat(spaces.length));
}
