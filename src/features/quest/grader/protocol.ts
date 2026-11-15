// src/features/quest/grader/protocol.ts
//
// Reads what the generated harness prints (harness.ts) back into events (#981).
//
// The harness writes to the JVM's standard output, which arrives in pieces of
// any size: half a line, or three lines at once, depending on the Java version.
// The reader therefore takes raw chunks, keeps what is not yet a whole line,
// and emits an event per completed protocol line.
//
// Lines that do not carry this run's tag are passed through as `noise`. They
// are what the JVM itself prints (a stack trace when the harness cannot start),
// and they are worth showing when nothing else explains a failed run.

import { TAG_PREFIX } from './harness.ts';

export type TestStatus = 'OK' | 'EXC' | 'OLE' | 'SETUP';

export interface TestResult {
  readonly index: number;
  readonly status: TestStatus;
  /** What the student's code printed during the test. */
  readonly out: string;
  /** For `EXC`: `class|line|message`. For `SETUP`: a reason code. */
  readonly detail: string;
  /** The method's return value, or a hero run's report. */
  readonly extra: string;
}

export type ProtocolEvent =
  | { readonly kind: 'begin'; readonly index: number }
  | { readonly kind: 'end'; readonly result: TestResult }
  | { readonly kind: 'done' }
  | { readonly kind: 'noise'; readonly text: string };

const STATUSES: ReadonlySet<string> = new Set(['OK', 'EXC', 'OLE', 'SETUP']);

function decodeField(field: string | undefined): string {
  if (!field || field === '-') return '';
  try {
    const binary = atob(field);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function parseLine(line: string, tag: string): ProtocolEvent {
  if (!line.startsWith(`${tag} `)) return { kind: 'noise', text: line };
  const parts = line.slice(tag.length + 1).split(' ');
  const index = Number(parts[1]);
  if (parts[0] === 'DONE') return { kind: 'done' };
  if (parts[0] === 'BEGIN' && Number.isInteger(index)) return { kind: 'begin', index };
  const status = parts[2] ?? '';
  if (parts[0] === 'END' && Number.isInteger(index) && STATUSES.has(status)) {
    return {
      kind: 'end',
      result: {
        index,
        status: status as TestStatus,
        out: decodeField(parts[3]),
        detail: decodeField(parts[4]),
        extra: decodeField(parts[5]),
      },
    };
  }
  return { kind: 'noise', text: line };
}

export interface ProtocolReader {
  /** Feed a chunk of standard output; get the events it completed. */
  push(chunk: string): ProtocolEvent[];
  /** Call once the JVM has exited: whatever is left is the last, unterminated line. */
  flush(): ProtocolEvent[];
}

/** A reader for one run. `nonce` is the one the run's harness was built with. */
export function createProtocolReader(nonce: string): ProtocolReader {
  const tag = TAG_PREFIX + nonce;
  let pending = '';
  return {
    push(chunk) {
      pending += chunk;
      const events: ProtocolEvent[] = [];
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '');
        pending = pending.slice(newline + 1);
        if (line.length > 0) events.push(parseLine(line, tag));
        newline = pending.indexOf('\n');
      }
      return events;
    },
    flush() {
      const line = pending.replace(/\r$/, '');
      pending = '';
      return line.length > 0 ? [parseLine(line, tag)] : [];
    },
  };
}
