// src/app/routes/BusRouteNsu.tsx
//
// North South University's student bus service, rendered from the typed
// dataset in src/core/busRoutesNsu.ts. Reached at /bus/?campus=nsu — the
// standalone page has no session, so the campus arrives in the URL (see
// BusRoute.tsx).
//
// Staleness honesty, and more of it than BRACU's page needs. NSU's only
// published schedule is the notice for one past service period; nothing newer
// exists to show. So the period is the first thing on the page, in a warning's
// colours rather than a note's, with the portal that has today's answer one
// tap away — and the page adds NOTHING derived from the clock. BRACU's page
// highlights the next pickup; doing that here would dress a year-old time up
// as a live one.

import { useSearchParams } from 'react-router';

import {
  NSU_BUS_FARES,
  NSU_BUS_NOTICE_URL,
  NSU_BUS_PORTAL_URL,
  NSU_BUS_ROUTES,
  NSU_BUS_SERVICE_PERIOD,
  findNsuBusRoute,
  formatNsuBusDate,
  formatNsuBusTime,
} from '../../core/busRoutesNsu';

const times = (list: readonly string[]) => list.map(formatNsuBusTime).join(' · ');

export function NsuBus() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = findNsuBusRoute(searchParams.get('route')) ?? NSU_BUS_ROUTES[0];

  // `campus` is what brought the reader to this page; a route change keeps it.
  const selectRoute = (id: string) => {
    setSearchParams(
      id === NSU_BUS_ROUTES[0].id ? { campus: 'nsu' } : { campus: 'nsu', route: id },
      { replace: true },
    );
  };

  const period = `${formatNsuBusDate(NSU_BUS_SERVICE_PERIOD.from)} – ${formatNsuBusDate(NSU_BUS_SERVICE_PERIOD.to)}`;

  return (
    <section className="shell-page bus-page" data-testid="bus-page" data-campus="nsu">
      <h1>Bus Routes &amp; Timings</h1>
      <p className="shell-muted">North South University student bus service.</p>

      <div className="bus-effective bus-effective--stale" data-testid="bus-effective" role="note">
        <strong>This is an old schedule.</strong> It is NSU&apos;s notice for the service period{' '}
        <strong>{period}</strong> — the latest one NSU has published. Routes and stops rarely
        change, but times and fares may have. Confirm before you travel on{' '}
        <a href={NSU_BUS_PORTAL_URL} target="_blank" rel="noopener noreferrer">
          NSU&apos;s transport portal
        </a>{' '}
        or the{' '}
        <a href={NSU_BUS_NOTICE_URL} target="_blank" rel="noopener noreferrer">
          official notice
        </a>
        .
      </div>

      <div className="bus-routes" role="group" aria-label="Route">
        {NSU_BUS_ROUTES.map((route) => (
          <button
            key={route.id}
            type="button"
            className={
              route.id === selected.id ? 'bus-route-btn bus-route-btn--active' : 'bus-route-btn'
            }
            aria-pressed={route.id === selected.id}
            onClick={() => selectRoute(route.id)}
          >
            {route.name}
          </button>
        ))}
      </div>

      <div className="bus-detail" data-testid="bus-detail">
        <div className="bus-detail-head">
          <h2>NSU – {selected.name} – NSU</h2>
          <span className="bus-fare" data-testid="bus-fare">
            BDT {NSU_BUS_FARES.oneWay} one way · BDT {NSU_BUS_FARES.roundTrip} round trip
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
          NSU&apos;s notice lists the stops on each route and the times at campus. It gives no time
          for an individual stop.
        </p>

        <div className="bus-outbound" data-testid="bus-arrivals">
          <h3>Arrives at campus</h3>
          <p>
            <strong>{times(selected.arriveCampus)}</strong>
          </p>
        </div>

        <div className="bus-outbound" data-testid="bus-outbound">
          <h3>Leaves campus</h3>
          <p>
            <strong>{times(selected.departCampus)}</strong>
          </p>
        </div>
      </div>

      <p className="bus-fare-note">
        Seats are by registration through NSU&apos;s transport portal. Shohoj is not affiliated with
        the service and cannot register or reserve a seat.
      </p>
    </section>
  );
}
