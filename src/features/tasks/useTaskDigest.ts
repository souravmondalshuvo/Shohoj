// src/features/tasks/useTaskDigest.ts
//
// The dashboard card's data (#719).
//
// Fetches the same two endpoints the Tasks route does — `/tasks/today` and
// `/tasks/upcoming` — in parallel, and hands them to the pure `buildDigest`.
// It does not call anything Tasks does not already expose, and it computes
// nothing about deadlines itself.
//
// WHY THERE IS NO `GET /api/v1/dashboard`
//
// The original plan named one, returning { today, upcoming, overdue, courses,
// stats }. It is not built, and this is the reasoning rather than an oversight:
//
//   * It would save no round trips. `/tasks/today` already returns overdue AND
//     due-today in one response; upcoming is the only second call, and a
//     dashboard endpoint would still have to make both internally.
//   * It would be a THIRD representation of the same tasks, which is precisely
//     the duplication Phase 4 exists to avoid. Every rule it encoded — what
//     counts as overdue, what "today" means in a timezone — already has exactly
//     one definition, and a second endpoint is a second place for them to drift.
//   * `stats` are derived from data the card has already fetched.
//
// The trigger to revisit: a dashboard that needs aggregation across entities
// Firestore cannot serve cheaply (workload per course over a semester, say), or
// a second client that cannot make two calls. Neither is true today.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiClient } from '../../platform/api/apiClient.ts';
import { fetchToday, fetchUpcoming, setTaskCompleted } from '../../platform/api/tasks.ts';
import { type Digest, buildDigest } from './taskDigest.ts';

export interface TaskDigestState {
  readonly digest: Digest;
  readonly loading: boolean;
  /** True when the card should not render at all — see the note below. */
  readonly silent: boolean;
  readonly complete: (id: string) => Promise<void>;
}

const EMPTY_DIGEST: Digest = {
  entries: [],
  overdueCount: 0,
  hiddenCount: 0,
  isEmpty: true,
};

/**
 * Load the dashboard digest.
 *
 * `silent` is the important output. A dashboard is shared space, and a student
 * who has never used Tasks should not have an empty card wedged between their
 * degree tracker and their GPA trend telling them so. The card renders only
 * when there is something to show; an error, an offline build, a signed-out
 * session and a genuinely empty list all resolve to silence rather than to
 * apology text on somebody else's screen.
 *
 * That is a deliberate asymmetry with the /tasks route, which DOES explain its
 * empty states — because there, the student asked.
 */
export function useTaskDigest(client: ApiClient | null): TaskDigestState {
  const [state, setState] = useState<{
    digest: Digest;
    loading: boolean;
    failed: boolean;
  }>({ digest: EMPTY_DIGEST, loading: client !== null, failed: false });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (client === null) {
      setState({ digest: EMPTY_DIGEST, loading: false, failed: false });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    const options = { signal: controller.signal };
    void Promise.all([fetchToday(client, options), fetchUpcoming(client, undefined, options)]).then(
      ([today, upcoming]) => {
        if (cancelled) return;
        if (!today.ok || !upcoming.ok) {
          // Failure is silence, not an error card. The dashboard's job is the
          // student's grades; Tasks being briefly unreachable is not worth
          // interrupting that, and /tasks itself reports it properly.
          setState({ digest: EMPTY_DIGEST, loading: false, failed: true });
          return;
        }
        setState({
          digest: buildDigest({
            overdue: today.value.overdue,
            dueToday: today.value.dueToday,
            upcoming: upcoming.value.items,
          }),
          loading: false,
          failed: false,
        });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, attempt]);

  /**
   * Tick a task from the dashboard.
   *
   * Optimistic, like the Tasks route's — but here completion also REMOVES the
   * row, because a digest shows what is left. The refetch settles it either way.
   */
  const complete = useCallback(
    async (id: string) => {
      if (client === null) return;
      setState((prev) => ({
        ...prev,
        digest: {
          ...prev.digest,
          entries: prev.digest.entries.filter((entry) => entry.task.id !== id),
        },
      }));
      await setTaskCompleted(client, id, true);
      setAttempt((n) => n + 1);
    },
    [client],
  );

  return useMemo<TaskDigestState>(
    () => ({
      digest: state.digest,
      loading: state.loading,
      silent: client === null || state.failed || (!state.loading && state.digest.isEmpty),
      complete,
    }),
    [state, client, complete],
  );
}
