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
        assessments: [],
        reminders: [],
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

      // A read-only peek at what the fake stored, for the few assertions about
      // fields the UI does not render — provenance, most of all. Reading the
      // DOM cannot tell you whether a task says it came from a paste.
      window.__shohojApiState = state;

      window.__shohojApiClient = {
        get(path) {
          // COPIES, not the live arrays. A real response is freshly parsed
          // JSON every time; handing out the mutable state means a later
          // in-place push leaves React holding the same reference, bailing out
          // of the re-render, and the UI silently never updates.
          if (path === '/semesters') return ok({ items: state.semesters.slice() });
          if (path === '/enrollments') return ok({ items: state.enrollments.slice() });
          if (path === '/tasks') return ok({ items: state.tasks.map((t) => ({ ...t })) });
          if (path === '/assessments')
            return ok({ items: state.assessments.map((a) => ({ ...a })) });
          const rems = /^\/tasks\/([^/]+)\/reminders$/.exec(path);
          if (rems) {
            return ok({
              items: state.reminders.filter((r) => r.taskId === rems[1]).map((r) => ({ ...r })),
            });
          }
          const one = /^\/tasks\/([^/]+)\/assessment$/.exec(path);
          if (one) {
            const found = state.assessments.find((a) => a.taskId === one[1]);
            return found
              ? ok({ assessment: found })
              : Promise.resolve({
                  ok: false,
                  error: { code: 'not_found', userMessage: 'This task has no assessment.' },
                });
          }
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
          const rem = /^\/tasks\/([^/]+)\/reminders$/.exec(path);
          if (rem) {
            const taskId = rem[1];
            const owner = state.tasks.find((t) => t.id === taskId);
            const record = {
              id: 'rem_' + String(body.offsetMinutes).padStart(32, '0'),
              taskId,
              offsetMinutes: body.offsetMinutes,
              channel: body.channel ?? 'EMAIL',
              // Derived from the deadline, exactly as the Worker does — null
              // when the task has none, so the "waiting" copy is exercised.
              scheduledFor:
                owner && owner.dueAt
                  ? new Date(Date.parse(owner.dueAt) - body.offsetMinutes * 60000).toISOString()
                  : null,
              status: 'PENDING',
              sentAt: null,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: new Date().toISOString(),
            };
            const at = state.reminders.findIndex((r) => r.id === record.id && r.taskId === taskId);
            if (at === -1) state.reminders.push(record);
            else state.reminders[at] = record;
            return ok({ reminder: record });
          }
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
              // Provenance comes from the REQUEST, as the Worker stores it.
              // Hardcoding MANUAL here would let an import that forgot to say
              // where it came from still pass.
              source: body.source ?? 'MANUAL',
              sourceReference: body.sourceReference ?? null,
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
          const assessmentMatch = /^\/tasks\/([^/]+)\/assessment$/.exec(path);
          if (assessmentMatch) {
            const taskId = assessmentMatch[1];
            const record = {
              taskId,
              totalMarks: body.totalMarks,
              earnedMarks: body.earnedMarks ?? null,
              weightPercent: body.weightPercent,
              syllabus: null,
              location: null,
              notes: null,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: new Date().toISOString(),
            };
            const at = state.assessments.findIndex((a) => a.taskId === taskId);
            if (at === -1) state.assessments.push(record);
            else state.assessments[at] = record;
            // The real Worker re-scores on every read, so the weight factor
            // appears as soon as an assessment exists. Mirror that here, or the
            // test would pass against a constant rather than the behaviour.
            const scored = state.tasks.find((x) => x.id === taskId);
            if (scored && Array.isArray(scored.priorityFactors)) {
              const value = Math.min(1, (body.weightPercent ?? 0) / 100);
              scored.priorityFactors = scored.priorityFactors.map((f) =>
                f.name === 'weight' ? { ...f, value, points: value * f.weight * 100 } : f,
              );
            }
            return ok({ assessment: record });
          }
          const id = path.split('/')[2];
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.status = body.completed ? 'COMPLETED' : 'TODO';
            task.completedAt = body.completed ? new Date().toISOString() : null;
          }
          return ok({ task });
        },
        delete(path) {
          const remDel = /^\/tasks\/([^/]+)\/reminders\/([^/]+)$/.exec(path);
          if (remDel) {
            const at = state.reminders.findIndex(
              (r) => r.id === remDel[2] && r.taskId === remDel[1],
            );
            if (at !== -1) state.reminders.splice(at, 1);
            return ok({ deleted: { id: remDel[2] } });
          }
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
    dueAt: d.toISOString(),
    startAt: null,
    estimatedMinutes: over.estimatedMinutes ?? null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    // A score and its breakdown, as the scored API now returns (#721).
    priorityScore: over.priorityScore ?? 50,
    priorityFactors: over.priorityFactors ?? [
      { name: 'urgency', value: 0.8, weight: 0.45, points: 36 },
      { name: 'weight', value: 0, weight: 0.25, points: 0 },
      { name: 'workload', value: 0, weight: 0.15, points: 0 },
      { name: 'importance', value: 0.33, weight: 0.15, points: 5 },
    ],
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

test('@a11y the calendar view and reminder controls scan clean', async ({ page }) => {
  // A new screen with new markup, plus the reminder chips, which use
  // aria-pressed rather than a checkbox and are worth scanning as such.
  await installApi(page, {
    tasks: [
      taskDue(1, { key: '1', title: 'Quiz tomorrow' }),
      taskDue(4, { key: '2', title: 'Essay later' }),
    ],
  });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.getByTestId('tasks-calendar')).toBeVisible();

  let scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  let blocking = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(blocking, `calendar: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);

  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await page.getByRole('button', { name: /show details for Essay later/i }).click();
  await expect(page.getByTestId('tasks-reminders')).toBeVisible();

  scan = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  blocking = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(blocking, `reminders: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
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

// ── Priority explanations, marks and grade impact (#723) ────────────────────

test('a task explains why it ranks where it does', async ({ page }) => {
  // The whole reason the API returns a breakdown. Four numbers are not an
  // interrogation; these are sentences.
  // A deadline three days out, read on Upcoming. taskDue(0) is noon TODAY,
  // which reads as "Already overdue" whenever the suite runs after midday —
  // a clock-dependent assertion, not a stable one.
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'Quiz 3 revision' })] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Upcoming' }).click();

  await expect(page.getByTestId('tasks-details')).toHaveCount(0);
  await page.getByRole('button', { name: /show details for Quiz 3 revision/i }).click();

  const why = page.getByTestId('tasks-why-list');
  await expect(why).toBeVisible();
  await expect(why).toContainText(/Due in \d+ days/);
  await expect(why).toContainText(/You marked it/);
  // Factors that contributed nothing are not listed.
  await expect(why).not.toContainText(/estimated/i);
});

test('the disclosure is named for its task, not "details"', async ({ page }) => {
  // A list of buttons all called "Details" is unusable by name.
  await installApi(page, {
    tasks: [
      taskDue(0, { key: '1', title: 'Quiz 3 revision' }),
      taskDue(0, { key: '2', title: 'Read chapter 4' }),
    ],
  });
  await goTasks(page);

  await expect(page.getByRole('button', { name: /details for Quiz 3 revision/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /details for Read chapter 4/i })).toBeVisible();
});

test('marks can be recorded, and blank stays blank rather than becoming zero', async ({ page }) => {
  // THE distinction. A "You scored" box that defaults to 0 would turn "not
  // marked yet" into "scored zero" on the way in.
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'MAT215 Final' })] });
  await goTasks(page);

  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await page.getByRole('button', { name: /show details for MAT215 Final/i }).click();

  const editor = page.getByTestId('tasks-assessment');
  await expect(editor.getByLabel('You scored')).toHaveValue('');

  await editor.getByLabel('% of course').fill('40');
  await editor.getByLabel('Out of').fill('40');
  await page.getByTestId('tasks-assessment-save').click();

  // Reopened, the score box is still blank — it was never marked.
  await page.getByRole('button', { name: /hide details for MAT215 Final/i }).click();
  await page.getByRole('button', { name: /show details for MAT215 Final/i }).click();
  await expect(page.getByTestId('tasks-assessment').getByLabel('You scored')).toHaveValue('');
});

test('the explanation names the weight once it is known', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'MAT215 Final' })] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await page.getByRole('button', { name: /show details for MAT215 Final/i }).click();

  const editor = page.getByTestId('tasks-assessment');
  await editor.getByLabel('% of course').fill('40');
  await editor.getByLabel('Out of').fill('40');
  await page.getByTestId('tasks-assessment-save').click();

  await expect(page.getByTestId('tasks-why-list')).toContainText('Worth 40% of the course');
});

test('sorting by priority is opt-in and lives in the URL', async ({ page }) => {
  // Off by default: reordering the list every current student sees, without
  // asking, is not an improvement.
  await installApi(page, {
    tasks: [
      taskDue(0, { key: '1', title: 'Low scorer', priorityScore: 10 }),
      taskDue(0, { key: '2', title: 'High scorer', priorityScore: 90 }),
    ],
  });
  await goTasks(page);

  const titles = () => page.getByTestId('tasks-row').allInnerTexts();
  const before = await titles();
  expect(before[0]).toContain('Low scorer');

  // click(), not check(). The box is CONTROLLED by the URL parameter, so the
  // browser flips it, React re-renders from a URL that has not updated yet and
  // flips it back, and only then does the parameter land — which Playwright's
  // check() reads as "clicking did not change its state". The URL and the
  // resulting order are what actually matter, and both are asserted.
  await page.getByLabel('Sort by priority').click();
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page.getByLabel('Sort by priority')).toBeChecked();
  const after = await titles();
  expect(after[0]).toContain('High scorer');
});

test('grade impact appears when one course is in view, and not before', async ({ page }) => {
  // "What do I need" is not a question about a mixed list.
  await installApi(page, {
    tasks: [
      taskDue(3, { key: '1', title: 'MAT215 Final' }),
      taskDue(3, { key: '2', title: 'CSE work', enrollmentId: 'enr_' + 'b'.repeat(32) }),
    ],
  });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Upcoming' }).click();

  await expect(page.getByTestId('tasks-grade')).toHaveCount(0);

  // Record what the final is worth, and that 60% is already banked elsewhere.
  await page.getByRole('button', { name: /show details for MAT215 Final/i }).click();
  const editor = page.getByTestId('tasks-assessment');
  await editor.getByLabel('% of course').fill('100');
  await editor.getByLabel('Out of').fill('100');
  await editor.getByLabel('You scored').fill('78');
  await page.getByTestId('tasks-assessment-save').click();

  await page.getByLabel('Filter by course').selectOption({ label: 'CSE220' });

  const grade = page.getByTestId('tasks-grade');
  await expect(grade).toBeVisible();
  await expect(page.getByTestId('tasks-grade-inhand')).toContainText('78%');
  await expect(page.getByTestId('tasks-grade-floor')).toContainText(/Final result|lands on/);
});

test('a course with no recorded weights shows no grade panel and no error', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(0, { key: '1', title: 'Unweighted' })] });
  await goTasks(page);
  await page.getByLabel('Filter by course').selectOption({ label: 'CSE220' });
  await expect(page.getByTestId('tasks-grade')).toHaveCount(0);
  await expect(page.getByTestId('tasks-page')).toBeVisible();
});

// ── Reminders, calendar and export (#729) ───────────────────────────────────

test('a reminder can be set and unset from the task panel', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'MAT215 Final' })] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await page.getByRole('button', { name: /show details for MAT215 Final/i }).click();

  // exact: true — once a reminder is set, the list gains a remove button whose
  // label CONTAINS this one ("Remove reminder A day before"), and Playwright
  // matches names by substring. The two names are properly distinct for a
  // screen reader; it is the locator that needs narrowing.
  const chip = page.getByRole('button', { name: 'A day before', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tasks-reminder-list')).toContainText('A day before');

  // The chip IS the setting, so tapping it again is how you undo it.
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('a reminder on an undated task says it is waiting, not broken', async ({ page }) => {
  // Otherwise a student sets a reminder and watches it do nothing.
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByTestId('tasks-add').click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Someday reading');
  await page.getByTestId('tasks-save').click();

  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('button', { name: /show details for Someday reading/i }).click();
  await expect(page.getByTestId('tasks-reminders-nodeadline')).toBeVisible();

  await page.getByRole('button', { name: 'Three hours before', exact: true }).click();
  await expect(page.getByTestId('tasks-reminder-list')).toContainText(/waiting for a deadline/i);
});

test('the calendar lays deadlines out by day', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(1, { key: '1', title: 'Quiz tomorrow' }),
      taskDue(4, { key: '2', title: 'Essay later' }),
      taskDue(1, { key: '3', title: 'Also tomorrow' }),
    ],
  });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Calendar' }).click();

  await expect(page).toHaveURL(/view=calendar/);
  const calendar = page.getByTestId('tasks-calendar');
  await expect(calendar).toBeVisible();
  await expect(page.getByTestId('tasks-calendar-item')).toHaveCount(3);
  await expect(calendar).toContainText('Tomorrow');
});

test('an undated task never reaches the calendar', async ({ page }) => {
  // A reading with no due date is not a thing happening today.
  await installApi(page, {
    tasks: [taskDue(2, { key: '1', title: 'Dated one' })],
  });
  await goTasks(page);
  await page.getByTestId('tasks-add').click();
  await page.getByRole('textbox', { name: 'Task' }).fill('No deadline at all');
  await page.getByTestId('tasks-save').click();

  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.getByTestId('tasks-calendar-item')).toHaveCount(1);
  await expect(page.getByTestId('tasks-calendar')).not.toContainText('No deadline at all');
});

test('the calendar offers an export, and it produces a real .ics', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(2, { key: '1', title: 'MAT215 Final' })] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'Calendar' }).click();

  const button = page.getByTestId('tasks-export');
  await expect(button).toBeEnabled();

  // The download itself is sandboxed in this runner, so this asserts the click
  // is wired and harmless; the bytes are covered by tests/taskCalendar.test.js.
  await button.click();
  // The click must not navigate or error the page.
  await expect(page.getByTestId('tasks-calendar')).toBeVisible();
});

test('with tasks but none dated, the calendar explains why it is empty', async ({ page }) => {
  // Not the zero-tasks case: that one correctly says "no tasks yet", because
  // the student has nothing at all rather than nothing SCHEDULED.
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByTestId('tasks-add').click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Undated only');
  await page.getByTestId('tasks-save').click();

  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.getByTestId('tasks-empty')).toContainText(/deadline/i);
});

// ── Import from text (#735) ─────────────────────────────────────────────────
//
// The point of these is the CONFIRM step. A detector that proposes well is
// only half of it; what makes the flow safe is that nothing is written while
// the student is still looking at proposals, and these assert that directly —
// by checking the list is unchanged at the moment the proposals are on screen.

/**
 * A date a few days out, written the way an announcement writes it.
 *
 * Relative to today rather than fixed, because the detector resolves a bare
 * day and month FORWARD — a hardcoded date would start resolving into next
 * year partway through this one and these would fail on a calendar boundary
 * rather than on a code change.
 */
function writtenDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })}`;
}

/** The announcement most of these paste: one quiz, with a course and a time. */
function announcementFor(daysAhead) {
  return {
    text: `MAT215 Quiz 3 will be held on ${writtenDate(daysAhead)} at 9:30 am, chapters 4-6.`,
  };
}

const openImport = async (page) => {
  await page.getByTestId('tasks-import-open').click();
  await expect(page.getByTestId('tasks-import')).toBeVisible();
};

test('pasting an announcement proposes a task and creates nothing until confirmed', async ({
  page,
}) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();

  // Suggest: the proposal is on screen, editable, and named from the text.
  await expect(page.getByTestId('tasks-import-list')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Task 1' })).toHaveValue('Quiz 3');

  // …and NOTHING has been created. This is the whole guarantee.
  expect(await page.evaluate(() => window.__shohojApiState.tasks.length)).toBe(0);
  await expect(page.getByTestId('tasks-list')).toHaveCount(0);

  // Confirm.
  await page.getByTestId('tasks-import-confirm').click();
  await expect(page.getByTestId('tasks-list')).toContainText('Quiz 3');
  expect(await page.evaluate(() => window.__shohojApiState.tasks.length)).toBe(1);
});

test('a confirmed task records that it came from a paste, and what from', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();
  await page.getByTestId('tasks-import-confirm').click();
  await expect(page.getByTestId('tasks-list')).toContainText('Quiz 3');

  const stored = await page.evaluate(() => window.__shohojApiState.tasks[0]);
  // "I typed this" and "a parser read this and I said yes" are different
  // answers to the same question, and only one of them is true here.
  expect(stored.source).toBe('PASTE');
  expect(stored.sourceReference).toContain('MAT215');
});

test('a proposal shows the text it was read from, so it can be checked', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();

  const item = page.getByTestId('tasks-import-list').locator('li').first();
  await expect(item).toContainText('Read from:');
  await expect(item).toContainText('MAT215');
});

test('a course the student is enrolled in is pre-selected on the proposal', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();

  // MAT215 is the second enrolment the fake installs.
  await expect(page.getByRole('combobox', { name: 'Course 1' })).toHaveValue(
    'enr_' + 'b'.repeat(32),
  );
});

test('an undated proposal is offered but not selected by default', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page
    .getByRole('textbox', { name: 'Announcement' })
    .fill('Quiz 3 is coming up at some point.');
  await page.getByTestId('tasks-import-detect').click();

  const pick = page.getByRole('checkbox', { name: 'Add this 1' });
  await expect(pick).not.toBeChecked();
  await expect(page.getByTestId('tasks-import-confirm')).toBeDisabled();

  // Offered, not hidden: one click and it goes in.
  await pick.click();
  await expect(page.getByTestId('tasks-import-confirm')).toHaveText('Add 1 task');
});

test('editing a proposal changes what is created, not what was detected', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();
  await page.getByRole('textbox', { name: 'Task 1' }).fill('Quiz 3 — rescheduled');
  await page.getByTestId('tasks-import-confirm').click();

  await expect(page.getByTestId('tasks-list')).toContainText('Quiz 3 — rescheduled');
});

test('text with no deadline in it proposes nothing and says so', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await openImport(page);
  await page
    .getByRole('textbox', { name: 'Announcement' })
    .fill('Hello everyone, hope your week is going well. See you around campus.');
  await page.getByTestId('tasks-import-detect').click();

  await expect(page.getByTestId('tasks-import-none')).toBeVisible();
  await expect(page.getByTestId('tasks-import-list')).toHaveCount(0);
  expect(await page.evaluate(() => window.__shohojApiState.tasks.length)).toBe(0);
});

test('two announcements in one paste become two proposals and two tasks', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page
    .getByRole('textbox', { name: 'Announcement' })
    .fill(`${announcementFor(3).text}\n\nCSE220 Assignment 2 is due ${writtenDate(5)}.`);
  await page.getByTestId('tasks-import-detect').click();

  await expect(page.getByTestId('tasks-import-list').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('tasks-import-confirm')).toHaveText('Add 2 tasks');

  await page.getByTestId('tasks-import-confirm').click();
  await expect(page.getByTestId('tasks-list').getByRole('listitem')).toHaveCount(2);
});

test('cancelling an import leaves the list exactly as it was', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(2, { key: '1', title: 'Already here' })] });
  await goTasks(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();
  await expect(page.getByTestId('tasks-import-list')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('tasks-import')).toHaveCount(0);
  expect(await page.evaluate(() => window.__shohojApiState.tasks.length)).toBe(1);
});

test('the import panel has no accessibility violations', async ({ page }) => {
  await installApi(page, { tasks: [] });
  await goTasks(page);

  await openImport(page);
  await page.getByRole('textbox', { name: 'Announcement' }).fill(announcementFor(3).text);
  await page.getByTestId('tasks-import-detect').click();
  await expect(page.getByTestId('tasks-import-list')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
