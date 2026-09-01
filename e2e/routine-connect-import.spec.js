import { expect, test } from '@playwright/test';
import { unlockCalculator } from './helpers/gate.js';
import { selectCalcTab } from './helpers/tabs.js';

// #633: the feed is a catalog of every section on offer and carries no student
// identity, so nothing we archive can say which sections are YOURS. Pasting the
// CONNECT page is the only path to the semester a student is actually in.
//
// The paste below is a real Summer 2026 schedule. Two of its rows — the CSE220L
// and CSE251L labs — do not exist in the archived catalog at all, which is
// precisely why this reads the page instead of resolving codes against a feed.

const FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';

// Next semester, which is all the live feed can ever offer during advising.
const LIVE = [{
    sectionId: 1, courseCode: 'CSE221', courseName: 'ALGORITHMS', sectionName: '01',
    courseId: 1, sectionType: 'THEORY', courseCredit: 3, capacity: 40, consumedSeat: 10,
    faculties: 'TAP', roomName: '08H-22C', semesterSessionId: 20263,
    sectionSchedule: {
        classSchedules: [{ day: 'SUNDAY', startTime: '11:00:00', endTime: '12:20:00' }],
        classStartDate: '2026-10-03', classEndDate: '2027-01-04',
    },
}];

const PASTE = [
    'TIME/DAY\tSUNDAY\tMONDAY\tTUESDAY\tWEDNESDAY\tTHURSDAY\tFRIDAY\tSATURDAY',
    '8:00 AM - 9:20 AM\t\tMAT215 -13 -MZK-12A-08C\t\tMAT215 -13 -MZK-12A-08C\t\t\t',
    '9:30 AM - 10:50 AM\tCSE220 -04 -MAHR-10B-15C\t\tCSE220 -04 -MAHR-10B-15C\t\t\t\t',
    '11:00 AM - 1:50 PM\t\tCSE220L -04 -TBA-09B-08L\tCSE251L -09B -TBA-FT10-02L\t\t\t\t',
    '2:00 PM - 3:20 PM\tMAT111 -01 -EMNH-12A-09C\t\tMAT111 -01 -EMNH-12A-09C\t\t\t\t',
    '3:30 PM - 4:50 PM\t\tCSE251 -09B -HMH-07H-27C\t\tCSE251 -09B -HMH-07H-27C\t\t\t',
    '',
    'DAY\tTIME\tEXAM\tCOURSE',
    'SATURDAY (2026-07-25)\t4:30 PM -6:30 PM\tMID\tCSE251',
].join('\n');

async function boot(page) {
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => {
        try {
            if (!sessionStorage.getItem('__e2e_booted')) {
                localStorage.clear();
                sessionStorage.clear();
                sessionStorage.setItem('__e2e_booted', '1');
            }
        } catch {}
        window.Chart = window.Chart || class { destroy() {} };
    });
    await page.route('https://**/*', (route) => {
        if (route.request().url().startsWith(FEED_URL)) {
            return route.fulfill({
                status: 200, contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify(LIVE),
            });
        }
        return route.abort();
    });
    await unlockCalculator(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await selectCalcTab(page, 'routine');
    await expect(page.locator('#routineCourseInput')).toBeVisible();
}

async function pasteSchedule(page, text = PASTE) {
    await page.locator('[data-action="routine:toggleConnectImport"]').click();
    await page.locator('#routineConnectPaste').fill(text);
    await page.locator('[data-action="routine:applyConnectImport"]').click();
}

test('pasting the CONNECT page builds the routine it shows', async ({ page }) => {
    await boot(page);
    // The live feed only has next semester, which is the whole complaint.
    await expect(page.locator('.routine-semester-badge')).toContainText('Fall 2026');

    await pasteSchedule(page);

    // Six courses, exactly. Asserted on the code element rather than by
    // substring: "CSE220" is inside "CSE220L", and a filter would pass on the
    // lab alone while the theory section was missing.
    await expect(page.locator('.routine-course-code')).toHaveText(
        ['CSE220', 'CSE220L', 'CSE251', 'CSE251L', 'MAT111', 'MAT215'],
    );
    // 10 meetings across the week: four twice-weekly courses plus two labs.
    await expect(page.locator('.routine-grid-block')).toHaveCount(10);
    await expect(page.locator('.routine-import-note')).toContainText('Imported 6 courses');
});

test('the labs the catalog does not have come through', async ({ page }) => {
    await boot(page);
    await pasteSchedule(page);

    // CSE220L and CSE251L are absent from the archived Summer catalog entirely.
    // Their rooms are the proof this came from the page, not from a lookup.
    const lab = page.locator('.routine-course-block').filter({ hasText: 'CSE220L' });
    await expect(lab).toContainText('09B-08L');
    await expect(page.locator('.routine-course-block').filter({ hasText: 'CSE251L' }))
        .toContainText('FT10-02L');
    // And the real instructors, where a snapshot would have said TBA.
    await expect(page.locator('.routine-course-block').filter({ hasText: 'MAT215' }))
        .toContainText('MZK');
});

test('the badge stops claiming this is the live feed', async ({ page }) => {
    await boot(page);
    await pasteSchedule(page);
    await expect(page.locator('.routine-source-badge')).toContainText('Pasted from CONNECT');
    await expect(page.locator('#routineSemesterPicker')).toHaveValue('imported');
});

test('the paste survives a fresh visit, and the live plan is still there', async ({ page }) => {
    await boot(page);
    await pasteSchedule(page);
    await expect(page.locator('.routine-grid-block')).toHaveCount(10);

    await unlockCalculator(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await selectCalcTab(page, 'routine');
    await expect(page.locator('#routineSemesterPicker')).toHaveValue('imported');
    await expect(page.locator('.routine-grid-block')).toHaveCount(10);

    // Switching back gives the live feed, with the imported routine untouched.
    await page.locator('#routineSemesterPicker').selectOption('');
    await expect(page.locator('.routine-semester-badge')).toContainText('Fall 2026');
    await expect(page.locator('.routine-course-block')).toHaveCount(0);
    await page.locator('#routineSemesterPicker').selectOption('imported');
    await expect(page.locator('.routine-grid-block')).toHaveCount(10);
});

test('a paste it cannot read keeps the box open and says why', async ({ page }) => {
    await boot(page);
    await page.locator('[data-action="routine:toggleConnectImport"]').click();
    await page.locator('#routineConnectPaste').fill('Dear student, please log in to CONNECT.');
    await page.locator('[data-action="routine:applyConnectImport"]').click();

    // Closing the box would look like it worked.
    await expect(page.locator('#routineConnectPaste')).toBeVisible();
    await expect(page.locator('.routine-import-note')).toContainText('Copy the whole Class Schedule table');
    await expect(page.locator('#routineSemesterPicker')).toHaveCount(0);
});

test('no switcher entry until something has been pasted', async ({ page }) => {
    await boot(page);
    // Nothing archived and nothing pasted: there is nowhere to switch to.
    await expect(page.locator('#routineSemesterPicker')).toHaveCount(0);
});
