// One-off CLI: flip the custom "admin" claim on a Firebase user.
//
// Setup
//   1. npm install
//   2. Firebase Console → Project settings → Service accounts → Generate new
//      private key. Keep the downloaded JSON OUTSIDE the repo so the live
//      private key never sits in the working tree. The key is located, in order:
//        a. $GOOGLE_APPLICATION_CREDENTIALS, if set
//        b. ~/.config/shohoj/shohoj-service-account.json (recommended)
//        c. repo-root shohoj-service-account.json (legacy; gitignored)
//
// Usage
//   npm run set:admin -- <uid>            # grant admin
//   npm run set:admin -- <uid> --revoke   # remove admin
//
// After running, the affected user must sign out and back in (or wait up to
// an hour) before the new claim shows up in their ID token.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import admin from 'firebase-admin';

const here = dirname(fileURLToPath(import.meta.url));
// Prefer keys stored outside the repo; fall back to the legacy repo-root path
// so existing setups keep working.
const serviceAccountPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS
  || resolve(homedir(), '.config', 'shohoj', 'shohoj-service-account.json');
const legacyRepoKeyPath = resolve(here, '..', 'shohoj-service-account.json');

const [, , uid, ...flags] = process.argv;
if (!uid) {
  console.error('Usage: npm run set:admin -- <uid> [--revoke]');
  process.exit(1);
}
const revoke = flags.includes('--revoke');

async function loadServiceAccount() {
  for (const path of [serviceAccountPath, legacyRepoKeyPath]) {
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
  console.error(`Could not read a service-account key (tried ${serviceAccountPath} and ${legacyRepoKeyPath}).`);
  console.error('See setup instructions at the top of this file.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const claims = revoke ? { admin: false } : { admin: true };
await admin.auth().setCustomUserClaims(uid, claims);
console.log(`${revoke ? 'Revoked' : 'Granted'} admin claim for uid=${uid}`);
console.log('User must sign out and sign back in for the claim to take effect.');
process.exit(0);
