// One-off CLI: flip the custom "admin" claim on a Firebase user.
//
// Setup
//   1. npm install
//   2. Firebase Console → Project settings → Service accounts → Generate new
//      private key. Save the downloaded JSON at the repo root as
//      shohoj-service-account.json (already in .gitignore).
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
import admin from 'firebase-admin';

const here = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(here, '..', 'shohoj-service-account.json');

const [, , uid, ...flags] = process.argv;
if (!uid) {
  console.error('Usage: npm run set:admin -- <uid> [--revoke]');
  process.exit(1);
}
const revoke = flags.includes('--revoke');

let serviceAccount;
try {
  serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error(`Could not read ${serviceAccountPath}`);
  console.error('See setup instructions at the top of this file.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const claims = revoke ? { admin: false } : { admin: true };
await admin.auth().setCustomUserClaims(uid, claims);
console.log(`${revoke ? 'Revoked' : 'Granted'} admin claim for uid=${uid}`);
console.log('User must sign out and sign back in for the claim to take effect.');
process.exit(0);
