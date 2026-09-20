// src/features/tasks/useTasks.ts
//
// The Tasks screens' data layer (#717).
//
// Thin by design: everything decidable without React is a pure function in
// ./taskView.ts or ../../platform/api/tasks.ts. What is left here is the part
// that genuinely needs React — fetching per view, not writing a stale answer
// over a fresh one, and keeping a completion tick feeling instant.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ShohojError } from '../../core/errors.ts';
import type { ApiClient } from '../../platform/api/apiClient.ts';
import {
  type Task,
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  setTaskCompleted as apiSetCompleted,
  updateTask as apiUpdateTask,
  fetchToday,
  fetchUpcoming,
  listTasks,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '../../platform/api/tasks.ts';
import type { TaskView } from './taskView.ts';

export type TasksStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TasksState {
  readonly status: TasksStatus;
  /** The current view's tasks, already ordered by the server. */
  readonly items: readonly Task[];
  /** Today only: work whose deadline has already passed. Empty elsewhere. */
  readonly overdue: readonly Task[];
  readonly error: ShohojError | null;
  readonly refresh: () => void;
  readonly create: (input: CreateTaskInput) => Promise<ShohojError | null>;
  readonly update: (id: string, input: UpdateTaskInput) => Promise<ShohojError | null>;
  readonly setCompleted: (id: string, completed: boolean) => Promise<ShohojError | null>;
  readonly remove: (id: string) => Promise<ShohojError | null>;
}

const EMPTY: readonly Task[] = [];

/**
 * Load and mutate the signed-in student's tasks for one view.
 *
 * `client` is null on an offline shell — a fork, a pull-request preview — which
 * resolves to `idle` with empty lists rather than an error. Nothing is wrong;
 * that build simply has no backend.
 *
 * Mutations return a `ShohojError | null` rather than throwing, so a caller can
 * show the server's own message without a try/catch at every call site.
 */
export function useTasks(client: ApiClient | null, view: TaskView): TasksState {
  const [state, setState] = useState<{
    status: TasksStatus;
    items: readonly Task[];
    overdue: readonly Task[];
    error: ShohojError | null;
  }>({ status: 'idle', items: EMPTY, overdue: EMPTY, error: null });

  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (client === null) {
      setState({ status: 'idle', items: EMPTY, overdue: EMPTY, error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    // Keep the previous list on screen while refetching. Blanking it makes a
    // completion tick flash the whole list away and back, which reads as a bug.
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    const options = { signal: controller.signal };
    const load = async () => {
      if (view === 'today') {
        const result = await fetchToday(client, options);
        return result.ok
          ? { items: result.value.dueToday, overdue: result.value.overdue, error: null }
          : { items: EMPTY, overdue: EMPTY, error: result.error };
      }
      if (view === 'upcoming') {
        const result = await fetchUpcoming(client, undefined, options);
        return result.ok
          ? { items: result.value.items, overdue: EMPTY, error: null }
          : { items: EMPTY, overdue: EMPTY, error: result.error };
      }
      const result = await listTasks(client, {}, options);
      return result.ok
        ? { items: result.value, overdue: EMPTY, error: null }
        : { items: EMPTY, overdue: EMPTY, error: result.error };
    };

    void load().then((next) => {
      // StrictMode double-invokes effects and a student can switch views
      // mid-flight; either way the late answer is dropped.
      if (cancelled) return;
      setState({ status: next.error === null ? 'ready' : 'error', ...next });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, view, attempt]);

  /** Run a mutation, then refetch. Returns the error, or null on success. */
  const mutate = useCallback(
    async (run: (api: ApiClient) => Promise<{ ok: boolean; error?: ShohojError }>) => {
      if (client === null) return null;
      const result = await run(client);
      if (!result.ok) return result.error ?? null;
      setAttempt((n) => n + 1);
      return null;
    },
    [client],
  );

  const create = useCallback(
    (input: CreateTaskInput) => mutate((api) => apiCreateTask(api, input)),
    [mutate],
  );
  const update = useCallback(
    (id: string, input: UpdateTaskInput) => mutate((api) => apiUpdateTask(api, id, input)),
    [mutate],
  );
  const remove = useCallback((id: string) => mutate((api) => apiDeleteTask(api, id)), [mutate]);

  /**
   * Tick a task, optimistically.
   *
   * The checkbox moves at once and the refetch confirms it. Without this the
   * tick waits on a round trip, which on campus wifi is long enough that a
   * student taps it twice — and the second tap un-ticks it.
   *
   * A failure puts the task back and surfaces the server's message, so an
   * optimistic update never becomes a silently wrong screen.
   */
  const setCompleted = useCallback(
    async (id: string, completed: boolean) => {
      if (client === null) return null;
      const nextStatus = completed ? 'COMPLETED' : 'TODO';
      setState((prev) => ({
        ...prev,
        items: prev.items.map((task) => (task.id === id ? { ...task, status: nextStatus } : task)),
        overdue: prev.overdue.map((task) =>
          task.id === id ? { ...task, status: nextStatus } : task,
        ),
      }));

      const result = await apiSetCompleted(client, id, completed);
      setAttempt((n) => n + 1);
      return result.ok ? null : result.error;
    },
    [client],
  );

  return useMemo<TasksState>(
    () => ({ ...state, refresh, create, update, setCompleted, remove }),
    [state, refresh, create, update, setCompleted, remove],
  );
}
