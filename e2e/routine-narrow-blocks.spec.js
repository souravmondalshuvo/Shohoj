import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// A three-way clash tiles one day column into thirds (#585). At a narrow window
// that is ~34px a block — less than the 37px a room label needs, and less than
// the course code itself — so every line ellipsed and the block truncated to
// "⚠ C…", saying nothing about which course it was.
//
// The fix degrades the content by width rather than restyling the clash: below
// a threshold a block drops to its course code and its clash mark, and the code
// scales down instead of truncating. This spec pins both halves — that the
// degrade fires when the block is too narrow for the rest, and that what
// survives is not clipped.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// Three courses meeting at exactly the same hour on Sunday: one cluster, three
// sub-columns, the worst case the issue measured. Each also meets on two other
// days, because the grid prunes empty days — a Sunday-only fixture would render
// one enormous column and reproduce nothing.
function sec(id, code, room, extraDays) {
  const at = (day) => ({ day, startTime: '08:00:00', endTime: '09:20:00' });
  return {
    courseId: id, sectionType: 'THEORY', semesterSessionId: 20262, courseCredit: 3,
    sectionId: id, courseCode: code, courseName: code, sectionName: '01',
    capacity: 30, consumedSeat: 5, faculties: 'ABC', roomName: room,
    sectionSchedule: {
      midExamDate: '2026-07-26', midExamStartTime: '11:00:00', midExamEndTime: '13:00:00',
      finalExamDate: '2026-09-13', finalExamStartTime: '11:00:00', finalExamEndTime: '13:00:00',
      classSchedules: [at('SUNDAY'), ...extraDays.map(at)],
    },
  };
}

const MOCK_FEED = [
  sec(7001, 'CSE260', '09A-10C', ['MONDAY', 'TUESDAY']),
  sec(7002, 'MAT120', '08B-02C', ['WEDNESDAY', 'THURSDAY']),
  sec(7003, 'PHY111', '10B-13C', ['SATURDAY', 'FRIDAY']),
];

async function boot(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.Chart = window.Chart || class { destroy() {} };
  });
  await page.route('https://**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(FEED_URL)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(MOCK_FEED),
      });
    }
    return route.abort();
  });
  await unlockCalculator(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await selectCalcTab(page, 'routine');
  await expect(page.locator('#routineCourseInput')).toBeVisible();
}

async function pickAll(page) {
  for (const [code, sid] of [['CSE260', 7001], ['MAT120', 7002], ['PHY111', 7003]]) {
    await page.locator('#routineCourseInput').fill(code);
    await page.locator('[data-action="routine:addCourse"]').click();
    await page.locator('.routine-course-block', { hasText: code })
      .locator(`.routine-section-row[data-sid="${sid}"]`).click();
  }
  // Only the Sunday cluster tiles; each course's other two days stand alone.
  await expect(page.locator('.routine-grid-block--split')).toHaveCount(3);
}

// Nothing a block still shows may promise text it cannot fit. Same shape as the
// clipping assertion in routine-polish.spec.js, applied to every split block.
async function clippedLines(page) {
  return page.locator('.routine-grid-block').evaluateAll((els) => {
    const bad = [];
    for (const el of els) {
      const code = el.querySelector('.routine-grid-block-code')?.textContent?.trim();
      for (const line of el.querySelectorAll('div, span')) {
        if (line.clientWidth > 0 && line.scrollWidth > line.clientWidth + 0.5) {
          bad.push(`${code}: "${line.textContent.trim()}" needs ${line.scrollWidth}px, has ${line.clientWidth}px`);
        }
      }
    }
    return bad;
  });
}

test('a three-way clash keeps every course code readable', async ({ page }) => {
  // Wide enough that the grid still renders (the agenda takes over on mobile),
  // narrow enough to reproduce the ~34px tiles the issue measured.
  await page.setViewportSize({ width: 760, height: 900 });
  await boot(page);
  await pickAll(page);

  const blocks = page.locator('.routine-grid-block--split');
  const widths = await blocks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  // The premise of the test: these really are the unreadable-narrow case.
  for (const w of widths) expect(w).toBeLessThan(74);

  // Each block still says which course it is, in full.
  const codes = await blocks.locator('.routine-grid-block-codetext').allTextContents();
  expect(codes.map((c) => c.trim()).sort()).toEqual(['CSE260', 'MAT120', 'PHY111']);
  expect(await clippedLines(page)).toEqual([]);

  // What it drops: room, faculty/section, and the times. The clash mark stays —
  // it is the block's only non-colour cue that this is a clash.
  await expect(page.locator('.routine-grid-block-room').first()).toBeHidden();
  await expect(page.locator('.routine-grid-block-meta').first()).toBeHidden();
  await expect(page.locator('.routine-grid-block-timetext').first()).toBeHidden();
  await expect(page.locator('.routine-grid-block-clashmark').first()).toBeVisible();
});

test('a block with room to spare still shows the room, faculty and time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await boot(page);
  await page.locator('#routineCourseInput').fill('CSE260');
  await page.locator('[data-action="routine:addCourse"]').click();
  await page.locator('.routine-section-row[data-sid="7001"]').click();

  // One class, one full-width block: the degrade is driven by the block's own
  // width, so nothing here should be dropped.
  const block = page.locator('.routine-grid-block').first();
  await expect(block.locator('.routine-grid-block-room')).toHaveText('09A-10C');
  await expect(block.locator('.routine-grid-block-meta')).toBeVisible();
  await expect(block.locator('.routine-grid-block-timetext')).toContainText('8:00 AM–9:20 AM');
  expect(await clippedLines(page)).toEqual([]);
});
