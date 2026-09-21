// tests/assistantFormat.test.js
//
// Covers the Assistant reply formatter (js/core/assistantFormat.js, #730).
//
// The contract worth defending is the negative one: NO markdown marker ever
// survives to the screen. The model writes markdown whatever the prompt says,
// so every case below is a shape a live reply actually arrived in.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAssistantReply,
  parseSpans,
  renderAssistantReply,
} from '../js/core/assistantFormat.js';

/** The visible text of a parse, as a reader would see it. */
const plain = (blocks) =>
  blocks
    .map((b) =>
      b.type === 'p'
        ? b.spans.map((s) => s.text).join('')
        : b.items.map((i) => i.map((s) => s.text).join('')).join('\n'),
    )
    .join('\n');

test('bold markers become bold spans, not asterisks', () => {
  const [para] = parseAssistantReply('To reach a **3.50 CGPA** is **unreachable**.');
  assert.deepEqual(para.spans, [
    { text: 'To reach a ', bold: false },
    { text: '3.50 CGPA', bold: true },
    { text: ' is ', bold: false },
    { text: 'unreachable', bold: true },
    { text: '.', bold: false },
  ]);
});

test('headings keep their emphasis but not their hashes', () => {
  const blocks = parseAssistantReply('### What CGPA target are you aiming for?');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'p');
  assert.equal(blocks[0].spans[0].bold, true);
  assert.equal(blocks[0].spans[0].text, 'What CGPA target are you aiming for?');
});

test('horizontal rules are dropped entirely', () => {
  const blocks = parseAssistantReply('Above.\n\n---\n\nBelow.');
  assert.deepEqual(
    blocks.map((b) => b.spans.map((s) => s.text).join('')),
    ['Above.', 'Below.'],
  );
});

test('bulleted and numbered runs become lists', () => {
  const blocks = parseAssistantReply('* Current: 2.34\n* Max: 2.62');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'ul');
  assert.equal(blocks[0].items.length, 2);

  const ordered = parseAssistantReply('1. Take CSE370\n2. Then CSE470');
  assert.equal(ordered[0].type, 'ol');
  assert.equal(ordered[0].items.length, 2);
});

test('a bullet run and a numbered run do not merge into one list', () => {
  const blocks = parseAssistantReply('- one\n1. two');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['ul', 'ol'],
  );
});

// The regression that motivated the module: whatever the model emits, the
// reader must never see the punctuation of it.
test('no stray markdown marker survives any shape of reply', () => {
  const messy = [
    '### Heading with an **unclosed bold',
    '',
    'Some `code` and a [link](https://example.com) and 3*4 and file_name_here.',
    '',
    '***',
    '',
    '* __item__',
  ].join('\n');
  const text = plain(parseAssistantReply(messy));

  assert.ok(!text.includes('**'), `bold markers survived: ${text}`);
  assert.ok(!text.includes('###'), `heading markers survived: ${text}`);
  assert.ok(!text.includes('`'), `code markers survived: ${text}`);
  assert.ok(!text.includes('](' ), `link plumbing survived: ${text}`);
  assert.ok(!text.includes('__'), `underscore markers survived: ${text}`);
  // ...while text that only LOOKS like markdown is left alone.
  assert.ok(text.includes('3*4'), `arithmetic was eaten: ${text}`);
  assert.ok(text.includes('file_name_here'), `an identifier was eaten: ${text}`);
  assert.ok(text.includes('link'), `the link label was eaten: ${text}`);
});

// Caught by e2e/assistant-fab.spec.js first: a blanket strip of `__` quietly
// rewrote the text of a reply. Stripping is for DANGLING delimiters only —
// anything else is the student's content and must arrive exactly as sent.
test('a double underscore inside an identifier is not a delimiter', () => {
  const payload = '<img src=x onerror="window.__xss=1">';
  const [para] = parseAssistantReply(payload);
  assert.equal(para.spans.map((s) => s.text).join(''), payload);

  for (const kept of ['a.__b', 'snake__case__word', 'CSE__370']) {
    assert.equal(
      plain(parseAssistantReply(kept)),
      kept,
      `rewrote text that is not a delimiter: ${kept}`,
    );
  }
});

test('an empty or absent reply parses to nothing rather than throwing', () => {
  assert.deepEqual(parseAssistantReply(''), []);
  assert.deepEqual(parseAssistantReply('   \n\n  '), []);
  assert.deepEqual(parseAssistantReply(undefined), []);
});

test('a plain sentence stays one paragraph with one span', () => {
  const blocks = parseAssistantReply('You need a 3.52 average over your last 12 credits.');
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].spans, [
    { text: 'You need a 3.52 average over your last 12 credits.', bold: false },
  ]);
});

test('single newlines inside a paragraph are kept as breaks', () => {
  const [para] = parseAssistantReply('Line one.\nLine two.');
  assert.equal(
    para.spans.map((s) => s.text).join(''),
    'Line one.\nLine two.',
  );
});

test('parseSpans drops empty spans rather than emitting blanks', () => {
  assert.deepEqual(parseSpans('****'), []);
  assert.deepEqual(parseSpans(''), []);
});

// renderAssistantReply is the legacy front-end's half. It must build real
// nodes — never innerHTML — so the test asserts on structure, not a string.
test('the DOM render builds strong and list elements', () => {
  const made = [];
  const node = (name) => ({
    nodeName: name,
    children: [],
    text: '',
    set textContent(v) {
      this.text = v;
    },
    get textContent() {
      return this.text;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
  });
  const doc = {
    createDocumentFragment: () => node('#fragment'),
    createElement: (name) => {
      const el = node(name);
      made.push(el);
      return el;
    },
    createTextNode: (text) => ({ nodeName: '#text', text }),
  };

  const frag = renderAssistantReply('Lead **2.34** line.\n\n* first\n* second', doc);

  assert.deepEqual(
    frag.children.map((c) => c.nodeName),
    ['p', 'ul'],
  );
  const [p, ul] = frag.children;
  assert.deepEqual(
    p.children.map((c) => c.nodeName),
    ['#text', 'strong', '#text'],
  );
  assert.equal(p.children[1].textContent, '2.34');
  assert.deepEqual(
    ul.children.map((c) => c.nodeName),
    ['li', 'li'],
  );
  assert.equal(ul.children[0].children[0].text, 'first');
});
