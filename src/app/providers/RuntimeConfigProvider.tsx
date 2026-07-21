// src/app/providers/RuntimeConfigProvider.tsx
//
// Exposes validated runtime config + derived capabilities to the shell (Phase 3).
// Reads raw config once (defaults to {} → offline), validates via the Phase 2
// runtime-config boundary, and surfaces a typed config (or null when invalid)
// plus capability flags. Components ask `useCapabilities().cloud` instead of
// touching window globals, so placeholder/fork config degrades gracefully.

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { readRuntimeConfig, type RuntimeConfig } from '../../platform/configuration/runtimeConfig';
import { deriveCapabilities, type Capabilities } from '../../platform/configuration/capabilities';

export interface RuntimeConfigValue {
  /** Validated config, or null when missing/placeholder/invalid. */
  readonly config: RuntimeConfig | null;
  readonly capabilities: Capabilities;
}

const RuntimeConfigContext = createContext<RuntimeConfigValue | null>(null);

export interface RuntimeConfigProviderProps {
  readonly children: ReactNode;
  /** Raw config (e.g. assembled from window._shohoj_*); defaults to offline. */
  readonly rawConfig?: unknown;
}

export function RuntimeConfigProvider({ children, rawConfig = {} }: RuntimeConfigProviderProps) {
  const value = useMemo<RuntimeConfigValue>(() => {
    const result = readRuntimeConfig(rawConfig);
    return {
      config: result.ok ? result.value : null,
      capabilities: deriveCapabilities(rawConfig),
    };
  }, [rawConfig]);

  return <RuntimeConfigContext value={value}>{children}</RuntimeConfigContext>;
}

function useRuntimeConfigValue(): RuntimeConfigValue {
  const value = useContext(RuntimeConfigContext);
  if (value === null) {
    throw new Error('useRuntimeConfig must be used within <RuntimeConfigProvider>');
  }
  return value;
}

/** Validated runtime config, or null when unavailable. */
export function useRuntimeConfig(): RuntimeConfig | null {
  return useRuntimeConfigValue().config;
}

/** Derived runtime capabilities (e.g. `cloud`). */
export function useCapabilities(): Capabilities {
  return useRuntimeConfigValue().capabilities;
}
