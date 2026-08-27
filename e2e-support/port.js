// e2e-support/port.js
//
// A port that will not collide with another checkout's test run.
//
// Every Playwright config here pins a fixed port, which is fine for one
// checkout and actively harmful for several. This repo is worked through git
// worktrees, and two of them running the same suite at once both wanted 4175:
// with `reuseExistingServer` the second run silently ADOPTED the first's
// server and tested a completely different build, reporting dozens of failures
// that every one of them passed in isolation. Without reuse it fails loudly
// instead, which is better but still blocks.
//
// Neither is necessary. The runs only need different ports, and the checkout
// path is already unique, so derive the offset from it.
//
// CI keeps the base ports exactly: one checkout, no collisions, and a
// deterministic number is easier to read in a workflow file. An explicit
// environment variable always wins, so anything that needs to pin a port still
// can.

import { createHash } from 'node:crypto';

/** Distinct blocks of 100, so the six base ports never overlap between runs. */
const BLOCK = 100;
const BLOCKS = 16;

/**
 * @param {number} base   The suite's canonical port, e.g. 4175.
 * @param {string} envVar Name of the variable that pins it explicitly.
 */
export function portFor(base, envVar) {
  const pinned = process.env[envVar];
  if (pinned) return Number(pinned);
  if (process.env.CI) return base;
  const digest = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 8);
  return base + (parseInt(digest, 16) % BLOCKS) * BLOCK;
}
