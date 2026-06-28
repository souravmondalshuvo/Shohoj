#!/usr/bin/env python3
"""
scripts/check_bundle_collisions.py — bundle identifier-collision guard.

build3.py flattens every JS module in a page's file list into ONE script scope
(it only strips `import`/`export` and concatenates). When two modules declare
the same top-level `function`/`const`/`let`/`var`/`class`, the bundle silently
keeps the last one — source files and source-mode unit tests still pass, but the
shipped page runs the wrong implementation. This has already caused live bugs
(e.g. a blank Papers list, PR #276).

This script reproduces build3's exact per-page file lists, finds top-level
declarations that appear in more than one file, and fails (exit 1) on any
collision that is not in ALLOWLIST. Intentionally-duplicated helpers may be
allowlisted with a documented reason; every allowlisted name must keep identical
behavior across its copies.

Run:  python3 scripts/check_bundle_collisions.py
CI:   wired into the bundle job; also runnable via `npm run check:collisions`.

Detection model: build3 keeps each module's top-level declarations at column 0
(nested declarations are indented), so a declaration that begins at column 0 of
an import/export-stripped, comment-stripped module is a bundle-scope global. This
matches the codebase's consistent style and is what surfaced the real defects;
it deliberately errs toward catching column-0 globals rather than parsing JS.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build3  # noqa: E402  — reuse the canonical file lists + strip logic

# ── Allowlist: name -> reason. Only for declarations that are intentionally
# duplicated AND behaviorally identical across every copy. Removing a copy or
# letting the copies diverge is the real fix; entries here are a deliberate,
# reviewed exception, not a place to silence new collisions.
ALLOWLIST = {
    'normalizeCourseCode': (
        'Identical course-code normalizer duplicated in core/reviews.js, '
        'core/papers.js, core/studyGroups.js (and an equivalent in '
        'core/routineState.js). Pending extraction to a shared courseCode '
        'module in a later feature-migration phase. Keep bodies equivalent.'
    ),
    'isKnownCourseCode': (
        'Identical course-code validator (same /^[A-Z]{2,4}[0-9]{3}[A-Z]?$/ '
        'regex + COURSE_DB lookup) duplicated in core/reviews.js, '
        'core/papers.js, core/studyGroups.js. Pending shared-module extraction. '
        'Keep bodies equivalent.'
    ),
}

DECL_RE = re.compile(
    r'^(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)'
)


def strip_comments(code):
    """Remove /* */ and // comments so commented-out code isn't counted."""
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    code = re.sub(r'(^|[^:])//[^\n]*', lambda m: m.group(1), code)
    return code


def top_level_decls(code):
    """Names declared at column 0 (bundle-scope globals) in stripped source."""
    names = []
    for line in code.split('\n'):
        if line[:1].isspace():
            continue  # indented -> not top level
        m = DECL_RE.match(line)
        if m:
            names.append(m.group(1))
    return names


def declarations_for(files):
    """Map name -> sorted list of files that declare it at top level."""
    owners = {}
    for path in files:
        if not os.path.exists(path):
            continue
        raw = open(path, encoding='utf-8').read()
        stripped = build3.strip_imports_exports(strip_comments(raw))
        for name in top_level_decls(stripped):
            owners.setdefault(name, set()).add(path)
    return {name: sorted(paths) for name, paths in owners.items()}


PAGES = [
    ('MAIN (shohoj.html)', build3.MAIN_JS_FILES),
    ('ADMIN (admin.html)', build3.ADMIN_JS_FILES),
    ('PROFILE (profile.html)', build3.PROFILE_JS_FILES),
    ('FIREBASE module', build3.FIREBASE_JS_FILES),
]


def main():
    unsafe = []        # (page, name, files)
    used_allow = set()

    for page_name, files in PAGES:
        owners = declarations_for(files)
        for name, paths in sorted(owners.items()):
            if len(paths) < 2:
                continue
            if name in ALLOWLIST:
                used_allow.add(name)
                print(f'  · allowlisted collision {name!r} in {page_name}: '
                      f'{", ".join(paths)}')
                continue
            unsafe.append((page_name, name, paths))

    if unsafe:
        print('\n❌ Unsafe bundle identifier collisions (last-wins silently '
              'drops an implementation):\n')
        for page_name, name, paths in unsafe:
            print(f'  [{page_name}] {name!r}')
            for p in paths:
                print(f'       {p}')
        print('\nFix: rename the module-private copies to be unique, or extract '
              'a single shared definition. Only add to ALLOWLIST if every copy '
              'is intentionally identical (document why).')
        return 1

    stale = set(ALLOWLIST) - used_allow
    if stale:
        print('\n⚠ Stale ALLOWLIST entries (no longer collide — remove them):')
        for name in sorted(stale):
            print(f'   {name!r}')

    print('\n✅ No unsafe bundle identifier collisions.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
