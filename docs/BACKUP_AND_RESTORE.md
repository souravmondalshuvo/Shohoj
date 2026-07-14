# Backup & restore

Honest statement up front:

> **Git does not back up user data.** The repository versions code, Firestore
> *rules*, and *indexes* — not the contents of Firestore or R2. If the `shohoj`
> Firestore database or the `shohoj-papers` R2 bucket were lost today, source
> control would not bring the user data back.

This document describes what to protect, how, and how to restore — appropriately
scoped for a student project. Some of it is **configuration guidance**, not
automation, because the automation needs platform settings/credentials that only
an administrator can provision.

## What needs protecting

| Data | System | Backed up by git? | Backup mechanism |
|---|---|---|---|
| Firestore **rules** & **indexes** | Firestore | ✅ yes (`firestore.rules`, `firestore.indexes.json`) | git history + `deploy-firestore` |
| Firestore **user data** (users, reviews, watches, reports…) | Firestore | ❌ no | scheduled export (below) |
| Past-paper **files** | R2 (`shohoj-papers`) | ❌ no | R2 versioning / lifecycle (below) |
| Runtime config | (generated) | ❌ (secrets in GitHub) | recreate from secrets |

## Firestore user-data backups (recommended setup)

Firestore supports **scheduled exports** to a Cloud Storage bucket. This is the
primary backup for user data.

- **Destination:** a dedicated GCS bucket (e.g. `gs://shohoj-firestore-backups`)
  in the same project/region. Do **not** reuse an app bucket.
- **Schedule:** daily is reasonable for this project; use
  `gcloud firestore export` on a Cloud Scheduler trigger, or Firestore's managed
  **scheduled backups** (Console → Firestore → Backups) if available on the plan.
- **Retention:** keep ~7 daily + ~4 weekly copies; expire the rest with a bucket
  lifecycle rule to control cost.
- **Access:** lock the bucket down (no public access); only the service account
  and project owners can read it.

> An automated backup **workflow is intentionally not added here** because it
> requires GCP credentials/permissions this repo does not assume. Set up the
> managed scheduled backup in the Console, or wire a Cloud Scheduler + export job
> in the Firebase/GCP project. Document the chosen destination here once it
> exists.

## R2 (past-paper files) protection

- Enable **object versioning** and/or a lifecycle policy on `shohoj-papers` so an
  overwrite/delete is recoverable.
- Consider a periodic copy to a second bucket for a project of higher stakes;
  for now, versioning + the fact that files also have Firestore metadata is a
  reasonable floor.

## Restoring

**Always restore into a *staging* project first, verify, then decide.** Never
restore a data backup directly over production — a bad or stale backup can do
more damage than the incident.

1. Create/point at a **separate** staging Firebase project (see
   [ENVIRONMENTS.md](ENVIRONMENTS.md)).
2. Import the export: `gcloud firestore import gs://…/<export-path>
   --project shohoj-staging`.
3. Verify integrity (below) against the staging app.
4. Only after verification, plan the production restore with a maintenance
   window; expect writes made after the backup's timestamp to be lost.

Rules/indexes restore is separate and safe — see [ROLLBACK.md](ROLLBACK.md) §3.
It never touches user data.

## Verifying backup integrity

- Confirm the export completed (non-empty, expected collection prefixes present).
- Periodically do a **test restore into staging** and spot-check a few documents
  (a user doc, a review, a seat watch) — an untested backup is a hope, not a
  backup.
- Record the last successful backup + last successful test-restore date.

## Recovery objectives (suggested, student-project scale)

| Objective | Suggested target | Rationale |
|---|---|---|
| **RPO** (max acceptable data loss) | ≤ 24 h | daily export; reviews/watches are not financial data |
| **RTO** (max acceptable downtime) | ≤ 1 day | frontend/Worker/rules redeploy in minutes; data restore is the long pole |

## Responsibilities

The repository maintainer/owner is responsible for: provisioning the backup
destination, confirming backups run, periodically test-restoring into staging,
and keeping this document's "destination" and "last verified" notes current.
