import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// #633: the Routine grid drew a "now" line and lit today's column over whatever
// timetable the CONNECT feed happened to be serving. That feed is an advising
// feed — it publishes the semester open for registration and drops the running
// one — so between advising and the start of term the grid was asserting "you
// are here" over classes a month away, with nothing on screen naming the
// semester.
//
// The load-bearing case is the suppression: an out-of-term timetable must carry
// no now line and no today marker. Sections are seeded on all seven weekdays so
// "today" is always among the grid's columns, and the clock is pinned to a
// Sunday mid-morning inside the grid's hours — otherwise "no now line" would
// pass for free on any run that happened to start before 8am.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

// Pinned "now": a Sunday at 10:00, inside the 08:00-21:00 slots below.
const NOW = new Date('2026-07-19T10:00:00');

// One section per weekday, all in one session, over the given term.
function feedFor(sessionId, classStartDate, classEndDate) {
    return DAYS.map((day, i) => ({
        sectionId: 7100 + i,
        courseId: 1,
        sectionType: 'THEORY',
        semesterSessionId: sessionId,
        courseCredit: 3,
        courseCode: `CSE1${10 + i}`,
        courseName: 'PROGRAMMING LANGUAGE I',
        sectionName: '01',
        capacity: 30,
        consumedSeat: 5,
        faculties: 'ABC',
        roomName: '09A-10C',
        sectionSchedule: {
            classSchedules: [{ day, startTime: '08:00:00', endTime: '21:00:00' }],
            classStartDate,
            classEndDate,
        },
    }));
}

// The real Fall 2026 term, which the feed was already serving on 2026-08-31
// while Summer was still running — months after the pinned clock.
const ADVISING_FEED = feedFor(20263, '2026-10-03', '2027-01-04');
// The real Summer 2026 term, which contains the pinned clock.
const IN_TERM_FEED = feedFor(20262, '2026-06-09', '2026-09-08');

async function boot(page, feed) {
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        window.Chart = window.Chart || class { destroy() {} };
    });
    await page.route('https://**/*', (route) => {
        if (route.request().url().startsWith(FEED_URL)) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify(feed),
            });
        }
        return route.abort();
    });
    await page.clock.setFixedTime(NOW);
    await unlockCalculator(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await selectCalcTab(page, 'routine');
    await expect(page.locator('#routineCourseInput')).toBeVisible();
}

// Pick every seeded section, so the grid renders a column for each weekday.
async function fillGrid(page) {
    for (let i = 0; i < DAYS.length; i++) {
        await page.locator('#routineCourseInput').fill(`CSE1${10 + i}`);
        await page.locator('[data-action="routine:addCourse"]').click();
        await page.locator(`.routine-section-row[data-sid="${7100 + i}"]`).click();
    }
    await expect(page.locator('.routine-grid')).toBeVisible();
}

test('the header names the semester the feed is serving', async ({ page }) => {
    await boot(page, ADVISING_FEED);
    const badge = page.locator('.routine-semester-badge');
    await expect(badge).toContainText('Fall 2026');
    await expect(badge).toContainText('classes start');
    await expect(badge).toHaveClass(/routine-semester--upcoming/);
});

test('an out-of-term grid draws no now line and marks no today', async ({ page }) => {
    await boot(page, ADVISING_FEED);
    await fillGrid(page);

    // The two claims the grid used to make unconditionally. Neither is true of a
    // timetable that does not begin for two months.
    await expect(page.locator('.routine-grid-now')).toHaveCount(0);
    await expect(page.locator('.routine-grid-day-header--today')).toHaveCount(0);

    // Every column dims rather than one lighting at random — the existing
    // "today is not among the displayed days" path, reused.
    await expect(page.locator('.routine-grid-dim-col')).toHaveCount(DAYS.length);
});

test('a running semester still draws the now line and marks today', async ({ page }) => {
    await boot(page, IN_TERM_FEED);
    await expect(page.locator('.routine-semester-badge')).toHaveClass(/routine-semester--running/);
    await fillGrid(page);

    // The other half of the pair. Without this the suppression above could be
    // passing because the grid never draws these at all.
    await expect(page.locator('.routine-grid-now')).toHaveCount(1);
    await expect(page.locator('.routine-grid-day-header--today')).toHaveText('Sun');
    await expect(page.locator('.routine-grid-dim-col')).toHaveCount(DAYS.length - 1);
});
