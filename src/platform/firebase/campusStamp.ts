// src/platform/firebase/campusStamp.ts
//
// The campus to stamp on a document this client is about to write.
//
// firestore.rules requires `university` on every client-created studyGroup,
// appFeedback and lostFoundPost, and pins it to the writer's own campus:
//
//     data.university == campusOfEmail(request.auth.token.email)
//
// Derived here from the signed-in session rather than passed in by the caller,
// deliberately. The alternative — an extra argument on each create() — is one
// a route can forget, and forgetting it is silent until the write reaches
// production rules and is denied. There is no caller to forget this.
//
// It reads the same fact the rules read (the verified email on the session), so
// the client's answer cannot disagree with the server's.

import type { Auth } from 'firebase/auth';

import { universityForEmail } from '../../core/university.ts';

/**
 * The signed-in user's campus id, or '' when no registered campus claims their
 * address.
 *
 * '' is not silently substituted with a default: `validCampus` in the rules
 * accepts only registered ids, so an unresolvable campus fails the write rather
 * than filing the document under somebody else's university. In practice the
 * route gate means callers are always signed in and resolvable; '' is the
 * anomaly path, and failing is the right thing to do with it.
 */
export function campusStamp(auth: Pick<Auth, 'currentUser'>): string {
  return universityForEmail(auth.currentUser?.email ?? '')?.id ?? '';
}

/**
 * The campus filter a list of a campus-scoped collection must open with:
 * `[where('university', '==', campus)]`, or `[]` when there is no campus to
 * scope to.
 *
 * firestore.rules judges a list from its constraints before reading a row, and
 * a document belongs only to the campus its `university` field names — so a
 * student's list without this filter is denied outright.
 *
 * `readCampus` is the campus the page is showing (useUniversity()), which is
 * the student's own or, for an admin, the one picked in the campus switcher.
 * Left out, it falls back to the session's own campus. The empty case is an
 * admin on an outside address who has picked none, whom the rules let read
 * every campus.
 *
 * `where` is passed in rather than imported so this module stays free of the
 * Firestore SDK, which the repos load lazily.
 */
export function campusFilter<C>(
  auth: Pick<Auth, 'currentUser'>,
  where: (field: 'university', op: '==', value: string) => C,
  readCampus?: string | undefined,
): C[] {
  const campus = readCampus ?? campusStamp(auth);
  return campus ? [where('university', '==', campus)] : [];
}
