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
// The shell builds to dist-shell/index.html with base '/' and the router resolves
// absolute paths on initial load, so the route is reached by deep-linking
// /calculator directly (the SPA preview server falls back to index.html).

import { expect, test } from '../e2e-support/authFixture.js';

async function gotoCalculator(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'CGPA Calculator' })).toBeVisible();
  return page.locator('#semestersContainer');
}

test('the served root resolves to Home on initial load', async ({ page }) => {
  // Regression: the shell builds to dist-shell/index.html with base '/', so the
  // root pathname matches the index route. Before the base/root fix the entry
  // loaded at a nested path and matched only the catch-all NotFound route.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    // The hero now carries legacy's copy and capitalisation: "University Life,"
    // / "Made Simple." across a <br>, with সহজ appended. Matched
    // case-insensitively on the first clause so a future line-break or the
    // Bengali suffix does not break this guard again.
    page.getByRole('heading', { name: /University Life/i, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
});

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
