import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// #633: the CONNECT feed keeps one semester and drops the rest, so the Worker
// archives them and the Routine tab can read one back. Legacy is still the
// shipping site, so this is where the fix actually reaches students.
//
// The switcher must appear only when there is something behind it, must load
// the semester it names, and must not drag the other feed-backed tabs along
// with it — Seats and Free Rooms share this tab's fetch through the live-feed
// broadcast, and an archived semester has no business on either.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
// The one worker origin the page's CSP allows. A made-up host is refused before
// any route handler sees it, which looks exactly like an empty archive.
const WORKER = 'https://shohoj-papers.souravmondal033.workers.dev';

function section(sectionId, courseCode, courseName, sessionId, start, end) {
    return {
        sectionId, courseCode, courseName, sectionName: '01',
        courseId: 1, sectionType: 'THEORY', courseCredit: 3,
        capacity: 40, consumedSeat: 10, faculties: 'ABC', roomName: '09A-10C',
        semesterSessionId: sessionId,
        sectionSchedule: {
            classSchedules: [{ day: 'SUNDAY', startTime: '08:00:00', endTime: '09:20:00' }],
            classStartDate: start, classEndDate: end,
        },
    };
}

const LIVE = [section(1, 'CSE110', 'PROGRAMMING LANGUAGE I', 20263, '2026-10-03', '2027-01-04')];
const SUMMER = [section(2, 'MAT110', 'DIFFERENTIAL CALCULUS', 20262, '2026-06-09', '2026-09-08')];

const LISTING = {
    semesters: [
        { sessionId: 20263, classStartDate: '2026-10-03', classEndDate: '2027-01-04', sections: 2086, archivedAt: 9 },
        {
            sessionId: 20262, classStartDate: '2026-06-09', classEndDate: '2026-09-08',
            sections: 2010, archivedAt: 5,
            provenance: { source: 'snapshot', sections: 2010, tbaFaculty: 1184, noSchedule: 27, unnamed: 0, seatsFrozen: true },
        },
    ],
};

async function boot(page, { listing = LISTING } = {}) {
    page.on('dialog', (d) => d.accept());
    // addInitScript runs on every navigation, so clearing unconditionally would
    // wipe the remembered semester on reload and make that test assert nothing.
    // Clear once, on the first load of the run.
    await page.addInitScript((worker) => {
        try {
            if (!sessionStorage.getItem('__e2e_booted')) {
                localStorage.clear();
                sessionStorage.clear();
                sessionStorage.setItem('__e2e_booted', '1');
            }
        } catch {}
        window.Chart = window.Chart || class { destroy() {} };
        window._shohoj_papers_worker_url = worker;
    }, WORKER);
    await page.route('https://**/*', (route) => {
        const url = route.request().url();
        const json = (body) => route.fulfill({
            status: 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(body),
        });
        if (url.startsWith(FEED_URL)) return json(LIVE);
        if (url === `${WORKER}/api/semesters`) return json(listing);
        if (url === `${WORKER}/api/semesters/20262`) return json(SUMMER);
        return route.abort();
    });
    await unlockCalculator(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await selectCalcTab(page, 'routine');
    await expect(page.locator('#routineCourseInput')).toBeVisible();
}

const picker = (page) => page.locator('#routineSemesterPicker');
const badge = (page) => page.locator('.routine-semester-badge');

test('the switcher lists the live feed and every archived semester', async ({ page }) => {
    await boot(page);
    await expect(picker(page)).toBeVisible();
    await expect(picker(page).locator('option')).toHaveText(['Live feed', 'Fall 2026', 'Summer 2026']);
    await expect(badge(page)).toContainText('Fall 2026');
});

test('choosing Summer 2026 loads it, and it reads as the semester in progress', async ({ page }) => {
    await boot(page);
    await picker(page).selectOption('20262');

    // The complaint that started this: the tab could only ever show next
    // semester. Summer 2026 contains today, so it reads running.
    await expect(badge(page)).toContainText('Summer 2026');
    await expect(badge(page)).toHaveClass(/routine-semester--running/);

    // And it is really that semester's data, not a relabelled live feed.
    await page.locator('#routineCourseInput').fill('MAT110');
    await page.locator('[data-action="routine:addCourse"]').click();
    await expect(page.locator('.routine-course-block').filter({ hasText: 'MAT110' })).toBeVisible();
});

test('an imported capture says what it cannot tell you', async ({ page }) => {
    await boot(page);
    await picker(page).selectOption('20262');
    const note = page.locator('.routine-archive-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('saved capture');
    await expect(note).toContainText('frozen');
    await expect(note).toContainText('1184 of 2010');
});

test('an archived semester stays on this tab', async ({ page }) => {
    await boot(page);
    await picker(page).selectOption('20262');
    await expect(badge(page)).toContainText('Summer 2026');

    // Routine shares its fetch with Seats and Free Rooms through the live-feed
    // broadcast. Sending them an archived semester would have a student reading
    // last semester's free rooms with nothing on that tab saying why.
    await selectCalcTab(page, 'freerooms');
    await expect(page.locator('#freeRoomsContent .freerooms-tab')).toBeVisible();
    // Free Rooms polls the live feed itself; what it must never do is inherit
    // this tab's archived one. CSE110 is live-only, MAT110 archive-only.
    await expect(page.locator('#freeRoomsContent')).not.toContainText('MAT110');
});

test('the choice survives a fresh visit', async ({ page }) => {
    await boot(page);
    await picker(page).selectOption('20262');
    await expect(badge(page)).toContainText('Summer 2026');

    // A fresh visit rather than page.reload(): reload drops the campus gate and
    // lands on no tab at all, which would be testing the gate, not the choice.
    await unlockCalculator(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await selectCalcTab(page, 'routine');
    await expect(picker(page)).toHaveValue('20262');
    await expect(badge(page)).toContainText('Summer 2026');
});

test('no switcher when the archive is empty', async ({ page }) => {
    await boot(page, { listing: { semesters: [] } });
    await expect(badge(page)).toContainText('Fall 2026');
    await expect(picker(page)).toHaveCount(0);
});
