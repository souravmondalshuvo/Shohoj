// e2e-shell/tasks-route.spec.js
//
// #717: the /tasks route — Today, Upcoming and All over an injected API client.
//
// The seam is window.__shohojApiClient (the __shohoj* convention), a fake
// implementing the ApiClient surface and backed by an in-page array. That keeps
// the spec offline and lets it drive states a real backend makes awkward to
// reach: no active semester, no enrolments, an overdue task.
//
// What it does NOT fake is the route itself: the real component, the real
// useTasks hook, the real taskView logic and the real API client interface all
// run. Only the transport is replaced.

import AxeBuilder from '@axe-core/playwright';

import { expect, test, anonymousTest } from '../e2e-support/authFixture.js';
import { navigateTo } from './_nav.js';

/**
 * Install a fake API client.
 *
 * It answers the same paths the real Worker does and applies the same Today /
 * Upcoming rules, so the route sees realistic data without a network.
 */
function installApi(page, { semesters = null, enrollments = null, tasks = [] } = {}) {
  return page.addInitScript(
    ({ semesters, enrollments, tasks }) => {
      const state = {
        semesters: semesters ?? [
          {
            id: 'sem_bracu_20263',
            name: 'Fall 2026',
            year: 2026,
            season: 'Fall',
            sessionId: 20263,
            status: 'ACTIVE',
            startDate: '2026-10-03',
            endDate: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        enrollments: enrollments ?? [
          {
            id: 'enr_' + 'a'.repeat(32),
            semesterId: 'sem_bracu_20263',
            courseCode: 'CSE220',
            credits: 3,
            section: '13',
            facultyInitials: 'SHO',
            status: 'ENROLLED',
            source: 'MANUAL',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'enr_' + 'b'.repeat(32),
            semesterId: 'sem_bracu_20263',
            courseCode: 'MAT215',
            credits: 3,
            section: '07',
            facultyInitials: null,
            status: 'ENROLLED',
            source: 'MANUAL',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        tasks: tasks.slice(),
      };
      let seq = 0;
      const ok = (value) => Promise.resolve({ ok: true, value });

      const startOfDay = (offset) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + offset);
        return d.getTime();
      };
      const open = (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS';

      window.__shohojApiClient = {
        get(path) {
          if (path === '/semesters') return ok({ items: state.semesters });
          if (path === '/enrollments') return ok({ items: state.enrollments });
          if (path === '/tasks') return ok({ items: state.tasks });
          if (path === '/tasks/today') {
            const dated = state.tasks.filter((t) => t.dueAt && t.status !== 'CANCELLED');
            return ok({
              overdue: dated.filter((t) => Date.parse(t.dueAt) < startOfDay(0) && open(t)),
              dueToday: dated.filter(
                (t) => Date.parse(t.dueAt) >= startOfDay(0) && Date.parse(t.dueAt) < startOfDay(1),
              ),
            });
          }
          if (path === '/tasks/upcoming') {
            return ok({
              days: 7,
              items: state.tasks.filter(
                (t) =>
                  t.dueAt &&
                  open(t) &&
                  Date.parse(t.dueAt) >= startOfDay(1) &&
                  Date.parse(t.dueAt) < startOfDay(8),
              ),
            });
          }
          return ok({ items: [] });
        },
        post(path, body) {
          if (path === '/tasks') {
            seq += 1;
            const task = {
              id: 'tsk_' + String(seq).padStart(32, '0'),
              enrollmentId: body.enrollmentId ?? null,
              title: body.title,
              description: null,
              type: body.type ?? 'ASSIGNMENT',
              status: 'TODO',
              priority: body.priority ?? 'MEDIUM',
              priorityScore: null,
              dueAt: body.dueAt ?? null,
              startAt: null,
              estimatedMinutes: body.estimatedMinutes ?? null,
              source: 'MANUAL',
              sourceReference: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
            };
            state.tasks.push(task);
            return ok({ task });
          }
          return ok({});
        },
        patch: (path, body) => ok({ task: { ...state.tasks[0], ...body } }),
        put(path, body) {
          const id = path.split('/')[2];
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.status = body.completed ? 'COMPLETED' : 'TODO';
            task.completedAt = body.completed ? new Date().toISOString() : null;
          }
          return ok({ task });
        },
        delete(path) {
          const id = path.split('/')[2];
          const i = state.tasks.findIndex((t) => t.id === id);
          if (i !== -1) state.tasks.splice(i, 1);
          return ok({ deleted: { id } });
        },
      };
    },
    { semesters, enrollments, tasks },
  );
}

/** A task due at a local hour, `offset` days from today. */
function taskDue(offset, over = {}) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return {
    id: 'tsk_' + (over.key ?? 'x').repeat(32).slice(0, 32),
    enrollmentId: 'enr_' + 'a'.repeat(32),
    title: over.title ?? 'A task',
    description: null,
    type: 'ASSIGNMENT',
    status: 'TODO',
    priority: 'MEDIUM',
    priorityScore: null,
    dueAt: d.toISOString(),
    startAt: null,
    estimatedMinutes: over.estimatedMinutes ?? null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    ...(over.enrollmentId ? { enrollmentId: over.enrollmentId } : {}),
    ...(over.status ? { status: over.status } : {}),
  };
}

const goTasks = async (page) => {
  await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tasks-page')).toBeVisible();
};

// ── Gates ───────────────────────────────────────────────────────────────────

anonymousTest('signed out, Tasks asks you to sign in and shows no list', async ({ page }) => {
  await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
  // Signed out the shell renders its portal; either way there is no task list.
  await expect(page.getByTestId('tasks-list')).toHaveCount(0);
});

test('with no backend configured, Tasks says so rather than erroring', async ({ page }) => {
  // No __shohojApiClient installed and no runtime config: the offline branch.
  await goTasks(page);
  await expect(page.getByTestId('tasks-offline')).toBeVisible();
});

// ── Empty states ────────────────────────────────────────────────────────────

test('with no active semester, Tasks explains that first', async ({ page }) => {
  // The most common first-run state, and the one where "no tasks" would be
  // actively misleading.
  await installApi(page, { semesters: [], enrollments: [] });
  await goTasks(page);

  const empty = page.getByTestId('tasks-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/semester/i);
  await expect(page.getByRole('link', { name: /set up your semester/i })).toBeVisible();
});

test('with a semester but no courses, Tasks asks for courses', async ({ page }) => {
  await installApi(page, { enrollments: [] });
  await goTasks(page);
  await expect(page.getByTestId('tasks-empty')).toContainText(/courses/i);
});

test('set up but with nothing filed, Tasks invites a first task', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await expect(page.getByTestId('tasks-empty')).toContainText(/no tasks yet/i);
});

// ── The three views ─────────────────────────────────────────────────────────

test('Today shows overdue and due-today, and Upcoming shows the week ahead', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(-3, { key: '1', title: 'Late lab report' }),
      taskDue(0, { key: '2', title: 'Quiz 3 revision' }),
      taskDue(3, { key: '3', title: 'Assignment 2' }),
      taskDue(40, { key: '4', title: 'Final project' }),
    ],
  });
  await goTasks(page);

  await expect(page.getByText('Late lab report')).toBeVisible();
  await expect(page.getByText('Quiz 3 revision')).toBeVisible();
  await expect(page.getByText('Assignment 2')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await expect(page.getByText('Assignment 2')).toBeVisible();
  await expect(page.getByText('Quiz 3 revision')).toHaveCount(0);
  await expect(page.getByText('Final project')).toHaveCount(0);

  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByText('Final project')).toBeVisible();
  await expect(page.getByTestId('tasks-row')).toHaveCount(4);
});

test('the view lives in the URL, so it can be linked and stepped back through', async ({
  page,
}) => {
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'Assignment 2' })] });
  await goTasks(page);

  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await expect(page).toHaveURL(/view=upcoming/);

  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
});

// ── Creating and completing ─────────────────────────────────────────────────

test('a student can add a task and see it appear', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await page.getByTestId('tasks-add').click();
  await expect(page.getByTestId('tasks-composer')).toBeVisible();

  // getByLabel('Task') also matches the 'Task views' tablist; scope to the input.
  await page.getByRole('textbox', { name: 'Task' }).fill('CSE220 Assignment 2');
  await page.getByTestId('tasks-composer').getByLabel('Course').selectOption({ label: 'CSE220' });
  await page.getByTestId('tasks-save').click();

  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByText('CSE220 Assignment 2')).toBeVisible();
  await expect(page.getByTestId('tasks-row')).toContainText('CSE220');
});

test('adding a task without a title is refused in the form', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await page.getByTestId('tasks-add').click();
  await page.getByTestId('tasks-save').click();

  await expect(page.getByRole('alert')).toContainText(/title/i);
  await expect(page.getByTestId('tasks-composer')).toBeVisible();
});

test('ticking a task completes it, and unticking reopens it', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(0, { key: '1', title: 'Quiz 3 revision' })] });
  await goTasks(page);

  const box = page.getByRole('checkbox', { name: /Mark Quiz 3 revision as done/i });
  await box.check();
  await expect(
    page.getByRole('checkbox', { name: /Mark Quiz 3 revision as not done/i }),
  ).toBeChecked();

  await page.getByRole('checkbox', { name: /Mark Quiz 3 revision as not done/i }).uncheck();
  await expect(
    page.getByRole('checkbox', { name: /Mark Quiz 3 revision as done/i }),
  ).not.toBeChecked();
});

test('the checkbox is labelled with the task, not a generic "done"', async ({ page }) => {
  // A screen reader running the list would otherwise announce a column of
  // identical checkboxes.
  await installApi(page, {
    tasks: [
      taskDue(0, { key: '1', title: 'Quiz 3 revision' }),
      taskDue(0, { key: '2', title: 'Read chapter 4' }),
    ],
  });
  await goTasks(page);

  await expect(page.getByRole('checkbox', { name: /Quiz 3 revision/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Read chapter 4/ })).toBeVisible();
});

// ── Filtering ───────────────────────────────────────────────────────────────

test('filtering by course narrows the list and says so when empty', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(0, { key: '1', title: 'CSE work' }),
      taskDue(0, { key: '2', title: 'MAT work', enrollmentId: 'enr_' + 'b'.repeat(32) }),
    ],
  });
  await goTasks(page);

  await expect(page.getByTestId('tasks-row')).toHaveCount(2);

  await page.getByLabel('Filter by course').selectOption({ label: 'MAT215' });
  await expect(page.getByTestId('tasks-row')).toHaveCount(1);
  await expect(page.getByText('MAT work')).toBeVisible();

  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await expect(page.getByTestId('tasks-empty')).toContainText(/filter/i);
});

// ── Summary ─────────────────────────────────────────────────────────────────

test('the header counts open and overdue work', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(-2, { key: '1', title: 'Late one', estimatedMinutes: 60 }),
      taskDue(0, { key: '2', title: 'Today one', estimatedMinutes: 30 }),
    ],
  });
  await goTasks(page);

  const summary = page.getByTestId('tasks-summary');
  await expect(summary).toContainText('2 open');
  await expect(summary).toContainText('1 overdue');
  await expect(summary).toContainText('1h 30m');
});

// ── Navigation ──────────────────────────────────────────────────────────────

test('Tasks is reachable from the tab bar', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await navigateTo(page, 'Tasks');
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByTestId('tasks-page')).toBeVisible();
});

// ── Accessibility ───────────────────────────────────────────────────────────
//
// The #238 route-level axe gate. Scanned with content rather than empty, and
// with the composer OPEN, since the form is where most of the route's
// interactive surface lives and an empty screen would scan almost nothing.

test('@a11y Tasks route has no serious/critical violations', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(-2, { key: '1', title: 'Late lab report', estimatedMinutes: 60 }),
      taskDue(0, { key: '2', title: 'Quiz 3 revision' }),
    ],
  });
  await goTasks(page);
  await page.getByTestId('tasks-add').click();
  await expect(page.getByTestId('tasks-composer')).toBeVisible();

  const scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const blocking = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

// ── Narrow viewports ────────────────────────────────────────────────────────

test('the route does not overflow a phone viewport', async ({ page }) => {
  // The composer packs five controls into a row; on a phone they must stack
  // rather than push the panel past the viewport.
  await page.setViewportSize({ width: 414, height: 900 });
  await installApi(page, {
    tasks: [
      taskDue(0, {
        key: '1',
        title: 'A deliberately long assignment title that has to wrap rather than widen the row',
      }),
    ],
  });
  await goTasks(page);
  await page.getByTestId('tasks-add').click();
  await expect(page.getByTestId('tasks-composer')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
