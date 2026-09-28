// src/app/AdminCampusSwitcher.tsx
//
// The admin's "view as" control (#798): which campus the shell renders for.
//
// A student's campus is their email's and never moves. An admin moderates all
// of them, and one on an address no campus claims resolves to none at all — so
// without this they could not see NSU's grading scale or tab list, or BRACU's,
// the way either campus's students do.
//
// View only. The choice feeds useUniversity and nothing else: the admin claim
// already passes every campus check in firestore.rules and the Worker, and the
// campus stamped on a document is still derived from the writer's email
// (campusStamp.ts), not from here.
//
// Rendered in two places, one visible per viewport (css/shell-routes.css):
//   nav — a pill beside the Admin link, from 481px up;
//   bar — a slim row above the tabs on phones, where the nav row is already
//         full: Admin, the email, Sign out and the theme toggle take all of
//         375px, and shrinking the Admin pill would break its legacy parity
//         capture.
// Each is display:none at the other's widths, so only one is ever in the
// accessibility tree.
//
// The campus list is read from the registry, so a new university appears here
// as a side effect of adding its profile.

import { useId } from 'react';

import { useAdminCampus, useAuth, useUniversity } from './providers/AuthProvider';
import { UNIVERSITIES, isUniversityId } from '../core/university';

export interface AdminCampusSwitcherProps {
  readonly placement?: 'nav' | 'bar';
}

export function AdminCampusSwitcher({ placement = 'nav' }: AdminCampusSwitcherProps) {
  const { status, isAdmin } = useAuth();
  const university = useUniversity();
  const [, setAdminCampus] = useAdminCampus();
  const id = useId();
  if (status !== 'authenticated' || !isAdmin) return null;

  const select = (
    <select
      id={id}
      className="admin-campus-switcher"
      // The bar has a visible <label>; the nav pill has no room for one.
      aria-label={placement === 'nav' ? 'View Shohoj as campus' : undefined}
      title="View Shohoj as this campus's students see it"
      data-testid={placement === 'nav' ? 'admin-campus-switcher' : 'admin-campus-switcher-bar'}
      value={university?.id ?? ''}
      onChange={(e) => {
        if (isUniversityId(e.target.value)) setAdminCampus(e.target.value);
      }}
    >
      {/* Only while nothing resolves — an admin on a non-campus address who has
          not picked yet. A disabled option cannot be chosen back. Short on
          purpose: a native select is as wide as its longest option. */}
      {university === null && (
        <option value="" disabled>
          Campus
        </option>
      )}
      {Object.values(UNIVERSITIES).map((campus) => (
        <option key={campus.id} value={campus.id}>
          {campus.shortName}
        </option>
      ))}
    </select>
  );

  if (placement === 'nav') return select;
  return (
    <div className="admin-campus-bar">
      <label htmlFor={id}>Viewing as</label>
      {select}
    </div>
  );
}

export default AdminCampusSwitcher;
