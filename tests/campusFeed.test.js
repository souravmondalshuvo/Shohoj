/**
 * tests/campusFeed.test.js
 * The section feed generated for a campus whose routine comes from the campus
 * database (NSU): it is current with data/campuses/, it parses through the
 * same parser the Routine tab uses for BRACU's live feed, and it carries
 * nothing a snapshot cannot vouch for.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildCampusFeed, classDates, feedSectionId, feedSessionId } from '../scripts/campus_feed.mjs';
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
  assert.ok(sameSlot, 'two sections share a slot somewhere in 3,787');
  const report = detectClashes([a, sameSlot]);
  assert.equal(report.classClashes.length, 1);
  // No exam schedule is published per section, so none can clash.
  assert.equal(report.examClashes.length, 0);
});

test('capturedOn is the scrape date the snapshot’s own note states', () => {
  assert.equal(nsuMeta.capturedOn, '2026-09-23');
  assert.ok(snapshot.note.includes('23 Sep 2026'), 'the note no longer states this capture date');
  assert.equal(nsuMeta.source, snapshot.source);
});

test('the mapping rejects a day letter it does not know', () => {
  assert.throws(
    () => buildCampusFeed({ term: '263', records: [{ course: 'X101', section: 1, days: 'Q', start: '08:00', end: '09:00' }] }, null, []),
    /unknown day letter 'Q'/,
  );
});
