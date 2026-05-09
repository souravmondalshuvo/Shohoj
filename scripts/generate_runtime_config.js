// Local-dev helper: read .env.local and write js/config/runtime-config.js
// from the template, the same way the CD workflow does in production.
//
// Setup
//   1. cp .env.example .env.local
//   2. Fill in values from Firebase Console → Project settings.
//
// Usage
//   npm run config:local
//
// The generated runtime-config.js is gitignored. Re-run this script any
// time you update .env.local — there is no watcher.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const envPath = resolve(repoRoot, '.env.local');
const templatePath = resolve(repoRoot, 'js/config/runtime-config.template.js');
const outputPath = resolve(repoRoot, 'js/config/runtime-config.js');

const REQUIRED_KEYS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'GA_MEASUREMENT_ID',
  'PAPERS_WORKER_URL',
  'RECAPTCHA_V3_SITE_KEY',
];

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

let envText;
try {
  envText = await readFile(envPath, 'utf8');
} catch (err) {
  console.error(`Could not read ${envPath}`);
  console.error('Copy .env.example to .env.local and fill in your Firebase values.');
  process.exit(1);
}

const env = parseEnv(envText);
const missing = REQUIRED_KEYS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing values in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

let output = await readFile(templatePath, 'utf8');
for (const key of REQUIRED_KEYS) {
  output = output.split(`__${key}__`).join(env[key]);
}

await writeFile(outputPath, output, 'utf8');
console.log(`Wrote ${outputPath}`);
