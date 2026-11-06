// worker/academicStoreD1.js
//
// The academic store on Cloudflare D1 (#908, ADR 0003): the same interface
// `createAcademicStore` in academicRepo.js builds over Firestore, over the
// tables in worker/migrations/. The handlers cannot tell which one they hold;
// test/academicStoreContract.test.js runs one suite against both.
//
// SQL INJECTION
//
// This is the first SQL in Shohoj, so the rules are mechanical rather than
// remembered, and test/sqlSafety.test.js enforces them:
//
//   * Every statement is a constant in `SQL` below — no `${…}`, no string
//     building. `.prepare()` is only ever called with `SQL.<name>`.
//   * Every value reaches SQLite through `.bind()`. That includes the owner,
//     the LIMIT and the status the reminder cron filters on.
//   * The owner is bound from the verified token by `repoFor(uid)` /
//     `feedsFor(uid)`, as in the Firestore store. No method takes an owner from
//     a record, so a record cannot name somebody else's.
//
// FIDELITY
//
// A record read back has exactly the fields the domain builders write, with
// null where a value is absent. A field the table has no column for is refused
// on write rather than dropped: losing data quietly is the one thing a store
// must never do, and a new field means a new migration.

import { isCalendarFeedToken } from './calendarFeed.js';

/** As in the Firestore store: retries after a token collision before giving up. */
const MAX_FEED_WRITE_ATTEMPTS = 5;

/** As in the Firestore store: a ceiling on one cron pass, not a page size. */
const PENDING_REMINDER_LIMIT = 500;

// ── Statements ──────────────────────────────────────────────────────────────
//
// Column order in each INSERT matches the field list for that table below.
// The contract tests round-trip every field of every table, so a mismatch fails
// there rather than in production.

const SQL = Object.freeze({
  getUser: `SELECT * FROM users WHERE firebase_uid = ?`,
  // A masked write is two statements in one batch, because SQLite checks NOT
  // NULL before an upsert's ON CONFLICT is considered — a partial record would
  // fail on the columns it leaves out even when the row exists. So: create the
  // row if it is missing (where a partial record SHOULD fail), then set only
  // the fields given, each behind a "was this field given" flag. Firestore's
  // updateMask, atomically.
  insertUserIfMissing: `
    INSERT INTO users (firebase_uid, schema_version, id, email, display_name,
                       university, student_id, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE firebase_uid = ?)`,
  updateUserFields: `
    UPDATE users SET
      schema_version = CASE WHEN ? THEN ? ELSE schema_version END,
      id             = CASE WHEN ? THEN ? ELSE id             END,
      email          = CASE WHEN ? THEN ? ELSE email          END,
      display_name   = CASE WHEN ? THEN ? ELSE display_name   END,
      university     = CASE WHEN ? THEN ? ELSE university     END,
      student_id     = CASE WHEN ? THEN ? ELSE student_id     END,
      created_at     = CASE WHEN ? THEN ? ELSE created_at     END,
      updated_at     = CASE WHEN ? THEN ? ELSE updated_at     END
    WHERE firebase_uid = ?`,
  userExists: `SELECT 1 AS present FROM users WHERE firebase_uid = ?`,

  listSemesters: `SELECT * FROM semesters WHERE owner_uid = ? ORDER BY id`,
  getSemester: `SELECT * FROM semesters WHERE owner_uid = ? AND id = ?`,
  putSemester: `
    INSERT INTO semesters (owner_uid, schema_version, id, user_id, university, name, year,
                           season, session_id, status, start_date, end_date, created_at,
                           updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_uid, id) DO UPDATE SET
      schema_version = excluded.schema_version,
      user_id        = excluded.user_id,
      university     = excluded.university,
      name           = excluded.name,
      year           = excluded.year,
      season         = excluded.season,
      session_id     = excluded.session_id,
      status         = excluded.status,
      start_date     = excluded.start_date,
      end_date       = excluded.end_date,
      created_at     = excluded.created_at,
      updated_at     = excluded.updated_at`,
  deleteSemester: `DELETE FROM semesters WHERE owner_uid = ? AND id = ?`,

  listEnrollments: `SELECT * FROM enrollments WHERE owner_uid = ? ORDER BY id`,
  getEnrollment: `SELECT * FROM enrollments WHERE owner_uid = ? AND id = ?`,
  putEnrollment: `
    INSERT INTO enrollments (owner_uid, schema_version, id, user_id, semester_id, course_code,
                             credits, section, faculty_initials, status, source, created_at,
                             updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_uid, id) DO UPDATE SET
      schema_version   = excluded.schema_version,
      user_id          = excluded.user_id,
      semester_id      = excluded.semester_id,
      course_code      = excluded.course_code,
      credits          = excluded.credits,
      section          = excluded.section,
      faculty_initials = excluded.faculty_initials,
      status           = excluded.status,
      source           = excluded.source,
      created_at       = excluded.created_at,
      updated_at       = excluded.updated_at`,
  deleteEnrollment: `DELETE FROM enrollments WHERE owner_uid = ? AND id = ?`,

  listTasks: `SELECT * FROM tasks WHERE owner_uid = ? ORDER BY id`,
  getTask: `SELECT * FROM tasks WHERE owner_uid = ? AND id = ?`,
  putTask: `
    INSERT INTO tasks (owner_uid, schema_version, id, user_id, enrollment_id, title, description,
                       type, status, priority, priority_score, due_at, start_at,
                       estimated_minutes, source, source_reference, created_at, updated_at,
                       completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_uid, id) DO UPDATE SET
      schema_version    = excluded.schema_version,
      user_id           = excluded.user_id,
      enrollment_id     = excluded.enrollment_id,
      title             = excluded.title,
      description       = excluded.description,
      type              = excluded.type,
      status            = excluded.status,
      priority          = excluded.priority,
      priority_score    = excluded.priority_score,
      due_at            = excluded.due_at,
      start_at          = excluded.start_at,
      estimated_minutes = excluded.estimated_minutes,
      source            = excluded.source,
      source_reference  = excluded.source_reference,
      created_at        = excluded.created_at,
      updated_at        = excluded.updated_at,
      completed_at      = excluded.completed_at`,
  deleteTask: `DELETE FROM tasks WHERE owner_uid = ? AND id = ?`,

  listAssessments: `SELECT * FROM assessments WHERE owner_uid = ? ORDER BY task_id`,
  getAssessment: `SELECT * FROM assessments WHERE owner_uid = ? AND task_id = ?`,
  putAssessment: `
    INSERT INTO assessments (owner_uid, schema_version, task_id, user_id, total_marks,
                             earned_marks, weight_percent, syllabus, location, notes,
                             created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_uid, task_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      user_id        = excluded.user_id,
      total_marks    = excluded.total_marks,
      earned_marks   = excluded.earned_marks,
      weight_percent = excluded.weight_percent,
      syllabus       = excluded.syllabus,
      location       = excluded.location,
      notes          = excluded.notes,
      created_at     = excluded.created_at,
      updated_at     = excluded.updated_at`,
  deleteAssessment: `DELETE FROM assessments WHERE owner_uid = ? AND task_id = ?`,

  listReminders: `SELECT * FROM reminders WHERE owner_uid = ? ORDER BY id`,
  getReminder: `SELECT * FROM reminders WHERE owner_uid = ? AND id = ?`,
  putReminder: `
    INSERT INTO reminders (owner_uid, schema_version, id, user_id, task_id, offset_minutes,
                           channel, scheduled_for, status, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_uid, id) DO UPDATE SET
      schema_version = excluded.schema_version,
      user_id        = excluded.user_id,
      task_id        = excluded.task_id,
      offset_minutes = excluded.offset_minutes,
      channel        = excluded.channel,
      scheduled_for  = excluded.scheduled_for,
      status         = excluded.status,
      sent_at        = excluded.sent_at,
      created_at     = excluded.created_at,
      updated_at     = excluded.updated_at`,
  deleteReminder: `DELETE FROM reminders WHERE owner_uid = ? AND id = ?`,
  // Ordered by owner then id: the order Firestore's collection-group query
  // returns, so a LIMIT truncates the same tail on either backend.
  pendingReminders: `
    SELECT * FROM reminders WHERE status = ? ORDER BY owner_uid, id LIMIT ?`,

  currentFeed: `SELECT token, created_at FROM calendar_feeds WHERE firebase_uid = ?`,
  // One statement replaces the student's token: UNIQUE (firebase_uid) is the
  // conflict target. A token that collides with somebody else's violates the
  // primary key instead, which aborts the statement and changes nothing.
  rotateFeed: `
    INSERT INTO calendar_feeds (token, firebase_uid, created_at) VALUES (?, ?, ?)
    ON CONFLICT (firebase_uid) DO UPDATE SET
      token      = excluded.token,
      created_at = excluded.created_at`,
  revokeFeed: `DELETE FROM calendar_feeds WHERE firebase_uid = ?`,
  feedOwner: `SELECT firebase_uid FROM calendar_feeds WHERE token = ?`,
});

// ── Field ↔ column ──────────────────────────────────────────────────────────

/** The user record's fields after `firebaseUid`, in the users column order. */
const USER_FIELDS = Object.freeze([
  'schemaVersion',
  'id',
  'email',
  'displayName',
  'university',
  'studentId',
  'createdAt',
  'updatedAt',
]);

/** Each table's record fields, in INSERT column order after `owner_uid`. */
const TABLE_FIELDS = Object.freeze({
  semesters: Object.freeze([
    'schemaVersion',
    'id',
    'userId',
    'university',
    'name',
    'year',
    'season',
    'sessionId',
    'status',
    'startDate',
    'endDate',
    'createdAt',
    'updatedAt',
  ]),
  enrollments: Object.freeze([
    'schemaVersion',
    'id',
    'userId',
    'semesterId',
    'courseCode',
    'credits',
    'section',
    'facultyInitials',
    'status',
    'source',
    'createdAt',
    'updatedAt',
  ]),
  tasks: Object.freeze([
    'schemaVersion',
    'id',
    'userId',
    'enrollmentId',
    'title',
    'description',
    'type',
    'status',
    'priority',
    'priorityScore',
    'dueAt',
    'startAt',
    'estimatedMinutes',
    'source',
    'sourceReference',
    'createdAt',
    'updatedAt',
    'completedAt',
  ]),
  // An assessment's `id` IS its task id; only `task_id` is stored.
  assessments: Object.freeze([
    'schemaVersion',
    'taskId',
    'userId',
    'totalMarks',
    'earnedMarks',
    'weightPercent',
    'syllabus',
    'location',
    'notes',
    'createdAt',
    'updatedAt',
  ]),
  reminders: Object.freeze([
    'schemaVersion',
    'id',
    'userId',
    'taskId',
    'offsetMinutes',
    'channel',
    'scheduledFor',
    'status',
    'sentAt',
    'createdAt',
    'updatedAt',
  ]),
});

/** `schemaVersion` → `schema_version`. */
function columnOf(field) {
  return field.replace(/[A-Z]/g, (upper) => `_${upper.toLowerCase()}`);
}

/** D1 refuses `undefined`; an absent field is stored as NULL. */
function bindable(value) {
  return value === undefined ? null : value;
}

/** A record from a row, field by field. */
function recordFrom(row, fields) {
  const record = {};
  for (const field of fields) record[field] = row[columnOf(field)] ?? null;
  return record;
}

/** Refuse a field the table cannot hold, rather than dropping it. */
function assertKnownFields(record, fields, table) {
  for (const field of Object.keys(record)) {
    if (!fields.includes(field)) {
      throw new Error(`D1 academic store: ${table} has no column for "${field}"`);
    }
  }
}

function toAssessment(row) {
  const record = recordFrom(row, TABLE_FIELDS.assessments);
  return { ...record, id: record.taskId };
}

// ── The store ───────────────────────────────────────────────────────────────

/**
 * Build the academic store over a D1 database binding. Same shape as
 * `createAcademicStore(deps)` in academicRepo.js.
 */
export function createD1AcademicStore(db) {
  const first = (sql, ...values) =>
    db
      .prepare(sql)
      .bind(...values)
      .first();
  const all = async (sql, ...values) =>
    (
      await db
        .prepare(sql)
        .bind(...values)
        .all()
    ).results;
  const run = (sql, ...values) =>
    db
      .prepare(sql)
      .bind(...values)
      .run();

  /** get/list/put/delete for one owned table. */
  function table(name, ownerUid, { list, get, put, remove, toRecord, keyOf }) {
    const fields = TABLE_FIELDS[name];
    return {
      list: async () => (await all(list, ownerUid)).map(toRecord),
      get: async (key) => {
        const row = await first(get, ownerUid, key);
        return row ? toRecord(row) : null;
      },
      put: async (record) => {
        assertKnownFields(record, keyOf ? [...fields, 'id'] : fields, name);
        if (keyOf) keyOf(record);
        await run(put, ownerUid, ...fields.map((field) => bindable(record[field])));
      },
      remove: async (key) => {
        await run(remove, ownerUid, key);
      },
    };
  }

  function repoFor(ownerUid) {
    const plain = (name) => (row) => recordFrom(row, TABLE_FIELDS[name]);
    const semesters = table('semesters', ownerUid, {
      list: SQL.listSemesters,
      get: SQL.getSemester,
      put: SQL.putSemester,
      remove: SQL.deleteSemester,
      toRecord: plain('semesters'),
    });
    const enrollments = table('enrollments', ownerUid, {
      list: SQL.listEnrollments,
      get: SQL.getEnrollment,
      put: SQL.putEnrollment,
      remove: SQL.deleteEnrollment,
      toRecord: plain('enrollments'),
    });
    const tasks = table('tasks', ownerUid, {
      list: SQL.listTasks,
      get: SQL.getTask,
      put: SQL.putTask,
      remove: SQL.deleteTask,
      toRecord: plain('tasks'),
    });
    const assessments = table('assessments', ownerUid, {
      list: SQL.listAssessments,
      get: SQL.getAssessment,
      put: SQL.putAssessment,
      remove: SQL.deleteAssessment,
      toRecord: toAssessment,
      // Firestore keys the document by task id; a record whose `id` disagreed
      // would read back differently here, so it is refused instead.
      keyOf: (record) => {
        if (record.id !== undefined && record.id !== record.taskId) {
          throw new Error('D1 academic store: an assessment id must equal its taskId');
        }
      },
    });
    const reminders = table('reminders', ownerUid, {
      list: SQL.listReminders,
      get: SQL.getReminder,
      put: SQL.putReminder,
      remove: SQL.deleteReminder,
      toRecord: plain('reminders'),
    });

    return {
      listSemesters: semesters.list,
      getSemester: semesters.get,
      putSemester: semesters.put,
      deleteSemester: semesters.remove,

      listEnrollments: enrollments.list,
      getEnrollment: enrollments.get,
      putEnrollment: enrollments.put,
      deleteEnrollment: enrollments.remove,

      listTasks: tasks.list,
      getTask: tasks.get,
      putTask: tasks.put,
      deleteTask: tasks.remove,

      listAssessments: assessments.list,
      getAssessment: assessments.get,
      putAssessment: assessments.put,
      deleteAssessment: assessments.remove,

      listReminders: reminders.list,
      getReminder: reminders.get,
      putReminder: reminders.put,
      deleteReminder: reminders.remove,
    };
  }

  const users = {
    async get(firebaseUid) {
      const row = await first(SQL.getUser, firebaseUid);
      if (!row) return null;
      return { ...recordFrom(row, USER_FIELDS), firebaseUid: row.firebase_uid };
    },

    async merge(firebaseUid, fields) {
      for (const field of Object.keys(fields)) {
        if (field === 'firebaseUid') {
          // The key is the uid the store was asked about; a record naming a
          // different one would be filed under the wrong account.
          if (fields.firebaseUid !== firebaseUid) {
            throw new Error('D1 academic store: a user record cannot change its firebaseUid');
          }
          continue;
        }
        if (!USER_FIELDS.includes(field)) {
          throw new Error(`D1 academic store: users has no column for "${field}"`);
        }
      }
      const values = USER_FIELDS.map((field) => bindable(fields[field]));
      const givenThenValue = USER_FIELDS.flatMap((field, index) => [
        field in fields ? 1 : 0,
        values[index],
      ]);
      await db.batch([
        db.prepare(SQL.insertUserIfMissing).bind(firebaseUid, ...values, firebaseUid),
        db.prepare(SQL.updateUserFields).bind(...givenThenValue, firebaseUid),
      ]);
    },
  };

  function feedsFor(firebaseUid) {
    return {
      async current() {
        const row = await first(SQL.currentFeed, firebaseUid);
        return row ? { token: row.token, createdAt: row.created_at } : null;
      },

      async rotate(mint) {
        // Same refusal as the Firestore store: a feed never brings an account
        // into existence.
        if (!(await first(SQL.userExists, firebaseUid))) {
          throw new Error('Calendar feed owner is unavailable');
        }
        for (let attempt = 0; attempt < MAX_FEED_WRITE_ATTEMPTS; attempt++) {
          const { token, createdAt } = mint();
          try {
            await run(SQL.rotateFeed, token, firebaseUid, createdAt);
            return { token, createdAt };
          } catch (error) {
            if (!isTokenCollision(error) || attempt === MAX_FEED_WRITE_ATTEMPTS - 1) throw error;
          }
        }
      },

      async revoke() {
        await run(SQL.revokeFeed, firebaseUid);
      },
    };
  }

  async function feedOwner(token) {
    // Shape first, as in the Firestore store: a malformed guess costs no read.
    if (!isCalendarFeedToken(token)) return null;
    const row = await first(SQL.feedOwner, token);
    return row ? row.firebase_uid : null;
  }

  async function pendingReminders() {
    const rows = await all(SQL.pendingReminders, 'PENDING', PENDING_REMINDER_LIMIT);
    return rows.map((row) => ({
      ownerUid: row.owner_uid,
      reminder: recordFrom(row, TABLE_FIELDS.reminders),
    }));
  }

  return { repoFor, users, feedsFor, feedOwner, pendingReminders };
}

/** A new token that is already somebody else's: retry with fresh randomness. */
function isTokenCollision(error) {
  return /UNIQUE constraint failed: calendar_feeds\.token/.test(String(error?.message ?? ''));
}
