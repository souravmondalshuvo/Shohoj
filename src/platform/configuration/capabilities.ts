// src/platform/configuration/capabilities.ts
//
// Runtime capabilities derived from validated config (Phase 3). The shell asks
// "can I use cloud features?" rather than poking at raw config globals, so a
// fork/PR with placeholder config (or a Firebase outage) cleanly renders the
// offline-but-working experience. Pure — derived via the Phase 2 runtime-config
// boundary; unit-tested.

import { readRuntimeConfig } from './runtimeConfig.ts';

export interface Capabilities {
  /** Firebase/cloud config is present and valid (auth, sync, reviews, papers). */
  readonly cloud: boolean;
}

export const OFFLINE_CAPABILITIES: Capabilities = { cloud: false };

/** Derive capabilities from raw runtime config. Invalid/placeholder → offline. */
export function deriveCapabilities(rawConfig: unknown): Capabilities {
  return { cloud: readRuntimeConfig(rawConfig).ok };
}
