// One-off migration: stamp `university` on documents written before campus
// tenancy existed.
//
// WHY THIS IS NEEDED
//
// firestore.rules tolerates a missing `university`: docCampus() defaults it to
// 'bracu', which is correct, because the app served no other campus before
// tenancy. Reads therefore work today.
//
// Queries do not get that courtesy. Firestore evaluates a list operation
// against its potential result set, so scoping a query means adding
//   where('university', '==', campus)
// and that clause does NOT match a document where the field is absent. It is
// not a null comparison — the document is simply not in the index for that
// field. Ship the filter before this migration and every pre-tenancy review,
// group, paper and post disappears for BRACU students, while the rules go on
// happily permitting reads nobody is asking for any more.
//
// So: run this, verify it reports zero remaining, and only then add the query
// filters.
//
// Setup
//   Same service-account key as scripts/set_admin_claim.js — located, in order:
//     a. $GOOGLE_APPLICATION_CREDENTIALS, if set
//     b. ~/.config/shohoj/shohoj-service-account.json (recommended)
//     c. repo-root shohoj-service-account.json (legacy; gitignored)
//
// Usage
//   npm run backfill:campus                      # dry run — counts, no writes
//   npm run backfill:campus -- --apply           # perform the writes
//   npm run backfill:campus -- --collection=papers --apply
//
// The dry run is the default on purpose: this writes to production data, and
// the cost of an accidental run is higher than the cost of typing --apply.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Collections whose read rule is `isCampusUser() && campusMatches(resource)`,
 * and which therefore need the field before a query can filter on it.
 *
 * studyGroupMembers is deliberately absent: it scopes by uid and by group
 * membership, never by campus, so stamping it would add a field nothing reads.
 */
export const CAMPUS_COLLECTIONS = Object.freeze([
  'facultyReviews',
  'facultyProfiles',
  'appFeedback',
  'papers',
  'studyGroups',
  'lostFoundPosts',
]);

/**
 * The campus every pre-tenancy document belongs to.
 *
 * Not a parameter. Documents without the field predate tenancy by definition,
 * and during that whole period sign-in was gated on @g.bracu.ac.bd — so their
 * campus is a fact about history, not a choice this script gets to make. The
 * same constant appears as the read-side default in firestore.rules docCampus().
 */
export const LEGACY_CAMPUS = 'bracu';

/** Firestore's hard cap on writes in a single batch. */
const BATCH_LIMIT = 500;

/**
 * Stamp one collection, a page at a time.
 *
 * Idempotent and resumable for the same reason: it only ever writes to
 * documents that lack the field, so a document already stamped — by an earlier
 * run, by the Worker, or as 'nsu' by a live NSU student — is skipped rather
 * than rewritten. Interrupting the script therefore costs only the work in
 * flight; re-running picks up exactly what is left.
 *
 * Paginates by document id rather than holding the whole collection in memory,
 * and re-reads from the last id each page. There is no "where field is
 * missing" query in Firestore, so every document must be looked at even though
 * only some are written.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string} name Collection to scan.
 * @param {{ apply?: boolean, pageSize?: number, campus?: string }} [options]
 * @returns {Promise<{scanned: number, stamped: number, alreadyStamped: number}>}
 */
export async function backfillCollection(db, name, options = {}) {
  const { apply = false, pageSize = 300, campus = LEGACY_CAMPUS } = options;
  const collection = db.collection(name);

  let scanned = 0;
  let stamped = 0;
  let alreadyStamped = 0;
  let cursor = null;

  for (;;) {
    let query = collection.orderBy('__name__').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    const needsStamp = [];
    for (const doc of page.docs) {
      scanned += 1;
      // `in` on the raw data, not a truthiness check: an empty-string campus
      // would be wrong data to preserve, but it is still a decision somebody
      // made, and silently overwriting it would hide that.
      if ('university' in doc.data()) alreadyStamped += 1;
      else needsStamp.push(doc.ref);
    }

    if (apply) {
      for (let i = 0; i < needsStamp.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const ref of needsStamp.slice(i, i + BATCH_LIMIT)) {
          batch.update(ref, { university: campus });
        }
        await batch.commit();
      }
    }
    stamped += needsStamp.length;

    cursor = page.docs[page.docs.length - 1];
    if (page.size < pageSize) break;
  }

  return { scanned, stamped, alreadyStamped };
}

/** Run every collection in turn, returning a per-collection report. */
export async function backfillAll(db, options = {}) {
  const { collections = CAMPUS_COLLECTIONS, onResult, ...rest } = options;
  const report = {};
  for (const name of collections) {
    report[name] = await backfillCollection(db, name, rest);
    onResult?.(name, report[name]);
  }
  return report;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Skipped when imported, so the test suite can drive the functions above
// against the emulator without the script trying to reach production.

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS
    || resolve(homedir(), '.config', 'shohoj', 'shohoj-service-account.json');
  const legacyKeyPath = resolve(here, '..', 'shohoj-service-account.json');

  const flags = process.argv.slice(2);
  const apply = flags.includes('--apply');
  const only = flags.find((f) => f.startsWith('--collection='))?.split('=')[1];

  if (only && !CAMPUS_COLLECTIONS.includes(only)) {
    console.error(`Unknown collection "${only}". Known: ${CAMPUS_COLLECTIONS.join(', ')}`);
    process.exit(1);
  }

  const { default: admin } = await import('firebase-admin');

  async function loadServiceAccount() {
    for (const path of [keyPath, legacyKeyPath]) {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        // Try the next candidate path.
      }
    }
    return null;
  }

  const serviceAccount = await loadServiceAccount();
  if (!serviceAccount) {
    console.error(`Could not read a service-account key (tried ${keyPath} and ${legacyKeyPath}).`);
    console.error('See setup instructions at the top of this file.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(
    apply
      ? `Stamping university="${LEGACY_CAMPUS}" on documents that lack it.`
      : 'DRY RUN — counting only, no writes. Re-run with --apply to write.',
  );
  console.log(`Project: ${serviceAccount.project_id}\n`);

  const report = await backfillAll(db, {
    apply,
    collections: only ? [only] : CAMPUS_COLLECTIONS,
    onResult: (name, r) => {
      const verb = apply ? 'stamped' : 'would stamp';
      console.log(
        `${name.padEnd(16)} scanned ${String(r.scanned).padStart(6)}`
          + `  ${verb} ${String(r.stamped).padStart(6)}`
          + `  already ${String(r.alreadyStamped).padStart(6)}`,
      );
    },
  });

  const remaining = Object.values(report).reduce((sum, r) => sum + r.stamped, 0);
  console.log('');
  if (apply) {
    console.log(`Done. ${remaining} document(s) stamped.`);
    console.log('Re-run without --apply; a clean migration reports 0 remaining.');
  } else {
    console.log(`${remaining} document(s) would be stamped. Re-run with --apply to write.`);
  }
  process.exit(0);
}
