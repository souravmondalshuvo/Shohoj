// tests/capabilities.test.js
//
// Covers runtime capability derivation (src/platform/configuration/capabilities.ts)
// that backs the shell's RuntimeConfigProvider.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCapabilities,
  OFFLINE_CAPABILITIES,
} from '../src/platform/configuration/capabilities.ts';

const COMPLETE = {
  firebase: {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
  },
  papersWorkerUrl: 'https://papers.example.com',
  recaptchaV3SiteKey: 'sitekey',
  googleClientId: 'client-id',
};

test('valid config → cloud capability on', () => {
  assert.deepEqual(deriveCapabilities(COMPLETE), { cloud: true });
});

test('empty/placeholder config → offline', () => {
  assert.deepEqual(deriveCapabilities({}), OFFLINE_CAPABILITIES);
  assert.deepEqual(deriveCapabilities(undefined), { cloud: false });
  assert.deepEqual(
    deriveCapabilities({ ...COMPLETE, papersWorkerUrl: '__PAPERS_WORKER_URL__' }),
    { cloud: false },
  );
});

console.log('capabilities tests passed');
