// src/app/routes/HomeRoute.tsx
//
// Landing route for the React Router shell (Phase 3). Lazy-loaded route module
// (exports `Component`), code-split out of the shell entry. This is the first
// page a user lands on, so it welcomes them and routes them straight into the
// tools rather than exposing shell internals. The cloud-capability line is the
// live consumer of the runtime-config boundary (covered by runtime-config.spec).

import { Link } from 'react-router';

import { useCapabilities } from '../providers/RuntimeConfigProvider';

// Quick-entry tiles into the most-used tools. Kept in sync with the nav in
// RootLayout; these are the routes a first-time visitor most likely wants.
const QUICK_LINKS: ReadonlyArray<{ to: string; label: string; blurb: string }> = [
  { to: '/calculator', label: 'CGPA Calculator', blurb: 'Grades, retake strategy, degree progress' },
  { to: '/routine', label: 'Routine', blurb: 'Build your weekly class schedule' },
  { to: '/seats', label: 'Seat Status', blurb: 'Live section capacity from CONNECT' },
  { to: '/reviews', label: 'Faculty Reviews', blurb: 'Ratings before you register' },
  { to: '/campus', label: 'Campus Map', blurb: 'Find your way around' },
  { to: '/profile', label: 'Profile', blurb: 'Account, watchlist & alerts' },
];

export function Component() {
  const { cloud } = useCapabilities();

  return (
    <section className="shell-page">
      <h1>
        University life, made simple. <span className="shell-brand-bn">সহজ</span>
      </h1>
      <p>
        Your courses, CGPA, routine, seats, and campus life — all in one place.
        Built for BRAC University students.
      </p>

      <div className="home-links">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="home-link">
            <span className="home-link-label">{link.label}</span>
            <span className="home-link-blurb">{link.blurb}</span>
          </Link>
        ))}
      </div>

      <p className="shell-muted home-cloud">
        Cloud features: {cloud ? 'available' : 'offline (local tools still work)'}
      </p>
    </section>
  );
}
