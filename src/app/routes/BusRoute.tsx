// src/app/routes/BusRoute.tsx
//
// BRAC University students' transport (#372) — the official Transport Office
// timetable rendered from the typed dataset in src/core/busRoutes.ts.
//
// Staleness honesty (the advising-tab lesson): the schedule is per-semester
// paper data, so the effective date is always on screen, the Transport Office
// contacts are one tap away, and the "authority may change anything anytime"
// disclaimer ships verbatim. The page adds ONE live convenience — today's
// service status and the next departure highlight — both derived from the
// device clock, not from any claimed live feed.

import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import {
  BUS_ROUTES,
  BUS_CONTACTS,
  BUS_GENERAL_INSTRUCTIONS,
  BUS_SCHEDULE_EFFECTIVE_FROM,
  BUS_SERVICE_AVAILABILITY,
  BUS_FARE_NOTE,
  busTimeToMinutes,
  isBusServiceDay,
  findBusRoute,
  type BusRouteVariant,
} from '../../core/busRoutes';

function fareLine(route: BusRouteVariant): string {
  return `BDT ${route.fareOneWay} per trip · BDT ${route.fareRoundTrip} round trip`;
}

export function Component() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = findBusRoute(searchParams.get('route')) ?? BUS_ROUTES[0];

  const now = new Date();
  const serviceToday = isBusServiceDay(now.getDay());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // First upcoming pickup of the selected route today (either trip), used
  // to highlight where the bus is headed next. Purely clock-derived.
  const nextPickup = useMemo(() => {
    if (!serviceToday) return null;
    let best: { stop: string; time: string; minutes: number } | null = null;
    for (const stop of selected.inbound) {
      for (const time of [stop.firstTrip, stop.secondTrip]) {
        const minutes = busTimeToMinutes(time);
        if (minutes === null || minutes < nowMinutes) continue;
        if (!best || minutes < best.minutes) {
          best = { stop: stop.name, time: time as string, minutes };
        }
      }
    }
    return best;
  }, [selected, serviceToday, nowMinutes]);

  const selectRoute = (id: string) => {
    setSearchParams(id === BUS_ROUTES[0].id ? {} : { route: id }, { replace: true });
  };

  const hasSecondTrip = selected.inbound.some((s) => s.secondTrip !== null);

  return (
    <section className="shell-page bus-page" data-testid="bus-page">
      <h1>Bus Routes &amp; Timings</h1>
      <p className="shell-muted">
        BRAC University students&apos; transport — air-conditioned buses on every route, fares
        payable through bKash.
      </p>

      <div className="bus-effective" data-testid="bus-effective" role="note">
        Schedule effective from <strong>{BUS_SCHEDULE_EFFECTIVE_FROM}</strong> ·{' '}
        {BUS_SERVICE_AVAILABILITY} The Transport Office may change any route, stoppage, schedule or
        fare at any time — when in doubt, confirm with the contacts below.
      </div>

      <p className="bus-today" data-testid="bus-today">
        {serviceToday
          ? nextPickup
            ? `Next pickup on this route today: ${nextPickup.time} at ${nextPickup.stop}.`
            : 'Today’s pickups on this route are done — see the outbound times below for the ride home.'
          : 'No service today (Friday). Buses run Saturday through Thursday.'}
      </p>

      <div className="bus-routes" role="group" aria-label="Route">
        {BUS_ROUTES.map((route) => (
          <button
            key={route.id}
            type="button"
            className={
              route.id === selected.id ? 'bus-route-btn bus-route-btn--active' : 'bus-route-btn'
            }
            aria-pressed={route.id === selected.id}
            onClick={() => selectRoute(route.id)}
          >
            <span className="bus-route-no">{String(route.routeNo).padStart(2, '0')}</span>
            {route.name}
          </button>
        ))}
      </div>

      <div className="bus-detail" data-testid="bus-detail">
        <div className="bus-detail-head">
          <h2>
            Route-{String(selected.routeNo).padStart(2, '0')}: {selected.name} to BRAC University
          </h2>
          <span className="bus-fare" data-testid="bus-fare">
            {fareLine(selected)}
          </span>
        </div>

        <div className="bus-table-scroll">
          <table className="bus-table" data-testid="bus-stops">
            <thead>
              <tr>
                <th scope="col">Stoppage</th>
                <th scope="col">1st trip</th>
                {hasSecondTrip && <th scope="col">2nd trip</th>}
              </tr>
            </thead>
            <tbody>
              {selected.inbound.map((stop) => (
                <tr
                  key={stop.name}
                  className={stop.name === nextPickup?.stop ? 'bus-stop--next' : undefined}
                >
                  <th scope="row">{stop.name}</th>
                  <td>{stop.firstTrip}</td>
                  {hasSecondTrip && <td>{stop.secondTrip}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bus-outbound" data-testid="bus-outbound">
          <h3>Return from campus (drop off, Basement 01)</h3>
          <p>
            {selected.outbound.first ? (
              <>
                1st outbound <strong>{selected.outbound.first}</strong> ·{' '}
              </>
            ) : null}
            2nd outbound <strong>{selected.outbound.second}</strong>
          </p>
        </div>

        <p className="bus-attendant">
          Route attendant:{' '}
          <a href={`tel:+88${selected.attendantPhone.replace('-', '')}`}>
            {selected.attendantPhone}
          </a>
        </p>
      </div>

      <p className="bus-fare-note">{BUS_FARE_NOTE}</p>

      <details className="bus-extra">
        <summary>General instructions</summary>
        <ul>
          {BUS_GENERAL_INSTRUCTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <details className="bus-extra" data-testid="bus-contacts">
        <summary>Transport Office contacts</summary>
        <ul>
          {BUS_CONTACTS.map((contact) => (
            <li key={contact.email}>
              <strong>{contact.name}</strong> — {contact.title} ·{' '}
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
