#!/usr/bin/env python3
"""
build3.py — Shohoj Bundle Builder
Reads all JS source files, strips ES module import/export syntax,
inlines CSS, and produces a single self-contained shohoj.html.

Usage:
    python3 build3.py
"""

import re
import os

# ── File order matters: dependencies must come before dependents ──────────────
JS_FILES = [
    # Core (no dependencies)
    'js/core/grades.js',
    'js/core/helpers.js',
    'js/core/state.js',
    'js/core/departments.js',
    # Core (with dependencies)
    'js/core/catalog.js',       # imports departments
    'js/core/calculator.js',    # imports grades, helpers, state
    # Import
    'js/import/parser.js',      # no imports
    # UI
    'js/ui/charts.js',          # no imports
    'js/ui/suggestions.js',     # imports catalog, state
    'js/ui/render.js',          # imports grades, departments, state, calculator, helpers
    'js/ui/simulator.js',       # imports grades, state, calculator
    'js/ui/modals.js',          # imports grades, departments, state, calculator, parser
    # Animations
    'js/animations/cursor.js',
    'js/animations/dotmatrix.js',
    'js/animations/reveal.js',
    # Entry point (last)
    'js/main.js',
]

CSS_FILE = 'css/style.css'
HTML_FILE = 'index.html'
OUTPUT_FILE = 'shohoj.html'


def strip_imports_exports(code):
    """Remove ES module import/export statements from JS source."""
    # Remove multi-line imports:  import { ... } from '...';
    code = re.sub(
        r'import\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];?\s*',
        '',
        code,
        flags=re.DOTALL
    )
    # Remove single-line default imports:  import X from '...';
    code = re.sub(
        r'import\s+\w+\s+from\s*[\'"][^\'"]+[\'"];?\s*',
        '',
        code
    )
    # Remove side-effect imports:  import '...';
    code = re.sub(
        r'import\s*[\'"][^\'"]+[\'"];?\s*',
        '',
        code
    )
    # Remove named exports:  export function ..., export const ..., export class ...
    code = re.sub(r'\bexport\s+(function|const|let|var|class)\b', r'\1', code)
    # Remove default exports:  export default ...
    code = re.sub(r'\bexport\s+default\s+', '', code)
    # Remove re-exports:  export { ... } from '...';
    code = re.sub(
        r'export\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];?\s*',
        '',
        code,
        flags=re.DOTALL
    )
    # Remove plain export blocks:  export { ... };
    code = re.sub(
        r'export\s*\{[^}]*\};?\s*',
        '',
        code,
        flags=re.DOTALL
    )
    return code


def build():
    # ── Read and bundle JS ────────────────────────────────────────────────────
    js_parts = []
    for path in JS_FILES:
        if not os.path.exists(path):
            print(f'  ⚠ Skipping missing file: {path}')
            continue
        with open(path, 'r', encoding='utf-8') as f:
            raw = f.read()
        stripped = strip_imports_exports(raw)
        js_parts.append(f'// ── {path} {"─" * (60 - len(path))}')
        js_parts.append(stripped.strip())
        js_parts.append('')

    # Append clearAllData() — called by the HTML clear button
    js_parts.append('''// ── clearAllData (appended by build3.py) ─────────────────────────────────
function clearAllData() {
  clearState();
  state.semesters = [];
  state.semesterCounter = 0;
  state.whatIfMode = false;
  Object.keys(state.whatIfGrades).forEach(k => delete state.whatIfGrades[k]);
  const btn = document.getElementById('whatIfBtn');
  if (btn) { btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = ''; btn.textContent = '🔮 What-if'; }
  renderSemesters();
  recalc();
}
window.clearAllData = clearAllData;
''')

    bundled_js = '\n'.join(js_parts)

    # ── Read CSS ──────────────────────────────────────────────────────────────
    with open(CSS_FILE, 'r', encoding='utf-8') as f:
        css = f.read()

    # ── Read HTML ─────────────────────────────────────────────────────────────
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    # ── Replace CSS link with inlined <style> ─────────────────────────────────
    html = re.sub(
        r'<link\s+[^>]*href=["\']css/style\.css["\'][^>]*/?>',
        f'<style>\n{css}\n</style>',
        html
    )

    # ── Replace module script with bundled <script> ───────────────────────────
    html = re.sub(
        r'<script\s+type=["\']module["\']\s+src=["\']js/main\.js["\'][^>]*>\s*</script>',
        f'<script>\n{bundled_js}\n</script>',
        html
    )

    # ── Write output ──────────────────────────────────────────────────────────
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

    # ── Summary ───────────────────────────────────────────────────────────────
    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'✅ Built {OUTPUT_FILE} ({size_kb:.0f} KB)')
    print(f'   JS files bundled: {len(JS_FILES)}')
    print(f'   CSS inlined from: {CSS_FILE}')


if __name__ == '__main__':
    build()
