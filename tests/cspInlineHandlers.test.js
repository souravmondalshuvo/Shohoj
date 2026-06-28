/**
 * tests/cspInlineHandlers.test.js
 * Static guard against inline on* event-handler attributes in the built bundle.
 *
 * Run `python3 build3.py` first. build3's `harden_script_csp` drops
 * 'unsafe-inline' from script-src and only hashes <script> *blocks* — it does
 * NOT cover inline handler attributes (onkeydown=, onblur=, onmouseenter=, …),
 * which under CSP3 would need 'unsafe-hashes'. So any such handler shipped in
 * the bundle is silently refused at runtime (the browser reports a
 * `securitypolicyviolation` with violatedDirective "script-src-attr"), breaking
 * whatever interaction it backs.
 *
 * The raw-ESM e2e suite can't catch this — it loads the un-bundled modules in
 * dev, which still allows inline handlers. Only the hardened bundle exhibits the
 * bug, so this guard scans the built shohoj.html statically: it catches every
 * handler regardless of whether a test happens to render that surface (a
 * behavioral test only covers the paths it exercises, and gives false greens
 * for the rest).
 *
 * Fix any reported handler by wiring it via dispatch.js `data-action`
 * delegation or an addEventListener block (a <script> block IS hash-covered).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundlePath = path.join(repoRoot, 'shohoj.html');

// Inline event-handler attributes look like `on<name>="…"` or `on<name>='…'`.
// The leading whitespace + `=` after the name keeps this from matching JS like
// `el.onclick = fn` (no quote) or `setAttribute('onclick', …)` (no `=`).
const HANDLER_RE = /\son([a-z]+)\s*=\s*("(?:[^"]*)"|'(?:[^']*)')/g;

// Strip comments before scanning so handler-like text in documentation (e.g. a
// JS comment that mentions `onkeydown="…"`, as in dispatch.js) isn't mistaken
// for a real handler. Covers HTML <!-- -->, CSS/JS /* */, and JS // line
// comments. The // rule is URL-safe: it only fires at start-of-line or after a
// non-colon char, so `https://…` is preserved.
function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

function scanInlineHandlers(html) {
  const source = stripComments(html);
  const found = new Map(); // attr+value -> count
  let match;
  HANDLER_RE.lastIndex = 0;
  while ((match = HANDLER_RE.exec(source)) !== null) {
    const attr = `on${match[1]}`;
    const value = match[2].slice(1, -1);
    const key = `${attr}=${value}`;
    found.set(key, (found.get(key) || 0) + 1);
  }
  return found;
}

function run() {
  if (!fs.existsSync(bundlePath)) {
    throw new Error('shohoj.html is missing. Run `python3 build3.py` before this guard.');
  }

  const html = fs.readFileSync(bundlePath, 'utf8');
  const found = scanInlineHandlers(html);

  if (found.size === 0) {
    console.log('CSP inline-handler guard passed: no inline on* handlers in the bundle');
    return;
  }

  const lines = [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [attr, value] = [key.slice(0, key.indexOf('=')), key.slice(key.indexOf('=') + 1)];
      const snippet = value.length > 70 ? `${value.slice(0, 70)}…` : value;
      return `  ${String(count).padStart(2)}×  ${attr}="${snippet}"`;
    });

  throw new Error(
    'shohoj.html ships inline on* event-handler attributes that the hardened ' +
    'production CSP refuses at runtime (script-src hashes do not cover handler ' +
    `attributes). ${found.size} distinct handler(s):\n${lines.join('\n')}\n\n` +
    'Fix: wire each via dispatch.js data-action or an addEventListener block.',
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
