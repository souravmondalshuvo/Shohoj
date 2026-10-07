// ── CAMPUS SCOPE (legacy bundle) ─────────────────────────────────────────────
//
// How this client tags the documents it creates, and how it asks for the ones
// it lists, so that each campus sees its own. The legacy twin of the shell's
// campusStamp (src/platform/firebase/campusStamp.ts), plus the read half the
// shell does not have yet.
//
// Everything is derived from the signed-in email — the same fact
// firestore.rules reads (`campusOfEmail(request.auth.token.email)`) — so the
// client's answer cannot disagree with the server's. A student's is NOT derived
// from the active campus (js/core/activeCampus.js), and neither is anything
// this client writes: an admin viewing the site as NSU is still, to the rules,
// whoever their email says they are.
//
// The one thing the active campus does decide is what an ADMIN is shown. The
// rules let an admin read every campus, so nothing but this client narrows
// their lists — and a page that says NSU while listing BRACU's papers and
// reviews is showing the wrong university's, to the one reader who is there to
// check what NSU's students see.
//
// WRITES. firestore.rules pins a present `university` to the writer's own
// campus and reads a missing one as BRACU. Legacy used to send none, which was
// right while it admitted BRACU only; an NSU student's group filed without it
// would read back as BRACU's and be invisible to its own author.
//
// READS. Two facts about the rules, both measured in the emulator
// (tests/firestore.rules.test.js, "list queries"):
//   1. An NSU student's list with no campus filter is DENIED outright.
//   2. A BRACU student's list with no campus filter is allowed — and has to
//      stay unfiltered, because `where('university','==','bracu')` does not
//      match the pre-tenancy documents that have no field at all, which is
//      most of BRACU's. (scripts/backfill_campus.js is what lifts this.)
// So a campus other than BRACU filters in the query, and BRACU filters here,
// after the fact, by the rule the rules themselves use for a missing field.

import { UNIVERSITY_DIRECTORY, campusOfEmail } from '../core/universityDirectory.js';

/**
 * The campus a document with no `university` field belongs to. Mirrors
 * `docCampus` in firestore.rules: everything written before tenancy is BRACU's.
 */
export const PRE_TENANCY_CAMPUS = 'bracu';

/**
 * The field to spread into a document this user is creating: `{ university }`
 * for a student a campus claims, `{}` otherwise.
 *
 * `{}` rather than a guessed default. The only signed-in user no campus claims
 * is an admin on an outside address, and a document with no field is what such
 * an admin has always written.
 */
export function campusWriteField(email) {
  const campus = campusOfEmail(email);
  return campus ? { university: campus } : {};
}

/**
 * How to list a campus-scoped collection for this user.
 *
 *   filter  the campus id to add as `where('university', '==', filter)`, or
 *           null to send the query without one
 *   keep    whether a returned document belongs in this user's view
 *
 * `viewingAs` is the campus the page is showing (js/core/activeCampus.js) and
 * counts for an admin only: they get the list a student of that campus would,
 * sent the way that student's client sends it. A student's own address always
 * decides theirs, whatever is passed here.
 *
 * An admin on a page that shows no campus — the admin dashboard, which
 * moderates all of them — gets no filter and keeps everything, as does anyone
 * no campus claims, who can only be an admin.
 */
export function campusReadPlan(email, isAdmin = false, viewingAs = null) {
  const campus = isAdmin
    ? (UNIVERSITY_DIRECTORY.some(u => u.id === viewingAs) ? viewingAs : null)
    : campusOfEmail(email);
  if (!campus) {
    return { filter: null, keep: () => true };
  }
  const keep = data => (data?.university ?? PRE_TENANCY_CAMPUS) === campus;
  return { filter: campus === PRE_TENANCY_CAMPUS ? null : campus, keep };
}
