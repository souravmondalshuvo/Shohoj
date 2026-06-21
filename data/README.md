# Seed Data

This folder contains source datasets used by the bundle and admin seed scripts.

- `faculty_profiles.jsonl` is injected into the public faculty directory by `build3.py`.
- `input_reviews.jsonl` is injected into the public review cache by `build3.py` and can also be imported into Firestore with `scripts/seed_reviews.py`.

Generated scrape outputs and local service account files stay out of git.

## Validate before you bundle or seed

`build3.py` trusts these files (it calls `round(rating)` with no guard, keys
faculty docs by `initials`, etc.), so run the validator after editing them:

```bash
npm run validate:data          # human report
npm run validate:data -- --strict   # warnings fail too (exit 1)
node scripts/validate_data.mjs --json   # machine-readable
```

It checks both files for duplicate/conflicting faculty, invalid course codes,
non-canonical department mappings, duplicate or orphaned reviews, ratings outside
1–5, missing required fields, and (when a `papers.jsonl` exists) invalid/oversized
paper metadata. **Errors** (build/rules-breaking) fail; **warnings** (data-quality)
and **info** (provenance gaps) don't, unless `--strict`. The rule functions are
unit-tested in `tests/validateData.test.js`.

> Privacy: faculty reviews are pseudonymous (no `uid` is stored). The validator
> never prints review `text` or anything author-identifying — findings reference
> line numbers and non-identifying fields (initials/course) only.

## Provenance

Each record should record where it came from:

- **reviews** carry a per-row `sourceUrl`.
- **faculty** rows may carry a `provenance` object or a `source` string.

The validator reports rows missing provenance as `info`. To stamp a placeholder
on rows that lack it (additive — existing lines are left byte-for-byte intact):

```bash
node scripts/validate_data.mjs --add-provenance --dry-run   # preview, no write
node scripts/validate_data.mjs --add-provenance             # write
```

The stamp is honestly marked `"source": "unverified-…-import"` — it records that
the origin is unknown rather than inventing one. Replace it with the real source
when known.

## Safe rollback for a bad import

These datasets are git-tracked, so a bad edit/import is always recoverable:

1. **Before re-importing**, confirm the tree is clean (`git status data/`) so you
   can distinguish your change.
2. **Local data file** — revert with `git checkout -- data/<file>.jsonl` (or
   `git restore data/<file>.jsonl`). If it was already committed, revert the
   commit: `git revert <sha>`.
3. **Rebuilt bundle** — `shohoj.html` is a build artifact (never committed); just
   re-run `python3 build3.py` after restoring the data.
4. **Firestore seed** (`scripts/seed_reviews.py` / `seed_faculty.py`) — writes use
   **deterministic doc IDs** (`{initials}_{course}_{sha256(...)}` for reviews,
   `initials` for faculty), so a re-import is idempotent and a bad batch can be
   undone by deleting exactly those IDs. Always dry-run first
   (`python3 scripts/seed_reviews.py data/input_reviews.jsonl --dry-run`) and
   validate (`npm run validate:data`) before writing.
