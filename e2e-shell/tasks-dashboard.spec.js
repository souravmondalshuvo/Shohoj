// e2e-shell/tasks-dashboard.spec.js
//
// #719: Shohoj Tasks surfaced on the main dashboard (/calculator), where the
// degree tracker and GPA trend already live.
//
// The acceptance criterion for Phase 4 is "a task created in Shohoj Tasks
// appears on the main Shohoj dashboard", so the headline test does exactly
// that: it creates the task through the /tasks UI and then looks for it on the
// dashboard, rather than seeding it straight onto the card.
//
// Uses the same window.__shohojApiClient seam as tasks-route.spec.js.

import { expect, test } from '../e2e-support/authFixture.js';
import { navigateTo } from './_nav.js';

function installApi(page, { tasks = [] } = {}) {
  return page.addInitScript(
    ({ tasks }) => {
      const state = {
        semesters: [
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
        enrollments: [
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
        },
        patch: () => ok({ task: state.tasks[0] }),
        put(path, body) {
          const id = path.split('/')[2];
          const t = state.tasks.find((x) => x.id === id);
          if (t) {
            t.status = body.completed ? 'COMPLETED' : 'TODO';
            t.completedAt = body.completed ? new Date().toISOString() : null;
          }
          return ok({ task: t });
        },
        delete: (path) => ok({ deleted: { id: path.split('/')[2] } }),
      };
    },
    { tasks },
  );
}

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
    status: over.status ?? 'TODO',
    priority: over.priority ?? 'MEDIUM',
    priorityScore: null,
    dueAt: d.toISOString(),
    startAt: null,
    estimatedMinutes: null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
  };
}

async function openDashboard(page) {
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
}

/**
 * Move between routes WITHOUT a page load.
 *
 * The API fake lives in the page, so a full navigation re-runs addInitScript
 * and resets its state — a task created on /tasks would vanish before the
 * dashboard could show it. Client-side navigation keeps one JS context, which
 * is also what a student actually does: they click a tab, they do not retype
 * the URL.
 */
async function goInApp(page, label) {
  await navigateTo(page, label);
}

// ── The acceptance criterion ────────────────────────────────────────────────

test('a task created in Shohoj Tasks appears on the dashboard', async ({ page }) => {
  await installApi(page, { tasks: [] });

  // Create it through the real Tasks UI.
  await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tasks-page')).toBeVisible();
  await page.getByTestId('tasks-add').click();
  await page.getByRole('textbox', { name: 'Task' }).fill('CSE220 Assignment 2');
  await page.getByTestId('tasks-composer').getByLabel('Course').selectOption({ label: 'CSE220' });

  const due = new Date();
  due.setDate(due.getDate() + 2);
  due.setHours(17, 0, 0, 0);
  const local = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(
    due.getDate(),
  ).padStart(2, '0')}T17:00`;
  await page.getByLabel('Due').fill(local);
  await page.getByTestId('tasks-save').click();
  await expect(page.getByTestId('tasks-composer')).toHaveCount(0);

  // Now look for it on the dashboard — navigating in-app, so the page's own
  // state (and the fake backing it) survives the move.
  await goInApp(page, 'Calculator');
  const digest = page.getByTestId('tasks-digest');
  await expect(digest).toBeVisible();
  await expect(digest).toContainText('CSE220 Assignment 2');
  await expect(digest).toContainText('CSE220');
});

// ── Ordering ────────────────────────────────────────────────────────────────

test('overdue work sits above everything else on the card', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(4, { key: '3', title: 'Later critical', priority: 'CRITICAL' }),
      taskDue(0, { key: '2', title: 'Due today' }),
      taskDue(-2, { key: '1', title: 'Late lab report', priority: 'LOW' }),
    ],
  });
  await openDashboard(page);

  const items = page.getByTestId('tasks-digest-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Late lab report');
  await expect(items.nth(1)).toContainText('Due today');
  await expect(items.nth(2)).toContainText('Later critical');

  await expect(page.getByTestId('tasks-digest-overdue')).toContainText('1 overdue');
});

// ── Ticking from the dashboard ──────────────────────────────────────────────

test('ticking a task on the dashboard completes it and clears the row', async ({ page }) => {
  await installApi(page, {
    tasks: [
      taskDue(0, { key: '1', title: 'Quiz 3 revision' }),
      taskDue(1, { key: '2', title: 'Reading' }),
    ],
  });
  await openDashboard(page);

  await expect(page.getByTestId('tasks-digest-item')).toHaveCount(2);
  // click(), not check(): the box never renders checked, because completing a
  // task removes its row from a digest. The row leaving IS the confirmation.
  await page
    .getByTestId('tasks-digest')
    .getByRole('checkbox', { name: /Mark Quiz 3 revision as done/i })
    .click();

  await expect(page.getByTestId('tasks-digest-item')).toHaveCount(1);
  await expect(page.getByTestId('tasks-digest')).not.toContainText('Quiz 3 revision');

  // And it really completed — the Tasks screen agrees.
  await goInApp(page, 'Tasks');
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(
    page.getByRole('checkbox', { name: /Mark Quiz 3 revision as not done/i }),
  ).toBeChecked();
});

// ── Silence ─────────────────────────────────────────────────────────────────

test('a student with no tasks sees no card at all', async ({ page }) => {
  // A dashboard is shared space. An empty card wedged between the degree
  // tracker and the GPA trend would be clutter for everyone not using Tasks.
  await installApi(page, { tasks: [] });
  await openDashboard(page);
  await expect(page.getByTestId('calculator-results')).toBeAttached();
  await expect(page.getByTestId('tasks-digest')).toHaveCount(0);
});

test('a student with only completed work sees no card', async ({ page }) => {
  await installApi(page, {
    tasks: [taskDue(0, { key: '1', title: 'Finished', status: 'COMPLETED' })],
  });
  await openDashboard(page);
  await expect(page.getByTestId('tasks-digest')).toHaveCount(0);
});

test('with no backend configured the dashboard is unchanged', async ({ page }) => {
  // No __shohojApiClient installed: the card must stay silent rather than
  // erroring on a route whose job is the student's grades.
  await openDashboard(page);
  await expect(page.getByTestId('tasks-digest')).toHaveCount(0);
  await expect(page.locator('#semestersContainer')).toBeVisible();
});

// ── The link through ────────────────────────────────────────────────────────

test('the card links to the view that holds the work', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(-1, { key: '1', title: 'Late one' })] });
  await openDashboard(page);

  await page
    .getByTestId('tasks-digest')
    .getByRole('link', { name: /view all tasks/i })
    .click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByTestId('tasks-page')).toBeVisible();
});

test('with nothing overdue the card links to Upcoming', async ({ page }) => {
  await installApi(page, { tasks: [taskDue(3, { key: '1', title: 'Next week' })] });
  await openDashboard(page);

  await page
    .getByTestId('tasks-digest')
    .getByRole('link', { name: /view all tasks/i })
    .click();
  await expect(page).toHaveURL(/view=upcoming/);
});

test('the card caps its rows and says how many more there are', async ({ page }) => {
  await installApi(page, {
    tasks: Array.from({ length: 8 }, (_, i) =>
      taskDue(1, { key: String(i), title: `Task number ${i}` }),
    ),
  });
  await openDashboard(page);

  await expect(page.getByTestId('tasks-digest-item')).toHaveCount(5);
  await expect(page.getByTestId('tasks-digest')).toContainText('3 more');
});
