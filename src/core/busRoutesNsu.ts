/**
 * North South University's student bus service — transcribed from
 * data/campuses/nsu/bus.json, which records NSU's official registration
 * notice. tests/busRoutesNsu.test.js holds this file to that record.
 *
 * STALENESS CONTRACT, and it is stricter than BRACU's (src/core/busRoutes.ts):
 * the notice is for ONE service period, 2025-09-25 to 2025-12-24, and NSU has
 * published nothing newer — its announcement page still showed this notice,
 * unchanged, a year on. So this is the latest schedule that exists, and it is
 * old. The page must say both things every time it is shown: which period the
 * notice covers, and where to confirm today's (`NSU_BUS_PORTAL_URL`). It must
 * not add anything that reads as live — no "next bus", no countdown.
 *
 * The shape is not BRACU's. NSU publishes the stops on each route and the times
 * buses reach and leave campus; it does not publish a time per stop.
 *
 * Pure data + two helpers; no imports, so it is unit-testable as it stands.
 */

export interface NsuBusRoute {
  /** Stable id used in URLs (?route=...). */
  readonly id: string;
  /** The area the route serves, as NSU names it: "Uttara". */
  readonly name: string;
  /** Stops in the order the notice lists them, furthest from campus first. */
  readonly stops: readonly string[];
  /** Times a bus on this route reaches campus, 24-hour "HH:MM". */
  readonly arriveCampus: readonly string[];
  /** Times a bus on this route leaves campus, 24-hour "HH:MM". */
  readonly departCampus: readonly string[];
}

/** The service period the notice covers, as ISO dates. */
export const NSU_BUS_SERVICE_PERIOD = { from: '2025-09-25', to: '2025-12-24' } as const;

/** BDT per passenger, the same on every route. */
export const NSU_BUS_FARES = { oneWay: 100, roundTrip: 200 } as const;

/** Where NSU runs registration and the current schedule. */
export const NSU_BUS_PORTAL_URL = 'https://transport.northsouth.edu/';

/** The notice this file transcribes. */
export const NSU_BUS_NOTICE_URL =
  'https://www.northsouth.edu/nsu-announcements/nsu-bus-service.html';

export const NSU_BUS_ROUTES: readonly [NsuBusRoute, ...NsuBusRoute[]] = [
  {
    id: 'uttara',
    name: 'Uttara',
    stops: ['Abdullahpur', 'House Building', 'Azampur', 'Jashimuddin', 'Airport'],
    arriveCampus: ['07:40', '14:20', '17:45'],
    departCampus: ['10:00', '14:40', '18:30'],
  },
  {
    id: 'mirpur',
    name: 'Mirpur',
    stops: ['Bangla College', 'Mirpur 1-12', 'ECB Square'],
    arriveCampus: ['07:40', '14:20', '17:45'],
    departCampus: ['10:00', '14:40', '18:30', '22:20'],
  },
  {
    id: 'mohammadpur',
    name: 'Mohammadpur',
    stops: [
      'Japan Garden City',
      'Suchana Community Center',
      'Syamoli Bus Stand',
      'Agargaon',
      'BAF Shaheen College',
      'Banani Rail',
    ],
    arriveCampus: ['07:40', '14:20', '17:45'],
    departCampus: ['10:00', '14:40', '18:30', '22:20'],
  },
  {
    id: 'dhanmondi',
    name: 'Dhanmondi',
    stops: ['Jigatola Bus Stand', 'Dhanmondi 27', 'Khamarbari Mor', 'Mohakhali Flyover'],
    arriveCampus: ['07:40', '14:20', '17:45'],
    departCampus: ['10:00', '14:40', '18:30'],
  },
  {
    id: 'azimpur',
    name: 'Azimpur',
    stops: ['Azimpur', 'Katabon', 'Bangla Motor', 'Mogbazar', 'Gulshan Niketon', 'Gate-1'],
    arriveCampus: ['07:40', '14:20', '18:45'],
    departCampus: ['10:00', '14:40'],
  },
  {
    id: 'khilgaon',
    name: 'Khilgaon',
    stops: [
      'Notre Dame College',
      'Rajarbag',
      'Khilgaon Bagicha',
      'Malibagh Rail Gate',
      'Malibagh Abul Hotel',
      'Rampura Bridge',
    ],
    arriveCampus: ['07:40', '14:20', '18:45'],
    departCampus: ['10:00', '14:40'],
  },
];

export function findNsuBusRoute(id: string | null): NsuBusRoute | null {
  return NSU_BUS_ROUTES.find((route) => route.id === id) ?? null;
}

/** "14:20" → "2:20 PM". Anything that is not HH:MM is returned as it came. */
export function formatNsuBusTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const period = hours < 12 ? 'AM' : 'PM';
  return `${((hours + 11) % 12) + 1}:${match[2]} ${period}`;
}

/** "2025-09-25" → "25 Sep 2025". Anything else is returned as it came. */
export function formatNsuBusDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}
