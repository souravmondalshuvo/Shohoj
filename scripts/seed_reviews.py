#!/usr/bin/env python3
"""
seed_reviews.py — bulk-import LLM-processed faculty reviews into Firestore.

Pipeline this script is meant to slot into:

    raw Facebook / Reddit posts
        │
        ▼  (LLM: extract structured review per post)
    input_reviews.jsonl
        │
        ▼  this script (validate + write to facultyReviews)
    Firestore `facultyReviews` collection

Each line of input_reviews.jsonl must be a JSON object matching the
shape that firestore.rules accepts for `facultyReviews`:

    {
      "facultyInitials": "MNR",           # 2–6 uppercase letters
      "courseCode":      "CSE110",         # optional, <=10 chars
      "semester":        "Fall 2024",      # optional, <=40 chars
      "ratings": {
        "teaching":   4,                   # 1–5
        "marking":    3,
        "behavior":   5,
        "difficulty": 4,
        "workload":   3
      },
      "text": "Clear lectures, fair grading.",  # optional, <=500 chars
      "sourceUrl": "https://..."           # optional — kept in metadata
    }

Writes are attributed to a bot uid so the UI can filter seeded reviews
out later if we decide to (today they're shown as regular reviews).

Usage:
    # Dry-run validation only:
    python3 scripts/seed_reviews.py input_reviews.jsonl --dry-run

    # Actual write (requires GOOGLE_APPLICATION_CREDENTIALS):
    export GOOGLE_APPLICATION_CREDENTIALS=./shohoj-service-account.json
    python3 scripts/seed_reviews.py input_reviews.jsonl

Dependencies:
    pip install firebase-admin
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID     = 'shohoj'
COLLECTION     = 'facultyReviews'
BOT_UID        = 'seed-bot-v1'                # identifies bot-submitted reviews
RATING_KEYS    = ['teaching', 'marking', 'behavior', 'difficulty', 'workload']
INITIALS_RE    = re.compile(r'^[A-Z]{2,6}$')
COURSE_CODE_RE = re.compile(r'^[A-Z]{2,4}\d{3}[A-Z]?$')

# ── Validation ────────────────────────────────────────────────────────────────
def validate(row, lineno):
    """Return (normalized_row, error_or_None). Mirrors firestore.rules checks."""
    errs = []

    initials = str(row.get('facultyInitials', '')).strip().upper()
    initials = re.sub(r'[^A-Z]', '', initials)[:6]
    if not INITIALS_RE.match(initials):
        errs.append(f'facultyInitials must be 2–6 letters (got {initials!r})')

    course = str(row.get('courseCode', '')).strip().upper()
    if course and not COURSE_CODE_RE.match(course):
        errs.append(f'courseCode looks malformed: {course!r}')
    if len(course) > 10:
        errs.append('courseCode too long (>10)')

    semester = str(row.get('semester', '')).strip()[:40]

    ratings = row.get('ratings') or {}
    norm_ratings = {}
    for key in RATING_KEYS:
        v = ratings.get(key)
        if not isinstance(v, (int, float)) or not (1 <= v <= 5):
            errs.append(f'rating "{key}" must be number in 1..5 (got {v!r})')
        else:
            norm_ratings[key] = int(round(v))

    text = str(row.get('text') or '').strip()
    if len(text) > 500:
        errs.append('text too long (>500)')

    if errs:
        return None, f'[line {lineno}] ' + '; '.join(errs)

    # Deterministic doc ID that mirrors the client format:
    #   {initials}_{courseCode}_{sha256(botUid|initials|course|text|source)}
    # The 'body' dict matches the strict key set enforced by firestore.rules.
    seed  = f'{BOT_UID}|{initials}|{course}|{text[:80]}|{row.get("sourceUrl","")}'
    hex_hash = hashlib.sha256(seed.encode('utf-8')).hexdigest()
    doc_id = f'{initials}_{course}_{hex_hash}'

    body = {
        'facultyInitials': initials,
        'courseCode':      course,
        'semester':        semester,
        'ratings':         norm_ratings,
        'text':            text,
    }
    # Metadata kept on a separate dict — written only if the admin SDK is used
    # (bypasses rules); NOT shipped to client-enforced writes.
    meta = {
        'sourceUrl': str(row.get('sourceUrl', ''))[:200],
        'seededBy':  BOT_UID,
        'seededAt':  int(time.time() * 1000),
    }

    return {'id': doc_id, 'body': body, 'meta': meta}, None


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
    """Write in batches. Requires firebase-admin + GOOGLE_APPLICATION_CREDENTIALS."""
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
            # Deterministic doc ID (mirrors client format) + strict body
            # that matches firestore.rules. Admin SDK bypasses rules, so we
            # additionally fold `meta` into a subcollection audit record.
            ref = col.document(entry['id'])
            doc_with_ts = {**entry['body'], 'createdAt': firestore.SERVER_TIMESTAMP}
            batch.set(ref, doc_with_ts)
            # Audit meta in a separate admin-only collection.
            meta_ref = db.collection('facultyReviewsMeta').document(entry['id'])
            batch.set(meta_ref, {**entry['meta'], 'createdAt': firestore.SERVER_TIMESTAMP})
        batch.commit()
        written += len(chunk)
        print(f'   wrote {written}/{len(docs)}')
    return written


def main():
    ap = argparse.ArgumentParser(description='Seed facultyReviews from a JSONL file.')
    ap.add_argument('input', type=Path, help='Path to input_reviews.jsonl')
    ap.add_argument('--dry-run', action='store_true',
                    help='Validate and print — do not write to Firestore.')
    args = ap.parse_args()

    if not args.input.exists():
        print(f'  ✖ Input file not found: {args.input}', file=sys.stderr)
        sys.exit(1)

    rows  = load_rows(args.input)
    valid = []
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

    confirm = input(f'Write {len(valid)} reviews to Firestore project {PROJECT_ID!r}? [y/N] ')
    if confirm.strip().lower() != 'y':
        print('   aborted.')
        return

    written = write_to_firestore(valid)
    print(f'✅ Seeded {written} reviews.')


if __name__ == '__main__':
    main()
