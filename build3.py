#!/usr/bin/env python3
"""
build3.py — Shohoj Bundle Builder
Reads all JS source files, strips ES module import/export syntax,
inlines CSS, inlines firebase.js as a <script type="module"> block,
and produces a single self-contained shohoj.html.

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
    'js/core/catalog.js',
    'js/core/calculator.js',
    # Import
    'js/import/parser.js',
    # UI
    'js/ui/charts.js',
    'js/ui/suggestions.js',
    'js/ui/tracker.js',
    'js/ui/render.js',
    'js/ui/simulator.js',
    'js/ui/modals.js',
    'js/ui/playground.js',
    'js/ui/planner.js',
    # Animations
    'js/animations/cursor.js',
    'js/animations/dotmatrix.js',
    'js/animations/reveal.js',
    # Entry point (last)
    'js/main.js',
]

# firebase.js uses CDN ES module imports — it must stay as type="module"
# so it cannot be bundled with the regular JS. It is inlined separately.
FIREBASE_FILE = 'js/auth/firebase.js'

CSS_FILE    = 'css/style.css'
HTML_FILE   = 'index.html'
OUTPUT_FILE = 'shohoj.html'


def strip_imports_exports(code):
    """Remove ES module import/export statements from JS source."""
    code = re.sub(
        r'import\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];?\s*',
        '', code, flags=re.DOTALL
    )
    code = re.sub(r'import\s+\w+\s+from\s*[\'"][^\'"]+[\'"];?\s*', '', code)
    code = re.sub(r'import\s*[\'"][^\'"]+[\'"];?\s*', '', code)
    code = re.sub(r'\bexport\s+(function|const|let|var|class)\b', r'\1', code)
    code = re.sub(r'\bexport\s+default\s+', '', code)
    code = re.sub(
        r'export\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];?\s*',
        '', code, flags=re.DOTALL
    )
    code = re.sub(r'export\s*\{[^}]*\};?\s*', '', code, flags=re.DOTALL)
    return code


def build():
    # ── Read and bundle main JS ───────────────────────────────────────────────
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

    js_parts.append('''// ── clearAllData (appended by build3.py) ─────────────────────────────────
function clearAllData() {
  clearState();
  state.semesters = [];
  state.semesterCounter = 0;
  resetPlayground();
  resetPlanner();
  renderSemesters();
  recalc();
}
window.clearAllData = clearAllData;
''')
    bundled_js = '\n'.join(js_parts)

    # ── Read firebase.js (kept as-is, will be inlined as type="module") ──────
    firebase_js = ''
    if os.path.exists(FIREBASE_FILE):
        with open(FIREBASE_FILE, 'r', encoding='utf-8') as f:
            firebase_js = f.read()
        print(f'   Firebase module: {FIREBASE_FILE}')
    else:
        print(f'  ⚠ Firebase file not found: {FIREBASE_FILE}')

    # ── Read CSS ──────────────────────────────────────────────────────────────
    with open(CSS_FILE, 'r', encoding='utf-8') as f:
        css = f.read()

    # ── Read HTML ─────────────────────────────────────────────────────────────
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    # ── Replace CSS link with inlined <style> ─────────────────────────────────
    html = re.sub(
        r'<link\s+[^>]*href=["\']css/style\.css["\'][^>]*/?>',
        lambda _m: f'<style>\n{css}\n</style>',
        html
    )

    # ── Replace the Firebase module import script with inlined version ────────
    # The index.html has: <script type="module">
    #                       import { initAuth, ... } from './js/auth/firebase.js';
    #                       ...
    #                     </script>
    # We replace that entire block with firebase.js inlined directly,
    # keeping type="module" so CDN imports still work.
    firebase_init_block = f'<script type="module">\n{firebase_js}\n\n// ── Boot ──\ninitAuth();\nwindow._shohoj_onSave = async function(snap) {{\n  if (currentUser) await saveToCloud(snap);\n}};\n</script>'

    html = re.sub(
        r'<script\s+type=["\']module["\']\s*>\s*import\s*\{[^}]*\}\s*from\s*[\'"][^"\']*firebase\.js["\'];[\s\S]*?</script>',
        lambda _m: firebase_init_block,
        html
    )

    # ── Replace main.js module script with bundled <script> ───────────────────
    html = re.sub(
        r'<script\s+type=["\']module["\']\s+src=["\']js/main\.js["\'][^>]*>\s*</script>',
        lambda _m: f'<script>\n{bundled_js}\n</script>',
        html
    )

    # ── Write output ──────────────────────────────────────────────────────────
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'✅ Built {OUTPUT_FILE} ({size_kb:.0f} KB)')
    print(f'   JS files bundled: {len(JS_FILES)}')
    print(f'   CSS inlined from: {CSS_FILE}')
    print(f'   Firebase inlined: {FIREBASE_FILE}')


if __name__ == '__main__':
    build()
