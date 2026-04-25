#!/usr/bin/env python3
"""
rename_faculty_initials.py — migrate a faculty member's initials in Firestore.

Use case: a faculty profile already has reviews under the OLD initials but the
faculty (or admins) have decided to use NEW initials going forward. This script
rewrites:

  1. facultyReviews    : updates `facultyInitials` field on every doc that
                         currently equals OLD. Doc IDs are kept as-is so any
                         reviewReports docs (`{uid}_{reviewId}`) stay valid.
  2. facultyProfiles   : copies facultyProfiles/{OLD} → facultyProfiles/{NEW}
                         (with `initials` field rewritten), then deletes the
                         old doc. Refuses to overwrite an existing NEW profile
                         unless --force is passed.
  3. facultyReviewsMeta: optional sibling collection. Touched only if it exists
                         and the corresponding review doc was migrated — meta
                         doc IDs match review doc IDs, so no data motion is
                         needed; it is left alone.

Usage:
    # Dry-run (recommended first):
    python3 scripts/rename_faculty_initials.py --from MTF --to MAHR --dry-run

    # Actual migration (requires GOOGLE_APPLICATION_CREDENTIALS):
    export GOOGLE_APPLICATION_CREDENTIALS=./shohoj-service-account.json
    python3 scripts/rename_faculty_initials.py --from MTF --to MAHR

Dependencies:
    pip install firebase-admin
"""

import argparse
import os
import re
import sys

PROJECT_ID         = 'shohoj'
REVIEWS_COLLECTION = 'facultyReviews'
PROFILE_COLLECTION = 'facultyProfiles'
INITIALS_RE        = re.compile(r'^[A-Z]{2,6}$')


def _normalize(raw):
    return re.sub(r'[^A-Z]', '', str(raw or '').strip().upper())[:6]


def _connect():
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

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {'projectId': PROJECT_ID})
    return firestore.client()


def _migrate_reviews(db, old, new, dry_run):
    """Update facultyInitials field on every review doc currently equal to OLD."""
    col = db.collection(REVIEWS_COLLECTION)
    docs = list(col.where('facultyInitials', '==', old).stream())
    print(f'   facultyReviews matching {old!r}: {len(docs)}')
    if not docs:
        return 0

    if dry_run:
        for d in docs[:5]:
            print(f'     would update {d.id}')
        if len(docs) > 5:
            print(f'     … and {len(docs) - 5} more')
        return len(docs)

    written = 0
    BATCH_SIZE = 400
    for start in range(0, len(docs), BATCH_SIZE):
        chunk = docs[start:start + BATCH_SIZE]
        batch = db.batch()
        for d in chunk:
            batch.update(d.reference, {'facultyInitials': new})
        batch.commit()
        written += len(chunk)
        print(f'     updated {written}/{len(docs)}')
    return written


def _migrate_profile(db, old, new, dry_run, force):
    """Copy facultyProfiles/{old} → facultyProfiles/{new}, then delete old."""
    col      = db.collection(PROFILE_COLLECTION)
    old_ref  = col.document(old)
    new_ref  = col.document(new)
    old_snap = old_ref.get()
    new_snap = new_ref.get()

    if not old_snap.exists:
        print(f'   facultyProfiles/{old}: not found (nothing to migrate)')
        return False

    if new_snap.exists and not force:
        print(f'  ✖ facultyProfiles/{new} already exists. Pass --force to overwrite.', file=sys.stderr)
        sys.exit(3)

    body = old_snap.to_dict() or {}
    body['initials'] = new

    if dry_run:
        print(f'   would copy facultyProfiles/{old} → facultyProfiles/{new}')
        print(f'   would delete facultyProfiles/{old}')
        return True

    batch = db.batch()
    batch.set(new_ref, body, merge=True)
    batch.delete(old_ref)
    batch.commit()
    print(f'   copied facultyProfiles/{old} → facultyProfiles/{new}, old deleted')
    return True


def main():
    ap = argparse.ArgumentParser(description='Rename a faculty member\'s initials across Firestore.')
    ap.add_argument('--from', dest='old', required=True, help='Current initials (e.g. MTF)')
    ap.add_argument('--to',   dest='new', required=True, help='New initials (e.g. MAHR)')
    ap.add_argument('--dry-run', action='store_true', help='Print what would change, do not write.')
    ap.add_argument('--force',   action='store_true', help='Overwrite an existing profile at the new initials.')
    args = ap.parse_args()

    old = _normalize(args.old)
    new = _normalize(args.new)
    if not (INITIALS_RE.match(old) and INITIALS_RE.match(new)):
        print(f'  ✖ initials must be 2–6 uppercase letters (got from={old!r} to={new!r})', file=sys.stderr)
        sys.exit(1)
    if old == new:
        print('  ✖ --from and --to must differ', file=sys.stderr)
        sys.exit(1)

    print(f'   project: {PROJECT_ID}')
    print(f'   from:    {old}')
    print(f'   to:      {new}')
    print(f'   mode:    {"DRY RUN" if args.dry_run else "WRITE"}')

    db = _connect()

    if not args.dry_run:
        confirm = input(f'Rename initials {old} → {new} in project {PROJECT_ID!r}? [y/N] ')
        if confirm.strip().lower() != 'y':
            print('   aborted.')
            return

    review_count = _migrate_reviews(db, old, new, args.dry_run)
    profile_done = _migrate_profile(db, old, new, args.dry_run, args.force)

    verb = 'would migrate' if args.dry_run else 'migrated'
    print(f'✅ {verb} {review_count} review(s) and {1 if profile_done else 0} profile.')


if __name__ == '__main__':
    main()
