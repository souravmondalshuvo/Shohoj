// src/features/academic/useAcademicRecords.ts
//
// The shell's view of a student's semesters and enrolments (#712).
//
// Deliberately NOT mounted yet. Phase 2 ships no UI, and a provider wired into
// the root layout would fetch on every shell boot for data nothing displays —
// a network request per student per session, bought with nothing. Phase 3
// mounts this where the Tasks screens live and actually need it.
//
// It is a thin shell on purpose. Everything decidable without React —
// which semester is active, what a student's credit load is, what to suggest
// from the calculator's state — is a pure function in ../../platform/api/academic.ts
// and ./enrollmentSuggestions.ts, tested without a renderer. What is left here
// is the part that genuinely needs React: subscribing, cancelling, and not
// writing a stale answer over a fresh one.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ShohojError } from '../../core/errors.ts';
import type { ApiClient } from '../../platform/api/apiClient.ts';
import {
  type Enrollment,
  type Semester,
  activeSemester as pickActive,
  enrolledCredits,
  listEnrollments,
  listSemesters,
} from '../../platform/api/academic.ts';

export type AcademicStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AcademicRecords {
  readonly status: AcademicStatus;
  readonly semesters: readonly Semester[];
  readonly enrollments: readonly Enrollment[];
  /** The one ACTIVE semester, or null. */
  readonly active: Semester | null;
  /** Enrolments in the active semester. Empty when there is no active semester. */
  readonly activeEnrollments: readonly Enrollment[];
  /** Credits carried in the active semester. */
  readonly activeCredits: number;
  readonly error: ShohojError | null;
  /** Re-fetch. Call after a mutation; safe at any time. */
  readonly refresh: () => void;
}

const EMPTY: readonly never[] = [];

/**
 * Load the signed-in student's semesters and enrolments.
 *
 * `client` is null on an offline shell, which is the normal state of a fork and
 * every pull-request preview — that resolves to `idle` with empty lists rather
 * than an error, because there is nothing wrong: this build simply has no
 * backend.
 *
 * Both collections are fetched together. They are always rendered together, and
 * two independent loading states would mean a screen that shows a semester with
 * no courses in it for a moment before the courses arrive.
 */
export function useAcademicRecords(client: ApiClient | null): AcademicRecords {
  const [state, setState] = useState<{
    status: AcademicStatus;
    semesters: readonly Semester[];
    enrollments: readonly Enrollment[];
    error: ShohojError | null;
  }>({ status: 'idle', semesters: EMPTY, enrollments: EMPTY, error: null });

  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (client === null) {
      setState({ status: 'idle', semesters: EMPTY, enrollments: EMPTY, error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    const options = { signal: controller.signal };
    void Promise.all([listSemesters(client, options), listEnrollments(client, {}, options)]).then(
      ([semesters, enrollments]) => {
        // StrictMode double-invokes effects in development and a student can
        // navigate away mid-flight; either way the late answer is dropped rather
        // than written over fresher state.
        if (cancelled) return;
        if (!semesters.ok) {
          setState({
            status: 'error',
            semesters: EMPTY,
            enrollments: EMPTY,
            error: semesters.error,
          });
          return;
        }
        if (!enrollments.ok) {
          setState({
            status: 'error',
            semesters: EMPTY,
            enrollments: EMPTY,
            error: enrollments.error,
          });
          return;
        }
        setState({
          status: 'ready',
          semesters: semesters.value,
          enrollments: enrollments.value,
          error: null,
        });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, attempt]);

  return useMemo<AcademicRecords>(() => {
    const active = pickActive(state.semesters);
    const activeEnrollments =
      active === null
        ? EMPTY
        : state.enrollments.filter((enrollment) => enrollment.semesterId === active.id);
    return {
      status: state.status,
      semesters: state.semesters,
      enrollments: state.enrollments,
      active,
      activeEnrollments,
      activeCredits: enrolledCredits(activeEnrollments),
      error: state.error,
      refresh,
    };
  }, [state, refresh]);
}
