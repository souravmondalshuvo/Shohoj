// ── ADMIN CAMPUS SWITCHER (legacy bundle) ────────────────────────────────────
//
// The admin's "view as" control (#807): which campus's rules the calculator
// runs on. The legacy twin of src/app/AdminCampusSwitcher.tsx (#798), and it
// writes the same stored choice, so picking NSU here is picking it in /app/.
//
// A student's campus is their email's and never moves; these controls stay
// hidden for them, and setAdminCampusChoice refuses a non-admin anyway.
//
// View only. What follows the choice is everything js/core/activeCampus.js
// feeds — grading scale, retake policy, repeat eligibility, credit-load limits,
// mark tiers. The BRACU-only data in this bundle (seats, routine, the course
// catalogue) does not change, and neither does anything server-side.
//
// Two controls, one visible per viewport (css/style.css): a pill in the nav,
// and a labelled row above the calculator header on phones, where the nav is
// already full. Both ship in index.html with `hidden`; this module fills and
// reveals them. Wired with addEventListener — the production CSP drops inline
// handlers.

import {
  getActiveCampus,
  isAdminCampusViewer,
  setAdminCampusChoice,
} from '../core/activeCampus.js';
import { UNIVERSITIES } from '../core/university.js';

const ADMIN_CAMPUS_SELECT_IDS = ['adminCampusSwitcher', 'adminCampusSwitcherBar'];

let _adminCampusSwitcherReady = false;

function _adminCampusSelects() {
  return ADMIN_CAMPUS_SELECT_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
}

function _fillAdminCampusOptions(select) {
  if (select.options.length > 0) return;
  for (const campus of Object.values(UNIVERSITIES)) {
    const option = document.createElement('option');
    option.value = campus.id;
    option.textContent = campus.shortName;
    select.appendChild(option);
  }
}

function _syncAdminCampusSwitcher() {
  const show = isAdminCampusViewer();
  const active = getActiveCampus().id;
  for (const select of _adminCampusSelects()) {
    _fillAdminCampusOptions(select);
    select.value = active;
    // The phone row's `hidden` sits on its wrapper so the label goes with it.
    (select.closest('.admin-campus-bar') || select).hidden = !show;
  }
}

/** Idempotent. Call once the nav and calculator markup exist. */
export function initAdminCampusSwitcher() {
  if (_adminCampusSwitcherReady) return;
  _adminCampusSwitcherReady = true;
  for (const select of _adminCampusSelects()) {
    select.addEventListener('change', () => {
      // A refused choice (signed out in another tab) snaps back on the resync.
      setAdminCampusChoice(select.value);
      _syncAdminCampusSwitcher();
    });
  }
  // auth-changed: admin status arrives with the session. campus-changed: keep
  // the two selects, and a choice made in /app/, in step.
  window.addEventListener('shohoj:auth-changed', _syncAdminCampusSwitcher);
  window.addEventListener('shohoj:campus-changed', _syncAdminCampusSwitcher);
  _syncAdminCampusSwitcher();
}
