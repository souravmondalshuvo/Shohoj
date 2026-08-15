// e2e-shell/feedback.spec.js
//
// #437: the feedback submit form + board on the React Router shell's
// /feedback route, migrated from the legacy feedback modal. Uses the same
// injected-seam pattern as lost-found.spec.js:
//   window.__shohojFeedbackIdentity — signed-in stand-in ({uid,email,isAdmin?})
//   window.__shohojFeedbackRepo     — repo fake backed by an in-page array

import { expect, test, installAuth } from '../e2e-support/authFixture.js';

function seed(page, { admin = false } = {}) {
  return page.addInitScript(({ admin }) => {
    const now = Date.now();
    const items = [
      { id: 'f1', type: 'bug', text: 'Simulator forgets my grades', anonymous: true, createdAtMs: now - 3_600_000 },
      { id: 'f2', type: 'feature', text: 'Dark mode for the routine grid', anonymous: false, uid: 'u_other', createdAtMs: now - 60_000 },
    ];
    const upvotes = [{ feedbackId: 'f1', uid: 'u_me' }];
    window.__shohojFeedbackIdentity = { uid: 'u_me', email: 'me@g.bracu.ac.bd', isAdmin: admin };
    window.__shohojFeedbackRepo = {
      async listRecent() { return items.slice(); },
      async listMyUpvotes(uid) { return upvotes.filter((v) => v.uid === uid); },
      async submit(draft, uid) {
        items.push({
          id: `f${items.length + 1}`,
          type: draft.type,
          text: draft.text,
          anonymous: draft.anonymous,
          ...(draft.anonymous ? {} : { uid }),
          createdAtMs: Date.now(),
        });
      },
      async toggleUpvote(feedbackId, uid, currentlyUpvoted) {
        const i = upvotes.findIndex((v) => v.feedbackId === feedbackId && v.uid === uid);
        if (currentlyUpvoted && i !== -1) upvotes.splice(i, 1);
        else if (!currentlyUpvoted && i === -1) upvotes.push({ feedbackId, uid });
      },
      async adminDelete(feedbackId) {
        const i = items.findIndex((it) => it.id === feedbackId);
        if (i !== -1) items.splice(i, 1);
      },
    };
  }, { admin });
}

async function gotoFeedback(page) {
  await page.goto('/feedback', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('feedback-page')).toBeVisible();
  await expect(page.getByTestId('feedback-list')).toBeVisible();
}

test('signed out shows the sign-in prompt, no form or board', async ({ page }) => {
  await page.goto('/feedback', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('feedback-signin')).toBeVisible();
  await expect(page.getByTestId('feedback-form')).toHaveCount(0);
});

test('board lists newest first, filters by type, upvote toggles optimistically', async ({ page }) => {
  await seed(page);
  await gotoFeedback(page);

  // Newest (f2) first.
  const itemIds = page.locator('[data-testid^="feedback-item-"]');
  await expect(itemIds).toHaveCount(2);
  await expect(itemIds.first()).toHaveAttribute('data-testid', 'feedback-item-f2');

  // Type filter narrows to bugs.
  await page.getByTestId('feedback-filter-bug').click();
  await expect(itemIds).toHaveCount(1);
  await expect(page.getByTestId('feedback-item-f1')).toContainText('Simulator forgets my grades');

  // f1 starts upvoted (seeded); clicking clears it, clicking again restores.
  const vote = page.getByTestId('feedback-vote-f1');
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'false');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
});

test('submit validates, sends, clears the box, and lands on the board', async ({ page }) => {
  await seed(page);
  await gotoFeedback(page);

  // Too-short text is rejected inline.
  await page.getByTestId('feedback-text').fill('ab');
  await page.getByTestId('feedback-send').click();
  await expect(page.getByTestId('feedback-error')).toBeVisible();

  // A real submission goes through and reloads the board.
  await page.getByTestId('feedback-type-feature').click();
  await page.getByTestId('feedback-text').fill('Export the planner as an image');
  await page.getByTestId('feedback-send').click();
  await expect(page.getByTestId('feedback-text')).toHaveValue('');
  await expect(page.getByText('Export the planner as an image')).toBeVisible();
});

test('admin sees delete; confirm removes the item', async ({ page }) => {
  // isAdmin comes from the auth snapshot, which outranks seed()'s admin flag.
  await installAuth(page, {
    status: 'authenticated', uid: 'u_me', email: 'me@g.bracu.ac.bd',
    isAdmin: true, university: 'bracu',
  });
  await seed(page, { admin: true });
  await gotoFeedback(page);

  await page.getByTestId('feedback-del-f1').click();
  // Shared ConfirmDialog: confirm the destructive action.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('feedback-item-f1')).toHaveCount(0);
  await expect(page.getByTestId('feedback-item-f2')).toBeVisible();
});

test('non-admin sees no delete affordance', async ({ page }) => {
  await seed(page);
  await gotoFeedback(page);
  await expect(page.locator('[data-testid^="feedback-del-"]')).toHaveCount(0);
});
