// src/state/NotificationProvider.tsx
//
// Phase 4 React layer over the pure notification model in
// `src/state/notifications.ts`. This is where the impure concerns the pure
// reducer deliberately excludes finally live: a React context + hook, stable
// id generation, the wall clock, and auto-dismiss timers. The reducer stays
// the single source of truth for *what* the state is; this provider only owns
// *when* things happen. It replaces the ad-hoc `window._shohoj_showToast`
// global (see docs/FULL_REACT_TYPESCRIPT_MIGRATION.md §4).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { createNotification, initialNotificationState, notificationReducer } from './notifications';
import type { Notification, NotificationInput } from './notifications';

export interface NotificationApi {
  /** Current toasts, oldest first (render order). */
  readonly items: readonly Notification[];
  /** Show a toast. Returns its id so callers can dismiss it early. */
  notify(input: NotificationInput): string;
  /** Remove a toast by id (no-op if already gone). */
  dismiss(id: string): void;
  /** Remove every toast. */
  clear(): void;
}

const NotificationContext = createContext<NotificationApi | null>(null);

/** Stable unique id; `crypto.randomUUID` in browsers, counter fallback otherwise. */
function makeIdFactory(): () => string {
  let counter = 0;
  return () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    counter += 1;
    return `n_${Date.now().toString(36)}_${counter}`;
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, initialNotificationState);

  // Pending auto-dismiss timers, keyed by notification id, so we can cancel
  // them on early dismiss/clear/unmount and never fire against a stale toast.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const nextId = useRef(makeIdFactory());

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      dispatch({ type: 'dismiss', id });
    },
    [clearTimer],
  );

  const clear = useCallback(() => {
    for (const handle of timers.current.values()) clearTimeout(handle);
    timers.current.clear();
    dispatch({ type: 'clear' });
  }, []);

  const notify = useCallback(
    (input: NotificationInput): string => {
      const notification = createNotification(input, { id: nextId.current(), now: Date.now() });
      dispatch({ type: 'push', notification });

      if (notification.durationMs !== null) {
        clearTimer(notification.id); // guard against id reuse
        const handle = setTimeout(() => {
          timers.current.delete(notification.id);
          dispatch({ type: 'dismiss', id: notification.id });
        }, notification.durationMs);
        timers.current.set(notification.id, handle);
      }

      return notification.id;
    },
    [clearTimer],
  );

  // Cancel every outstanding timer when the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const handle of pending.values()) clearTimeout(handle);
      pending.clear();
    };
  }, []);

  const api = useMemo<NotificationApi>(
    () => ({ items: state.items, notify, dismiss, clear }),
    [state.items, notify, dismiss, clear],
  );

  return <NotificationContext.Provider value={api}>{children}</NotificationContext.Provider>;
}

/** Access the notification API. Throws if used outside a NotificationProvider. */
export function useNotifications(): NotificationApi {
  const api = useContext(NotificationContext);
  if (api === null) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return api;
}
