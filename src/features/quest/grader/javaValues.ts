// src/features/quest/grader/javaValues.ts
//
// Moving values between a quest file and Java, for method-call tests (#981).
//
// A test's arguments are written in the quest file as plain JSON-like values.
// They go into the generated harness as Java literals, and what the method
// returns comes back as text. This file is both directions, plus how a value is
// shown to a student.

import type { JavaScalar, JavaType, JavaValue } from '../content/schema.ts';

/** Separates array elements in what the harness reports. Never appears in a quest's data. */
export const ELEMENT_SEPARATOR = '\u001f';

function escapeChar(ch: string, quote: string): string {
  switch (ch) {
    case '\\':
      return '\\\\';
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    case '\t':
      return '\\t';
    default: {
      if (ch === quote) return `\\${quote}`;
      const codePoint = ch.charCodeAt(0);
      // Anything outside printable ASCII is written as a Unicode escape, so the
      // generated source is plain ASCII whatever encoding javac assumes.
      if (codePoint < 0x20 || codePoint > 0x7e)
        return `\\u${codePoint.toString(16).padStart(4, '0')}`;
      return ch;
    }
  }
}

/** A Java string literal for any text, including quotes, newlines and non-ASCII. */
export function javaString(text: string): string {
  let out = '"';
  for (let i = 0; i < text.length; i += 1) out += escapeChar(text.charAt(i), '"');
  return `${out}"`;
}

function scalarLiteral(type: string, value: JavaScalar): string {
  switch (type) {
    case 'int':
      return String(value);
    case 'long':
      return `${String(value)}L`;
    case 'double': {
      const text = String(value);
      // 3 would be an int literal; 3.0 is the double the test means.
      return /[.eE]/.test(text) ? text : `${text}.0`;
    }
    case 'boolean':
      return value === true ? 'true' : 'false';
    case 'char':
      return `'${escapeChar(String(value), "'")}'`;
    default:
      return javaString(String(value));
  }
}

/** A Java expression that evaluates to `value` as a `type`. The schema has checked they fit. */
export function toJavaLiteral(type: JavaType, value: JavaValue): string {
  if (Array.isArray(value)) {
    const element = type.slice(0, -2);
    return `new ${type}{${value.map((item) => scalarLiteral(element, item)).join(', ')}}`;
  }
  return scalarLiteral(type, value);
}

/** The `Class` object for a type, as Java source: `int.class`, `String[].class`. */
export function toJavaClass(type: JavaType): string {
  return `${type}.class`;
}

function showScalar(type: string, value: JavaScalar): string {
  if (type === 'String') return `"${String(value)}"`;
  if (type === 'char') return `'${String(value)}'`;
  return String(value);
}

/** A value the way a student would write it: `10`, `"abc"`, `[1, 2, 3]`. */
export function displayValue(type: JavaType, value: JavaValue): string {
  if (Array.isArray(value)) {
    const element = type.slice(0, -2);
    return `[${value.map((item) => showScalar(element, item)).join(', ')}]`;
  }
  return showScalar(type, value);
}

/** What the harness reported for a return value, made readable the same way. */
export function displayActual(type: JavaType, reported: string): string {
  if (reported === 'null') return 'null';
  if (type.endsWith('[]')) {
    const element = type.slice(0, -2);
    return `[${splitArray(reported)
      .map((item) => showScalar(element, item))
      .join(', ')}]`;
  }
  return showScalar(type, reported);
}

function splitArray(reported: string): string[] {
  const inner =
    reported.startsWith('[') && reported.endsWith(']') ? reported.slice(1, -1) : reported;
  return inner === '' ? [] : inner.split(ELEMENT_SEPARATOR);
}

function scalarMatches(type: string, expected: JavaScalar, actual: string): boolean {
  if (type === 'double') {
    const got = Number(actual);
    const want = Number(expected);
    if (!Number.isFinite(got)) return false;
    // Floating-point answers are compared with a tolerance: 0.1 + 0.2 is a
    // correct way to reach 0.3, and Java prints it as 0.30000000000000004.
    return Math.abs(got - want) <= 1e-6 * Math.max(1, Math.abs(want));
  }
  return String(expected) === actual;
}

/** Whether the text the harness reported for a return value is the expected value. */
export function matchesExpected(type: JavaType, expected: JavaValue, reported: string): boolean {
  if (reported === 'null') return false;
  if (Array.isArray(expected)) {
    const element = type.slice(0, -2);
    const items = splitArray(reported);
    return (
      items.length === expected.length &&
      expected.every((value, i) => scalarMatches(element, value, items[i] ?? ''))
    );
  }
  return scalarMatches(type, expected, reported);
}
