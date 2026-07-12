// tests/runtimeConfig.test.js
//
// Covers the typed runtime-config boundary
// (src/platform/configuration/runtimeConfig.ts): valid config, the fork/PR
// placeholder case, missing fields, URL validation, and the globals adapter.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readRuntimeConfig,
  hasCompleteConfig,
  runtimeConfigFromGlobals,
} from '../src/platform/configuration/runtimeConfig.ts';
import { isOk, isErr } from '../src/core/result.ts';
import { ConfigError } from '../src/core/errors.ts';

const COMPLETE = {
  firebase: {
    apiKey: 'AIzaKey',
    authDomain: 'shohoj.firebaseapp.com',
    projectId: 'shohoj',
    storageBucket: 'shohoj.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
    measurementId: 'G-XYZ',
  },
  papersWorkerUrl: 'https://papers.example.com',
  recaptchaV3SiteKey: 'sitekey',
  googleClientId: 'client-id',
};

// What an unconfigured fork / external PR sees from the template tokens.
const PLACEHOLDERS = {
  firebase: {
    apiKey: '__FIREBASE_API_KEY__',
    authDomain: '__FIREBASE_AUTH_DOMAIN__',
    projectId: '__FIREBASE_PROJECT_ID__',
    storageBucket: '__FIREBASE_STORAGE_BUCKET__',
    messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
    appId: '__FIREBASE_APP_ID__',
    measurementId: '__GA_MEASUREMENT_ID__',
  },
  papersWorkerUrl: '__PAPERS_WORKER_URL__',
  recaptchaV3SiteKey: '__RECAPTCHA_V3_SITE_KEY__',
  googleClientId: '__GOOGLE_OAUTH_CLIENT_ID__',
};

test('readRuntimeConfig: complete config validates to a typed value', () => {
  const result = readRuntimeConfig(COMPLETE);
  assert.ok(isOk(result));
  assert.equal(result.value.firebase.projectId, 'shohoj');
  assert.equal(result.value.papersWorkerUrl, 'https://papers.example.com');
  assert.equal(hasCompleteConfig(COMPLETE), true);
});

test('readRuntimeConfig: unreplaced placeholders are treated as missing (fork case)', () => {
  const result = readRuntimeConfig(PLACEHOLDERS);
  assert.ok(isErr(result));
  assert.ok(result.error instanceof ConfigError);
  assert.equal(result.error.code, 'config');
  // Safe, non-technical user message — no raw token / SDK text leaked.
  assert.equal(result.error.userMessage, 'This feature is unavailable due to a configuration problem.');
  assert.equal(hasCompleteConfig(PLACEHOLDERS), false);
});

test('readRuntimeConfig: missing field fails', () => {
  const rest = { ...COMPLETE };
  delete rest.firebase;
  const result = readRuntimeConfig(rest);
  assert.ok(isErr(result));
  assert.equal(result.error.code, 'config');
});

test('readRuntimeConfig: non-http papers URL fails', () => {
  const result = readRuntimeConfig({ ...COMPLETE, papersWorkerUrl: 'ftp://nope' });
  assert.ok(isErr(result));
});

test('readRuntimeConfig: blank required value fails', () => {
  const result = readRuntimeConfig({ ...COMPLETE, recaptchaV3SiteKey: '   ' });
  assert.ok(isErr(result));
});

test('googleClientId is optional — the blanked CD secret still validates', () => {
  // cd.yml blanks this optional secret when unset; that must disable only the
  // Google-OAuth extras, never the whole cloud config (#390).
  assert.ok(isOk(readRuntimeConfig({ ...COMPLETE, googleClientId: '' })));
  const absent = { ...COMPLETE };
  delete absent.googleClientId;
  assert.ok(isOk(readRuntimeConfig(absent)));
});

test('measurementId is optional — absent analytics id still validates', () => {
  const noGa = { ...COMPLETE, firebase: { ...COMPLETE.firebase } };
  delete noGa.firebase.measurementId;
  assert.ok(isOk(readRuntimeConfig(noGa)));
});

test('runtimeConfigFromGlobals: maps window._shohoj_* into the schema shape', () => {
  const raw = runtimeConfigFromGlobals({
    _shohoj_firebase_config: COMPLETE.firebase,
    _shohoj_papers_worker_url: COMPLETE.papersWorkerUrl,
    _shohoj_recaptcha_v3_site_key: COMPLETE.recaptchaV3SiteKey,
    _shohoj_google_client_id: COMPLETE.googleClientId,
  });
  assert.ok(isOk(readRuntimeConfig(raw)));
});

console.log('runtime-config boundary tests passed');
