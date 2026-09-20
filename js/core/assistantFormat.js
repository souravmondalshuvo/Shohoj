// js/core/assistantFormat.js
//
// Turns an Assistant reply into display blocks (#730).
//
// The model writes markdown whether or not we ask it to. Before this module
// both front-ends printed the reply with `textContent` under
// `white-space: pre-wrap`, so every `**`, `###` and `---` landed on screen
// verbatim — a chat bubble full of punctuation.
//
// The system prompt now asks for plain prose, but a prompt is best-effort and
// this is the guarantee: whatever shape the answer arrives in, the markers are
// either rendered as formatting or removed. Nothing leaks.
//
// Authored in vanilla JS, in js/core, because BOTH front-ends need it — the
// legacy bundle (build3.py flattens js/ into shohoj.html and cannot load .ts)
// and the React shell, which imports it through assistantFormat.d.ts. The same
// arrangement assistantClient.js already uses.
//
// The parser is pure and returns data, not DOM: the legacy FAB builds elements
// from it, the shell maps it to JSX, and a unit test can assert on it without a
// browser. Only `renderAssistantReply` below touches the DOM, and it builds
// every node with createElement/textContent — model output must never reach
// innerHTML, both because it is untrusted text and because the production CSP
// leaves us no margin for cleverness there.

// A line that is nothing but a horizontal rule: ---, ***, ___ (3+).
const RULE_RE = /^\s*([-*_])\1{2,}\s*$/;
// ### Heading — up to 6 hashes, then the text.
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
// Bulleted item: -, *, + or an actual bullet the model sometimes emits.
const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;
// Numbered item: 1. or 1)
const NUMBER_RE = /^\s*\d{1,2}[.)]\s+(.*)$/;

/**
 * Strip inline markers we do not render, leaving the text they wrapped.
 *
 * Runs AFTER bold extraction, so a `**` that survives to here was unmatched —
 * an opening marker with no partner, which would otherwise print as two stars.
 */
function stripInlineMarkers(text) {
  return (
    text
      // `code` → code, without pretending we style code spans.
      .replace(/`+([^`]*)`+/g, '$1')
      // Unmatched bold/italic runs left over after the bold pass.
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      // A single * or _ used as emphasis, but never one inside a word
      // (file_name, 3*4) — only a marker hugging the text it wraps.
      .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$)/g, '$1$2')
      // Markdown links [label](url): keep the label, drop the plumbing.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  );
}

/**
 * Split one line into bold and plain spans.
 *
 * Returns [{ text, bold }]. Adjacent plain text is not merged — the callers
 * both emit one node per span, and a stray empty span is dropped here.
 */
export function parseSpans(line) {
  const spans = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      const plain = stripInlineMarkers(line.slice(last, m.index));
      if (plain) spans.push({ text: plain, bold: false });
    }
    const inner = stripInlineMarkers(m[1] ?? m[2] ?? '').trim();
    if (inner) spans.push({ text: inner, bold: true });
    last = re.lastIndex;
  }
  if (last < line.length) {
    const plain = stripInlineMarkers(line.slice(last));
    if (plain) spans.push({ text: plain, bold: false });
  }
  return spans;
}

/**
 * Parse a reply into blocks:
 *   { type: 'p',  spans: [...] }            a paragraph (or a heading's text)
 *   { type: 'ul' | 'ol', items: [[...]] }   a list, each item a span array
 *
 * A heading becomes a paragraph whose text is bold rather than an <h3>: the
 * bubble is ~300px wide and a real heading scale there looks like a mistake,
 * but the emphasis the model meant is still worth keeping.
 */
export function parseAssistantReply(text) {
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const spans = [];
    paragraph.forEach((line, i) => {
      // A newline inside a paragraph is a line break the model meant to keep
      // (a list of numbers, an address); between spans it is just a space.
      if (i > 0) spans.push({ text: '\n', bold: false });
      spans.push(...parseSpans(line));
    });
    if (spans.some((s) => s.text.trim())) blocks.push({ type: 'p', spans });
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.items.length > 0) blocks.push(list);
    list = null;
  };

  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (RULE_RE.test(line)) {
      // A divider inside a chat bubble is noise whichever way it renders; the
      // blank line it implies is the part worth keeping.
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushParagraph();
      flushList();
      const spans = parseSpans(heading[2]).map((s) => ({ ...s, bold: true }));
      if (spans.length > 0) blocks.push({ type: 'p', spans });
      continue;
    }

    const bullet = line.match(BULLET_RE);
    const numbered = bullet ? null : line.match(NUMBER_RE);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      const spans = parseSpans((bullet ? bullet[1] : numbered[1]).trim());
      if (spans.length > 0) list.items.push(spans);
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Build the DOM for a reply, for the legacy front-end.
 *
 * `doc` is injected so this is testable without a browser. Returns a
 * DocumentFragment the caller appends to the bubble.
 */
export function renderAssistantReply(text, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const frag = d.createDocumentFragment();

  const appendSpans = (parent, spans) => {
    for (const span of spans) {
      if (span.bold) {
        const strong = d.createElement('strong');
        strong.textContent = span.text;
        parent.appendChild(strong);
      } else {
        parent.appendChild(d.createTextNode(span.text));
      }
    }
  };

  for (const block of parseAssistantReply(text)) {
    if (block.type === 'p') {
      const p = d.createElement('p');
      appendSpans(p, block.spans);
      frag.appendChild(p);
    } else {
      const listEl = d.createElement(block.type);
      for (const item of block.items) {
        const li = d.createElement('li');
        appendSpans(li, item);
        listEl.appendChild(li);
      }
      frag.appendChild(listEl);
    }
  }
  return frag;
}
