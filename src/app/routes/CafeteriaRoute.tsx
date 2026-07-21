// src/app/routes/CafeteriaRoute.tsx
//
// Campus cafeteria guide (#373) — a static directory of on-campus food outlets
// rendered from the typed dataset in src/core/cafeteriaOutlets.ts.
//
// Data honesty (the advising-tab lesson, mirrored from the bus timetable):
// there are NO daily menus or prices anywhere. Opening hours are per-outlet
// facts that change, so each outlet carries a `verified` flag: until its hours
// are confirmed the open/closed-now badge is suppressed and the card says
// "Hours not yet confirmed" instead of asserting a status from placeholder
// data. The only live convenience is the open/closed-now badge, derived from
// the device clock — no claimed live feed.

import { Link } from 'react-router';

import {
  CAFETERIA_OUTLETS,
  CAFETERIA_DISCLAIMER,
  CAFETERIA_LAST_REVIEWED,
  outletKindLabel,
  outletStatusNow,
  type CafeteriaOutlet,
  type OutletStatus,
} from '../../core/cafeteriaOutlets';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusLabel(status: OutletStatus): string {
  switch (status.state) {
    case 'unconfirmed':
      return 'Hours not yet confirmed';
    case 'open':
      return `Open now · closes ${status.closesAt}`;
    case 'closed':
      return status.opensAt
        ? `Closed · opens ${status.opensAt}${status.opensDay && status.opensDay !== 'today' ? ` ${status.opensDay}` : ''}`
        : 'Closed';
  }
}

function statusClass(status: OutletStatus): string {
  return `cafeteria-status cafeteria-status--${status.state}`;
}

/** Today-first summary of an outlet's weekly hours, for the card body. */
function hoursSummary(
  outlet: CafeteriaOutlet,
  todayIndex: number,
): { day: string; text: string; today: boolean }[] {
  return outlet.hours.map((intervals, dayIndex) => ({
    day: DAY_NAMES[dayIndex],
    today: dayIndex === todayIndex,
    text:
      intervals.length === 0 ? 'Closed' : intervals.map((i) => `${i.open} – ${i.close}`).join(', '),
  }));
}

export function Component() {
  const now = new Date();
  const todayIndex = now.getDay();

  // Cheap over a handful of outlets — recompute each render so the badge is
  // current whenever the page renders.
  const outlets = CAFETERIA_OUTLETS.map((outlet) => ({
    outlet,
    status: outletStatusNow(outlet, now),
  }));

  return (
    <section className="shell-page cafeteria-page" data-testid="cafeteria-page">
      <h1>Cafeteria Guide</h1>
      <p className="shell-muted">
        Where to eat on campus — each outlet&apos;s location, opening hours and how to pay. No daily
        menus, by design.
      </p>

      <div className="cafeteria-effective" data-testid="cafeteria-effective" role="note">
        Last reviewed: <strong>{CAFETERIA_LAST_REVIEWED}</strong>. {CAFETERIA_DISCLAIMER}
      </div>

      <ul className="cafeteria-list" data-testid="cafeteria-list">
        {outlets.map(({ outlet, status }) => (
          <li
            key={outlet.id}
            className="cafeteria-card"
            data-testid={`cafeteria-outlet-${outlet.id}`}
          >
            <div className="cafeteria-card-head">
              <h2 className="cafeteria-name">
                {outlet.name} <span className="cafeteria-kind">{outletKindLabel(outlet.kind)}</span>
              </h2>
              <span
                className={statusClass(status)}
                data-testid={`cafeteria-status-${outlet.id}`}
                data-state={status.state}
              >
                {statusLabel(status)}
              </span>
            </div>

            <p className="cafeteria-location">
              {outlet.locationNote}{' '}
              <Link
                className="cafeteria-map-link"
                to={`/campus?floor=${outlet.floor}`}
                data-testid={`cafeteria-map-${outlet.id}`}
              >
                Show floor {outlet.floor}
                {outlet.zone ? `, Block ${outlet.zone}` : ''} on the map →
              </Link>
            </p>

            <div className="cafeteria-hours-scroll">
              <table
                className="cafeteria-hours"
                data-testid={`cafeteria-hours-${outlet.id}`}
                aria-label={`Weekly opening hours for ${outlet.name}`}
              >
                <tbody>
                  {hoursSummary(outlet, todayIndex).map((row) => (
                    <tr key={row.day} className={row.today ? 'cafeteria-hours--today' : undefined}>
                      <th scope="row">
                        {row.day}
                        {row.today ? ' (today)' : ''}
                      </th>
                      <td>{row.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="cafeteria-pay">Payment: {outlet.payment.join(' · ')}</p>
            {outlet.note ? <p className="cafeteria-note">{outlet.note}</p> : null}
            {!outlet.verified ? (
              <p className="cafeteria-unverified">
                Hours below are an unconfirmed placeholder — confirm at the outlet.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
