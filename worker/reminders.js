// worker/reminders.js
//
// Task reminders (#727): the last entity from the domain model, and the first
// thing in Shohoj Tasks that speaks before it is spoken to.
//
// Pure. No Firestore, no clock, no sender — the instant is passed in, which is
// what lets "does this fire yet" be tested exhaustively instead of waited on.
//
// AN OFFSET, NOT A TIMESTAMP
//
// A reminder is stored as `offsetMinutes` before the deadline, and the instant
// it fires is derived. That is the difference between a reminder that follows a
// rescheduled exam and one that fires at the old time for a date that no longer
// exists — and a student who moves a deadline should not have to remember to
// move three reminders with it.
//
// `scheduledFor` is still stored, because the cron has to find due reminders
// without reading every task first. It is DERIVED state: recomputed from the
// task whenever either changes, and the offset is the thing of record. Where
// the two disagree, the offset wins.

export const REMINDER_SCHEMA_VERSION = 1;

/** Where a reminder is delivered. */
export const REMINDER_CHANNELS = Object.freeze(['WEB', 'EMAIL', 'PUSH']);

/**
 * Only EMAIL is deliverable today.
 *
 * WEB and PUSH are storable so a student's choice survives the arrival of
 * those channels, and so the model does not need migrating to add them. The
 * cron skips anything it cannot actually send, rather than marking it sent —
 * a reminder recorded as delivered through a channel that does not exist is
 * worse than one still waiting.
 */
export const DELIVERABLE_CHANNELS = Object.freeze(['EMAIL']);

export const REMINDER_STATUSES = Object.freeze(['PENDING', 'SENT', 'FAILED', 'CANCELLED']);

/**
 * The offsets worth offering, in minutes before the deadline.
 *
 * The brief's list, and they are the ones students actually ask for: the night
 * before, the afternoon of, and the "leave now" nudge. Anything else is
 * available as a custom number — this is the menu, not the limit.
 */
export const COMMON_OFFSETS = Object.freeze([
  { minutes: 24 * 60, label: 'A day before' },
  { minutes: 3 * 60, label: 'Three hours before' },
  { minutes: 30, label: 'Thirty minutes before' },
]);

/** Four weeks. Past this a reminder is a calendar entry, not a nudge. */
const MAX_OFFSET_MINUTES = 28 * 24 * 60;
/** At most this many per task — a guard against a scripted client, not a quota. */
export const MAX_REMINDERS_PER_TASK = 5;

function invalid(field, message) {
  return { field, message };
}

/**
 * Validate a reminder request.
 *
 * An offset of 0 is allowed and means "at the deadline", which is a real thing
 * to want. Negative is not: a reminder after the fact is a notification about
 * something already missed, and if that is ever wanted it should be its own
 * feature with its own wording rather than a negative number here.
 */
export function validateReminderInput(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { error: invalid('body', 'Expected a JSON object.') };
  }

  const { offsetMinutes } = payload;
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > MAX_OFFSET_MINUTES) {
    return {
      error: invalid(
        'offsetMinutes',
        `Remind between 0 and ${MAX_OFFSET_MINUTES} minutes before the deadline.`,
      ),
    };
  }

  const channel = payload.channel === undefined ? 'EMAIL' : payload.channel;
  if (!REMINDER_CHANNELS.includes(channel)) {
    return { error: invalid('channel', `Channel must be one of ${REMINDER_CHANNELS.join(', ')}.`) };
  }

  return { value: { offsetMinutes, channel } };
}

/**
 * When a reminder fires, as an ISO instant — or null when it cannot.
 *
 * A task with no deadline has nothing to count back from. That is not an error
 * and not a reason to refuse the reminder: a student can add a deadline later,
 * and the reminder starts working the moment they do.
 */
export function scheduledForTask(task, offsetMinutes) {
  if (task?.dueAt === null || task?.dueAt === undefined) return null;
  const due = Date.parse(task.dueAt);
  if (Number.isNaN(due)) return null;
  return new Date(due - offsetMinutes * 60_000).toISOString();
}

/** Deterministic id from the task and the offset: the same reminder twice is one. */
export async function reminderId(taskId, offsetMinutes, channel, sha256Hex) {
  const digest = await sha256Hex(`shohoj:reminder:v1:${taskId}|${offsetMinutes}|${channel}`);
  return `rem_${digest.slice(0, 32)}`;
}

export function buildReminderRecord({ id, taskId, userId, input, task, nowIso, existing = null }) {
  return {
    schemaVersion: REMINDER_SCHEMA_VERSION,
    id,
    taskId,
    userId,
    offsetMinutes: input.offsetMinutes,
    channel: input.channel,
    scheduledFor: scheduledForTask(task, input.offsetMinutes),
    // Re-adding a reminder that already fired resets it: the student is asking
    // to be reminded again, which is the only thing the request can mean.
    status: 'PENDING',
    sentAt: null,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

export function reminderDto(record) {
  return {
    id: record.id,
    taskId: record.taskId,
    offsetMinutes: record.offsetMinutes,
    channel: record.channel,
    scheduledFor: record.scheduledFor ?? null,
    status: record.status,
    sentAt: record.sentAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Recompute a reminder against its task.
 *
 * Called whenever a task's deadline moves. Returns the updated record, or null
 * when nothing changed — so a caller can skip a write rather than touching
 * every reminder on every task edit.
 *
 * A reminder that has already SENT is left alone: its `scheduledFor` is a
 * record of when it went, and rewriting it would lose that. Moving the deadline
 * of a task whose reminder already fired does not un-fire it.
 */
export function rescheduleReminder(reminder, task, nowIso) {
  if (reminder.status === 'SENT') return null;
  const next = scheduledForTask(task, reminder.offsetMinutes);
  if (next === (reminder.scheduledFor ?? null)) return null;
  return { ...reminder, scheduledFor: next, updatedAt: nowIso };
}

/**
 * Should this reminder go out now?
 *
 * Every condition here is a way a reminder could annoy somebody:
 *
 *   * already sent, or cancelled — fire once, never twice;
 *   * a channel nothing can deliver — skip rather than claim success;
 *   * no scheduled time — the task has no deadline to count back from;
 *   * not yet due;
 *   * the task is finished or abandoned — the deadline stopped mattering;
 *   * the task is gone — its reminders went with it.
 *
 * `graceMinutes` bounds how late a reminder may still go out. A cron that was
 * down for a day should not, on recovery, deliver yesterday's nudges about work
 * that is now simply overdue — the student knows. Past the grace window the
 * reminder is dropped rather than sent.
 */
export function shouldSend(reminder, task, nowMs, graceMinutes = 120) {
  if (reminder.status !== 'PENDING') return false;
  if (!DELIVERABLE_CHANNELS.includes(reminder.channel)) return false;
  if (!reminder.scheduledFor) return false;
  if (task === null || task === undefined) return false;
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;

  const due = Date.parse(reminder.scheduledFor);
  if (Number.isNaN(due)) return false;
  if (due > nowMs) return false;
  return nowMs - due <= graceMinutes * 60_000;
}

/** True when a pending reminder is too late to be worth sending. */
export function isStale(reminder, nowMs, graceMinutes = 120) {
  if (reminder.status !== 'PENDING' || !reminder.scheduledFor) return false;
  const due = Date.parse(reminder.scheduledFor);
  if (Number.isNaN(due)) return false;
  return nowMs - due > graceMinutes * 60_000;
}

/**
 * The email for one due reminder.
 *
 * Plain and short on purpose: it arrives on a phone, at a moment the student is
 * probably doing something else, and its whole job is to name the thing and say
 * when. No marketing, no digest of everything else they owe.
 */
export function buildReminderEmail(task, reminder, courseCode = null) {
  const course = courseCode === null ? '' : `${courseCode} · `;
  const when = task.dueAt === null ? '' : formatDue(task.dueAt, reminder.offsetMinutes);
  const subject = `${course}${task.title}${when === '' ? '' : ` — ${when}`}`;

  const html = [
    `<p style="margin:0 0 12px;font-size:16px"><strong>${escapeHtml(task.title)}</strong></p>`,
    course === '' ? '' : `<p style="margin:0 0 8px;color:#555">${escapeHtml(courseCode)}</p>`,
    when === '' ? '' : `<p style="margin:0 0 16px">${escapeHtml(when)}</p>`,
    '<p style="margin:0;color:#777;font-size:13px">A reminder you set in Shohoj.</p>',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: subject.slice(0, 200), html };
}

/** "Due in 3 hours" / "Due now" — from the offset, not the clock, so it is pure. */
function formatDue(dueAt, offsetMinutes) {
  if (offsetMinutes === 0) return 'Due now';
  if (offsetMinutes % (24 * 60) === 0) {
    const days = offsetMinutes / (24 * 60);
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `Due in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `Due in ${offsetMinutes} minutes`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
