# Seed Data

This folder contains source datasets used by the bundle and admin seed scripts.

- `faculty_profiles.jsonl` is injected into the public faculty directory by `build3.py`.
- `input_reviews.jsonl` is injected into the public review cache by `build3.py` and can also be imported into Firestore with `scripts/seed_reviews.py`.

Generated scrape outputs and local service account files stay out of git.
