// tests/unlockMapCard.test.js — the "Next registration" zone's wording and
// state selection (#478).
//
// The eligibility arithmetic is pinned in tests/prereq.test.js. What matters
// here is that the zone picks the honest state: it must never show an empty map
// when the real reason is a missing transcript or a feed that publishes no
// prerequisites, and it must admit the courses it could not read.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  umcHtmlFor,
  umcNoPrereqDataHtml,
  umcNoTranscriptHtml,
  umcZoneHtml,
} from '../js/ui/unlockMapCard.js';
import { buildUnlockMap } from '../js/core/prereq.js';
import { profileSignedInHtml } from '../js/ui/profileTab.js';

const SECTIONS = [
  {
    courseCode: 'CSE110',
    courseName: 'Programming Language I',
    credits: 3,
    prerequisiteCourses: '',
  },
  {
    courseCode: 'CSE111',
    courseName: 'Programming Language II',
    credits: 3,
    prerequisiteCourses: '(CSE110)',
  },
  {
    courseCode: 'CSE220',
    courseName: 'Data Structures',
    credits: 3,
    prerequisiteCourses: '(CSE111)',
  },
  { courseCode: 'CSE221', courseName: 'Algorithms', credits: 3, prerequisiteCourses: '(CSE220)' },
];

const snapshotWith = (courses) => ({ semesters: [{ name: 'Fall 2024', courses }] });

// ── The slot on the page ─────────────────────────────────────────────────────

test('the profile hub emits the host the zone paints into', () => {
  const signedIn = { signedIn: true, displayName: 'X', email: 'x@g.bracu.ac.bd', photoURL: null };
  const withBriefing = profileSignedInHtml(signedIn, null, null, null, 0, null, {
    includeBriefing: true,
  });
  assert.match(withBriefing, /id="pfUnlockHost"/);

  // Without the opt-in there is no slot, so the tab embedded in the main app is
  // unchanged — the zone ships on the standalone page only, like the briefing.
  const without = profileSignedInHtml(signedIn, null, null, null, 0, null, {});
  assert.doesNotMatch(without, /id="pfUnlockHost"/);
});

// ── State selection ──────────────────────────────────────────────────────────

test('no transcript invites the import instead of showing an empty map', () => {
  assert.equal(umcHtmlFor(null, SECTIONS), umcNoTranscriptHtml());
  assert.equal(umcHtmlFor({}, SECTIONS), umcNoTranscriptHtml());
  assert.equal(umcHtmlFor({ semesters: [] }, SECTIONS), umcNoTranscriptHtml());
  assert.match(umcNoTranscriptHtml(), /Import your transcript/);
});

test('a feed with no prerequisites says so rather than blaming the student', () => {
  const bare = [{ courseCode: 'MAT110', courseName: 'Calculus', credits: 3 }];
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), bare);
  assert.equal(html, umcNoPrereqDataHtml());
  assert.match(html, /Nothing is wrong with your data/);
});

// ── The zone itself ──────────────────────────────────────────────────────────

test('renders the three cards the issue asks for', () => {
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), SECTIONS);
  assert.match(html, /Unlocked now/);
  assert.match(html, /One course away/);
  assert.match(html, /Highest leverage/);

  // CSE111 is takeable and opens CSE220; CSE220 is the next step.
  assert.match(html, /CSE111/);
  assert.match(html, /needs <strong>CSE111<\/strong>/);
});

test('a failed course does not count as a prerequisite, and resurfaces as the next step', () => {
  const passed = buildUnlockMap(SECTIONS, new Set(['CSE110']));
  const failed = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'F' }]), SECTIONS);

  // Passing CSE110 makes CSE111 takeable; failing it does not.
  assert.ok(passed.unlocked.some((c) => c.code === 'CSE111'));
  assert.match(failed, /needs <strong>CSE110<\/strong>/);

  // And the failed course itself is back on the list — it has no prerequisites
  // of its own, so retaking it is exactly the move to make.
  assert.match(failed, /CSE110/);
  assert.match(failed, /Highest leverage/);
});

test('unreadable prerequisites are admitted, not hidden', () => {
  const withJunk = [
    ...SECTIONS,
    { courseCode: 'CSE499', courseName: 'Thesis', credits: 6, prerequisiteCourses: 'ask advisor' },
  ];
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), withJunk);
  assert.match(html, /couldn't be read/);
  assert.match(html, /check with your advisor/);
  assert.match(html, /CSE499/, 'still listed — failing open must not hide the course');
});

test('a clean read carries no advisor caveat', () => {
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), SECTIONS);
  assert.doesNotMatch(html, /couldn't be read/);
});

test('the leverage card is omitted when nothing opens anything', () => {
  const flat = [
    { courseCode: 'MAT110', courseName: 'Calculus', credits: 3, prerequisiteCourses: '(CSE110)' },
    { courseCode: 'ENG101', courseName: 'English', credits: 3, prerequisiteCourses: '(CSE110)' },
  ];
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), flat);
  assert.doesNotMatch(html, /Highest leverage/);
  assert.match(html, /Unlocked now/);
});

test('course names are escaped', () => {
  const hostile = [
    {
      courseCode: 'CSE110',
      courseName: '<img src=x onerror=alert(1)>',
      credits: 3,
      prerequisiteCourses: '',
    },
    { courseCode: 'CSE111', courseName: 'Safe', credits: 3, prerequisiteCourses: '(CSE110)' },
  ];
  const html = umcZoneHtml(buildUnlockMap(hostile, new Set()));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('long lists roll up rather than printing everything', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    courseCode: `GEN${100 + i}`,
    courseName: `General ${i}`,
    credits: 3,
    prerequisiteCourses: '',
  }));
  // One course with a real prerequisite, so hasPrereqData is true.
  many.push({
    courseCode: 'CSE111',
    courseName: 'Programming Language II',
    credits: 3,
    prerequisiteCourses: '(CSE110)',
  });
  const html = umcHtmlFor(snapshotWith([{ name: 'Programming (CSE110)', grade: 'A' }]), many);
  assert.match(html, /\+7 more/); // 15 unlocked, 8 shown
});

// ── Program relevance (#539) ─────────────────────────────────────────────────

const PROGRAMS = {
  CSE: {
    label: 'B.Sc. in Computer Science and Engineering (CSE)',
    presets: [{ courses: [{ name: 'Programming Language I (CSE110)' }] }],
  },
};

const CROSS_DEPT = [
  ...SECTIONS,
  { courseCode: 'BCH101', courseName: 'Basic Biochemistry', credits: 3, prerequisiteCourses: '' },
  { courseCode: 'BCH201', courseName: 'Human Physiology', credits: 3, prerequisiteCourses: '(BCH101)' },
  { courseCode: 'ARC102', courseName: 'Design II', credits: 3, prerequisiteCourses: '(ARC101)' },
];

const cseSnapshot = {
  program: PROGRAMS.CSE.label,
  semesters: [{ name: 'Fall 2024', courses: [{ name: 'Programming (CSE110)', grade: 'A' }] }],
};

test('a known program keeps other degrees out of the map', () => {
  const html = umcHtmlFor(cseSnapshot, CROSS_DEPT, { programs: PROGRAMS });
  assert.doesNotMatch(html, /BCH101/, 'no biochemistry for a CSE student');
  assert.doesNotMatch(html, /ARC102/, 'no architecture either');
  assert.match(html, /CSE111/, 'their own department survives');
  assert.match(html, /Filtered to your program/);
  assert.match(html, /data-action="unlock:showAll"/, 'and a way out of the filter');
});

test('showing all departments restores the unfiltered map', () => {
  const html = umcHtmlFor(cseSnapshot, CROSS_DEPT, { programs: PROGRAMS, showAll: true });
  assert.match(html, /BCH101/);
  assert.match(html, /Showing every department/);
  assert.match(html, /data-action="unlock:programOnly"/, 'and a way back');
});

test('an unrecognized program filters nothing and says nothing', () => {
  const html = umcHtmlFor(
    { ...cseSnapshot, program: 'B.Sc. in Underwater Basketry' },
    CROSS_DEPT,
    { programs: PROGRAMS },
  );
  assert.match(html, /BCH101/, 'better everything than a blank zone');
  assert.doesNotMatch(html, /Filtered to your program/, 'and no claim we filtered');
  assert.doesNotMatch(html, /data-action="unlock:showAll"/);
});
