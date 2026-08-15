// e2e-shell/groups.spec.js
//
// #443: the Study Group Finder on the React Router shell's /groups route,
// migrated from the legacy groupsTab.js. Uses the injected-seam pattern
// (lost-found parity):
//   window.__shohojGroupsIdentity — signed-in stand-in ({uid,email})
//   window.__shohojGroupsRepo     — repo fake over in-page arrays

import { expect, test } from '../e2e-support/authFixture.js';

function seed(page) {
  return page.addInitScript(() => {
    const now = Date.now();
    const groups = [
      { id: 'g1', courseCode: 'CSE220', title: 'Algo midterm grind', description: 'DP + graphs', mode: 'in-person', schedule: 'Sun 4pm', contactLink: 'https://m.me/algogrind', capacity: 6, creatorUid: 'u_other', createdAtMs: now - 3_600_000 },
      { id: 'g2', courseCode: 'CSE110', title: 'Recursion help desk', mode: 'online', contactLink: 'https://discord.gg/rec', capacity: 10, creatorUid: 'u_me', createdAtMs: now - 60_000 },
    ];
    const members = [
      { groupId: 'g2', uid: 'u_me', email: 'me@g.bracu.ac.bd' },
      { groupId: 'g2', uid: 'u_other', email: 'other@g.bracu.ac.bd' },
    ];
    window.__shohojGroupsReports = [];
    window.__shohojGroupsIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd' };
    window.__shohojGroupsRepo = {
      async listGroups() { return groups.slice(); },
      async listMyMemberships(uid) {
        return members.filter((m) => m.uid === uid).map((m) => ({ groupId: m.groupId }));
      },
      async listMembers(groupId) {
        return members.filter((m) => m.groupId === groupId).map((m) => ({ uid: m.uid, email: m.email }));
      },
      async create(draft, uid) {
        groups.push({ id: `g${groups.length + 1}`, ...draft, creatorUid: uid, createdAtMs: Date.now() });
        return `g${groups.length}`;
      },
      async join(groupId, uid, email) { members.push({ groupId, uid, email }); },
      async leave(groupId, uid) {
        const i = members.findIndex((m) => m.groupId === groupId && m.uid === uid);
        if (i !== -1) members.splice(i, 1);
      },
      async remove(groupId) {
        const i = groups.findIndex((g) => g.id === groupId);
        if (i !== -1) groups.splice(i, 1);
      },
      async report(groupId, reason, uid) {
        window.__shohojGroupsReports.push({ groupId, reason, uid });
      },
    };
  });
}

async function gotoGroups(page) {
  await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('groups-page')).toBeVisible();
  await expect(page.getByTestId('groups-list')).toBeVisible();
}

test('signed out shows the sign-in prompt', async ({ page }) => {
  await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('groups-signin')).toBeVisible();
  await expect(page.getByTestId('groups-course-filter')).toHaveCount(0);
});

test('board lists newest first with joined badge; filters narrow', async ({ page }) => {
  await seed(page);
  await gotoGroups(page);

  const items = page.locator('[data-testid^="groups-item-"]');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toHaveAttribute('data-testid', 'groups-item-g2');
  await expect(page.getByTestId('groups-joined-g2')).toBeVisible();

  await page.getByTestId('groups-mode-in-person').click();
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId('groups-item-g1')).toBeVisible();

  await page.getByTestId('groups-mode-all').click();
  await page.getByTestId('groups-course-filter').fill('cse1');
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId('groups-item-g2')).toBeVisible();
});

test('join reveals roster access; leave hides it again', async ({ page }) => {
  await seed(page);
  await gotoGroups(page);

  // Not a member of g1 yet: no roster button, advisory capacity label.
  await expect(page.getByTestId('groups-roster-toggle-g1')).toHaveCount(0);
  await expect(page.getByTestId('groups-item-g1')).toContainText('up to 6');

  await page.getByTestId('groups-join-g1').click();
  await expect(page.getByTestId('groups-joined-g1')).toBeVisible();
  await page.getByTestId('groups-roster-toggle-g1').click();
  await expect(page.getByTestId('groups-roster-g1')).toContainText('me@g.bracu.ac.bd');

  await page.getByTestId('groups-leave-g1').click();
  await expect(page.getByTestId('groups-joined-g1')).toHaveCount(0);
  await expect(page.getByTestId('groups-roster-g1')).toHaveCount(0);
});

test('create form validates the draft and posts a new group', async ({ page }) => {
  await seed(page);
  await gotoGroups(page);
  await page.getByTestId('groups-create-toggle').click();

  await page.getByTestId('groups-course').fill('CSE370');
  await page.getByTestId('groups-title').fill('DB normal forms');
  await page.getByTestId('groups-contact').fill('not-a-url');
  await page.getByTestId('groups-form-send').click();
  await expect(page.getByTestId('groups-form-error')).toContainText('https');

  await page.getByTestId('groups-contact').fill('https://m.me/dbgrind');
  await page.getByTestId('groups-form-send').click();
  await expect(page.getByTestId('groups-form')).toHaveCount(0);
  await expect(page.getByText('DB normal forms')).toBeVisible();
});

test('creator deletes via confirm; others report with a reason', async ({ page }) => {
  await seed(page);
  await gotoGroups(page);

  // g2 is mine → Delete; g1 is someone else's → Report.
  await expect(page.getByTestId('groups-delete-g2')).toBeVisible();
  await expect(page.getByTestId('groups-report-g1')).toBeVisible();

  await page.getByTestId('groups-report-g1').click();
  await page.getByTestId('groups-report-box').getByRole('textbox').fill('dead link');
  await page.getByTestId('groups-report-send').click();
  const reports = await page.evaluate(() => window.__shohojGroupsReports);
  expect(reports).toEqual([{ groupId: 'g1', reason: 'dead link', uid: 'u_me' }]);

  await page.getByTestId('groups-delete-g2').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('groups-item-g2')).toHaveCount(0);
});
