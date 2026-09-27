// scripts/query_campus_db.mjs (#784)
//
// Ask the campus database anything:
//
//   npm run db:query -- "SELECT code, title FROM courses WHERE campus='nsu' AND credits > 3"
//   npm run db:query -- --json "SELECT * FROM programs"
//   npm run db:query -- --csv  "SELECT * FROM sections WHERE term='252'" > sections.csv
//   npm run db:query -- --tables          # list every table and view with its columns
//
// Rebuilds dist-data/campus.db first whenever any file under data/campuses/ is
// newer than it, so a query never answers from stale data. The database is
// opened read-only: this is for extracting, and data/campuses/ is where edits go.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CAMPUS_DATA_DIR } from './campus_data.mjs';
import { DEFAULT_OUT_DIR, buildCampusDb } from './build_campus_db.mjs';

const DB_PATH = path.join(DEFAULT_OUT_DIR, 'campus.db');

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

function ensureFresh() {
  const built = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).mtimeMs : 0;
  if (built < newestMtime(CAMPUS_DATA_DIR)) buildCampusDb();
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function printTable(rows) {
  if (!rows.length) {
    console.log('(no rows)');
    return;
  }
  const columns = Object.keys(rows[0]);
  const text = (v) => (v === null || v === undefined ? 'NULL' : String(v));
  const widths = columns.map((c) =>
    Math.min(60, Math.max(c.length, ...rows.map((r) => text(r[c]).length))),
  );
  const line = (cells) =>
    cells
      .map((cell, i) => cell.slice(0, widths[i]).padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  console.log(line(columns));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(columns.map((c) => text(r[c]))));
  console.log(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
}

const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : args.includes('--csv') ? 'csv' : 'table';
const sql = args
  .filter((a) => !a.startsWith('--'))
  .join(' ')
  .trim();

try {
  ensureFresh();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
try {
  if (args.includes('--tables')) {
    const objects = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name",
      )
      .all();
    for (const { name, type } of objects) {
      const cols = db
        .prepare(`PRAGMA table_info("${name}")`)
        .all()
        .map((c) => c.name);
      console.log(`${type === 'view' ? 'view ' : 'table'}  ${name}(${cols.join(', ')})`);
    }
  } else if (!sql) {
    console.error(
      'usage: npm run db:query -- [--json|--csv] "<SQL>"   |   npm run db:query -- --tables',
    );
    process.exitCode = 1;
  } else {
    const rows = db.prepare(sql).all();
    if (format === 'json') console.log(JSON.stringify(rows, null, 2));
    else if (format === 'csv') {
      const columns = rows.length ? Object.keys(rows[0]) : [];
      console.log(
        [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join(
          '\n',
        ),
      );
    } else printTable(rows);
  }
} catch (error) {
  console.error(`query failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
