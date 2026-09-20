// src/features/tasks/useAssessments.ts
//
// Every assessment the student has, once (#723).
//
// One fetch, one map. The alternative — a request per task as each row opens —
// would mean a grade panel over a five-task course costing five round trips for
// data the server keeps in a single collection.
//
// Thin, like the other hooks here: no arithmetic, no derived grade state. The
// map goes to gradeImpactView and to the row that needs a weight.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiClient } from '../../platform/api/apiClient.ts';
import {
  type Assessment,
  type AssessmentInput,
  assessmentsByTask,
  deleteAssessment as apiDelete,
  listAssessments,
  putAssessment as apiPut,
} from '../../platform/api/tasks.ts';

export interface AssessmentsState {
  readonly byTaskId: ReadonlyMap<string, Assessment>;
  readonly loading: boolean;
  /** Save or replace. Returns a displayable message on failure, else null. */
  readonly save: (taskId: string, input: AssessmentInput) => Promise<string | null>;
  readonly remove: (taskId: string) => Promise<string | null>;
}

const EMPTY: ReadonlyMap<string, Assessment> = new Map();

export function useAssessments(client: ApiClient | null): AssessmentsState {
  const [items, setItems] = useState<readonly Assessment[]>([]);
  const [loading, setLoading] = useState(client !== null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (client === null) {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    void listAssessments(client, { signal: controller.signal }).then((result) => {
      if (cancelled) return;
      // A failure here leaves the map empty, which reads as "no assessments
      // recorded" — the grade panel then renders nothing rather than an error.
      // Marks are supporting detail on this screen; the task list is the screen.
      setItems(result.ok ? result.value : []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, attempt]);

  const save = useCallback(
    async (taskId: string, input: AssessmentInput) => {
      if (client === null) return null;
      const result = await apiPut(client, taskId, input);
      if (!result.ok) return result.error.userMessage;
      setAttempt((n) => n + 1);
      return null;
    },
    [client],
  );

  const remove = useCallback(
    async (taskId: string) => {
      if (client === null) return null;
      const result = await apiDelete(client, taskId);
      if (!result.ok) return result.error.userMessage;
      setAttempt((n) => n + 1);
      return null;
    },
    [client],
  );

  const byTaskId = useMemo(() => (items.length === 0 ? EMPTY : assessmentsByTask(items)), [items]);

  return useMemo(() => ({ byTaskId, loading, save, remove }), [byTaskId, loading, save, remove]);
}
