-- worker/migrations/0001_academic_store.sql
--
-- The academic store on Cloudflare D1 (#908, ADR 0003): the same records the
-- Firestore store keeps under shohojUsers/{uid}, as tables.
--
-- Applied by `wrangler d1 migrations apply`, never edited after it ships: a
-- change to the schema is a new numbered file, which is the migration history
-- per-document `schemaVersion` never had.
--
-- OWNERSHIP IS STILL STRUCTURAL. Every academic table is keyed by
-- (owner_uid, id), exactly as a Firestore path is keyed by the uid it sits
-- under, and the D1 store binds `owner_uid` from the verified token on every
-- statement. A query that forgets its owner returns another student's rows, so
-- none is written without one.
--
-- `user_id` is the record's own `usr_…` field. The foreign key from
-- (owner_uid, user_id) to users makes "this record's Shohoj id belongs to the
-- account it is filed under" a constraint rather than a hope.
--
-- NULL-ability follows the API contract: a column is nullable exactly when its
-- DTO reads `?? null`. STRICT tables refuse a value of the wrong type instead of
-- quietly storing it, so a number never comes back as text.
--
-- Foreign keys have no ON DELETE action. The handlers already delete children
-- before parents (deleteSemesterCascade and friends); a missed step should fail
-- loudly here, not be tidied up out of sight.

CREATE TABLE users (
  firebase_uid   TEXT    NOT NULL PRIMARY KEY,
  id             TEXT    NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  email          TEXT,
  display_name   TEXT,
  university     TEXT,
  student_id     TEXT,
  created_at     TEXT,
  updated_at     TEXT,
  -- The parent key of every (owner_uid, user_id) foreign key below.
  UNIQUE (firebase_uid, id)
) STRICT;

CREATE TABLE semesters (
  owner_uid      TEXT    NOT NULL,
  id             TEXT    NOT NULL,
  schema_version INTEGER NOT NULL,
  user_id        TEXT    NOT NULL,
  university     TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  year           INTEGER NOT NULL,
  season         TEXT    NOT NULL,
  session_id     TEXT,
  status         TEXT    NOT NULL,
  start_date     TEXT,
  end_date       TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (owner_uid, id),
  FOREIGN KEY (owner_uid, user_id) REFERENCES users (firebase_uid, id)
) STRICT;

CREATE TABLE enrollments (
  owner_uid        TEXT    NOT NULL,
  id               TEXT    NOT NULL,
  schema_version   INTEGER NOT NULL,
  user_id          TEXT    NOT NULL,
  semester_id      TEXT    NOT NULL,
  course_code      TEXT    NOT NULL,
  credits          REAL,
  section          TEXT,
  faculty_initials TEXT,
  status           TEXT    NOT NULL,
  source           TEXT    NOT NULL,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  PRIMARY KEY (owner_uid, id),
  FOREIGN KEY (owner_uid, user_id) REFERENCES users (firebase_uid, id),
  FOREIGN KEY (owner_uid, semester_id) REFERENCES semesters (owner_uid, id)
) STRICT;

-- deleteSemesterCascade finds a semester's enrolments.
CREATE INDEX enrollments_by_semester ON enrollments (owner_uid, semester_id);

CREATE TABLE tasks (
  owner_uid         TEXT    NOT NULL,
  id                TEXT    NOT NULL,
  schema_version    INTEGER NOT NULL,
  user_id           TEXT    NOT NULL,
  -- Nullable: a task need not belong to a course. When set, it must.
  enrollment_id     TEXT,
  title             TEXT    NOT NULL,
  description       TEXT,
  type              TEXT    NOT NULL,
  status            TEXT    NOT NULL,
  priority          TEXT    NOT NULL,
  priority_score    REAL,
  due_at            TEXT,
  start_at          TEXT,
  estimated_minutes INTEGER,
  source            TEXT    NOT NULL,
  source_reference  TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  completed_at      TEXT,
  PRIMARY KEY (owner_uid, id),
  FOREIGN KEY (owner_uid, user_id) REFERENCES users (firebase_uid, id),
  FOREIGN KEY (owner_uid, enrollment_id) REFERENCES enrollments (owner_uid, id)
) STRICT;

-- deleteEnrollmentCascade finds an enrolment's tasks.
CREATE INDEX tasks_by_enrollment ON tasks (owner_uid, enrollment_id);

-- Keyed by task: at most one assessment per task, as in Firestore.
CREATE TABLE assessments (
  owner_uid      TEXT    NOT NULL,
  task_id        TEXT    NOT NULL,
  schema_version INTEGER NOT NULL,
  user_id        TEXT    NOT NULL,
  total_marks    REAL    NOT NULL,
  earned_marks   REAL,
  weight_percent REAL    NOT NULL,
  syllabus       TEXT,
  location       TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (owner_uid, task_id),
  FOREIGN KEY (owner_uid, user_id) REFERENCES users (firebase_uid, id),
  FOREIGN KEY (owner_uid, task_id) REFERENCES tasks (owner_uid, id)
) STRICT;

CREATE TABLE reminders (
  owner_uid      TEXT    NOT NULL,
  id             TEXT    NOT NULL,
  schema_version INTEGER NOT NULL,
  user_id        TEXT    NOT NULL,
  task_id        TEXT    NOT NULL,
  offset_minutes INTEGER NOT NULL,
  channel        TEXT    NOT NULL,
  scheduled_for  TEXT,
  status         TEXT    NOT NULL,
  sent_at        TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (owner_uid, id),
  FOREIGN KEY (owner_uid, user_id) REFERENCES users (firebase_uid, id),
  FOREIGN KEY (owner_uid, task_id) REFERENCES tasks (owner_uid, id)
) STRICT;

-- The reminder cron reads every student's PENDING reminders.
CREATE INDEX reminders_by_status ON reminders (status, owner_uid, id);
-- deleteTaskCascade finds a task's reminders.
CREATE INDEX reminders_by_task ON reminders (owner_uid, task_id);

-- One live feed per student. The Firestore store needs a forward pointer on the
-- user AND a reverse document, kept together by a conditional commit; here
-- UNIQUE (firebase_uid) is the forward pointer, and a rotation is one upsert.
CREATE TABLE calendar_feeds (
  token        TEXT NOT NULL PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE REFERENCES users (firebase_uid),
  created_at   TEXT NOT NULL
) STRICT;
