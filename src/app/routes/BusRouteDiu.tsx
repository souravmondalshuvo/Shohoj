// src/app/routes/BusRouteDiu.tsx
//
// Daffodil International University's transport, rendered from the typed
// dataset in src/core/busRoutesDiu.ts. Reached at /bus/?campus=diu — the
// standalone page has no session, so the campus arrives in the URL (see
// BusRoute.tsx).
//
// Staleness honesty. DIU's feed is live, but what it serves is still titled
// for the Summer 2026 exam period, a month into Fall. So the page leads with
// DIU's own title for the schedule and the day Shohoj last read it, with DIU's
// transport page one tap away — and it adds NOTHING derived from the clock.
// BRACU's page highlights the next pickup; doing that here would dress an
// exam-period time up as today's.

import { useSearchParams } from 'react-router';

import {
  DIU_BUS_CHECKED_ON,
  DIU_BUS_FEED_SEMESTER,
  DIU_BUS_FEED_TITLE,
  DIU_BUS_PAGE_URL,
  DIU_BUS_ROUTES,
  DIU_BUS_SERVICES,
  diuBusRouteLabel,
  findDiuBusRoute,
  formatDiuBusServiceDays,
  formatDiuBusTime,
} from '../../core/busRoutesDiu';
import { formatNsuBusDate } from '../../core/busRoutesNsu';

const times = (list: readonly string[]) => list.map(formatDiuBusTime).join(' · ');

export function DiuBus() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = findDiuBusRoute(searchParams.get('route')) ?? DIU_BUS_ROUTES[0];

  // `campus` is what brought the reader to this page; a route change keeps it.
  const selectRoute = (id: string) => {
    setSearchParams(
      id === DIU_BUS_ROUTES[0].id ? { campus: 'diu' } : { campus: 'diu', route: id },
      { replace: true },
    );
  };

  return (
    <section className="shell-page bus-page" data-testid="bus-page" data-campus="diu">
      <h1>Bus Routes &amp; Timings</h1>
      <p className="shell-muted">
        Daffodil International University transport, to and from Daffodil Smart City.
      </p>

      <div className="bus-effective bus-effective--stale" data-testid="bus-effective" role="note">
        <strong>This may not be this semester&apos;s schedule.</strong> DIU publishes it as the
        &ldquo;{DIU_BUS_FEED_TITLE}&rdquo; for <strong>{DIU_BUS_FEED_SEMESTER}</strong>, and it is
        still what DIU was showing on <strong>{formatNsuBusDate(DIU_BUS_CHECKED_ON)}</strong>.
        Confirm before you travel on{' '}
        <a href={DIU_BUS_PAGE_URL} target="_blank" rel="noopener noreferrer">
          DIU&apos;s transport page
        </a>
        .
      </div>

      {DIU_BUS_SERVICES.map((service) => (
        <div key={service.id} className="bus-service" data-testid={`bus-service-${service.id}`}>
          <h2>{service.label}</h2>
          <div className="bus-routes" role="group" aria-label={service.label}>
            {DIU_BUS_ROUTES.filter((route) => route.service === service.id).map((route) => (
              <button
                key={route.id}
                type="button"
                className={
                  route.id === selected.id ? 'bus-route-btn bus-route-btn--active' : 'bus-route-btn'
                }
                aria-pressed={route.id === selected.id}
                onClick={() => selectRoute(route.id)}
              >
                {diuBusRouteLabel(route)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="bus-detail" data-testid="bus-detail">
        <div className="bus-detail-head">
          <h2>{diuBusRouteLabel(selected)}</h2>
          <span className="bus-fare" data-testid="bus-days">
            Runs {formatDiuBusServiceDays(selected)}
          </span>
        </div>

        <div className="bus-table-scroll">
          <table className="bus-table bus-table--stops" data-testid="bus-stops">
            <thead>
              <tr>
                <th scope="col">Stoppage</th>
              </tr>
            </thead>
            <tbody>
              {selected.stops.map((stop) => (
                <tr key={stop}>
                  <th scope="row">{stop}</th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bus-fare-note">
          DIU lists the stops on each route and the times a bus sets off. It gives no time for an
          individual stop, and publishes no fare.
        </p>

        <div className="bus-outbound" data-testid="bus-arrivals">
          <h3>Sets off for campus</h3>
          <p>
            <strong>{times(selected.towardsCampus)}</strong>
          </p>
        </div>

        <div className="bus-outbound" data-testid="bus-outbound">
          <h3>Leaves campus</h3>
          <p>
            <strong>{times(selected.fromCampus)}</strong>
          </p>
        </div>

        {selected.note ? (
          <p className="bus-fare-note" data-testid="bus-correction">
            {selected.note}
          </p>
        ) : null}
      </div>

      <details className="bus-extra" data-testid="bus-instructions">
        <summary>DIU&apos;s notes on the service</summary>
        <ul>
          <li>Services on each route run on a limited basis.</li>
          <li>
            Be at your stop 10–15 minutes before the departure time. The bus leaves on time and does
            not wait.
          </li>
          <li>A bus does not leave campus on a route with fewer than 15 passengers.</li>
        </ul>
      </details>

      <p className="bus-fare-note">
        Shohoj is not affiliated with the service and cannot reserve a seat.
      </p>
    </section>
  );
}
