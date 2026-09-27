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
  assert.equal(one("SELECT COUNT(*) AS n FROM sections WHERE campus='nsu' AND term='252'").n, nsu.sections['252'].records.length);
  const expectedMeetings = nsu.sections['252'].records.reduce((n, s) => n + s.days.length, 0);
  assert.equal(one("SELECT COUNT(*) AS n FROM meetings WHERE campus='nsu' AND term='252'").n, expectedMeetings);

  // Campus rules come through as columns you can filter on.
  const profile = one("SELECT * FROM campuses WHERE id='nsu'");
  assert.equal(profile.max_retakes, 3);
  assert.equal(profile.retake_eligible_at_or_below, 'B');
  assert.equal(profile.credit_load_max, null, 'NSU publishes no maximum load');
  assert.equal(one("SELECT points FROM grades WHERE campus='nsu' AND letter='A-'").points, 3.7);
  assert.equal(one("SELECT COUNT(*) AS n FROM grades WHERE campus='nsu' AND letter IN ('A+','D-')").n, 0);

  // Free rooms: take a real meeting, then ask which rooms are busy in that
  // slot. Its room must be among them, and a room free all day must not be.
  const sample = one("SELECT room, day, start, \"end\" FROM meetings WHERE campus='nsu' AND term='252' AND room IS NOT NULL ORDER BY course, section LIMIT 1");
  const busy = new Set(all(
    `SELECT DISTINCT room FROM meetings
      WHERE campus='nsu' AND term='252' AND day=? AND start < ? AND "end" > ? AND room IS NOT NULL`,
    sample.day, sample.end, sample.start,
  ).map((r) => r.room));
  assert.ok(busy.has(sample.room), 'a room is busy during its own class');
  const free = all(
    `SELECT room FROM rooms WHERE campus='nsu' AND term='252'
      AND room NOT IN (SELECT room FROM meetings WHERE campus='nsu' AND term='252' AND day=? AND start < ? AND "end" > ? AND room IS NOT NULL)`,
    sample.day, sample.end, sample.start,
  ).map((r) => r.room);
  assert.ok(free.length > 0 && !free.includes(sample.room), 'free rooms exclude the occupied one');

  // Prerequisites join back to titles; alternatives share a requirement number.
  const cse225 = all("SELECT requires FROM prerequisite_options WHERE campus='nsu' AND course='CSE225'");
  assert.deepEqual(cse225.map((r) => r.requires), ['CSE215']);
  const eee111 = all("SELECT requirement, requires FROM prerequisite_options WHERE campus='nsu' AND course='EEE111' ORDER BY requires");
  assert.deepEqual(eee111, [{ requirement: 1, requires: 'EEE141' }, { requirement: 1, requires: 'ETE141' }]);

  // Provenance travels with the data: every row can say where it came from.
  const unsourced = one(`SELECT COUNT(*) AS n FROM courses c LEFT JOIN sources s
                          ON s.campus = c.campus AND s.id = c.source WHERE s.id IS NULL`);
  assert.equal(unsourced.n, 0);
  const honours = one("SELECT s.status FROM cgpa_bands b JOIN sources s ON s.campus=b.campus AND s.id=b.source WHERE b.kind='honours' LIMIT 1");
  assert.equal(honours.status, 'third-party', 'unconfirmed honours thresholds stay flagged as third-party');
  db.close();

  // Deterministic: an unchanged source rebuilds the identical D1 dump.
  const first = fs.readFileSync(sqlPath, 'utf8');
  buildCampusDb({ outDir: out });
  assert.equal(fs.readFileSync(sqlPath, 'utf8'), first);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

console.log('campusDb: database builds from data/campuses and answers queries');
