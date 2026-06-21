// src/state/notifications.ts
//
// Typed notification/toast model + pure reducer. This replaces the ad-hoc
// `window._shohoj_showToast` global (see docs/FULL_REACT_TYPESCRIPT_MIGRATION.md
// §4) with a single typed source of truth. The React provider/hook and the
// auto-dismiss timers are layered on top in Phase 4 — this module stays pure
// (no React, DOM, timers, or randomness) so it is trivially testable and
// reusable from services and domain code.

export type NotificationKind = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly message: string;
  /** Auto-dismiss delay in ms, or `null` for sticky (caller dismisses). */
  readonly durationMs: number | null;
  readonly createdAt: number;
}

/** Per-kind default auto-dismiss. Errors are sticky so they aren't missed. */
export const DEFAULT_DURATIONS: Readonly<Record<NotificationKind, number | null>> = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: null,
};

export interface NotificationInput {
  readonly kind: NotificationKind;
  readonly message: string;
  /** Override the per-kind default. `undefined` uses {@link DEFAULT_DURATIONS}. */
  readonly durationMs?: number | null;
}

export interface NotificationMeta {
  /** Stable unique id (provided by the React layer / a generator). */
  readonly id: string;
  /** Creation timestamp (provided so this module stays pure). */
  readonly now: number;
}

/** Build a Notification from input + externally-supplied id/now. */
export function createNotification(input: NotificationInput, meta: NotificationMeta): Notification {
  return {
    id: meta.id,
    kind: input.kind,
    message: input.message,
    durationMs: input.durationMs === undefined ? DEFAULT_DURATIONS[input.kind] : input.durationMs,
    createdAt: meta.now,
  };
}

export interface NotificationState {
  readonly items: readonly Notification[];
}

export const initialNotificationState: NotificationState = { items: [] };

export type NotificationAction =
  | { readonly type: 'push'; readonly notification: Notification }
  | { readonly type: 'dismiss'; readonly id: string }
  | { readonly type: 'clear' };

/** Pure reducer. Pushing an id that already exists replaces it (idempotent). */
export function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case 'push': {
      const without = state.items.filter((n) => n.id !== action.notification.id);
      return { items: [...without, action.notification] };
    }
    case 'dismiss':
      return { items: state.items.filter((n) => n.id !== action.id) };
    case 'clear':
      return initialNotificationState;
    default:
      // Exhaustiveness guard: a new action type becomes a compile error here.
      action satisfies never;
      return state;
  }
}
