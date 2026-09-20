// src/app/providers/ApiProvider.tsx
//
// Mounts the Shohoj API client into the shell, and resolves the signed-in
// student's Shohoj user once per session (#710).
//
// Two things live here rather than in the features that need them:
//
//   * ONE CLIENT. Built from the validated runtime config and the auth
//     provider's token getter. A feature asking for a client gets this one, so
//     there is a single place the base URL and the bearer token are decided.
//     Offline shells (fork builds, placeholder config) get null and must handle
//     it — the same contract `useCapabilities().cloud` already sets.
//
//   * ONE USER RESOLUTION. `GET /api/v1/me` bootstraps the student's Shohoj
//     record on first call, so it must happen exactly once per sign-in rather
//     than per feature that wants the user id. Tasks, the dashboard and the
//     planner all need it; three independent fetches would mean three writes
//     racing to create the same record.
//
// This does NOT block rendering. Shohoj is offline-first: the calculator,
// planner and degree tracker work with no backend at all, and a shell that
// waited on an identity round trip before painting would throw that away for
// every student on a slow connection. Consumers read a status and decide for
// themselves — which for most of the app is "ignore it entirely".

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ShohojError } from '../../core/errors.ts';
import { type ApiClient, createApiClient } from '../../platform/api/apiClient.ts';
import { type ShohojUser, fetchShohojUser } from '../../platform/api/shohojUser.ts';
import { useAuth, useIdToken } from './AuthProvider';
import { useRuntimeConfig } from './RuntimeConfigProvider';

/**
 * Where the Shohoj user record stands.
 *
 * `idle` covers every reason there is nothing to fetch — signed out, still
 * resolving auth, or an offline build with no backend configured. Consumers
 * that only care whether they have a user id treat `idle` and `error` the same
 * way; consumers showing a state to the student need to tell them apart.
 */
export type ShohojUserStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ShohojUserState {
  readonly status: ShohojUserStatus;
  readonly user: ShohojUser | null;
  /** Typed failure carrying a displayable `userMessage`. Null unless `status` is `error`. */
  readonly error: ShohojError | null;
  /** Retry after a failure. Safe to call at any time; a no-op while loading. */
  readonly refresh: () => void;
}

interface ApiContextValue {
  readonly client: ApiClient | null;
  readonly shohojUser: ShohojUserState;
}

const ApiContext = createContext<ApiContextValue | null>(null);

declare global {
  interface Window {
    /**
     * e2e seam (the __shohoj* convention): an injected API client, so the Tasks
     * screens can be driven without a Worker or a Firebase session. Read only
     * when no client is passed as a prop.
     */
    __shohojApiClient?: ApiClient;
  }
}

export interface ApiProviderProps {
  readonly children: ReactNode;
  /**
   * Injectable client, for tests and the e2e seam. When given, the runtime
   * config is not consulted at all.
   */
  readonly client?: ApiClient | null;
}

export function ApiProvider({ children, client: injectedClient }: ApiProviderProps) {
  const config = useRuntimeConfig();
  const getIdToken = useIdToken();
  const { status: authStatus, uid } = useAuth();

  // Rebuilt only when the backend URL or the token getter changes, which is to
  // say almost never — a new client identity per render would restart the
  // effect below on every render.
  const client = useMemo<ApiClient | null>(() => {
    if (injectedClient !== undefined) return injectedClient;
    const injected = typeof window !== 'undefined' ? window.__shohojApiClient : undefined;
    if (injected !== undefined) return injected;
    if (config === null) return null;
    return createApiClient({ baseUrl: config.papersWorkerUrl, getIdToken });
  }, [injectedClient, config, getIdToken]);

  const [state, setState] = useState<Omit<ShohojUserState, 'refresh'>>({
    status: 'idle',
    user: null,
    error: null,
  });
  // Bumping this re-runs the effect; it is the whole implementation of refresh().
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // Keyed on uid, not merely on "authenticated": signing out and back in as
    // somebody else on a shared campus machine must not keep the first
    // student's record on screen.
    if (client === null || authStatus !== 'authenticated' || uid === null) {
      setState({ status: 'idle', user: null, error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading', user: null, error: null });

    void fetchShohojUser(client, { signal: controller.signal }).then((result) => {
      // StrictMode runs effects twice in development, and a student can sign
      // out mid-flight. Either way the late answer is discarded rather than
      // written over fresher state.
      if (cancelled) return;
      setState(
        result.ok
          ? { status: 'ready', user: result.value, error: null }
          : { status: 'error', user: null, error: result.error },
      );
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, authStatus, uid, attempt]);

  const value = useMemo<ApiContextValue>(
    () => ({ client, shohojUser: { ...state, refresh } }),
    [client, state, refresh],
  );

  return <ApiContext value={value}>{children}</ApiContext>;
}

function useApiContext(): ApiContextValue {
  const value = useContext(ApiContext);
  if (value === null) {
    throw new Error('useApiClient/useShohojUser must be used within <ApiProvider>');
  }
  return value;
}

/**
 * The shared API client, or null on an offline shell.
 *
 * Callers must handle null rather than asserting. An offline build is the
 * normal state of a fork and of every pull-request preview, and a feature that
 * throws there takes the whole route down with it.
 */
export function useApiClient(): ApiClient | null {
  return useApiContext().client;
}

/** The signed-in student's Shohoj user record and how its fetch is going. */
export function useShohojUser(): ShohojUserState {
  return useApiContext().shohojUser;
}

/**
 * The Shohoj user id, or null when there is not one yet.
 *
 * The common case by far: a feature needs the owner key for a record and has
 * nothing to say about loading or failure. Collapsing four states into
 * "have it / don't" keeps that call site to one line.
 */
export function useShohojUserId(): string | null {
  return useApiContext().shohojUser.user?.id ?? null;
}
