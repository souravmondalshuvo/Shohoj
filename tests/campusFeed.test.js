/**
 * tests/campusFeed.test.js
 * The section feed generated for a campus whose routine comes from the campus
 * database (NSU, DIU): it is current with data/campuses/, it parses through the
 * same parser the Routine tab uses for BRACU's live feed, and it carries
 * nothing a snapshot cannot vouch for.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NO_ROOM, buildCampusFeed, classDates, feedSectionId, feedSessionId } from '../scripts/campus_feed.mjs';
import { CAMPUS_FEEDS, feedPath, renderCampusFeeds } from '../scripts/generate_campus_feed.mjs';
import { loadCampuses } from '../scripts/campus_data.mjs';
import { CAMPUS_FEED_SNAPSHOTS } from '../js/core/campusFeeds.generated.js';
import { detectClashes, indexByCourse, parseFeed } from '../js/core/connectFeed.js';
import { describeSemester, semesterNameFromSessionId } from '../js/core/semesterIdentity.js';

const nsuConfig = CAMPUS_FEEDS.find((f) => f.campus === 'nsu');
const nsuMeta = CAMPUS_FEED_SNAPSHOTS.nsu;
const nsuRaw = JSON.parse(readFileSync(feedPath('nsu', nsuMeta.term), 'utf8'));
const nsu = loadCampuses().campuses.find((c) => c.id === 'nsu');
const snapshot = nsu.sections[nsuConfig.termKey];

test('the generated files are current with data/campuses', () => {
  for (const { path, text } of renderCampusFeeds()) {
    assert.equal(readFileSync(path, 'utf8'), text, `${path} is stale — run: npm run generate:campus-feed`);
  }
});

test('every section parses through the Routine tab’s own parser, none dropped', () => {
  const { sections, dropped } = parseFeed(nsuRaw);
  assert.equal(dropped.length, 0);
  assert.equal(sections.length, snapshot.records.length);
  assert.equal(sections.length, nsuMeta.sectionCount);
  assert.equal(indexByCourse(sections).size, nsuMeta.courseCount);
});

test('section ids are unique, positive integers, and stable', () => {
  const ids = nsuRaw.map((s) => s.sectionId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0 && id <= 0x7fffffff));
  // The same term, course and section always give the same id: saved picks
  // must survive a regeneration.
  assert.equal(feedSectionId('263', 'ACT201', 1), nsuRaw.find((s) => s.courseCode === 'ACT201' && s.sectionName === '1').sectionId);
  assert.notEqual(feedSectionId('263', 'ACT201', 1), feedSectionId('262', 'ACT201', 1));
});

test('RDS day letters become weekdays: R is Thursday, A is Saturday', () => {
  const { sections } = parseFeed(nsuRaw);
  const byKey = new Map(sections.map((s) => [`${s.courseCode}/${s.sectionName}`, s]));
  for (const [pattern, days] of [
    ['ST', ['SUNDAY', 'TUESDAY']],
    ['MW', ['MONDAY', 'WEDNESDAY']],
    ['RA', ['THURSDAY', 'SATURDAY']],
    ['F', ['FRIDAY']],
  ]) {
    const record = snapshot.records.find((r) => r.days === pattern);
    const section = byKey.get(`${record.course}/${record.section}`);
    assert.deepEqual(section.classSlots.map((s) => s.day), days, pattern);
    assert.equal(section.classSlots[0].room, record.room);
  }
});

test('a section with no published time is listed, with no class slots', () => {
  const untimed = snapshot.records.filter((r) => !r.days);
  assert.ok(untimed.length > 0);
  assert.equal(untimed.length, nsuMeta.untimedCount);
  const { sections } = parseFeed(nsuRaw);
  const byKey = new Map(sections.map((s) => [`${s.courseCode}/${s.sectionName}`, s]));
  const section = byKey.get(`${untimed[0].course}/${untimed[0].section}`);
  assert.ok(section, 'still listed');
  assert.deepEqual(section.classSlots, []);
});

test('no seat count is carried: a stale one would read as live', () => {
  assert.ok(snapshot.records.some((r) => r.seatsAvailable > 0), 'the snapshot does have seat numbers');
  assert.ok(nsuRaw.every((s) => s.capacity === 0 && s.consumedSeat === 0));
  assert.ok(!JSON.stringify(nsuRaw[0]).includes('seatsAvailable'));
  assert.ok(parseFeed(nsuRaw).sections.every((s) => s.isFull === false));
});

test('titles and credits come from the campus catalogue', () => {
  const act = nsuRaw.find((s) => s.courseCode === 'ACT201');
  assert.equal(act.courseName, 'Introduction to Financial Accounting');
  assert.equal(act.courseCredit, 3);
});

test('the semester is named and dated from NSU’s own calendar', () => {
  assert.equal(feedSessionId('263'), 20263);
  assert.equal(semesterNameFromSessionId(nsuMeta.semesterSessionId), 'Fall 2026');
  assert.deepEqual(classDates(nsu.calendars[nsuConfig.termKey]), {
    classStartDate: '2026-09-20',
    classEndDate: '2026-12-20',
  });
  const identity = describeSemester(parseFeed(nsuRaw).sections, '2026-10-05');
  assert.equal(identity.name, 'Fall 2026');
  assert.throws(() => feedSessionId('26X'));
});

test('clash detection works on the generated sections', () => {
  const { sections } = parseFeed(nsuRaw);
  const timed = sections.filter((s) => s.classSlots.length > 0);
  const a = timed[0];
  const sameSlot = timed.find(
    (s) => s.sectionId !== a.sectionId
      && s.classSlots[0].day === a.classSlots[0].day
      && s.classSlots[0].startMin === a.classSlots[0].startMin,
  );
  assert.ok(sameSlot, 'two sections share a slot somewhere in 3,818');
  const report = detectClashes([a, sameSlot]);
  assert.equal(report.classClashes.length, 1);
  // No exam schedule is published per section, so none can clash.
  assert.equal(report.examClashes.length, 0);
});

test('capturedOn is the date the snapshot’s own note gives it', () => {
  assert.equal(nsuMeta.capturedOn, '2026-09-28');
  assert.ok(snapshot.note.includes('dated 28 Sep 2026'), 'the note no longer states this capture date');
  assert.equal(nsuMeta.source, snapshot.source);
});

test('the mapping rejects a day letter it does not know', () => {
  assert.throws(
    () => buildCampusFeed({ term: '263', records: [{ course: 'X101', section: 1, days: 'Q', start: '08:00', end: '09:00' }] }, null, []),
    /unknown day letter 'Q'/,
  );
});

// ── DIU: per-day meetings, program-scoped codes, a few departments ───────────

const diuConfig = CAMPUS_FEEDS.find((f) => f.campus === 'diu');
const diuMeta = CAMPUS_FEED_SNAPSHOTS.diu;
const diuRaw = JSON.parse(readFileSync(feedPath('diu', diuMeta.term), 'utf8'));
const diu = loadCampuses().campuses.find((c) => c.id === 'diu');
const diuSnapshot = diu.sections[diuConfig.termKey];
const diuKey = (r) => `${r.program}|${r.course}|${r.section}`;

test('DIU: every section parses, none dropped, ids unique', () => {
  const { sections, dropped } = parseFeed(diuRaw);
  assert.equal(dropped.length, 0);
  assert.equal(sections.length, diuSnapshot.records.length);
  assert.equal(sections.length, diuMeta.sectionCount);
  assert.equal(new Set(diuRaw.map((s) => s.sectionId)).size, diuRaw.length);
  // The program is part of a program-scoped section's id; a campus-wide one's
  // id is what it always was.
  assert.notEqual(feedSectionId('263', 'MAT101', '67_A', 'CSE'), feedSectionId('263', 'MAT101', '67_A', 'SWE'));
  assert.equal(feedSectionId('263', 'ACT201', 1, undefined), feedSectionId('263', 'ACT201', 1));
});

const DIU_DAYS = { S: 'SUNDAY', M: 'MONDAY', T: 'TUESDAY', W: 'WEDNESDAY', R: 'THURSDAY', F: 'FRIDAY', A: 'SATURDAY' };
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

test('DIU: each meeting keeps its own day, time and room', () => {
  const records = new Map(diuSnapshot.records.map((r) => [feedSectionId('263', r.course, r.section, r.program), r]));
  const { sections } = parseFeed(diuRaw);
  let multiRoom = 0;
  let roomless = 0;
  for (const section of sections) {
    const record = records.get(section.sectionId);
    assert.ok(record, `${section.courseCode} ${section.sectionName} comes from the snapshot`);
    assert.equal(section.classSlots.length, record.meetings.length);
    const rooms = new Set(record.meetings.map((m) => m.room).filter(Boolean));
    if (rooms.size > 1) multiRoom++;
    record.meetings.forEach((m, i) => {
      const slot = section.classSlots[i];
      const where = `${diuKey(record)} meeting ${i}`;
      assert.equal(slot.day, DIU_DAYS[m.day], where);
      assert.equal(slot.startMin, minutes(m.start), where);
      assert.equal(slot.endMin, minutes(m.end), where);
      // A roomless meeting beside roomed ones says so; it never takes theirs.
      if (!m.room && rooms.size > 0) roomless++;
      assert.equal(slot.room, m.room ?? (rooms.size > 0 ? NO_ROOM : ''), where);
    });
    assert.equal(section.roomName, [...rooms].join(' · '));
  }
  assert.ok(multiRoom > 0, 'some DIU sections meet in more than one room');
  assert.ok(roomless > 0, 'some DIU meetings (SWE online classes) have no room');
});

test('DIU: a course two programs both list names each section’s program', () => {
  const { sections } = parseFeed(diuRaw);
  const mat = sections.filter((s) => s.courseCode === 'MAT101').map((s) => s.sectionName);
  assert.ok(mat.includes('CSE 73_A') && mat.includes('SWE 48-A'), mat.slice(0, 4).join(', '));
  // A course only one program lists keeps the section name as printed.
  assert.ok(sections.some((s) => s.courseCode === 'ACT327' && s.sectionName === '67_A'));
});

test('DIU: titles and credits come from the section’s own program, never another’s', () => {
  const titled = diuRaw.find((s) => s.courseCode === 'MAT101' && s.courseName !== '');
  assert.equal(titled.courseName, 'Mathematics - I');
  assert.equal(titled.courseCredit, 3);
  // SWE's MAT101 is a stub in SWE's list: no title, no credits, rather than CSE's.
  const sweIds = new Set(
    diuSnapshot.records
      .filter((r) => r.program === 'SWE' && r.course === 'MAT101')
      .map((r) => feedSectionId('263', r.course, r.section, r.program)),
  );
  assert.ok(sweIds.size > 0);
  for (const s of diuRaw.filter((x) => sweIds.has(x.sectionId))) {
    assert.equal(s.courseName, '');
    assert.equal(s.courseCredit, 0);
  }
});

test('DIU: the snapshot names the programs it covers, and does not serve Free Rooms', () => {
  assert.deepEqual(diuMeta.programs, ['CSE', 'ENG', 'SWE']);
  assert.equal(diuMeta.freeRooms, false);
  assert.equal(nsuMeta.programs, null);
  assert.equal(nsuMeta.freeRooms, true);
});

test('DIU: dated from its calendar, classes ending no later than the eve of finals', () => {
  assert.equal(semesterNameFromSessionId(diuMeta.semesterSessionId), 'Fall 2026');
  // DIU names no last day of classes; finals start 17 Dec and run to 24 Dec.
  assert.deepEqual(classDates(diu.calendars[diuConfig.termKey]), {
    classStartDate: '2026-09-09',
    classEndDate: '2026-12-16',
  });
  assert.equal(diuMeta.examStartDate, '2026-12-17');
  assert.equal(diuMeta.examEndDate, '2026-12-24');
  const identity = describeSemester(parseFeed(diuRaw).sections, '2026-10-22');
  assert.equal(identity.name, 'Fall 2026');
  assert.equal(identity.status, 'running');
});

test('DIU: capturedOn is the newest routine the file gathers', () => {
  // CSE V4.1 (3 Oct), SWE V5 (10 Oct), English V-0.7 (14 Oct): the file is
  // true once the last of them is out.
  assert.equal(diuMeta.capturedOn, '2026-10-14');
  assert.ok(diuSnapshot.note.includes('V-0.7 (14 Oct 2026)'), 'the note no longer dates English’s schedule');
});

test('the mapping rejects a meeting day letter it does not know', () => {
  assert.throws(
    () => buildCampusFeed({ term: '263', records: [{ course: 'X101', section: 1, days: null, start: null, end: null, meetings: [{ day: 'Q', start: '08:00', end: '09:00', room: null }] }] }, null, []),
    /unknown day letter 'Q'/,
  );
});
