#!/usr/bin/env python3
"""
seed_faculty.py — bulk-import faculty profiles into Firestore.

Reads faculty_profiles.jsonl and writes each profile to the
`facultyProfiles` Firestore collection. Uses the faculty's initials
as the deterministic document ID.

Usage:
    # Dry-run validation only:
    python3 scripts/seed_faculty.py faculty_profiles.jsonl --dry-run

    # Actual write (requires GOOGLE_APPLICATION_CREDENTIALS):
    export GOOGLE_APPLICATION_CREDENTIALS=./shohoj-service-account.json
    python3 scripts/seed_faculty.py faculty_profiles.jsonl

Dependencies:
    pip install firebase-admin
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID   = 'shohoj'
COLLECTION   = 'facultyProfiles'
INITIALS_RE  = re.compile(r'^[A-Z]{2,6}$')
COURSE_RE    = re.compile(r'^[A-Z]{2,4}\d{3}[A-Z]?$')

# ── Validation ────────────────────────────────────────────────────────────────
def validate(row, lineno):
    errs = []

    initials = re.sub(r'[^A-Z]', '', str(row.get('initials', '')).strip().upper())[:6]
    if not INITIALS_RE.match(initials):
        errs.append(f'initials must be 2–6 letters (got {initials!r})')

    name = str(row.get('name', '')).strip()
    if not name:
        errs.append('name is required')

    email = str(row.get('email', '')).strip()
    if not email:
        errs.append('email is required')

    dept = str(row.get('dept', '')).strip().upper()
    if not dept:
        errs.append('dept is required')

    courses = row.get('courses', [])
    if not isinstance(courses, list):
        errs.append('courses must be an array')
        courses = []
    bad_courses = [c for c in courses if not COURSE_RE.match(str(c).strip().upper())]
    if bad_courses:
        errs.append(f'malformed course codes: {bad_courses}')

    if errs:
        return None, f'[line {lineno}] ' + '; '.join(errs)

    body = {
        'initials': initials,
        'name':     name,
        'email':    email,
        'dept':     dept,
        'courses':  [c.strip().upper() for c in courses],
    }
    return {'id': initials, 'body': body}, None


def load_rows(path):
    rows = []
    with open(path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append((i, json.loads(line)))
            except json.JSONDecodeError as e:
                print(f'  ⚠ line {i} is not valid JSON: {e}', file=sys.stderr)
    return rows


def write_to_firestore(docs, batch_size=400):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print('  ✖ firebase-admin not installed. Run: pip install firebase-admin', file=sys.stderr)
        sys.exit(2)

    if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        print('  ✖ GOOGLE_APPLICATION_CREDENTIALS is not set.', file=sys.stderr)
        print('    Export it to a service-account JSON with Firestore write access.', file=sys.stderr)
        sys.exit(2)

    firebase_admin.initialize_app(credentials.ApplicationDefault(), {'projectId': PROJECT_ID})
    db  = firestore.client()
    col = db.collection(COLLECTION)

    written = 0
    for start in range(0, len(docs), batch_size):
        chunk = docs[start:start + batch_size]
        batch = db.batch()
        for entry in chunk:
            ref = col.document(entry['id'])
            batch.set(ref, entry['body'], merge=True)
        batch.commit()
        written += len(chunk)
        print(f'   wrote {written}/{len(docs)}')
    return written


def main():
    ap = argparse.ArgumentParser(description='Seed facultyProfiles from a JSONL file.')
    ap.add_argument('input', type=Path, help='Path to faculty_profiles.jsonl')
    ap.add_argument('--dry-run', action='store_true',
                    help='Validate and print — do not write to Firestore.')
    args = ap.parse_args()

    if not args.input.exists():
        print(f'  ✖ Input file not found: {args.input}', file=sys.stderr)
        sys.exit(1)

    rows    = load_rows(args.input)
    valid   = []
    invalid = []
    for lineno, row in rows:
        norm, err = validate(row, lineno)
        if err:
            invalid.append(err)
        else:
            valid.append(norm)

    print(f'   parsed:   {len(rows)}')
    print(f'   valid:    {len(valid)}')
    print(f'   invalid:  {len(invalid)}')
    for msg in invalid[:20]:
        print(f'     - {msg}', file=sys.stderr)
    if len(invalid) > 20:
        print(f'     … and {len(invalid) - 20} more', file=sys.stderr)

    if args.dry_run or not valid:
        if args.dry_run:
            print('   dry-run — no writes performed.')
        return

    confirm = input(f'Write {len(valid)} profiles to Firestore project {PROJECT_ID!r}? [y/N] ')
    if confirm.strip().lower() != 'y':
        print('   aborted.')
        return

    written = write_to_firestore(valid)
    print(f'✅ Seeded {written} faculty profiles.')


if __name__ == '__main__':
    main()
