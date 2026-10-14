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
// WRITES. firestore.rules requires `university` on every document a client
// creates and pins it to the writer's own campus.
//
// READS. A document belongs to the campus its `university` field names, and a
// list must say which campus it wants: `where('university','==',campus)`. The
// rules judge a list from its constraints before reading a row, so a list
// without that filter is denied — for every campus, BRACU included.
//
// BRACU used to be the exception. Pre-tenancy documents had no field, the
// rules read a missing one as BRACU's, and a BRACU filter would have missed
// them — so BRACU sent none, and the rules, unable to hold the other campuses'
// rows back from an unfiltered list, handed them over for this client to drop.
// scripts/backfill_campus.js stamped those documents, and that exception, with
// the leak it carried, is gone.

import { UNIVERSITY_DIRECTORY, campusOfEmail } from '../core/universityDirectory.js';

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
  return { filter: campus, keep: data => data?.university === campus };
}
