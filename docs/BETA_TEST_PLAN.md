# Shohoj Beta Test Plan

Use this plan to validate Shohoj with real BRACU students before wider release.

## Goals

- Confirm first-time users understand what Shohoj does.
- Validate Demo Mode for recruiters and non-BRACU viewers.
- Test CGPA, retake/repeat logic, transcript import, semester planning, and degree progress with real student scenarios.
- Find mobile layout issues on common phones.
- Collect feedback on faculty reviews, past papers, and admin moderation flows.

## Tester Profile

Aim for 10 to 20 testers in the first beta round:

- CSE/CS students from different semesters
- At least 2 students who have retaken or repeated a course
- At least 2 students with long transcripts
- At least 3 mobile-first users
- 1 or 2 trusted admin/moderator testers if admin workflows are in scope

Do not ask testers to share passwords, private tokens, or unnecessary personal data.

## Test Setup

Ask each tester to use:

- Live site: `https://souravmondalshuvo.github.io/Shohoj`
- Their own laptop or phone
- Their preferred browser
- Demo Mode first, then real BRACU sign-in only if they are comfortable

Recommended devices:

- iPhone Safari
- Android Chrome
- MacBook Safari
- Chrome or Brave desktop

## Session Script

Each session should take 20 to 30 minutes.

1. Open Shohoj.
2. Ask the tester what they think the product does before clicking anything.
3. Click Try Demo Mode.
4. Review the CGPA calculator and fake semester data.
5. Add or edit one course and confirm the CGPA changes.
6. Open Semester Planner and inspect available/locked courses.
7. Open Degree Progress and check whether the progress view is understandable.
8. Open Faculty Reviews and search by course or faculty.
9. Open Past Papers and browse approved resources.
10. Try the transcript import flow if the tester is comfortable using a real transcript.
11. On mobile, check navigation, modals, buttons, horizontal scroll, and custom cursor behavior.

## Feature Checklist

### Demo Mode

- Tester can find Try Demo Mode quickly.
- Fake data loads without BRACU login.
- Demo data feels realistic enough to understand the product.

### CGPA Calculator

- Adding a course is clear.
- Grade changes update GPA/CGPA as expected.
- Retake/repeat labels make sense.
- Export/import controls do not confuse users.

### Transcript Import

- Upload flow is understandable.
- Parsed semesters and courses match the source transcript.
- Errors explain what the tester should do next.
- No transcript content is shared outside the tester's own session without permission.

### Semester Planner

- Available courses feel relevant.
- Locked courses explain missing prerequisites.
- Credit-load warnings are visible and understandable.
- Start Semester behavior is clear.

### Degree Progress

- Credits earned, credits remaining, and estimated progress are easy to understand.
- Tester understands that graduation estimates are approximate.

### Faculty Reviews

- Search and filters are easy to use.
- Rating dimensions are understandable.
- Pseudonymous review wording does not overclaim full anonymity.

### Past Papers

- Browsing by course code is easy.
- Upload/download expectations are clear.
- Moderation status is understandable.

### Admin Dashboard

- Admin-only access is enforced.
- Pending papers, reports, feedback, and audit logs are understandable.
- Delete/approve actions are hard to trigger accidentally.

### Mobile

- No horizontal scroll on common phone widths.
- Buttons are large enough to tap.
- Modals fit the viewport.
- Navbar and tabs remain usable.
- Custom cursor behavior does not interfere on touch devices.

## Feedback Questions

Ask these after the test:

- What did you expect Shohoj to do before using it?
- Which feature felt most useful?
- Which step was confusing?
- Did any result look wrong or surprising?
- Would you trust this for planning your semester?
- What would stop you from using it regularly?
- What should be added before sharing it with more BRACU students?

## Success Metrics

For a first beta round, aim for:

- 80% of testers can load Demo Mode without help.
- 80% can add or edit a course and understand the CGPA update.
- 70% can explain what the Semester Planner is recommending.
- 70% can understand Degree Progress without extra explanation.
- No critical transcript import errors across tested transcript formats.
- No blocker mobile layout issues on tested phones.

## Privacy and Safety

- Do not collect transcript PDFs unless the tester explicitly agrees.
- Do not publish screenshots containing real names, student IDs, emails, or grades.
- Do not ask testers to share their Google password or authentication code.
- Use anonymized notes when recording feedback.
- Treat faculty reviews and reports as sensitive moderation data.

## Triage After Testing

After each beta round:

1. Group findings into bugs, UX issues, data gaps, and feature requests.
2. Create one GitHub issue per actionable fix.
3. Prioritize transcript import bugs, incorrect CGPA logic, auth/security issues, and mobile blockers first.
4. Add screenshots or reproduction steps to each issue.
5. Close non-actionable feedback with a short note instead of leaving stale issues open.
