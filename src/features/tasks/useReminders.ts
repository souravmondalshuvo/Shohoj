// src/features/tasks/useReminders.ts
//
// Reminders for one task (#729).
//
// Per-task rather than all-at-once, unlike assessments: reminders are only ever
// read inside an open task detail panel, and a student has at most a handful.
// Fetching everybody's on a screen that shows one task's would be work done for
// nothing.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiClient } from '../../platform/api/apiClient.ts';
import {
  type Reminder,
  type ReminderChannel,
  addReminder as apiAdd,
  listReminders,
  removeReminder as apiRemove,
} from '../../platform/api/tasks.ts';

export interface RemindersState {
  readonly items: readonly Reminder[];
  readonly loading: boolean;
  readonly add: (offsetMinutes: number, channel?: ReminderChannel) => Promise<string | null>;
  readonly remove: (id: string) => Promise<string | null>;
}

const EMPTY: readonly Reminder[] = [];

/** `taskId` null means no task is open — nothing is fetched. */
export function useReminders(client: ApiClient | null, taskId: string | null): RemindersState {
  const [items, setItems] = useState<readonly Reminder[]>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (client === null || taskId === null) {
      setItems(EMPTY);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    void listReminders(client, taskId, { signal: controller.signal }).then((result) => {
      if (cancelled) return;
      // A failed read shows no reminders rather than an error. The panel's job
      // is the task; reminders are an affordance on it, and a red box here
      // would be louder than the thing it is attached to.
      setItems(result.ok ? result.value : EMPTY);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, taskId, attempt]);

  const add = useCallback(
    async (offsetMinutes: number, channel: ReminderChannel = 'EMAIL') => {
      if (client === null || taskId === null) return null;
      const result = await apiAdd(client, taskId, { offsetMinutes, channel });
      if (!result.ok) return result.error.userMessage;
      setAttempt((n) => n + 1);
      return null;
    },
    [client, taskId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (client === null || taskId === null) return null;
      const result = await apiRemove(client, taskId, id);
      if (!result.ok) return result.error.userMessage;
      setAttempt((n) => n + 1);
      return null;
    },
    [client, taskId],
  );

  return useMemo(() => ({ items, loading, add, remove }), [items, loading, add, remove]);
}
