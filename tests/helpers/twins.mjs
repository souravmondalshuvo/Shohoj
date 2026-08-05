// tests/helpers/twins.mjs
//
// Support for the hand-maintained js/ ↔ src/ twin family (#484).
//
// Nothing generates one side from the other, so the "Generated from" header is
// the only thing asserting a relationship. This module turns that header into
// something executable: it discovers the pairs, and it makes the typed side
// importable from a plain node test.
//
// Why transpile rather than import the .ts directly: most of src/ uses
// extensionless relative imports ('./grades'), which Vite and tsc resolve but
// node's type-stripping does not. 229 such specifiers across 59 files is not a
// change to make in passing, so — following tests/typedCoreParity.test.js — the
// tree is transpiled into a temp directory with specifiers rewritten to .mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directories scanned for `// Generated from ...` headers. */
const JS_ROOTS = ['js'];

/** Rewrite local specifiers to the transpiled .mjs siblings. Handles both the
 * explicit-.ts convention and the extensionless one. */
function rewriteLocalImports(output) {
  return output.replace(
    /(from\s+|import\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (_m, lead, quote, specifier) => {
      if (/\.[cm]?js$/.test(specifier)) return `${lead}${quote}${specifier}${quote}`;
      if (/\.(css|json)$/.test(specifier)) return `${lead}${quote}${specifier}${quote}`;
      return `${lead}${quote}${specifier.replace(/\.tsx?$/, '')}.mjs${quote}`;
    },
  );
}

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

let cachedTempDir = null;

/**
 * Transpile every `src/**\/*.ts` into a temp tree of .mjs, preserving layout.
 *
 * transpileModule does not typecheck and does not resolve imports, so a file
 * that could never run still transpiles fine — failures surface at import
 * time, per twin, which is where they are actionable.
 */
export function transpiledSrcDir() {
  if (cachedTempDir) return cachedTempDir;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shohoj-twin-parity-'));
  const files = walk(path.join(ROOT, 'src'), (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  for (const sourcePath of files) {
    const rel = path.relative(path.join(ROOT, 'src'), sourcePath);
    const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: false,
      },
    });
    const outFile = path.join(tempDir, rel.replace(/\.ts$/, '.mjs'));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, rewriteLocalImports(result.outputText));
  }

  cachedTempDir = tempDir;
  return tempDir;
}

/** Import the typed side of a pair out of the transpiled tree. */
export async function importTyped(srcRelPath) {
  const rel = path.relative('src', srcRelPath).replace(/\.ts$/, '.mjs');
  return import(pathToFileURL(path.join(transpiledSrcDir(), rel)).href);
}

/** Import the vanilla side straight from the repo. */
export async function importVanilla(jsRelPath) {
  return import(pathToFileURL(path.join(ROOT, jsRelPath)).href);
}

/**
 * Every declared twin, discovered from the header rather than a hardcoded list
 * — a new twin is covered the moment it carries one.
 */
export function discoverTwins() {
  const pairs = [];
  for (const root of JS_ROOTS) {
    for (const file of walk(path.join(ROOT, root), (f) => f.endsWith('.js'))) {
      const first = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
      // "Twin of" is the current wording; "Generated from" was the old one and
      // is still honoured so a stray file cannot fall out of the family simply
      // by keeping the header it was born with.
      const match = first.match(/^\/\/\s*(?:Twin of|Generated from)\s+(\S+?\.ts)\b/);
      if (!match) continue;
      pairs.push({
        js: path.relative(ROOT, file),
        ts: match[1],
        name: path.basename(file, '.js'),
      });
    }
  }
  return pairs.sort((a, b) => a.js.localeCompare(b.js));
}

/** Value exports only — types vanish in transpile, so both sides are comparable. */
export function exportNames(mod) {
  return Object.keys(mod)
    .filter((k) => k !== 'default')
    .sort();
}

export { ROOT };
