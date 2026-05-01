#!/usr/bin/env python3
"""
build3.py — Shohoj Bundle Builder
Reads all JS source files, strips ES module import/export syntax,
inlines CSS, inlines firebase.js as a <script type="module"> block,
and produces a single self-contained shohoj.html.

Usage:
    python3 build3.py
"""

import json
import hashlib
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
    'js/core/faculty.js',
    'js/core/reviews.js',
    # Import
    'js/import/parser.js',
    # UI
    'js/ui/charts.js',
    'js/ui/suggestions.js',
    'js/ui/tracker.js',
    'js/ui/reviews.js',
    'js/ui/reviewsTab.js',
    'js/ui/difficultyMap.js',
    'js/ui/render.js',
    'js/ui/simulator.js',
    'js/ui/modals.js',
    'js/ui/playground.js',
    'js/ui/planner.js',
    'js/ui/advising.js',
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
    code = re.sub(r'\bexport\s+(async\s+function|function|const|let|var|class)\b', r'\1', code)
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

    # ── Inject faculty profiles from faculty_profiles.jsonl ───────────────────
    profiles_path = 'faculty_profiles.jsonl'
    if os.path.exists(profiles_path):
        profiles = []
        with open(profiles_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    profiles.append(json.loads(line))
        profiles_js = json.dumps(profiles, ensure_ascii=False, separators=(', ', ': '))
        placeholder = 'const SEEDED_FACULTY_PROFILES = []; // injected by build3.py'
        replacement = f'const SEEDED_FACULTY_PROFILES = {profiles_js};'
        bundled_js = bundled_js.replace(placeholder, replacement)
        print(f'   Faculty profiles injected: {len(profiles)} from {profiles_path}')
    else:
        print(f'  ⚠ {profiles_path} not found — SEEDED_FACULTY_PROFILES will be empty')

    # ── Inject seed reviews from input_reviews.jsonl ──────────────────────────
    reviews_path = 'input_reviews.jsonl'
    if os.path.exists(reviews_path):
        reviews = []
        with open(reviews_path, 'r', encoding='utf-8') as f:
            for idx, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                initials = re.sub(r'[^A-Z]', '', str(row.get('facultyInitials', '')).upper())[:6]
                course = str(row.get('courseCode', '')).strip().upper()
                text = str(row.get('text') or '').strip()[:500]
                source = str(row.get('sourceUrl') or '')
                digest = hashlib.sha256(
                    f'seeded-input-v1|{idx}|{initials}|{course}|{text}|{source}'.encode('utf-8')
                ).hexdigest()
                ratings = row.get('ratings') or {}
                reviews.append({
                    'id': f'{initials}_{course}_{digest}',
                    'facultyInitials': initials,
                    'courseCode': course,
                    'semester': str(row.get('semester') or '').strip()[:40],
                    'ratings': {
                        'teaching':   round(ratings.get('teaching')),
                        'marking':    round(ratings.get('marking')),
                        'behavior':   round(ratings.get('behavior')),
                        'difficulty': round(ratings.get('difficulty')),
                        'workload':   round(ratings.get('workload')),
                    },
                    'text': text,
                    'createdAt': 1775000000000 - idx,
                    'seeded': True,
                })
        reviews_js = json.dumps(reviews, ensure_ascii=False, separators=(', ', ': '))
        placeholder = 'const SEEDED_REVIEWS = []; // injected by build3.py'
        replacement = f'const SEEDED_REVIEWS = {reviews_js};'
        bundled_js = bundled_js.replace(placeholder, replacement)
        print(f'   Seed reviews injected: {len(reviews)} from {reviews_path}')
    else:
        print(f'  ⚠ {reviews_path} not found — SEEDED_REVIEWS will be empty')

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

    # ── Add gstatic.com to CSP connect-src for Firebase SDK module fetches ────
    html = re.sub(
        r'(connect-src\s+)(?!https://www\.gstatic\.com)',
        r'\1https://www.gstatic.com ',
        html
    )

    # ── Replace the Firebase module import script with inlined version ────────
    # Strategy: find the comment marker, then find the NEXT <script type="module">
    # block after it and replace it. This is more robust than a single large regex.
    firebase_init_block = (
        '<!-- Firebase auth init — inlined by build3.py -->\n'
        '  <script type="module">\n'
        + firebase_js
        + '\n\n// ── Boot ──\ninitAuth();\n'
        + 'window._shohoj_onSave = async function(snap) {\n'
        + '  if (currentUser) await saveToCloud(snap);\n'
        + '};\n'
        + '  </script>'
    )

    # Find the firebase comment + script block and replace as a unit
    firebase_block_pattern = re.compile(
        r'<!--[^>]*[Ff]irebase[^>]*-->\s*'
        r'<script\s+type=["\']module["\'][^>]*>[\s\S]*?</script>',
        re.MULTILINE
    )
    match = firebase_block_pattern.search(html)
    if match:
        html = html[:match.start()] + firebase_init_block + html[match.end():]
        print('   Firebase block: replaced via comment anchor')
    else:
        # Fallback: replace any <script type="module"> that imports firebase.js
        html = re.sub(
            r'<script\s+type=["\']module["\']\s*>[\s\S]*?firebase\.js[\s\S]*?</script>',
            firebase_init_block,
            html
        )
        print('   Firebase block: replaced via fallback pattern')

    # ── Replace main.js module script with bundled <script> ───────────────────
    html = re.sub(
        r'<script\s+type=["\']module["\']\s+src=["\']js/main\.js["\'][^>]*>\s*</script>',
        lambda _m: f'<script>\n{bundled_js}\n</script>',
        html
    )

    # ── Sanity check: make sure no export/import keywords leaked into output ──
    # Check the non-module script content only
    non_module = re.sub(r'<script\s+type=["\']module["\'][\s\S]*?</script>', '', html)
    if re.search(r'\bexport\s+(function|const|let|var|class|default|\{)', non_module):
        print('  ⚠ WARNING: "export" keyword found outside module scripts — check build output!')
    else:
        print('   Sanity check: no export leaks detected ✓')

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
