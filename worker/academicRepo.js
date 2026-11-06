// worker/academicRepo.js
//
// The academic core's storage layer (#712, widened by #908): where the Shohoj
// user record, semesters, enrolments, tasks, assessments, reminders and
// calendar-feed tokens live, and the only place that knows it is Firestore.
//
// `createAcademicStore` is the interface the rest of the Worker sees. Nothing
// outside this module names an academic Firestore path, so a second backend
// (Cloudflare D1, ADR 0003) is a second implementation of that one object, not
// a hunt through the handlers. test/storageSeam.test.js keeps it that way.
//
// Everything here takes its Firestore access as injected primitives (`getDoc`,
// `patchDoc`, `deleteDoc`, `listDocs`, and for the store also `mergeDoc`,
// `getDocSnapshot`, `commitWrites` and `runQuery`) rather than importing the
// REST helpers from index.js. Two reasons: index.js imports this module, so
// importing back would close a cycle the Workers runtime and node's test loader
// resolve differently; and a repository whose I/O is injected can be tested
// against a Map, which is how the handler tests below it stay offline.
//
// LAYOUT
//
//   shohojUsers/{firebaseUid}                         the internal user record
//   shohojUsers/{firebaseUid}/semesters/{semesterId}
//   shohojUsers/{firebaseUid}/enrollments/{enrollmentId}
//   shohojUsers/{firebaseUid}/tasks/{taskId}
//   shohojUsers/{firebaseUid}/assessments/{taskId}   <- keyed BY task id
//   shohojUsers/{firebaseUid}/reminders/{reminderId}
//   calendarFeeds/{token}                             whose feed a token is
//
// Subcollections under the user, for three reasons that all point the same way:
// a student's data is co-located, so deleting an account is one subtree; no
// `userId` index is needed on any query; and **a query that forgets to filter
// by owner cannot be written**, because the owner is in the path rather than in
// a `where` clause somebody has to remember.
//
// The path is keyed by the Firebase uid while the records reference the Shohoj
// `usr_…` id. That is not an inconsistency: the path is an internal storage
// detail behind the API, and keying it by the uid is what makes request-time
// resolution a single keyed read. The DATA carries the Shohoj id, and the data
// is what a future relational import reads.
//
// Client access is closed — firestore.rules ends in a deny-all
// `match /{document=**}`, and tests/firestore.rules.test.js pins these exact
// paths shut. Every read and write goes through /api/v1, where ownership is
// checked against the verified token.

import { isCalendarFeedToken } from './calendarFeed.js';

/**
 * Server-owned collection holding the internal user record, with the
 * student's academic subtree beneath it.
 *
 * Separate from `users/{uid}`, which is the client-written academic-state blob
 * (`{ data: <JSON string>, updatedAt }`, capped at 500 KB by firestore.rules).
 * Two reasons not to reuse it: that document's rule is
 * `keys().hasOnly(['data','updatedAt'])`, so adding fields would mean weakening
 * a rule that protects real academic data; and this record must be
 * server-written only, while that one is client-written by design.
 *
 * Nothing needs to be added to firestore.rules for this: the rules end in a
 * deny-all `match /{document=**}`, so an unlisted collection is already closed
 * to every client. The Worker reaches it with a service account, which bypasses
 * rules — the same path /reviews already uses.
 */
export const USERS_COLLECTION = 'shohojUsers';
/** The calendar-feed reverse index, keyed by token (#744). */
export const CALENDAR_FEED_COLLECTION = 'calendarFeeds';
export const SEMESTERS_SUBCOLLECTION = 'semesters';
export const ENROLLMENTS_SUBCOLLECTION = 'enrollments';
export const TASKS_SUBCOLLECTION = 'tasks';
/**
 * Assessments, keyed by TASK id rather than an id of their own.
 *
 * That is what makes "at most one assessment per task" structural instead of a
 * rule somebody has to enforce on write — and it makes the join a single list
 * plus a lookup, rather than a query.
 */
export const ASSESSMENTS_SUBCOLLECTION = 'assessments';
/**
 * Reminders (#727).
 *
 * Under the user like everything else, so ownership stays structural — but the
 * delivery cron has to see EVERY student's reminders, which a per-user path
 * cannot serve. That is what the collection-group query in runReminderCron is
 * for: the same subtree, read across all users, server-side only.
 */
export const REMINDERS_SUBCOLLECTION = 'reminders';

/**
 * How many records one student may hold.
 *
 * A cap, not a quota to sell: without one, a scripted client can grow a single
 * student's subtree without bound, and every list of that subtree then costs
 * real money to read. Both numbers are far past a real degree — a BRACU
 * bachelor's is about twelve semesters and fifty courses.
 */
export const MAX_SEMESTERS = 40;
export const MAX_ENROLLMENTS = 400;
/**
 * Tasks are the one collection a student legitimately fills, so this is set
 * where a heavy user will not meet it: five thousand is roughly four years of
 * three tasks a day, every day.
 */
export const MAX_TASKS = 5000;

function userPath(firebaseUid) {
  return `${USERS_COLLECTION}/${firebaseUid}`;
}

export function semesterPath(firebaseUid, id) {
  return `${userPath(firebaseUid)}/${SEMESTERS_SUBCOLLECTION}/${id}`;
}

export function enrollmentPath(firebaseUid, id) {
  return `${userPath(firebaseUid)}/${ENROLLMENTS_SUBCOLLECTION}/${id}`;
}

export function taskPath(firebaseUid, id) {
  return `${userPath(firebaseUid)}/${TASKS_SUBCOLLECTION}/${id}`;
}

export function assessmentPath(firebaseUid, taskId) {
  return `${userPath(firebaseUid)}/${ASSESSMENTS_SUBCOLLECTION}/${taskId}`;
}

export function reminderPath(firebaseUid, id) {
  return `${userPath(firebaseUid)}/${REMINDERS_SUBCOLLECTION}/${id}`;
}

/**
 * Build the repository for one signed-in student.
 *
 * Bound to a `firebaseUid` on construction, so no method takes an owner
 * argument and no call site can pass the wrong one. The owner is decided once,
 * from the verified token, where the repository is created.
 *
 * `deps`:
 *   getDoc(path)            → stored fields, or null when absent
 *   patchDoc(path, fields)  → merge-write
 *   deleteDoc(path)         → remove
 *   listDocs(collectionPath)→ array of stored field objects (may be empty)
 */
export function createAcademicRepo(deps, firebaseUid) {
  const semesters = `${userPath(firebaseUid)}/${SEMESTERS_SUBCOLLECTION}`;
  const enrollments = `${userPath(firebaseUid)}/${ENROLLMENTS_SUBCOLLECTION}`;
  const tasks = `${userPath(firebaseUid)}/${TASKS_SUBCOLLECTION}`;
  const assessments = `${userPath(firebaseUid)}/${ASSESSMENTS_SUBCOLLECTION}`;
  const reminders = `${userPath(firebaseUid)}/${REMINDERS_SUBCOLLECTION}`;

  return {
    listSemesters: () => deps.listDocs(semesters),
    getSemester: (id) => deps.getDoc(semesterPath(firebaseUid, id)),
    putSemester: (record) => deps.patchDoc(semesterPath(firebaseUid, record.id), record),
    deleteSemester: (id) => deps.deleteDoc(semesterPath(firebaseUid, id)),

    listEnrollments: () => deps.listDocs(enrollments),
    getEnrollment: (id) => deps.getDoc(enrollmentPath(firebaseUid, id)),
    putEnrollment: (record) => deps.patchDoc(enrollmentPath(firebaseUid, record.id), record),
    deleteEnrollment: (id) => deps.deleteDoc(enrollmentPath(firebaseUid, id)),

    listTasks: () => deps.listDocs(tasks),
    getTask: (id) => deps.getDoc(taskPath(firebaseUid, id)),
    putTask: (record) => deps.patchDoc(taskPath(firebaseUid, record.id), record),
    deleteTask: (id) => deps.deleteDoc(taskPath(firebaseUid, id)),

    listAssessments: () => deps.listDocs(assessments),
    getAssessment: (taskId) => deps.getDoc(assessmentPath(firebaseUid, taskId)),
    putAssessment: (record) => deps.patchDoc(assessmentPath(firebaseUid, record.taskId), record),
    deleteAssessment: (taskId) => deps.deleteDoc(assessmentPath(firebaseUid, taskId)),

    listReminders: () => deps.listDocs(reminders),
    getReminder: (id) => deps.getDoc(reminderPath(firebaseUid, id)),
    putReminder: (record) => deps.patchDoc(reminderPath(firebaseUid, record.id), record),
    deleteReminder: (id) => deps.deleteDoc(reminderPath(firebaseUid, id)),
  };
}

// ── The storage interface (#908) ────────────────────────────────────────────

/**
 * How many times a feed rotation or revocation rereads and retries after
 * losing a race on the owner document before giving up.
 */
const MAX_FEED_WRITE_ATTEMPTS = 5;

/**
 * How many PENDING reminders one cron pass reads. Pending is bounded by what
 * has not yet fired, which is small; this is a ceiling, not a page size.
 */
const PENDING_REMINDER_LIMIT = 500;

/**
 * Build the academic store: every read and write the Worker makes of a
 * student's academic records, in one object.
 *
 *   repoFor(firebaseUid)   the per-student repository above
 *   users.get(uid)         the internal user record, or null
 *   users.merge(uid, rec)  write those fields, leaving any others alone
 *   feedsFor(uid)          that student's calendar feed: current/rotate/revoke
 *   feedOwner(token)       whose feed a token is, or null — anonymous
 *   pendingReminders()     every student's PENDING reminders, as
 *                          `{ ownerUid, reminder }` — server-side only
 *
 * `deps`, beyond the four `createAcademicRepo` takes:
 *   mergeDoc(path, fields)    → write only the named fields (an update mask)
 *   getDocSnapshot(path)      → `{ fields, updateTime }`, or null when absent
 *   commitWrites(writes)      → atomic and precondition-checked; a lost race
 *                               throws an error carrying `conflict: true`
 *   runQuery(structuredQuery) → `[{ name, fields }]`
 *
 * `users.merge` is a masked write on purpose: the same document carries
 * `calendarFeedToken`, which a profile refresh must never clear.
 */
export function createAcademicStore(deps) {
  return {
    repoFor: (firebaseUid) => createAcademicRepo(deps, firebaseUid),
    users: {
      get: (firebaseUid) => deps.getDoc(userPath(firebaseUid)),
      merge: (firebaseUid, fields) => deps.mergeDoc(userPath(firebaseUid), fields),
    },
    feedsFor: (firebaseUid) => createFeedStore(deps, firebaseUid),
    feedOwner: (token) => resolveFeedOwner(deps, token),
    pendingReminders: () => pendingReminders(deps),
  };
}

// ── Calendar feed tokens (#744) ─────────────────────────────────────────────
//
// Two documents, deliberately:
//
//   shohojUsers/{uid}.calendarFeedToken   what THIS student's feed is
//   calendarFeeds/{token}                 whose feed THAT is
//
// The forward pointer is authoritative: anonymous reads must check BOTH
// documents. Atomic commits keep the pointers together, and the owner document's
// updateTime serializes rotations/revocations even across Worker isolates.

function feedDocPath(token) {
  return `${CALENDAR_FEED_COLLECTION}/${token}`;
}

/** Only valid tokens may become reverse-index document paths. */
function currentFeedToken(fields) {
  const token = fields?.calendarFeedToken;
  return isCalendarFeedToken(token) ? token : null;
}

/** One student's feed, bound to them the way their repository is. */
function createFeedStore(deps, firebaseUid) {
  const ownerPath = userPath(firebaseUid);

  return {
    /** `{ token, createdAt }` for the live feed, or null when there is none. */
    async current() {
      const token = currentFeedToken(await deps.getDoc(ownerPath));
      if (token === null) return null;

      // Read the reverse doc for its timestamp rather than storing the date twice.
      const feed = await deps.getDoc(feedDocPath(token));
      if (!feed || feed.firebaseUid !== firebaseUid) {
        // The forward pointer outlived its reverse doc. The URL is already dead,
        // so report honestly rather than handing back a link that 404s.
        return null;
      }
      return { token, createdAt: feed.createdAt };
    },

    /**
     * Mint a feed, or replace the existing one, and return `{ token, createdAt }`.
     *
     * `mint()` supplies a fresh `{ token, createdAt }` on every attempt. A single
     * conditional commit creates the new reverse pointer, moves only the owner's
     * calendarFeedToken field, and deletes the previous reverse pointer. If
     * another request changes the owner first, reread and retry. A token
     * collision also retries instead of overwriting someone else's credential.
     */
    async rotate(mint) {
      for (let attempt = 0; attempt < MAX_FEED_WRITE_ATTEMPTS; attempt++) {
        const user = await deps.getDocSnapshot(ownerPath);
        if (!user?.updateTime) throw new Error('Calendar feed owner is unavailable');
        const previous = currentFeedToken(user.fields);
        const { token, createdAt } = mint();
        const writes = [
          {
            path: feedDocPath(token),
            fields: { firebaseUid, createdAt },
            exists: false,
          },
          {
            path: ownerPath,
            fields: { calendarFeedToken: token },
            updateTime: user.updateTime,
          },
        ];
        if (previous !== null && previous !== token) {
          writes.push({ path: feedDocPath(previous), delete: true });
        }
        try {
          await deps.commitWrites(writes);
          return { token, createdAt };
        } catch (error) {
          if (!error.conflict || attempt === MAX_FEED_WRITE_ATTEMPTS - 1) throw error;
        }
      }
    },

    /**
     * Clear the authoritative pointer and remove its reverse index atomically.
     * A concurrent rotation forces a retry, so revocation cannot clear the new
     * pointer while leaving its credential accessible. Revoking a feed that is
     * already gone resolves quietly.
     */
    async revoke() {
      for (let attempt = 0; attempt < MAX_FEED_WRITE_ATTEMPTS; attempt++) {
        const user = await deps.getDocSnapshot(ownerPath);
        const token = currentFeedToken(user?.fields);
        if (token === null) return;
        if (!user.updateTime) throw new Error('Calendar feed owner is unavailable');
        try {
          await deps.commitWrites([
            { path: ownerPath, fields: { calendarFeedToken: '' }, updateTime: user.updateTime },
            { path: feedDocPath(token), delete: true },
          ]);
          return;
        } catch (error) {
          if (!error.conflict || attempt === MAX_FEED_WRITE_ATTEMPTS - 1) throw error;
        }
      }
    },
  };
}

/**
 * Resolve only the owner's current credential. Legacy orphan reverse documents
 * are intentionally inert, including ones left by previously failed writes.
 */
async function resolveFeedOwner(deps, token) {
  if (!isCalendarFeedToken(token)) return null;
  const feed = await deps.getDoc(feedDocPath(token));
  const uid = feed?.firebaseUid;
  if (typeof uid !== 'string' || uid === '' || uid.includes('/')) return null;
  const owner = await deps.getDoc(userPath(uid));
  return owner?.calendarFeedToken === token ? uid : null;
}

// ── Reminders across every student (#727) ───────────────────────────────────

/**
 * Every student's PENDING reminders, each with the uid that owns it.
 *
 * Reminders live under each student for ownership, so finding them across
 * everybody needs a collection-group query — `allDescendants` over the
 * `reminders` subcollection. Filtered on STATUS server-side and left to the
 * caller on time: adding a range filter on `scheduledFor` would need a
 * composite index for a list that is already short.
 *
 * The document PATH carries the owning uid; the record carries the Shohoj user
 * id, which is a different value and cannot address the document. A row whose
 * path does not parse is skipped.
 */
async function pendingReminders(deps) {
  const rows = await deps.runQuery({
    from: [{ collectionId: REMINDERS_SUBCOLLECTION, allDescendants: true }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'EQUAL',
        value: { stringValue: 'PENDING' },
      },
    },
    limit: PENDING_REMINDER_LIMIT,
  });

  const pending = [];
  for (const row of rows) {
    const ownerUid = ownerUidFromReminderPath(row?.name);
    if (ownerUid === null) continue;
    pending.push({ ownerUid, reminder: row.fields });
  }
  return pending;
}

/** The owning uid, read from a reminder document's own path. */
function ownerUidFromReminderPath(name) {
  const match = /shohojUsers\/([^/]+)\/reminders\//.exec(String(name ?? ''));
  return match ? match[1] : null;
}

/**
 * Assessments as a lookup by task id.
 *
 * One list call, then an in-memory join — which is why they are keyed by task
 * id. Scoring a list of tasks needs every assessment, and fetching them one per
 * task would turn a page render into fifty reads.
 */
export async function assessmentsByTaskId(repo) {
  const all = await repo.listAssessments();
  const byId = {};
  for (const assessment of all) {
    if (typeof assessment?.taskId === 'string') byId[assessment.taskId] = assessment;
  }
  return byId;
}

/** Delete a task and the assessment attached to it. */
export async function deleteTaskCascade(repo, taskId) {
  // Assessment and reminders first: both are unreachable through every path the
  // API offers once their task is gone, exactly like an orphaned task or
  // enrolment. A surviving reminder is worse than a surviving row, because it
  // would go on to EMAIL somebody about a task that no longer exists.
  await repo.deleteAssessment(taskId);
  const reminders = await repo.listReminders();
  for (const reminder of reminders) {
    if (reminder.taskId === taskId) await repo.deleteReminder(reminder.id);
  }
  await repo.deleteTask(taskId);
}

/**
 * Delete a semester and every enrolment in it, enrolments first.
 *
 * Firestore has no cascade, and this is the operation where that matters most:
 * a semester removed while its enrolments remain leaves them pointing at
 * nothing, and an enrolment whose semester is gone is invisible in every view
 * that lists by semester — so it can never be found again, let alone cleaned up.
 *
 * Enrolments go first on purpose. Interrupted midway, that leaves a semester
 * with fewer courses in it, which the student can see and re-run. The other
 * order leaves exactly the orphans this is written to avoid.
 *
 * Returns the number of enrolments removed, so the handler can say what it did.
 */
export async function deleteSemesterCascade(repo, semesterIdValue) {
  const all = await repo.listEnrollments();
  const doomed = all.filter((enrollment) => enrollment.semesterId === semesterIdValue);
  let removedTasks = 0;
  for (const enrollment of doomed) {
    removedTasks += await deleteEnrollmentCascade(repo, enrollment.id);
  }
  await repo.deleteSemester(semesterIdValue);
  return { removedEnrollments: doomed.length, removedTasks };
}

/**
 * Delete an enrolment and every task attached to it.
 *
 * Same reasoning as the semester cascade, one level down: a task whose
 * enrolment is gone shows up in no course-filtered view, so it cannot be found
 * or removed again. Tasks go first, so an interruption leaves an enrolment with
 * fewer tasks — visible and repeatable — rather than orphans.
 *
 * Returns the number of tasks removed, so the handler can say what it did.
 */
export async function deleteEnrollmentCascade(repo, enrollmentIdValue) {
  const all = await repo.listTasks();
  const doomed = all.filter((task) => task.enrollmentId === enrollmentIdValue);
  for (const task of doomed) {
    await deleteTaskCascade(repo, task.id);
  }
  await repo.deleteEnrollment(enrollmentIdValue);
  return doomed.length;
}
