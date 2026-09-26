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
async function boot(page, { stub = signedInStub, tasks = [], failFirstLoad = false, extract = null, tab = 'tasks' } = {}) {
  const store = new Map(tasks.map((t) => [t.id, t]));
  const assessments = new Map();
  let feed = null;
  let feedSeq = 0;
  const reminders = new Map(); // taskId -> reminder[]
  let reminderSeq = 0;
  const log = [];
  // Fails every task read until the test calls log.stopFailing(): the
  // Calculator digest also reads /tasks/today at start-up, so "fail the first
  // request" would be spent before the Tasks tab ever asked.
  let failing = failFirstLoad;
  log.stopFailing = () => { failing = false; };

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
    if (failing && path.startsWith('/tasks') && req.method() === 'GET') {
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
    if (path === '/tasks/feed') {
      if (req.method() === 'POST') {
        feedSeq += 1;
        feed = { url: `${WORKER}/api/v1/tasks/feed/secret${feedSeq}.ics`, createdAt: '2026-10-08T00:00:00Z' };
      }
      if (req.method() === 'DELETE') feed = null;
      return json(200, { feed });
    }
    if (path === '/tasks/extract') {
      if (extract === null) return json(503, { error: { code: 'unavailable', message: 'The reader is off.' } });
      return json(extract.status ?? 200, extract.body);
    }
    if (path === '/assessments') return json(200, { items: [...assessments.values()] });
    const assess = path.match(/^\/tasks\/(tsk_[0-9a-f]+)\/assessment$/);
    if (assess && req.method() === 'PUT') {
      const input = JSON.parse(req.postData());
      const a = { taskId: assess[1], syllabus: null, location: null, notes: null, createdAt: 'x', updatedAt: 'x', earnedMarks: null, ...input };
      assessments.set(assess[1], a);
      return json(200, { assessment: a });
    }
    if (assess && req.method() === 'DELETE') {
      assessments.delete(assess[1]);
      return json(200, { deleted: { taskId: assess[1] } });
    }
    const rem = path.match(/^\/tasks\/(tsk_[0-9a-f]+)\/reminders(?:\/(rem_[0-9a-f]+))?$/);
    if (rem) {
      const list = reminders.get(rem[1]) ?? [];
      if (req.method() === 'GET') return json(200, { items: list });
      if (req.method() === 'POST') {
        const { offsetMinutes } = JSON.parse(req.postData());
        reminderSeq += 1;
        const r = {
          id: `rem_${reminderSeq.toString(16).padStart(32, '0')}`, taskId: rem[1], offsetMinutes, channel: 'WEB',
          scheduledFor: store.get(rem[1])?.dueAt ? '2026-12-01T00:00:00.000Z' : null,
          status: 'PENDING', sentAt: null, createdAt: 'x', updatedAt: 'x',
        };
        reminders.set(rem[1], [...list, r]);
        return json(201, { reminder: r });
      }
      reminders.set(rem[1], list.filter((r) => r.id !== rem[2]));
      return json(200, { deleted: { id: rem[2] } });
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
  await page.evaluate((t) => window.switchCalcTab(t), tab);
  return log;
}

const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

test('signed out (saved work resumed), the tab asks for sign-in and calls nothing', async ({ page }) => {
  const log = await boot(page, { stub: signedOutStub });
  await expect(page.getByTestId('tasks-signin')).toBeVisible();
  expect(log).toHaveLength(0);
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
  const log = await boot(page, { tasks: [makeTask({ title: 'Essay draft', dueAt: hoursFromNow(-30) })], failFirstLoad: true });
  await expect(page.getByTestId('tasks-error')).toContainText('Tasks are resting. Try again shortly.');
  log.stopFailing();
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

// ── Phase 2: details and the grade picture ───────────────────────────────────

const factor = (name, points) => ({ name, value: 0.5, weight: 25, points });

test('details explain the ranking and a reminder chip toggles on and off', async ({ page }) => {
  const log = await boot(page, {
    tasks: [makeTask({
      title: 'Midterm prep', dueAt: hoursFromNow(30), priorityScore: 64, estimatedMinutes: 180,
      priorityFactors: [factor('urgency', 36), factor('workload', 18), factor('importance', 10)],
    })],
  });
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Show details for Midterm prep' }).click();

  const details = page.getByTestId('tasks-details');
  // The panel spans the row beneath it, rather than squeezing in beside it.
  const widths = await details.evaluate((d) => ({
    details: d.getBoundingClientRect().width,
    row: d.closest('.tasks-row').clientWidth,
  }));
  expect(widths.details).toBeGreaterThan(widths.row * 0.85);
  await expect(details.getByTestId('tasks-why-list').locator('li')).toHaveCount(3);
  await expect(details.getByTestId('tasks-why-list')).toContainText('Due in 30 hours');
  await expect(details.locator('.tasks-band')).toHaveText('Needs attention');

  const chip = details.getByRole('button', { name: 'A day before', exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(details.getByTestId('tasks-reminder-list')).toContainText('A day before');
  expect(JSON.parse(log.find((r) => r.method === 'POST' && r.path.endsWith('/reminders')).body)).toEqual({ offsetMinutes: 1440 });

  await details.getByRole('button', { name: 'A day before', exact: true }).click();
  await expect(details.getByRole('button', { name: 'A day before', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(details.getByTestId('tasks-reminder-list')).toHaveCount(0);
});

test('a task with no deadline says reminders wait for one', async ({ page }) => {
  await boot(page, { tasks: [makeTask({ title: 'Read chapter 5' })] });
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Show details for Read chapter 5' }).click();
  await expect(page.getByTestId('tasks-reminders-nodeadline')).toBeVisible();
});

test('what a task is worth: blank score saves as unmarked, and the course shows its grade picture', async ({ page }) => {
  const log = await boot(page, {
    tasks: [
      makeTask({ title: 'Quiz 1', enrollmentId: 'enr_1', dueAt: hoursFromNow(-200), status: 'COMPLETED' }),
      makeTask({ title: 'Final', enrollmentId: 'enr_1', dueAt: hoursFromNow(400) }),
    ],
  });
  await page.getByRole('tab', { name: 'All' }).click();

  // Validation happens before anything is sent.
  await page.getByRole('button', { name: 'Show details for Final' }).click();
  await page.getByTestId('tasks-assessment-save').click();
  await expect(page.getByTestId('tasks-assessment').locator('.tasks-error')).toHaveText('How much of the course is this worth?');

  await page.locator('#tasksAssessWeight').fill('40');
  await page.locator('#tasksAssessTotal').fill('100');
  await page.getByTestId('tasks-assessment-save').click();
  await expect(page.getByTestId('tasks-assessment').getByRole('button', { name: 'Remove' })).toBeVisible();
  const finalPut = log.find((r) => r.method === 'PUT' && r.path.endsWith('/assessment'));
  expect(JSON.parse(finalPut.body)).toEqual({ totalMarks: 100, weightPercent: 40, earnedMarks: null });

  await page.getByRole('button', { name: 'Hide details for Final' }).click();
  await page.getByRole('button', { name: 'Show details for Quiz 1' }).click();
  // The form is Quiz 1's own, not a carry-over of what was typed for Final.
  await expect(page.locator('#tasksAssessWeight')).toHaveValue('');
  await page.locator('#tasksAssessWeight').fill('20');
  await page.locator('#tasksAssessTotal').fill('20');
  await page.locator('#tasksAssessEarned').fill('18');
  await page.getByTestId('tasks-assessment-save').click();
  await expect(page.getByTestId('tasks-assessment').getByRole('button', { name: 'Remove' })).toBeVisible();

  await page.getByLabel('Filter by course').selectOption('enr_1');
  const grade = page.getByTestId('tasks-grade');
  await expect(grade.locator('.tasks-grade-title')).toHaveText('CSE220');
  await expect(grade.getByTestId('tasks-grade-inhand')).toHaveText('90% in hand');
  await expect(grade.getByTestId('tasks-grade-partial')).toBeVisible(); // 60% of the course entered
  await expect(grade.getByTestId('tasks-grade-targets')).toContainText('needs');
});

// ── Phase 3: paste an announcement ───────────────────────────────────────────

test('a pasted announcement becomes reviewed proposals, and only ticked ones are added', async ({ page }) => {
  const log = await boot(page);
  await page.getByTestId('tasks-import-open').click();
  await page.locator('#tasksImportText').fill(
    'Quiz 3 of CSE220 will be held on 25 December at 9:30 am and covers chapters 4-6.\n\n' +
      'Term paper outline this month.\n\nPlease bring your ID cards.',
  );
  await page.getByTestId('tasks-import-detect').click();

  const list = page.getByTestId('tasks-import-list');
  await expect(list.locator('.tasks-import-item')).toHaveCount(2);
  // Dated → ticked and course-matched; undated → unticked, never guessed.
  await expect(page.getByLabel('Add this 1')).toBeChecked();
  await expect(page.getByLabel('Task 1')).toHaveValue('Quiz 3');
  await expect(page.getByLabel('Course 1')).toHaveValue('enr_1');
  await expect(page.getByLabel('Add this 2')).not.toBeChecked();
  await expect(page.getByLabel('Due 2')).toHaveValue('');
  await expect(page.getByTestId('tasks-import-skipped')).toHaveText('1 line had no deadline in it and was skipped.');
  // A dated proposal exists, so the paid reader is not offered.
  await expect(page.getByTestId('tasks-import-ai')).toHaveCount(0);

  await expect(page.getByTestId('tasks-import-confirm')).toHaveText('Add 1 task');
  await page.getByTestId('tasks-import-confirm').click();
  await expect(page.getByTestId('tasks-import-open')).toBeVisible();

  const posts = log.filter((r) => r.method === 'POST' && r.path === '/tasks');
  expect(posts).toHaveLength(1);
  const body = JSON.parse(posts[0].body);
  expect(body).toMatchObject({ title: 'Quiz 3', type: 'QUIZ', enrollmentId: 'enr_1', source: 'PASTE', description: 'chapters 4-6' });
  expect(body.sourceReference).toContain('25 December');
  expect(Date.parse(body.dueAt)).toBe(new Date(2026, 11, 25, 9, 30).getTime());
});

test('with nothing dated, the reader is offered and its proposals replace the empty ones', async ({ page }) => {
  const log = await boot(page, {
    extract: {
      body: {
        detected: [{
          title: 'Midterm', type: 'EXAM', dueAt: '2026-11-14T04:00:00.000Z', courseCode: 'CSE220',
          syllabus: null, confidence: 'medium', evidence: 'the midterm is on the 14th of next month',
        }],
        quota: { remaining: 4, limit: 5, resetsAt: '2026-10-09T00:00:00Z' },
      },
    },
  });
  await page.getByTestId('tasks-import-open').click();
  await page.locator('#tasksImportText').fill('Heads up: the midterm is on the 14th of next month.');
  await page.getByTestId('tasks-import-detect').click();
  await expect(page.getByTestId('tasks-import-confirm')).toHaveText('Nothing selected');

  await page.getByTestId('tasks-import-ai').click();
  await expect(page.getByTestId('tasks-import-ai-note')).toHaveText('Shohoj read it and found 1 more thing. Check it before adding.');
  await expect(page.getByLabel('Task 1')).toHaveValue('Midterm');
  const extract = log.find((r) => r.path === '/tasks/extract');
  expect(JSON.parse(extract.body)).toEqual({ text: 'Heads up: the midterm is on the 14th of next month.', courseCodes: ['CSE220'] });

  await page.getByTestId('tasks-import-confirm').click();
  await expect(page.getByTestId('tasks-import-open')).toBeVisible();
  const post = JSON.parse(log.find((r) => r.method === 'POST' && r.path === '/tasks').body);
  expect(post).toMatchObject({ title: 'Midterm', source: 'AI_SUGGESTION', enrollmentId: 'enr_1' });
});

test('when the reader cannot help, the student keeps what they had', async ({ page }) => {
  await boot(page); // extract → 503 unavailable
  await page.getByTestId('tasks-import-open').click();
  await page.locator('#tasksImportText').fill('Assignment 4 sometime soon.');
  await page.getByTestId('tasks-import-detect').click();
  await expect(page.getByLabel('Task 1')).toHaveValue('Assignment 4');
  await page.getByTestId('tasks-import-ai').click();
  await expect(page.getByTestId('tasks-import-ai-note')).toHaveText('The reader is off.');
  await expect(page.getByLabel('Task 1')).toHaveValue('Assignment 4');
  await expect(page.getByTestId('tasks-import-ai')).toHaveCount(0);
});

// ── Phase 4: the calendar ────────────────────────────────────────────────────

test('the calendar lists deadlines by day and downloads them as an .ics', async ({ page }) => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  const later = new Date(); later.setDate(later.getDate() + 5); later.setHours(9, 0, 0, 0);
  await boot(page, {
    tasks: [
      makeTask({ title: 'Lab report 2', type: 'LAB', enrollmentId: 'enr_1', dueAt: tomorrow.toISOString(), estimatedMinutes: 90 }),
      makeTask({ title: 'Essay', dueAt: later.toISOString() }),
      makeTask({ title: 'Undated reading' }),
    ],
  });
  await page.getByRole('tab', { name: 'Calendar' }).click();

  const cal = page.getByTestId('tasks-calendar');
  await expect(cal.getByTestId('tasks-calendar-item')).toHaveCount(2);
  await expect(cal.locator('.tasks-calendar-date').first()).toHaveText('Tomorrow');
  await expect(cal.getByTestId('tasks-calendar-item').first()).toContainText('CSE220: Lab report 2');
  // Undated work cannot sit on a calendar.
  await expect(cal).not.toContainText('Undated reading');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    cal.getByTestId('tasks-export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^shohoj-tasks-\d{4}-\d{2}-\d{2}\.ics$/);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('SUMMARY:CSE220: Lab report 2');
  expect(text).toContain('TRIGGER:-PT60M');
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
});

test('the subscription link can be created, replaced and turned off', async ({ page }) => {
  const soon = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const log = await boot(page, { tasks: [makeTask({ title: 'Quiz 4', dueAt: soon })] });
  await page.getByRole('tab', { name: 'Calendar' }).click();

  const panel = page.getByTestId('tasks-feed');
  await expect(panel.getByTestId('tasks-feed-warning')).toContainText('anyone who has it can read your deadlines');
  await panel.getByTestId('tasks-feed-create').click();
  await expect(panel.getByTestId('tasks-feed-url')).toHaveValue(/secret1\.ics$/);

  await panel.getByTestId('tasks-feed-rotate').click();
  await expect(panel.getByTestId('tasks-feed-url')).toHaveValue(/secret2\.ics$/);

  await panel.getByTestId('tasks-feed-revoke').click();
  await expect(panel.getByTestId('tasks-feed-create')).toBeVisible();
  expect(log.filter((r) => r.path === '/tasks/feed').map((r) => r.method)).toEqual(['GET', 'POST', 'POST', 'DELETE']);
});

test('a calendar with nothing dated says so instead of listing undated work', async ({ page }) => {
  await boot(page, { tasks: [makeTask({ title: 'Someday reading' })] });
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.getByTestId('tasks-empty')).toContainText('Nothing with a deadline');
  await expect(page.getByTestId('tasks-calendar')).toHaveCount(0);
});

// ── Phase 5: the digest on the Calculator tab ────────────────────────────────

test('the calculator shows a digest of open work, and completing from it removes the row', async ({ page }) => {
  const laterToday = new Date(); laterToday.setHours(23, 0, 0, 0);
  const log = await boot(page, {
    tab: 'calculator',
    tasks: [
      makeTask({ title: 'Problem set 3', dueAt: hoursFromNow(-72) }),
      makeTask({ title: 'Lab report', dueAt: laterToday.toISOString(), enrollmentId: 'enr_1', type: 'LAB' }),
      makeTask({ title: 'Essay draft', dueAt: hoursFromNow(80) }),
      makeTask({ title: 'Done already', dueAt: hoursFromNow(-30), status: 'COMPLETED' }),
    ],
  });

  const digest = page.getByTestId('tasks-digest');
  await expect(digest).toBeVisible();
  await expect(digest.getByTestId('tasks-digest-item')).toHaveCount(3);
  await expect(digest.getByTestId('tasks-digest-overdue')).toHaveText('1 overdue');
  await expect(digest.locator('.tasks-digest-group')).toHaveText(['Overdue', 'Today', 'Coming up']);
  await expect(digest.getByTestId('tasks-digest-item').nth(1).locator('.tasks-course')).toHaveText('CSE220 · 04');

  // click, not check(): the row leaves at once, so it is never seen checked.
  await digest.getByRole('checkbox', { name: 'Mark Problem set 3 as done' }).click();
  await expect(digest.getByTestId('tasks-digest-item')).toHaveCount(2);
  await expect(digest.getByTestId('tasks-digest-overdue')).toHaveCount(0);
  expect(log.filter((r) => r.path.endsWith('/completion'))).toHaveLength(1);

  await digest.getByRole('button', { name: 'View all tasks' }).click();
  await expect(page.locator('#tabTasks')).toHaveClass(/active/);
  await expect(page.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
});

test('no open work means no digest at all', async ({ page }) => {
  await boot(page, { tab: 'calculator', tasks: [makeTask({ title: 'Undated', dueAt: null })] });
  await page.waitForTimeout(500);
  await expect(page.locator('#tasksDigestBox')).toBeHidden();
});

test('signed out, the calculator shows no digest and calls nothing', async ({ page }) => {
  const log = await boot(page, { tab: 'calculator', stub: signedOutStub });
  await page.waitForTimeout(500);
  await expect(page.locator('#tasksDigestBox')).toBeHidden();
  expect(log).toHaveLength(0);
});
