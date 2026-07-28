// Shared navigation helper for the shell's grouped tab bar.
//
// The shell used to render a flat list of 19 nav links that collapsed behind a
// "Menu" toggle on narrow viewports, so specs could click any route by name (or
// open the toggle first). The bar now mirrors legacy's grouped structure
// (src/app/ShellTabs.tsx): five top-level slots, with most routes inside a
// dropdown that must be opened before its items are clickable.
//
// Use navigateTo() instead of clicking a route link directly — it opens the
// owning group when there is one, and clicks straight through when the route is
// a top-level tab.

/** Route label -> the dropdown that holds it. Mirrors TABS in ShellTabs.tsx;
 *  routes absent from this map are top-level tabs. */
const GROUP_OF = {
  Planner: 'Plan',
  Routine: 'Plan',
  Transcript: 'Plan',
  Degree: 'Plan',

  Reviews: 'Courses',
  Difficulty: 'Courses',
  Papers: 'Courses',

  Seats: 'Campus',
  'Free Rooms': 'Campus',
  'Campus Map': 'Campus',
  Bus: 'Campus',
  'Lost & Found': 'Campus',
  Cafeteria: 'Campus',
  Feedback: 'Campus',
};

/**
 * Navigate to a route by its visible tab label.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} linkName Exact label, e.g. 'Planner' or 'Calculator'.
 */
export async function navigateTo(page, linkName) {
  const group = GROUP_OF[linkName];
  if (group) {
    // The trigger is a <button>; its icon and caret are aria-hidden, so the
    // accessible name is just the group label.
    await page.getByRole('button', { name: group, exact: true }).click();
  }
  await page.getByRole('link', { name: linkName, exact: true }).click();
}
