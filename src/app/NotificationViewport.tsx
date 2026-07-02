// src/app/NotificationViewport.tsx
//
// Renders the NotificationProvider's items as accessible toasts (#311). The
// provider owns all behavior — ids, per-kind auto-dismiss timers, sticky
// errors — this component only maps state to DOM. The viewport region is
// always mounted (even when empty) so screen readers treat toast insertions
// as live-region updates; success/info/warning announce politely via
// role="status", errors assertively via role="alert" and stay until
// dismissed (their durationMs is null by design).

import { useNotifications } from '../state/NotificationProvider';
import type { Notification } from '../state/notifications';

function toastRole(notification: Notification): 'alert' | 'status' {
  return notification.kind === 'error' ? 'alert' : 'status';
}

export function NotificationViewport() {
  const { items, dismiss } = useNotifications();

  return (
    <div className="shell-toast-viewport" aria-label="Notifications">
      {items.map((notification) => (
        <div
          key={notification.id}
          role={toastRole(notification)}
          className={`shell-toast shell-toast--${notification.kind}`}
        >
          <span className="shell-toast-message">{notification.message}</span>
          <button
            type="button"
            className="shell-toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismiss(notification.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default NotificationViewport;
