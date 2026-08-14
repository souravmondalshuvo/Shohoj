#!/usr/bin/env python3
"""
build3.py — Shohoj Bundle Builder
Reads all JS source files, strips ES module import/export syntax,
inlines CSS, inlines firebase.js as a <script type="module"> block,
and produces self-contained HTML files:
    shohoj.html         — main site (from index.html)
    admin.html          — admin dashboard (from admin/index.html)
    profile.html        — account hub + academic profile (from profile/index.html)

Usage:
    python3 build3.py
"""

import base64
import hashlib
import json
import os
import re
from html.parser import HTMLParser

DATA_DIR = 'data'

def first_existing_path(*paths):
    for path in paths:
        if os.path.exists(path):
            return path
    return paths[0]

# ── File order matters: dependencies must come before dependents ──────────────
MAIN_JS_FILES = [
    # Public runtime config (window vars; generated from env, must come first)
    'js/config/runtime-config.js',
    # QR data (window vars, must come first)
    'js/qr-data.js',
    # Core (no dependencies)
    'js/core/grades.js',
    'js/core/milestones.js',
    'js/core/helpers.js',
    'js/core/dispatch.js',
    'js/core/state.js',
    'js/core/departments.js',
    # Core (with dependencies)
    'js/core/catalog.js',
    'js/core/gpa-core.js',
    'js/core/calculator.js',
    'js/core/faculty.js',
    'js/core/reviews.js',
    'js/core/papers.js',
    'js/core/studyGroups.js',
    # Import
    'js/import/transcript-core.js',
    'js/import/parser.js',
    # UI
    'js/ui/charts.js',
    'js/ui/suggestions.js',
    'js/ui/tracker.js',
    'js/ui/reviews.js',
    'js/ui/reviewsTab.js',
    'js/ui/difficultyMap.js',
    'js/ui/previewModalPdfjs.js',
    'js/ui/previewModal.js',
    'js/ui/papersTab.js',
    # Routine Builder (Connect-feed-backed)
    'js/core/connectFeed.js',
    'js/core/connectFeedClient.js',
    'js/core/freeRooms.js',
    'js/core/seatStatus.js',
    'js/core/seatWatch.js',
    'js/core/calendarExport.js',
    'js/core/routineState.js',
    'js/core/routineGrid.js',
    'js/core/routineFaculty.js',
    'js/core/routineSuggestions.js',
    'js/core/routinePlannerImport.js',
    'js/core/routineExport.js',
    # QR generator from the installed qrcode-generator package (defines a
    # top-level `qrcode` once `export default` is stripped; used by routineTab)
    'node_modules/qrcode-generator/dist/qrcode.mjs',
    # Shared live-feed poller (used by routineTab/freeRoomsTab/seatsTab)
    'js/ui/feedLive.js',
    'js/ui/routineTab.js',
    'js/ui/freeRoomsTab.js',
    'js/ui/seatsTab.js',
    'js/ui/groupsTab.js',
    'js/ui/render.js',
    'js/ui/simulator.js',
    'js/ui/modals.js',
    'js/ui/playground.js',
    'js/core/planner-core.js',
    'js/ui/planner.js',
    'js/ui/feedback.js',
    # Shohoj Assistant launcher + its Worker transport (shared with the shell
    # through js/core/assistantClient.d.ts)
    'js/core/assistantClient.js',
    'js/ui/assistantFab.js',
    # Animations
    'js/animations/cursor.js',
    'js/animations/dotmatrix.js',
    'js/animations/reveal.js',
    # Entry point (last)
    'js/main.js',
]

# Admin page bundles only the dashboard + its direct deps. Skipping seeded
# reviews and unused UI modules keeps admin.html ~10× smaller, so the auth
# spinner doesn't sit there parsing megabytes of irrelevant code.
ADMIN_JS_FILES = [
    'js/config/runtime-config.js',
    'js/core/helpers.js',
    'js/core/dispatch.js',
    'js/core/departments.js',
    'js/core/catalog.js',
    'js/core/papers.js',
    'js/ui/previewModalPdfjs.js',
    'js/ui/previewModal.js',
    'js/ui/adminDashboard.js',
    'js/animations/cursor.js',
    'js/admin-entry.js',
]

# Dedicated /profile/ page: account hub + transcript-derived academic profile.
# Like admin, a slim bundle — just the profile view, dispatch, helpers and the
# cursor. Auth + the _shohoj_* identity globals come from the Firebase module
# (loaded separately, below). The seat-alerts card is omitted on this page.
PROFILE_JS_FILES = [
    'js/config/runtime-config.js',
    'js/core/helpers.js',
    'js/core/dispatch.js',
    # Semester GPA for the academic card's history comes from the calculator's
    # own grade rules (#532), so the profile bundle carries gpa-core + its
    # grade table rather than a second copy of the policy.
    'js/core/grades.js',
    'js/core/gpa-core.js',
    'js/ui/profileTab.js',
    # "This semester" briefing: the student's picks joined against the live
    # section feed (exam crunch, week measurement, gap rooms). Dependencies
    # must precede the modules that import them.
    'js/core/connectFeed.js',
    'js/core/connectFeedClient.js',
    'js/core/freeRooms.js',
    'js/core/semesterBriefing.js',
    'js/ui/semesterBriefingCard.js',
    # "Next registration" unlock map (#478). Shipped without these entries, so
    # the zone threw ReferenceError in the bundle while working in dev, where
    # js/ loads un-bundled (#535). prereq.js reads grades.js, listed above;
    # departments.js supplies the model curricula the map filters by (#539).
    'js/core/prereq.js',
    'js/core/departments.js',
    'js/ui/unlockMapCard.js',
    'js/animations/cursor.js',
    'js/profile-entry.js',
]

# Firebase auth uses CDN ES module imports, so it must stay as type="module"
# and cannot be bundled with the regular JS. Local auth helpers are inlined
# before firebase.js so the deploy output stays self-contained.
FIREBASE_JS_FILES = [
    'js/auth/firebase-init.js',
    'js/auth/admin-service.js',
    'js/auth/assistant-service.js',
    'js/auth/auth-service.js',
    'js/auth/paper-service.js',
    'js/auth/review-service.js',
    'js/auth/user-sync-service.js',
    'js/auth/firebase.js',
]

CSS_FILE = 'css/style.css'

# (template_path, output_path, css_link_pattern, main_script_pattern)
PAGES = [
    {
        'template': 'index.html',
        'output': 'shohoj.html',
        'js_files': MAIN_JS_FILES,
        'inject_seeds': True,
        'css_pattern': r'<link\s+[^>]*href=["\']css/style\.css["\'][^>]*/?>',
        'main_pattern': r'<script\s+type=["\']module["\']\s+src=["\']js/main\.js["\'][^>]*>\s*</script>',
        'qr_strip': '  <script src="js/qr-data.js"></script>\n',
    },
    {
        'template': 'admin/index.html',
        'output': 'admin.html',
        'js_files': ADMIN_JS_FILES,
        'inject_seeds': False,
        'css_pattern': r'<link\s+[^>]*href=["\']\.\./css/style\.css["\'][^>]*/?>',
        # Admin page loads two module scripts — firebase.js (kept as module)
        # and admin-entry.js (which needs the bundled JS instead).
        'main_pattern': r'<script\s+type=["\']module["\']\s+src=["\']\.\./js/admin-entry\.js["\'][^>]*>\s*</script>',
        'qr_strip': None,
    },
    {
        'template': 'profile/index.html',
        'output': 'profile.html',
        'js_files': PROFILE_JS_FILES,
        'inject_seeds': False,
        'css_pattern': r'<link\s+[^>]*href=["\']\.\./css/style\.css["\'][^>]*/?>',
        # Like admin: firebase.js stays a module, profile-entry.js becomes bundled JS.
        'main_pattern': r'<script\s+type=["\']module["\']\s+src=["\']\.\./js/profile-entry\.js["\'][^>]*>\s*</script>',
        'qr_strip': None,
    },
]


def js_safe_json(obj):
    """JSON-encode for embedding inside an inline <script> tag.

    json.dumps does NOT escape forward slashes, so a string containing
    "</script>" would close the script element early. Also escape U+2028 /
    U+2029 since JS treats them as line terminators (legal in JSON, illegal
    in JS string literals pre-ES2019; many embedders still trip over them).
    """
    return (
        json.dumps(obj, ensure_ascii=False, separators=(', ', ': '))
        .replace('</', '<\\/')
        .replace(' ', '\\u2028')
        .replace(' ', '\\u2029')
    )


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


def strip_local_imports_exports(code):
    """Remove local module imports/exports while keeping CDN imports intact."""
    code = re.sub(
        r'import\s*\{[^}]*\}\s*from\s*[\'"]\.[^\'"]+[\'"];?\s*',
        '', code, flags=re.DOTALL
    )
    code = re.sub(r'import\s+\w+\s+from\s*[\'"]\.[^\'"]+[\'"];?\s*', '', code)
    code = re.sub(r'import\s*[\'"]\.[^\'"]+[\'"];?\s*', '', code)
    code = re.sub(r'\bexport\s+(async\s+function|function|const|let|var|class)\b', r'\1', code)
    code = re.sub(r'\bexport\s+default\s+', '', code)
    code = re.sub(
        r'export\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];?\s*',
        '', code, flags=re.DOTALL
    )
    code = re.sub(r'export\s*\{[^}]*\};?\s*', '', code, flags=re.DOTALL)
    return code


def build_firebase_module(js_files):
    js_parts = []
    for path in js_files:
        if not os.path.exists(path):
            print(f'  ⚠ Skipping missing Firebase file: {path}')
            continue
        with open(path, 'r', encoding='utf-8') as f:
            raw = f.read()
        stripped = strip_local_imports_exports(raw)
        js_parts.append(f'// ── {path} {"─" * (60 - len(path))}')
        js_parts.append(stripped.strip())
        js_parts.append('')
    return '\n'.join(js_parts)


def build_bundled_js(js_files, inject_seeds=True, include_clear_all_data=True):
    js_parts = []
    for path in js_files:
        if not os.path.exists(path):
            print(f'  ⚠ Skipping missing file: {path}')
            continue
        with open(path, 'r', encoding='utf-8') as f:
            raw = f.read()
        stripped = strip_imports_exports(raw)
        js_parts.append(f'// ── {path} {"─" * (60 - len(path))}')
        js_parts.append(stripped.strip())
        js_parts.append('')

    if include_clear_all_data:
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

    if not inject_seeds:
        return bundled_js

    # ── Inject faculty profiles from data/faculty_profiles.jsonl ──────────────
    profiles_path = first_existing_path(
        os.path.join(DATA_DIR, 'faculty_profiles.jsonl'),
        'faculty_profiles.jsonl',
    )
    if os.path.exists(profiles_path):
        profiles = []
        with open(profiles_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    profiles.append(json.loads(line))
        profiles_js = js_safe_json(profiles)
        placeholder = 'const SEEDED_FACULTY_PROFILES = []; // injected by build3.py'
        replacement = f'const SEEDED_FACULTY_PROFILES = {profiles_js};'
        bundled_js = bundled_js.replace(placeholder, replacement)
        print(f'   Faculty profiles injected: {len(profiles)} from {profiles_path}')
    else:
        print(f'  ⚠ {profiles_path} not found — SEEDED_FACULTY_PROFILES will be empty')

    # ── Inject seed reviews from data/input_reviews.jsonl ─────────────────────
    reviews_path = first_existing_path(
        os.path.join(DATA_DIR, 'input_reviews.jsonl'),
        'input_reviews.jsonl',
    )
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
        reviews_js = js_safe_json(reviews)
        placeholder = 'const SEEDED_REVIEWS = []; // injected by build3.py'
        replacement = f'const SEEDED_REVIEWS = {reviews_js};'
        bundled_js = bundled_js.replace(placeholder, replacement)
        print(f'   Seed reviews injected: {len(reviews)} from {reviews_path}')
    else:
        print(f'  ⚠ {reviews_path} not found — SEEDED_REVIEWS will be empty')

    return bundled_js


class _InlineScriptCollector(HTMLParser):
    """Collect the text bodies of inline <script> tags (those without a src).

    Uses the stdlib HTML parser instead of a tag-matching regex: script and
    style are CDATA elements, so their raw text arrives verbatim through
    handle_data (character references are not decoded) — byte-for-byte what the
    browser hashes for a CSP 'sha256-...' source. Bodies are kept in document
    order to match the previous regex-based output.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.bodies = []
        self._capturing = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            has_src = any(name.lower() == 'src' for name, _ in attrs)
            self._capturing = not has_src
            self._buf = []

    def handle_endtag(self, tag):
        if tag == 'script':
            if self._capturing:
                self.bodies.append(''.join(self._buf))
            self._capturing = False
            self._buf = []

    def handle_data(self, data):
        if self._capturing:
            self._buf.append(data)


def harden_script_csp(html, output_path):
    """Replace 'unsafe-inline' in CSP script-src with SHA-256 hashes."""
    collector = _InlineScriptCollector()
    collector.feed(html)
    collector.close()

    hashes = []
    seen = set()
    for body in collector.bodies:
        if not body.strip():
            continue
        digest = hashlib.sha256(body.encode('utf-8')).digest()
        token = "'sha256-" + base64.b64encode(digest).decode('ascii') + "'"
        if token in seen:
            continue
        seen.add(token)
        hashes.append(token)

    if not hashes:
        return html

    csp_re = re.compile(
        r'(<meta\s+http-equiv=["\']Content-Security-Policy["\']\s+content=")([^"]*)(")',
        re.IGNORECASE,
    )
    match = csp_re.search(html)
    if not match:
        print(f'  ⚠ {output_path}: no CSP meta tag found, skipping hash injection')
        return html

    policy = match.group(2)
    directives = [d.strip() for d in policy.split(';') if d.strip()]
    new_directives = []
    patched = False
    for d in directives:
        parts = d.split()
        if parts and parts[0].lower() == 'script-src':
            kept = [p for p in parts[1:] if p != "'unsafe-inline'"]
            new_directives.append(' '.join(['script-src', *kept, *hashes]))
            patched = True
        else:
            new_directives.append(d)
    if not patched:
        print(f'  ⚠ {output_path}: CSP has no script-src directive, skipping')
        return html

    new_policy = '; '.join(new_directives) + ';'
    new_meta = match.group(1) + new_policy + match.group(3)
    print(f'   CSP script-src hardened: {len(hashes)} hash(es), unsafe-inline dropped')
    return html[:match.start()] + new_meta + html[match.end():]


def render_page(template_path, output_path, css, firebase_js, bundled_js,
                css_pattern, main_pattern, qr_strip):
    with open(template_path, 'r', encoding='utf-8') as f:
        html = f.read()

    if qr_strip:
        html = html.replace(qr_strip, '')

    # Strip the dev/e2e import map; production inlines qrcode-generator directly,
    # so the bare specifier never appears in the bundled output and a stray
    # import map would only add an un-hashable CSP surface.
    html = re.sub(
        r'\s*<!-- dev/e2e import map[\s\S]*?</script>',
        '',
        html,
    )

    # Strip the <script src="...runtime-config.js"> tag from the template;
    # its window assignments are already bundled into the main JS payload.
    html = re.sub(
        r'\s*<script\s+src=["\'](?:\.\./)?js/config/runtime-config\.js["\'][^>]*>\s*</script>\s*',
        '\n  ',
        html,
    )

    html = re.sub(css_pattern, lambda _m: f'<style>\n{css}\n</style>', html)

    # Allow gstatic.com in CSP connect-src for Firebase SDK module fetches.
    html = re.sub(
        r'(connect-src\s+)(?!https://www\.gstatic\.com)',
        r'\1https://www.gstatic.com ',
        html
    )

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

    firebase_block_pattern = re.compile(
        r'<!--[^>]*[Ff]irebase[^>]*-->\s*'
        r'<script\s+type=["\']module["\'][^>]*>[\s\S]*?</script>',
        re.MULTILINE
    )
    match = firebase_block_pattern.search(html)
    if match:
        html = html[:match.start()] + firebase_init_block + html[match.end():]
    else:
        html = re.sub(
            r'<script\s+type=["\']module["\']\s+src=["\'](?:\.\./)?js/auth/firebase\.js["\'][^>]*>\s*</script>',
            firebase_init_block,
            html
        )

    # Replace the page entry-point module script with the bundled non-module JS.
    html = re.sub(main_pattern, lambda _m: f'<script>\n{bundled_js}\n</script>', html)

    # Sanity check: no leaked export keywords outside module scripts.
    non_module = re.sub(r'<script\s+type=["\']module["\'][\s\S]*?</script>', '', html)
    if re.search(r'\bexport\s+(function|const|let|var|class|default|\{)', non_module):
        print(f'  ⚠ WARNING: "export" keyword leaked into {output_path}!')

    # Harden CSP: replace 'unsafe-inline' in script-src with SHA-256 hashes of
    # every inline <script> we just baked into the page. Style-src keeps
    # 'unsafe-inline' since templates use inline style="..." attributes that
    # would otherwise need 'unsafe-hashes' + per-attribute hashing.
    html = harden_script_csp(html, output_path)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size_kb = os.path.getsize(output_path) / 1024
    print(f'✅ Built {output_path} ({size_kb:.0f} KB)')


def build():
    firebase_js = build_firebase_module(FIREBASE_JS_FILES)
    print(f'   Firebase module files: {len(FIREBASE_JS_FILES)}')

    with open(CSS_FILE, 'r', encoding='utf-8') as f:
        css = f.read()

    for page in PAGES:
        if not os.path.exists(page['template']):
            print(f'  ⚠ Skipping missing template: {page["template"]}')
            continue
        bundled_js = build_bundled_js(
            page['js_files'],
            inject_seeds=page['inject_seeds'],
            include_clear_all_data=page['inject_seeds'],  # admin doesn't need clearAllData either
        )
        render_page(
            template_path=page['template'],
            output_path=page['output'],
            css=css,
            firebase_js=firebase_js,
            bundled_js=bundled_js,
            css_pattern=page['css_pattern'],
            main_pattern=page['main_pattern'],
            qr_strip=page['qr_strip'],
        )

    print(f'   Main JS files: {len(MAIN_JS_FILES)} · Admin JS files: {len(ADMIN_JS_FILES)} · Profile JS files: {len(PROFILE_JS_FILES)}')
    print(f'   CSS inlined from: {CSS_FILE}')
    print(f'   Firebase inlined: {", ".join(FIREBASE_JS_FILES)}')


if __name__ == '__main__':
    build()
