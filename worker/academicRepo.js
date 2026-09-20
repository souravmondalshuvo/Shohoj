// worker/academicRepo.js
//
// The academic core's repository layer (#712): where semester and enrolment
// records live, and the only place that knows it is Firestore.
//
// Everything here takes its Firestore access as four injected primitives
// (`getDoc`, `patchDoc`, `deleteDoc`, `listDocs`) rather than importing the
// REST helpers from index.js. Two reasons: index.js imports this module, so
// importing back would close a cycle the Workers runtime and node's test loader
// resolve differently; and a repository whose I/O is injected can be tested
// against a Map, which is how the handler tests below it stay offline.
//
// LAYOUT
//
//   shohojUsers/{firebaseUid}/semesters/{semesterId}
//   shohojUsers/{firebaseUid}/enrollments/{enrollmentId}
//   shohojUsers/{firebaseUid}/tasks/{taskId}
//   shohojUsers/{firebaseUid}/assessments/{taskId}   <- keyed BY task id
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

export const USERS_COLLECTION = 'shohojUsers';
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
  };
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
  // Assessment first: an assessment whose task is gone is unreachable through
  // every path the API offers, exactly like an orphaned task or enrolment.
  await repo.deleteAssessment(taskId);
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
