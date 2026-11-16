// src/features/quest/ui/CodeEditor.tsx
//
// The Java editor for Shohoj Quest (#981): CodeMirror 6, with the lines the
// compiler or a crash pointed at tinted, and a row of symbol keys for phones.
//
// Loaded on demand: only a quest with code to write pulls CodeMirror in.
//
// Phones are the reason for most of what is here. A phone keyboard hides
// braces, brackets and semicolons two layers down, so the symbols Java needs
// sit in a row above it. Autocorrect and autocapitalise are off, because
// "Int" and "system.out" are how a phone helps. And the text is 16px on touch
// screens, below which iOS zooms the page on focus.
//
// The editor is as tall as its code and wraps long lines, so it never scrolls
// inside itself: the panel around it scrolls instead. A scrolling box inside a
// scrolling page is hard to use with a thumb, and a keyboard cannot reach one
// at all.
//
// Tab indents, as in every code editor. Escape then Tab leaves the editor, so
// a keyboard user is not trapped; CodeMirror's default keymap provides that.

import { useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { java } from '@codemirror/lang-java';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** 1-based lines to tint: where the compiler or a crash pointed. */
  readonly errorLines: readonly number[];
  /** What the editor is for, read out by a screen reader. */
  readonly label: string;
}

const setErrorLines = StateEffect.define<readonly number[]>();
const errorLine = Decoration.line({ class: 'quest-cm-error' });

// The tint follows its line as the student types above it. It is cleared by
// the next run, not by an edit: fixing the first of three errors should not
// hide where the other two are.
const errorLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLines)) continue;
      const doc = transaction.state.doc;
      const lines = [...new Set(effect.value)]
        .filter((line) => line >= 1 && line <= doc.lines)
        .sort((a, b) => a - b);
      next = Decoration.set(lines.map((line) => errorLine.range(doc.line(line).from)));
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const indentedLine = (columns: number) =>
  Decoration.line({
    class: 'quest-cm-indented',
    attributes: { style: `--quest-lead:${columns}` },
  });
const leadingSpace = Decoration.mark({ class: 'quest-cm-lead' });

/**
 * Two things for narrow screens, both driven from quest.css:
 *
 *   * A wrapped line carries on under its own first character instead of back
 *     at the margin, so the shape of the code survives. Each indented line is
 *     told how wide its indent is, and hangs by that much.
 *   * The indent itself is marked, so a phone can draw it at half width. Java
 *     is three levels deep before a student has written anything, and twelve
 *     full-width columns is a third of a phone's line.
 */
function indentMarks(state: EditorState): DecorationSet {
  const marks = [];
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const lead = /^[ \t]*/.exec(line.text)?.[0] ?? '';
    if (lead.length === 0) continue;
    const columns = [...lead].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0);
    marks.push(indentedLine(Math.min(columns, 24)).range(line.from));
    marks.push(leadingSpace.range(line.from, line.from + lead.length));
  }
  return Decoration.set(marks);
}

const indentField = StateField.define<DecorationSet>({
  create: indentMarks,
  update: (marks, transaction) => (transaction.docChanged ? indentMarks(transaction.state) : marks),
  provide: (field) => EditorView.decorations.from(field),
});

// Colours come from quest.css, so the editor follows the site's theme.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: 'var(--quest-code-keyword)' },
  {
    tag: [tags.typeName, tags.className, tags.standard(tags.typeName)],
    color: 'var(--quest-code-type)',
  },
  { tag: [tags.string, tags.character], color: 'var(--quest-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--quest-code-number)' },
  {
    tag: [tags.lineComment, tags.blockComment],
    color: 'var(--quest-code-comment)',
    fontStyle: 'italic',
  },
  { tag: tags.function(tags.variableName), color: 'var(--quest-code-call)' },
]);

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--quest-code-bg)', color: 'var(--quest-code-fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'visible',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.5',
  },
  // Room to tap into, however short the code: the whole box takes the caret.
  '.cm-content': { caretColor: 'var(--quest-code-fg)', padding: '8px 0', minHeight: '200px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--quest-code-comment)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--quest-code-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-line.quest-cm-error': { backgroundColor: 'var(--quest-code-error)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--quest-code-selection)' },
});

/** What a phone keyboard buries. In the order a Java beginner reaches for them. */
const SYMBOLS = ['{', '}', '(', ')', ';', '=', '"', '+', '-', '*', '/', '%', '<', '>', '!', '&', '|', '[', ']', "'"]; // prettier-ignore

export default function CodeEditor({ value, onChange, errorLines, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The editor is created once. It reads the latest handler through this.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  const initial = useRef({ value, label });
  useEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const created = new EditorView({
      parent,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          indentField,
          java(),
          syntaxHighlighting(highlight),
          errorLinesField,
          theme,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            'aria-label': initial.current.label,
            autocapitalize: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      view.current = null;
      created.destroy();
    };
  }, []);

  // The value changed from outside: "Start again" put the starter back.
  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLines.of(errorLines) });
  }, [errorLines]);

  const type = (text: string) => {
    const current = view.current;
    if (!current) return;
    current.dispatch(current.state.replaceSelection(text), { scrollIntoView: true });
    current.focus();
  };

  return (
    <div className="quest-editor">
      <div className="quest-editor-code" ref={host} />
      <div className="quest-keys" role="toolbar" aria-label="Symbols">
        {/* Holding focus in the editor keeps the phone keyboard up between taps. */}
        <button
          type="button"
          className="quest-key quest-key--wide"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => type('    ')}
          aria-label="Indent"
        >
          tab
        </button>
        {SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            className="quest-key"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => type(symbol)}
          >
            {symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
