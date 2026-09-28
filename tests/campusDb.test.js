/**
 * tests/campusDb.test.js (#784)
 *
 * Builds the campus database from the committed data into a temp dir and
 * queries it the way a student-facing feature would: row counts agree with the
 * JSON they came from, a free-room question answers correctly, prerequisites
 * join back to courses, and the build is deterministic (the D1 dump is only
 * safe to diff and reload if rebuilding unchanged data yields the same file).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { loadCampuses } from '../scripts/campus_data.mjs';
import { buildCampusDb } from '../scripts/build_campus_db.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-db-'));
try {
  const { dbPath, sqlPath } = buildCampusDb({ outDir: out });
  const { campuses } = loadCampuses();
  const nsu = campuses.find((c) => c.id === 'nsu');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  // node:sqlite returns null-prototype rows; spread them so deepEqual compares values.
  const all = (sql, ...params) => db.prepare(sql).all(...params).map((row) => ({ ...row }));

  // Every record made it in.
  assert.equal(one("SELECT COUNT(*) AS n FROM courses WHERE campus='nsu'").n, nsu.courses.records.length);
  assert.equal(one("SELECT COUNT(*) AS n FROM programs WHERE campus='nsu'").n, nsu.programs.records.length);
  for (const [key, file] of Object.entries(nsu.sections)) {
    const [term, system] = key.split('-');
    const where = `campus='nsu' AND term='${term}' AND term_system='${system}'`;
    assert.equal(one(`SELECT COUNT(*) AS n FROM sections WHERE ${where}`).n, file.records.length, key);
    // Only scheduled sections expand into meetings; an internship has none.
    const expected = file.records.reduce((n, s) => n + (s.days ? s.days.length : 0), 0);
    assert.equal(one(`SELECT COUNT(*) AS n FROM meetings WHERE ${where}`).n, expected, `${key} meetings`);
  }
  assert.ok(one("SELECT COUNT(*) AS n FROM sections WHERE campus='nsu' AND days IS NULL").n > 0, 'unscheduled sections are kept');
  // A snapshot term carries seats left, not a section size.
  const fall = one("SELECT COUNT(capacity) AS sized, COUNT(seats_available) AS counted, COUNT(*) AS n FROM sections WHERE campus='nsu' AND term='263' AND term_system='trimester'");
  assert.equal(fall.sized, 0);
  assert.equal(fall.counted, fall.n);
  // Catalogue stubs keep their null title rather than inventing one.
  assert.ok(one("SELECT COUNT(*) AS n FROM courses WHERE campus='nsu' AND title IS NULL").n > 0);
  const corrected = one("SELECT \"end\", note FROM sections WHERE campus='nsu' AND term='253' AND course='ARC273' AND section=2");
  assert.equal(corrected.end, '13:40');
  assert.match(corrected.note, /Printed as/, 'a corrected value says what was printed');

  // Campus rules come through as columns you can filter on.
  const profile = one("SELECT * FROM campuses WHERE id='nsu'");
  assert.equal(profile.max_retakes, 3);
  assert.equal(profile.retake_eligible_at_or_below, 'B');
  assert.equal(profile.credit_load_max, null, 'NSU publishes no maximum load');
  assert.equal(one("SELECT points FROM grades WHERE campus='nsu' AND letter='A-'").points, 3.7);
  assert.equal(one("SELECT COUNT(*) AS n FROM grades WHERE campus='nsu' AND letter IN ('A+','D-')").n, 0);

  // Free rooms: take a real meeting, then ask which rooms are busy in that
  // slot. Its room must be among them, and a room free all day must not be.
  const TERM = "campus='nsu' AND term='253' AND term_system='trimester'";
  const sample = one(`SELECT room, day, start, "end" FROM meetings WHERE ${TERM} AND room IS NOT NULL ORDER BY course, section LIMIT 1`);
  const busy = new Set(all(
    `SELECT DISTINCT room FROM meetings
      WHERE ${TERM} AND day=? AND start < ? AND "end" > ? AND room IS NOT NULL`,
    sample.day, sample.end, sample.start,
  ).map((r) => r.room));
  assert.ok(busy.has(sample.room), 'a room is busy during its own class');
  const free = all(
    `SELECT room FROM rooms WHERE ${TERM}
      AND room NOT IN (SELECT room FROM meetings WHERE ${TERM} AND day=? AND start < ? AND "end" > ? AND room IS NOT NULL)`,
    sample.day, sample.end, sample.start,
  ).map((r) => r.room);
  assert.ok(free.length > 0 && !free.includes(sample.room), 'free rooms exclude the occupied one');

  // Prerequisites: each rule keeps its own source, and alternatives share a
  // requirement number within that rule.
  const optionsOf = (course, source) => all(
    `SELECT o.requirement, o.requires FROM prerequisite_options o
       JOIN prerequisites p ON p.campus = o.campus AND p.id = o.rule
      WHERE p.campus='nsu' AND p.course=? AND p.source=? ORDER BY o.requirement, o.requires`,
    course, source,
  );
  assert.deepEqual(optionsOf('CSE225', 'nsu-ece-courses'), [{ requirement: 1, requires: 'CSE215' }]);
  assert.deepEqual(optionsOf('EEE111', 'nsu-ece-courses'), [{ requirement: 1, requires: 'EEE141' }, { requirement: 1, requires: 'ETE141' }]);
  const eng103 = all("SELECT source FROM prerequisites WHERE campus='nsu' AND course='ENG103' ORDER BY source").map((r) => r.source);
  assert.ok(eng103.length >= 2, 'the same course can carry rules from several documents');
  const bus499 = one("SELECT min_credits, min_cgpa FROM prerequisites WHERE campus='nsu' AND course='BUS499'");
  assert.deepEqual({ ...bus499 }, { min_credits: 112, min_cgpa: 3.3 });

  // Plans and requirement groups add up to the programs they describe.
  // NSU's plans are full curricula; BRACU's are starter presets (plans.json is
  // marked partial), so only NSU's are held to program totals.
  for (const row of all("SELECT p.program, SUM(p.credits) AS total, g.total_credits AS expected FROM plans p JOIN programs g ON g.campus=p.campus AND g.code=p.program WHERE p.campus='nsu' GROUP BY p.program")) {
    assert.equal(row.total, row.expected, `${row.program} plan`);
  }
  const finMajor = one(`SELECT SUM(credits) AS total FROM requirement_groups
                         WHERE campus='nsu' AND program IN ('BBA-FIN', (SELECT extends FROM programs WHERE campus='nsu' AND code='BBA-FIN'))`);
  assert.equal(finMajor.total, 130, 'a BBA major inherits BBA\'s shared groups');
  const science = one(`SELECT g.choose, COUNT(DISTINCT o.option) AS options FROM requirement_groups g
                        JOIN requirement_options o ON o.campus=g.campus AND o.grp=g.id
                       WHERE g.campus='nsu' AND g.program='BBA' AND g.name LIKE 'GED: science%'`);
  assert.deepEqual({ ...science }, { choose: 4, options: 14 });

  // BRACU: section names stay text, labs become lab meetings, and CONNECT's
  // "(A AND B) OR (C AND D)" prerequisites keep their paths.
  const bracuSections = one("SELECT COUNT(*) AS n FROM sections WHERE campus='bracu' AND term='20263'").n;
  assert.ok(bracuSections > 2000, 'Fall 2026 BRACU sections are loaded');
  assert.equal(typeof one("SELECT section FROM sections WHERE campus='bracu' AND section='04' LIMIT 1")?.section, 'string', '"04" stays "04"');
  assert.ok(one("SELECT COUNT(*) AS n FROM meetings WHERE campus='bracu' AND kind='lab'").n > 0, 'lab meetings are expanded');
  const paths = all(`SELECT DISTINCT pp.path FROM prerequisite_paths pp JOIN prerequisites p ON p.campus=pp.campus AND p.id=pp.rule
                      WHERE p.campus='bracu' AND p.course='MSC221' AND p.source='bracu-connect-20263'`);
  assert.equal(paths.length, 4, 'MSC221 keeps all four prerequisite paths');
  assert.equal(one("SELECT retake_cutoff FROM campuses WHERE id='bracu'").retake_cutoff, 'Fall 2024');

  // Provenance travels with the data: every row can say where it came from.
  const unsourced = one(`SELECT COUNT(*) AS n FROM courses c LEFT JOIN sources s
                          ON s.campus = c.campus AND s.id = c.source WHERE s.id IS NULL`);
  assert.equal(unsourced.n, 0);
  const honours = one("SELECT s.status FROM cgpa_bands b JOIN sources s ON s.campus=b.campus AND s.id=b.source WHERE b.campus='nsu' AND b.kind='honours' LIMIT 1");
  assert.equal(honours.status, 'third-party', 'unconfirmed honours thresholds stay flagged as third-party');

  // DIU: half credits, an unknown calendar and a corrected bus time survive the build.
  assert.equal(one("SELECT total_credits FROM programs WHERE campus='diu' AND code='CSE'").total_credits, 154.5);
  assert.ok(one("SELECT COUNT(*) AS n FROM programs WHERE campus='diu' AND term_system IS NULL AND note IS NOT NULL").n > 0);
  assert.equal(one("SELECT email_domains FROM campuses WHERE id='diu'").email_domains, '');
  const graduate = one("SELECT source FROM academic_rules WHERE campus='diu' AND id='min-cgpa-to-graduate'");
  assert.equal(graduate.source, 'diu-faq', 'a rule keeps its own source');
  const fridayBus = all(`SELECT t.time FROM bus_times t JOIN bus_routes r ON r.campus=t.campus AND r.route=t.route
                         WHERE t.campus='diu' AND r.service='friday' AND t.direction='depart' AND t.time < '07:00'`);
  assert.equal(fridayBus.length, 0, 'no Friday bus leaves campus before dawn');
  db.close();

  // Deterministic: an unchanged source rebuilds the identical D1 dump.
  const first = fs.readFileSync(sqlPath, 'utf8');
  buildCampusDb({ outDir: out });
  assert.equal(fs.readFileSync(sqlPath, 'utf8'), first);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

console.log('campusDb: database builds from data/campuses and answers queries');
