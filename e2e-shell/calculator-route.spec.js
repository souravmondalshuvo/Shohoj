// e2e-shell/calculator-route.spec.js
//
// Phase 5B: verifies the React calculator wired into the shell /calculator route
// against the built dist-shell/ output. Unlike the island spec (e2e-vite), this
// exercises the shell's own reducer container: CalculatorRoute owns
// useReducer(calculatorReducer), seeds from the persistence engine, and renders
// CalculatorSemesters through a reducer-backed CalculatorBridge. The bridge's
// catalog/demo/rate are inert in the shell for now, so this covers the wired
// surface: add-semester, add-course, and persistence to localStorage.
//
// The shell is reached by loading the built index and navigating in-app — a deep
// link to /calculator 404s on a static server (base/basename mismatch, tracked
// separately), but client-side navigation works, which is how the shell runs.

import { expect, test } from '@playwright/test';

async function gotoCalculator(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.locator('#semestersContainer');
}

test('the shell calculator route mounts the React container', async ({ page }) => {
  const container = await gotoCalculator(page);
  // Fresh state → the React empty state renders inside the route's container.
  await expect(container.locator('.empty-state')).toBeVisible();
});

test('adding a semester then a course flows through the reducer', async ({ page }) => {
  const container = await gotoCalculator(page);

  // Empty-state "+ Add semester" → bridge.addSemester → reducer addSemester.
  await container.getByRole('button', { name: '+ Add semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(1);
  await expect(container.locator('input[id^="course-input-"]')).toHaveCount(1);

  // "+ Add course" → bridge.commit(addCourse(...)) → reducer replace → re-render.
  await container.getByRole('button', { name: '+ Add course' }).first().click();
  await expect(container.locator('input[id^="course-input-"]')).toHaveCount(2);
});

test('a mutation persists through the Phase 4 engine to localStorage', async ({ page }) => {
  const container = await gotoCalculator(page);

  // No write before the first mutation (the seed load is not re-persisted).
  expect(await page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1'))).toBeNull();

  await container.getByRole('button', { name: '+ Add semester' }).click();
  await expect(container.locator('.semester-block')).toHaveCount(1);

  // persistCalculatorState stamped the state under the academic-store key.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('shohoj_cgpa_v1')))
    .not.toBeNull();
});
