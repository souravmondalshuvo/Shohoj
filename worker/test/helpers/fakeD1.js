// worker/test/helpers/fakeD1.js
//
// A D1 database binding over node:sqlite, for tests: real SQLite running the
// real migration files, behind the slice of D1's API the academic store uses —
// `prepare(sql).bind(...).first() / .all() / .run()` and `batch([...])`.
//
// Two D1 behaviours are reproduced on purpose, because code that passed here
// and then met them in production would be the worst kind of green:
//   * binding `undefined` throws (D1_TYPE_ERROR);
//   * foreign keys are enforced.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Rows from node:sqlite have a null prototype; D1 hands back plain objects. */
function plain(row) {
  return row ? { ...row } : null;
}

class FakeStatement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    values.forEach((value, index) => {
      if (value === undefined) {
        throw new Error(`D1_TYPE_ERROR: Type 'undefined' not supported for value at ${index}`);
      }
    });
    return new FakeStatement(this.db, this.sql, values);
  }

  /** The prepared node:sqlite statement, compiled on each call like D1's. */
  compiled() {
    return this.db.prepare(this.sql);
  }

  async first(column) {
    const row = plain(this.compiled().get(...this.values));
    if (row === null) return null;
    return column === undefined ? row : (row[column] ?? null);
  }

  async all() {
    return {
      success: true,
      results: this.compiled()
        .all(...this.values)
        .map(plain),
      meta: {},
    };
  }

  async run() {
    const { changes } = this.compiled().run(...this.values);
    return { success: true, meta: { changes: Number(changes) } };
  }
}

/**
 * A fresh in-memory database with every migration applied, in file order.
 * `statements` records each SQL text executed, for tests that want to see what
 * reached the database.
 */
export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }

  const statements = [];
  return {
    statements,
    /** Direct SQL for test setup and inspection — never used by the store. */
    raw: db,
    prepare(sql) {
      statements.push(sql);
      return new FakeStatement(db, sql);
    },
    async batch(prepared) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of prepared) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
