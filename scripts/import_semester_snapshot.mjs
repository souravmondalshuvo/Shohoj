#!/usr/bin/env node
/**
 * scripts/import_semester_snapshot.mjs
 *
 * Turn a locally captured CONNECT snapshot into an archive payload the Worker
 * can serve (#633).
 *
 * The feed drops a semester the moment the next opens for advising, and the
 * Worker's cron only started keeping them from the day it shipped — so the
 * semester that was running when this work began is recoverable only from a
 * snapshot someone happened to have. `bracu-section.json` is one: 2010 Summer
 * 2026 sections, captured mid-term.
 *
 * A snapshot is not the live feed and this does not pretend otherwise. It
 * reshapes what is there, backfills course names from the catalog, and reports
 * exactly what is missing so the UI can say so rather than quietly presenting a
 * gap as a fact.
 *
 * Usage:
 *   node scripts/import_semester_snapshot.mjs bracu-section.json --session 20262
 *   node scripts/import_semester_snapshot.mjs <file> --session <id> \
 *     --merge-index current-index.json --out semester-20262.json
 *
 * Writes two files and prints the wrangler commands to upload them. The payload
 * alone is not enough: a semester absent from semesters/index.json is invisible
 * to the client even when its object exists, so pass --merge-index with the
 * live manifest (`wrangler r2 object get shohoj-papers/semesters/index.json`)
 * and upload the merged one too. Without the flag it merges into an empty
 * manifest, which is correct only for a bucket that holds nothing yet.
 *
 * It does NOT upload. That is a write to production storage and belongs to
 * whoever holds the credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COURSE_DB } from '../js/core/catalog.js';
import {
  ARCHIVE_INDEX_KEY,
  archiveKeyFor,
  mergeArchiveIndex,
  summarizeArchivePayload,
} from '../worker/semesterArchive.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, flags };
}

/**
 * The snapshot stores `sectionSchedule` as a JSON *string*; the live feed sends
 * it as an object. Everything downstream — the Worker's validator, parseFeed,
 * describeSemester — reads it as an object.
 */
function parseSchedule(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Reshape one snapshot row into the live feed's shape. Null means unusable. */
function convertSection(row, sessionId) {
  if (!row || typeof row.sectionId !== 'number') return null;
  const courseCode = typeof row.courseCode === 'string' ? row.courseCode.trim().toUpperCase() : '';
  if (courseCode === '') return null;

  const schedule = parseSchedule(row.sectionSchedule);
  if (schedule === null) return null;

  // The snapshot carries no course names at all. The catalog has them for
  // almost every code, and a name is what makes a section legible — "CSE220"
  // alone is a code, not a course.
  const catalogEntry = COURSE_DB[courseCode];
  const courseName =
    (typeof row.courseName === 'string' && row.courseName.trim()) ||
    (catalogEntry && catalogEntry.name) ||
    '';

  return {
    ...row,
    courseCode,
    courseName,
    // The snapshot leaves this null on every row; the archive is keyed on it.
    semesterSessionId: sessionId,
    sectionSchedule: schedule,
  };
}

/**
 * What this snapshot cannot tell a student, counted rather than guessed at.
 *
 * Travels with the archive so the UI can label the gaps. A snapshot presented
 * as if it were the live feed is worse than no snapshot: it invites a student
 * to trust a seat count frozen months ago.
 */
function describeGaps(payload) {
  let tbaFaculty = 0;
  let noSchedule = 0;
  let unnamed = 0;
  for (const s of payload) {
    if (!s.faculties || s.faculties.trim().toUpperCase() === 'TBA') tbaFaculty++;
    if (!s.sectionSchedule?.classSchedules?.length) noSchedule++;
    if (!s.courseName) unnamed++;
  }
  return {
    source: 'snapshot',
    sections: payload.length,
    tbaFaculty,
    noSchedule,
    unnamed,
    // Registration numbers stop moving the instant a snapshot is taken. They
    // describe the semester's history, never its availability.
    seatsFrozen: true,
  };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const input = positional[0];
  if (!input)
    die('usage: import_semester_snapshot.mjs <snapshot.json> --session <id> [--out <path>]');

  const sessionId = Number(flags.session);
  if (!Number.isInteger(sessionId) || sessionId < 20000 || sessionId > 99999) {
    die('--session must be a CONNECT session id, e.g. 20262 for Summer 2026');
  }

  const inputPath = path.resolve(ROOT, input);
  if (!fs.existsSync(inputPath)) die(`no such file: ${inputPath}`);

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (e) {
    die(`could not parse ${inputPath}: ${e.message}`);
  }
  if (!Array.isArray(raw)) die('a snapshot must be a JSON array of sections');

  const payload = [];
  let dropped = 0;
  for (const row of raw) {
    const converted = convertSection(row, sessionId);
    if (converted) payload.push(converted);
    else dropped++;
  }

  // The same gate the cron applies. If the conversion produced something the
  // Worker would refuse, fail here rather than after an upload.
  const summary = summarizeArchivePayload(payload);
  if (summary === null) die('the converted payload is not recognisably one semester');
  if (summary.sessionId !== sessionId) {
    die(`converted payload reports session ${summary.sessionId}, expected ${sessionId}`);
  }

  const gaps = describeGaps(payload);
  const outPath = path.resolve(ROOT, flags.out ?? `semester-${sessionId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload));

  // Merge into the manifest rather than replacing it: overwriting index.json
  // with a single entry would un-list every other semester the cron has kept.
  let currentIndex = { semesters: [] };
  if (flags['merge-index']) {
    const indexPath = path.resolve(ROOT, flags['merge-index']);
    if (!fs.existsSync(indexPath)) die(`no such manifest: ${indexPath}`);
    try {
      currentIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (e) {
      die(`could not parse ${indexPath}: ${e.message}`);
    }
  }
  const mergedIndex = mergeArchiveIndex(currentIndex, summary, Date.now());
  const entry = mergedIndex.semesters.find((x) => x.sessionId === sessionId);
  entry.provenance = gaps;
  const indexOut = path.resolve(ROOT, flags['index-out'] ?? `semesters-index-${sessionId}.json`);
  fs.writeFileSync(indexOut, JSON.stringify(mergedIndex));

  console.log(`read      ${raw.length} rows from ${path.relative(ROOT, inputPath)}`);
  console.log(`converted ${payload.length}${dropped ? `, dropped ${dropped} unusable` : ''}`);
  console.log(`session   ${summary.sessionId}`);
  console.log(`term      ${summary.classStartDate} → ${summary.classEndDate}`);
  console.log(
    `gaps      ${gaps.tbaFaculty} TBA faculty · ${gaps.noSchedule} without a timetable · ${gaps.unnamed} unnamed`,
  );
  console.log(`wrote     ${path.relative(ROOT, outPath)}`);
  console.log(
    `          ${path.relative(ROOT, indexOut)} (${mergedIndex.semesters.length} semesters)`,
  );
  if (!flags['merge-index']) {
    console.log('');
    console.log('NOTE: no --merge-index given, so the manifest above lists only this');
    console.log('      semester. Uploading it would un-list anything else the bucket');
    console.log('      holds. Pull the live one first:');
    console.log(
      `        npx wrangler r2 object get shohoj-papers/${ARCHIVE_INDEX_KEY} --file current-index.json`,
    );
  }
  console.log('');
  console.log('Upload (writes to production R2 — run these yourself):');
  console.log(`  npx wrangler r2 object put shohoj-papers/${archiveKeyFor(sessionId)} \\`);
  console.log(`    --file ${path.relative(ROOT, outPath)} --content-type application/json`);
  console.log(`  npx wrangler r2 object put shohoj-papers/${ARCHIVE_INDEX_KEY} \\`);
  console.log(`    --file ${path.relative(ROOT, indexOut)} --content-type application/json`);
}

main();
