// The legacy calculator's Tasks tab, phase 1 (#767), over a stubbed Worker.
//
// The Worker here is an in-memory store behind page.route, speaking the real
// /api/v1 shapes, so the tab is exercised end to end: the token on every call,
// Today's overdue/due-today split, adding a task with an offset-carrying
// deadline, one completion request per tick, delete, and a failing load that
// offers a retry instead of hanging.

import { expect, test } from '@playwright/test';

const WORKER = 'https://shohoj-papers.souravmondal033.workers.dev';
const API = `${WORKER}/api/v1`;

function signedInStub(worker) {
  window._shohoj_papers_worker_url = worker;
  window._shohoj_currentUid = () => 'u1';
  window._shohoj_isAuthReady = () => true;
  window._shohoj_idToken = async () => 'id-token';
}

function signedOutStub(worker) {
  window._shohoj_papers_worker_url = worker;
  window._shohoj_currentUid = () => null;
  window._shohoj_isAuthReady = () => true;
  window._shohoj_idToken = async () => null;
}

let seq = 0;
function makeTask(overrides) {
  seq += 1;
  return {
    id: `tsk_${seq.toString(16).padStart(32, '0')}`,
    enrollmentId: null,
    title: 'Task',
    description: null,
    type: 'ASSIGNMENT',
    status: 'TODO',
    priority: 'MEDIUM',
    priorityScore: null,
    dueAt: null,
    startAt: null,
    estimatedMinutes: null,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

/** Boot with a Worker whose store starts as `tasks`. Returns the request log. */
async function boot(page, { stub = signedInStub, tasks = [], failFirstLoad = false } = {}) {
  const store = new Map(tasks.map((t) => [t.id, t]));
  const log = [];
  let failed = false;

  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    // Past the campus gate (signinPortal.js): these stubs never fire Firebase's
    // auth event, so the calculator opens the way resuming saved work does.
    try { sessionStorage.setItem('shohoj_calc_unlocked', '1'); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.addInitScript(stub, WORKER);

  await page.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*' };
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (!req.url().startsWith(API)) return route.abort();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    const path = url.pathname.replace('/api/v1', '');
    log.push({ method: req.method(), path, auth: req.headers().authorization, body: req.postData() });

    if (path === '/semesters') {
      return json(200, { items: [{ id: 'sem_1', name: 'Fall 2026', status: 'ACTIVE' }] });
    }
    if (path === '/enrollments') {
      return json(200, { items: [{ id: 'enr_1', semesterId: 'sem_1', courseCode: 'CSE220', section: '04', status: 'ENROLLED' }] });
    }
    if (failFirstLoad && !failed && path.startsWith('/tasks') && req.method() === 'GET') {
      failed = true;
      return json(503, { error: { code: 'UNAVAILABLE', message: 'Tasks are resting. Try again shortly.' } });
    }

    const all = [...store.values()];
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
    const open = (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS';

    if (path === '/tasks' && req.method() === 'GET') return json(200, { items: all });
    if (path === '/tasks/today') {
      return json(200, {
        overdue: all.filter((t) => open(t) && t.dueAt && Date.parse(t.dueAt) < startOfToday.getTime()),
        dueToday: all.filter((t) => t.dueAt && Date.parse(t.dueAt) >= startOfToday.getTime() && Date.parse(t.dueAt) < endOfToday.getTime()),
      });
    }
    if (path === '/tasks/upcoming') return json(200, { days: 7, items: all.filter((t) => t.dueAt && Date.parse(t.dueAt) >= endOfToday.getTime()) });
    if (path === '/tasks' && req.method() === 'POST') {
      const input = JSON.parse(req.postData());
      const task = makeTask(input);
      store.set(task.id, task);
      return json(201, { task });
    }
    const completion = path.match(/^\/tasks\/(tsk_[0-9a-f]+)\/completion$/);
    if (completion) {
      const { completed } = JSON.parse(req.postData());
      const task = { ...store.get(completion[1]), status: completed ? 'COMPLETED' : 'TODO' };
      store.set(task.id, task);
      return json(200, { task });
    }
    const one = path.match(/^\/tasks\/(tsk_[0-9a-f]+)$/);
    if (one && req.method() === 'DELETE') {
      store.delete(one[1]);
      return json(200, { deleted: { id: one[1] } });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.switchCalcTab === 'function');
  await page.evaluate(() => window.switchCalcTab('tasks'));
  return log;
}

const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

test('signed out (saved work resumed), the tab asks for sign-in and calls nothing', async ({ page }) => {
  const log = await boot(page, { stub: signedOutStub });
  await expect(page.getByTestId('tasks-signin')).toBeVisible();
  expect(log).toEqual([]);
});

test('Today splits overdue from due today, with course labels', async ({ page }) => {
  // Anchored to local midnight so the "due today" task cannot fall into tomorrow.
  const laterToday = new Date(); laterToday.setHours(23, 0, 0, 0);
  await boot(page, {
    tasks: [
      makeTask({ title: 'Problem set 3', dueAt: hoursFromNow(-72) }),
      makeTask({ title: 'Lab report', dueAt: laterToday.toISOString(), enrollmentId: 'enr_1', type: 'LAB' }),
    ],
  });

  const overdue = page.locator('.tasks-group-overdue');
  await expect(overdue.getByTestId('tasks-row')).toHaveCount(1);
  await expect(overdue).toContainText('Problem set 3');
  await expect(page.locator('.tasks-group-title').nth(1)).toHaveText('Due today');
  const lab = page.getByTestId('tasks-row').filter({ hasText: 'Lab report' });
  await expect(lab.locator('.tasks-course')).toHaveText('CSE220 · 04');
  await expect(page.getByTestId('tasks-summary')).toContainText('2 open');
  await expect(page.getByTestId('tasks-summary')).toContainText('1 overdue');
  await expect(page.locator('.tasks-semester')).toHaveText('Fall 2026');
});

test('adding a task sends the token and an offset-carrying deadline', async ({ page }) => {
  const log = await boot(page);
  await expect(page.getByTestId('tasks-empty')).toBeVisible();

  await page.getByTestId('tasks-add').click();
  await page.locator('#tasksTitle').fill('Quiz 2 prep');
  await page.locator('#tasksType').selectOption('QUIZ');
  await page.locator('#tasksCourse').selectOption('enr_1');
  await page.locator('#tasksDue').fill('2026-12-01T09:30');
  await page.locator('#tasksEstimate').fill('45');
  await page.getByTestId('tasks-save').click();

  await expect(page.getByTestId('tasks-composer')).toHaveCount(0);
  const post = log.find((r) => r.method === 'POST');
  expect(post.auth).toBe('Bearer id-token');
  const body = JSON.parse(post.body);
  expect(body).toMatchObject({ title: 'Quiz 2 prep', type: 'QUIZ', enrollmentId: 'enr_1', estimatedMinutes: 45, priority: 'MEDIUM' });
  expect(body.dueAt).toMatch(/Z$/);
  expect(Date.parse(body.dueAt)).toBe(new Date('2026-12-01T09:30').getTime());

  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('tasks-row').filter({ hasText: 'Quiz 2 prep' })).toBeVisible();
  expect(log.every((r) => r.auth === 'Bearer id-token')).toBe(true);
});

test('an empty title is refused before anything is sent', async ({ page }) => {
  const log = await boot(page);
  await page.getByTestId('tasks-add').click();
  await page.getByTestId('tasks-save').click();
  await expect(page.locator('.tasks-composer .tasks-error')).toHaveText('Give the task a title.');
  expect(log.some((r) => r.method === 'POST')).toBe(false);
});

test('one tick sends one completion request, and delete removes the row', async ({ page }) => {
  const log = await boot(page, { tasks: [makeTask({ title: 'Read chapter 4' })] });
  await page.getByRole('tab', { name: 'All' }).click();
  const row = page.getByTestId('tasks-row').filter({ hasText: 'Read chapter 4' });
  await expect(row).toBeVisible();

  await row.getByRole('checkbox').check();
  await expect(page.getByTestId('tasks-row').filter({ hasText: 'Read chapter 4' })).toHaveClass(/tasks-row-done/);
  expect(log.filter((r) => r.path.endsWith('/completion'))).toHaveLength(1);

  await page.getByRole('button', { name: 'Delete Read chapter 4' }).click();
  await expect(page.getByTestId('tasks-empty')).toBeVisible();
  expect(log.filter((r) => r.method === 'DELETE')).toHaveLength(1);
});

test('a failing load shows the Worker message and a working retry', async ({ page }) => {
  await boot(page, { tasks: [makeTask({ title: 'Essay draft', dueAt: hoursFromNow(-30) })], failFirstLoad: true });
  await expect(page.getByTestId('tasks-error')).toContainText('Tasks are resting. Try again shortly.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('tasks-row').filter({ hasText: 'Essay draft' })).toBeVisible();
});

test('the nav Tasks link opens the tab in place', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.switchCalcTab('calculator'));
  await page.locator('nav').getByRole('link', { name: 'Tasks' }).click();
  await expect(page.locator('#tabTasks')).toHaveClass(/active/);
  expect(page.url()).not.toContain('app/tasks');
});
