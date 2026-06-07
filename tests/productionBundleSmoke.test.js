/**
 * tests/productionBundleSmoke.test.js
 * Browser smoke test for the generated production bundle.
 *
 * Run `python3 build3.py` first. This test serves `shohoj.html`, opens it in
 * Chromium, loads demo mode, and fails on uncaught runtime errors.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundlePath = path.join(repoRoot, 'shohoj.html');

const firebaseStubs = {
  'firebase-app.js': `
    export function initializeApp(config) {
      return { config };
    }
  `,
  'firebase-app-check.js': `
    export class ReCaptchaV3Provider {
      constructor(siteKey) { this.siteKey = siteKey; }
    }
    export function initializeAppCheck() {
      return {};
    }
  `,
  'firebase-auth.js': `
    export class GoogleAuthProvider {
      setCustomParameters() {}
    }
    export function getAuth() {
      return {};
    }
    export function onAuthStateChanged(_auth, callback) {
      setTimeout(() => callback(null), 0);
      return () => {};
    }
    export async function signInWithPopup() {
      return { user: null };
    }
    export async function signOut() {}
  `,
  'firebase-firestore.js': `
    function emptySnapshot() {
      return { docs: [], empty: true, forEach() {} };
    }
    function ref(type, args) {
      return { type, args };
    }
    export async function addDoc() {
      return ref('doc', []);
    }
    export function collection(...args) {
      return ref('collection', args);
    }
    export async function deleteDoc() {}
    export function doc(...args) {
      return ref('doc', args);
    }
    export function documentId() {
      return '__documentId__';
    }
    export async function getDoc() {
      return { exists: () => false, data: () => undefined };
    }
    export async function getDocs() {
      return emptySnapshot();
    }
    export function getFirestore() {
      return {};
    }
    export function limit(...args) {
      return ref('limit', args);
    }
    export function onSnapshot(...args) {
      const callback = args.find(arg => typeof arg === 'function');
      if (callback) setTimeout(() => callback(emptySnapshot()), 0);
      return () => {};
    }
    export function orderBy(...args) {
      return ref('orderBy', args);
    }
    export function query(...args) {
      return ref('query', args);
    }
    export function serverTimestamp() {
      return new Date();
    }
    export async function setDoc() {}
    export function startAfter(...args) {
      return ref('startAfter', args);
    }
    export function where(...args) {
      return ref('where', args);
    }
  `,
};

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function createServer() {
  return http.createServer((req, res) => {
    const requestPath = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    const relativePath = requestPath === '/' ? 'shohoj.html' : requestPath.slice(1);
    const filePath = path.join(repoRoot, relativePath);

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'content-type': contentTypeFor(filePath) });
      res.end(data);
    });
  });
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

async function closeServer(server) {
  await new Promise(resolve => server.close(resolve));
}

function externalScriptFor(url) {
  const firebaseName = Object.keys(firebaseStubs).find(name => url.endsWith(`/${name}`));
  if (firebaseName) return firebaseStubs[firebaseName];

  // Match on the parsed host (not a substring), so e.g. "evil.com/google.com"
  // can't be mistaken for a Google host. Every non-firebase branch stubs to ''.
  let host = '';
  let path = '';
  try { const u = new URL(url); host = u.hostname; path = u.pathname; } catch {}
  const hostIs = (h) => host === h || host.endsWith(`.${h}`);

  if (hostIs('cdnjs.cloudflare.com')) return '';
  if (
    hostIs('googletagmanager.com') ||
    hostIs('google-analytics.com') ||
    (hostIs('google.com') && path.startsWith('/recaptcha'))
  ) {
    return '';
  }

  return '';
}

const expectedFirebaseConfigError = '[Shohoj] Firebase config missing or incomplete';

// Keep this list narrow so new broken scripts/assets still fail the bundle smoke test.
const ignoredConsoleErrors = [
  {
    name: 'meta-csp-frame-ancestors',
    match: "The Content Security Policy directive 'frame-ancestors'",
  },
  {
    name: 'stubbed-cdn-script-integrity',
    match: 'Failed to find a valid digest',
  },
  {
    name: 'missing-firebase-config',
    match: expectedFirebaseConfigError,
  },
];

function ignoredConsoleErrorFor(text) {
  return ignoredConsoleErrors.find(({ match }) => text.includes(match));
}

async function installExternalStubs(page) {
  await page.route('https://**/*', route => {
    const body = externalScriptFor(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body,
    });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();

    class FakePdf {
      addImage() {}
      addPage() {}
      line() {}
      rect() {}
      roundedRect() {}
      save() { window.__shohojPdfSaved = true; }
      setDrawColor() {}
      setFillColor() {}
      setFont() {}
      setFontSize() {}
      setLineWidth() {}
      setTextColor() {}
      text() {}
    }

    window.dataLayer = [];
    window.gtag = () => {};
    window.jspdf = { jsPDF: FakePdf };
    window.pdfjsLib = window.pdfjsLib || {};
    window.Chart = window.Chart || class { destroy() {} };
  });
}

async function run() {
  if (!fs.existsSync(bundlePath)) {
    throw new Error('shohoj.html is missing. Run `python3 build3.py` before this smoke test.');
  }

  const server = createServer();
  const port = await listen(server);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];

  page.on('pageerror', error => {
    pageErrors.push(error.stack || error.message);
  });

  page.on('console', message => {
    const text = message.text();
    if (message.type() !== 'error') return;

    const ignoredError = ignoredConsoleErrorFor(text);
    if (ignoredError) {
      return;
    }

    pageErrors.push(`console error: ${text}`);
  });

  try {
    await installExternalStubs(page);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

    await expect(page.locator('#heroDemoBtn')).toBeVisible();
    await page.locator('#heroDemoBtn').click();

    await expect(page.locator('#cgpaVal')).toHaveText('3.50');
    await expect(page.locator('#course-input-0-0')).toHaveValue(/CSE110/);
    await expect(page.locator('#course-input-1-1')).toHaveValue(/CSE220/);

    if (pageErrors.length > 0) {
      throw new Error(`Production bundle emitted runtime errors:\n${pageErrors.join('\n\n')}`);
    }

    console.log('Production bundle smoke passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
