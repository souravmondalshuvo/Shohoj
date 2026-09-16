// The Semester GPA Trend canvas has to survive being drawn while hidden.
//
// The campus gate hides the calculator until auth resolves, and recalc() runs
// in that window with the saved semesters. A canvas sized from a 0px-wide
// wrapper stayed 0px wide once the calculator was revealed: the card and its
// ↓ Declining verdict showed, the chart itself was blank. Demo mode unlocks
// before it recalcs, which is why no other spec saw it.

import { expect, test } from '@playwright/test';

const course = (code, grade) => ({ code, name: code, credits: 3, grade, retake: false });

test('the trend chart draws once a hidden calculator is revealed', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.addInitScript(({ semesters }) => {
    if (sessionStorage.getItem('__shohoj_trend_spec')) return;
    sessionStorage.clear();
    sessionStorage.setItem('__shohoj_trend_spec', '1');
    localStorage.setItem('shohoj_cgpa_v1', JSON.stringify({
      currentDept: 'CSE',
      semesterCounter: 2,
      startSeason: 'Spring',
      startYear: '2024',
      planCourses: [],
      semesters,
    }));
  }, {
    semesters: [
      { id: 0, name: 'Spring 2024', running: false, courses: [course('CSE110', 'A'), course('MAT110', 'A-')] },
      { id: 1, name: 'Summer 2024', running: false, courses: [course('CSE111', 'B'), course('MAT120', 'C+')] },
    ],
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('signin-portal-resume').click();
  const box = page.locator('#trendChartBox');
  await expect(box).toBeVisible();

  // Replay what a signed-in load does: recalc while the gate has the
  // wrapper hidden, then reveal it. Nothing recalcs on the reveal.
  const wrapper = page.locator('#calculator .calc-wrapper');
  await wrapper.evaluate(async w => {
    w.hidden = true;
    window._shohoj_recalc();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    w.hidden = false;
  });

  const canvas = page.locator('#trendCanvas');
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  await expect.poll(() => canvas.evaluate(c => c.width)).toBeGreaterThan(100);

  // And it follows its container when the window changes size.
  const before = await canvas.evaluate(c => c.width);
  await page.setViewportSize({ width: 700, height: 900 });
  await expect.poll(() => canvas.evaluate(c => c.width)).not.toBe(before);
  const wrapWidth = await canvas.evaluate(c => c.parentElement.clientWidth);
  await expect.poll(() => canvas.evaluate(c => parseFloat(c.style.width))).toBe(wrapWidth);
});
