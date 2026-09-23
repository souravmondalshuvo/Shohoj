// src/features/tasks/useCalendarFeed.ts
//
// The subscribable calendar feed, as state (#744).
//
// Fetched lazily — `enabled` is false until the student is actually looking at
// the calendar. A feed URL is a credential, and putting a request for one on
// every Tasks page load would mean most students' browsers ask for something
// they are not using, on a screen that never shows it.

import { useCallback, useEffect, useState } from 'react';

import type { ApiClient } from '../../platform/api/apiClient.ts';
import {
  type CalendarFeed,
  createCalendarFeed,
  deleteCalendarFeed,
  getCalendarFeed,
} from '../../platform/api/tasks.ts';

export interface CalendarFeedState {
  readonly feed: CalendarFeed | null;
  readonly loading: boolean;
  /** Set while a mint or revoke is in flight, so the buttons can be disabled. */
  readonly busy: boolean;
  readonly error: string | null;
  /** Mint, or rotate — which is how a leaked URL is killed. */
  readonly create: () => Promise<void>;
  readonly revoke: () => Promise<void>;
}

export function useCalendarFeed(client: ApiClient | null, enabled: boolean): CalendarFeedState {
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client === null || !enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    void getCalendarFeed(client, { signal: controller.signal }).then((result) => {
      if (cancelled) return;
      // A failed read shows "no feed" rather than an error. The worst it costs
      // is a student pressing the button again; a red box on a screen whose
      // subject is their calendar would be louder than the thing it is about.
      setFeed(result.ok ? result.value : null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, enabled]);

  const create = useCallback(async () => {
    if (client === null) return;
    setBusy(true);
    setError(null);
    const result = await createCalendarFeed(client);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    setFeed(result.value);
  }, [client]);

  const revoke = useCallback(async () => {
    if (client === null) return;
    setBusy(true);
    setError(null);
    const result = await deleteCalendarFeed(client);
    setBusy(false);
    if (!result.ok) {
      // Worth saying out loud, unlike a failed read: the student asked for the
      // link to stop working and it may not have.
      setError(result.error.userMessage);
      return;
    }
    setFeed(null);
  }, [client]);

  return { feed, loading, busy, error, create, revoke };
}
