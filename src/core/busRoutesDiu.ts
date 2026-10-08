/**
 * Daffodil International University's transport — transcribed from
 * data/campuses/diu/bus.json, which records DIU's public transport feed (the
 * one its own transport page reads). tests/busRoutesDiu.test.js holds this
 * file to that record.
 *
 * STALENESS CONTRACT. The feed is live, but what it serves is titled "Special
 * Transport Schedule for Exam-2026", for Summer 2026 — and it was still
 * serving that, unchanged, a month into Fall. It names a semester and no
 * dates. So this is what DIU publishes today, and DIU's own title says it was
 * drawn up for an exam period. The page must say both, link DIU's transport
 * page (`DIU_BUS_PAGE_URL`), and add nothing that reads as live — no "next
 * bus", no countdown.
 *
 * The shape is neither BRACU's nor NSU's. DIU publishes three services
 * (regular routes, shuttles, and a Friday schedule), the stops on each route
 * in order, the times a bus sets off towards campus and the times one leaves
 * it, and the days a route does not run. It publishes no time per stop, and no
 * fares.
 *
 * Every route ends at Daffodil Smart City (DSC), the campus.
 *
 * Pure data + helpers; no imports, so it is unit-testable as it stands.
 */

export type DiuBusService = 'regular' | 'shuttle' | 'friday';

export interface DiuBusRoute {
  /** Stable id used in URLs (?route=...). */
  readonly id: string;
  /** The route as DIU's feed names it: "Dhanmondi <> DSC". */
  readonly name: string;
  readonly service: DiuBusService;
  /** Stops in the order the feed lists them, the campus last. */
  readonly stops: readonly string[];
  /** Times a bus sets off towards campus (the feed's `from_home`), 24-hour "HH:MM". */
  readonly towardsCampus: readonly string[];
  /** Times a bus leaves campus (the feed's `from_campus`), 24-hour "HH:MM". */
  readonly fromCampus: readonly string[];
  /** Days with no service, one code each: A S M T W R F is Saturday to Friday. */
  readonly daysOff: string;
  /** A correction made while recording the feed, in the record's own words. */
  readonly note?: string;
}

/** The feed's own title and semester for what it is serving. */
export const DIU_BUS_FEED_TITLE = 'Special Transport Schedule for Exam-2026';
export const DIU_BUS_FEED_SEMESTER = 'Summer 2026';

/** The day the feed was last read and found to match this file. */
export const DIU_BUS_CHECKED_ON = '2026-10-09';

/** DIU's own transport page, which shows the current schedule. */
export const DIU_BUS_PAGE_URL = 'https://daffodilvarsity.edu.bd/transport';

/** The feed this file transcribes. */
export const DIU_BUS_FEED_URL = 'https://webbackend.daffodilvarsity.edu.bd/api/v2/public/transport';

/** The services, in the order the feed gives them. */
export const DIU_BUS_SERVICES: readonly { readonly id: DiuBusService; readonly label: string }[] = [
  { id: 'regular', label: 'Regular routes' },
  { id: 'shuttle', label: 'Shuttles' },
  { id: 'friday', label: 'Friday schedule' },
];

export const DIU_BUS_ROUTES: readonly [DiuBusRoute, ...DiuBusRoute[]] = [
  {
    id: 'dhanmondi',
    name: 'Dhanmondi <> DSC',
    service: 'regular',
    stops: [
      'Dhanmondi - Sobhanbag Mosque',
      'Asad Gate / Arong shopping Mall',
      'Suhrawardy Medical college and hospital',
      'Shishu Mela',
      'Shyamoli Square',
      'Kallyanpur',
      'Technical',
      'Mazar Road',
      'Mirpur Konabari Mor',
      'Diabari Police Box',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20', '18:10'],
    daysOff: 'F',
  },
  {
    id: 'uttara-rajlokkhi',
    name: 'Uttara - Rajlokkhi <>Uttara Metro rail Center<> DSC',
    service: 'regular',
    stops: [
      'Rajlokkhi Shopping Complex',
      'Azampur Bus Stop',
      'House Building (Mascot Plaza)',
      'ZamZam Tower',
      'Thana Road',
      'Moylar Mor',
      'Khalpar Mor',
      'Uttara Metro North',
      'Uttara Metro Centre',
      'Uttara Sector-18 Bridge',
      'Uttara Diabari Project Mor',
      'Panchabati Mor',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20', '18:10'],
    daysOff: 'AF',
  },
  {
    id: 'tongi-college-gate',
    name: 'Tongi College gate <> DSC',
    service: 'regular',
    stops: [
      'Tongi College gate',
      'Cherag Ali',
      'Tongi Station Road',
      'Kamarpara',
      'East West Medical College',
      'Sundarban Courier',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20', '18:10'],
    daysOff: 'AF',
  },
  {
    id: 'ecb-chattor',
    name: 'ECB Chattor <> Mirpur <> DSC',
    service: 'regular',
    stops: [
      'ECB Chattar Bus Stop',
      'Kalshi Mor',
      'Shagupta Mor',
      'Pallabi Bus Stand (Metrorail Station)',
      'Mirpur 11 (Rabbani Hotel)',
      'Mirpur 10 (Hotel Al-Baraka)',
      'Mirpur-2 (Shopping Mall Overbridged)',
      'Mirpur-2 (Janata Housing)',
      'Mirpur-1 (Sony Cinema Hall- Rupayan Building )',
      'Mirpur Eidgah Mor',
      'Rainkhola Mor',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20', '18:10'],
    daysOff: 'AF',
  },
  {
    id: 'baipail',
    name: 'Baipail <> Nabinagar <> C&B <> DSC',
    service: 'regular',
    stops: [
      'Baipail Bus Stand',
      'Palli Bidyut Bus Stand',
      'Nabinagar Bus Stand (Shena Shopping Complex)',
      'Bismail',
      'Prantik Gate (JU)',
      'C&B Mor',
      'Kolma',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20'],
    daysOff: 'AF',
  },
  {
    id: 'dhamrai-bus-stand',
    name: 'Dhamrai Bus Stand <> Nabinagar <> C&B <> DSC',
    service: 'regular',
    stops: [
      'Dhulivita Bus Stand',
      'Dhamrai Thana Road',
      'Islampur',
      'Nayarhat',
      'Kohinur Gate',
      'Gono University',
      'Niribili',
      'Savar DOHS',
      'Nabinagar Bus Stand',
      'Bis-mail',
      'Prantik Gate',
      'C&B',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20'],
    daysOff: 'AF',
  },
  {
    id: 'savar',
    name: 'Savar <> C&B <> DSC',
    service: 'regular',
    stops: [
      'Savar Model Mosque',
      'Savar Bus Stand',
      'Shimultola (CRP)',
      'Radio Colony',
      'C&B.',
      '1 No Kolma',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00', '10:00'],
    fromCampus: ['13:30', '16:20'],
    daysOff: 'F',
  },
  {
    id: 'narayanganj-chasara',
    name: 'Narayanganj Chasara > Dhanmondi > DSC',
    service: 'regular',
    stops: [
      'Narayanganj Chasara',
      'Sibu Market',
      'Jalkuri',
      'Sign Board',
      'Matuail Bus Stand',
      'Rayerbag',
      'Sonir Akra',
      'Kajla',
      'Jatrabari (Mayor Hanif Flyover)',
      'Chankharpul',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['06:20'],
    fromCampus: ['16:20'],
    daysOff: 'AF',
  },
  {
    id: 'mugha-medical-college',
    name: 'Mugha Medical College',
    service: 'regular',
    stops: [
      'Mugda Medical College',
      'Budda Mandir',
      'Bashabo',
      'Khilgaon Police Fari',
      'Malibagh Rail Gate',
      'Abul Hotel',
      'Rampura Bazar',
      'Rampura TV Centre',
      'Rampura Bridge',
      'Merul Badda (Brac University)',
      'Middle Badda (U-loop)',
      'Badda Link Road (Pran & RFL)',
      'Uttar Badda (Footover Bridge)',
      'Suvastu',
      'Notun Bazar',
      'Nadda (Footover Bridge)',
      'Jamuna Future Park (Footover Bridge)',
      'Kuril Bishwa Road (Mirpur Flyover)',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['06:20'],
    fromCampus: ['16:20'],
    daysOff: 'AF',
  },
  {
    id: 'konabari-pukur-par',
    name: 'Konabari Pukur Par<>DSC',
    service: 'regular',
    stops: [
      'Konabari Pukur Par (AC Land Office)',
      'Narsinghpur',
      'Goshbag',
      'Zirabo',
      'Ashulia Bazar',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:00'],
    fromCampus: ['16:20'],
    daysOff: 'AF',
  },
  {
    id: 'shuttle-technical-bus-stand',
    name: 'Shuttle : Technical Bus Stand <> DSC',
    service: 'shuttle',
    stops: [
      'Technical',
      'Mazar Road',
      'Mirpur Konabari Mor',
      'Diabari Police Box',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['08:30', '12:00'],
    fromCampus: ['11:15'],
    daysOff: 'AF',
  },
  {
    id: 'shuttle-mirpur-1-sony-cinema-hall',
    name: 'Shuttle: Mirpur-1, Sony Cinema Hall <> DSC',
    service: 'shuttle',
    stops: [
      'Mirpur-1 (Sony Cinema Hall- Rupayan Building )',
      'Mirpur Eidgah Mor',
      'Rainkhola Mor',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['08:30', '12:00'],
    fromCampus: ['11:15'],
    daysOff: 'AF',
  },
  {
    id: 'shuttle-uttara-moylar-mor',
    name: 'Shuttle: Uttara Moylar Mor <> Uttara Metro rail Center<> DSC',
    service: 'shuttle',
    stops: [
      'Moylar Mor',
      'Khalpar Mor',
      'Uttara Metro North',
      'Uttara Metro Centre',
      'Uttara Sector-18 Bridge',
      'Uttara Diabari Project Mor',
      'Panchabati Mor',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['08:30', '12:00'],
    fromCampus: ['11:15'],
    daysOff: 'AF',
  },
  {
    id: 'shuttle-tongi-station-route',
    name: 'Shuttle: Tongi station route <> Daffodil Smart City',
    service: 'shuttle',
    stops: [
      'Tongi Station Road',
      'Kamarpara',
      'East West Medical College',
      'Sundarban Courier',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['08:30', '12:00'],
    fromCampus: ['11:15'],
    daysOff: 'AF',
  },
  {
    id: 'shuttle-c-b',
    name: 'Shuttle: C&B <> DSC',
    service: 'shuttle',
    stops: ['C&B', '1 No Kolma', 'Daffodil Smart City-DSC'],
    towardsCampus: ['08:30', '12:00'],
    fromCampus: ['11:15'],
    daysOff: 'AF',
  },
  {
    id: 'friday-dhanmondi',
    name: 'Friday Schedule : Dhanmondi <> DSC',
    service: 'friday',
    stops: [
      'Dhanmondi - Sobhanbag Mosque',
      'Asad Gate / Arong shopping Mall',
      'Suhrawardy Medical college and hospital',
      'Shishu Mela',
      'Shyamoli Square',
      'Kallyanpur',
      'Technical',
      'Mazar Road',
      'Mirpur Konabari Mor',
      'Diabari Police Box',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:30'],
    fromCampus: ['14:20', '18:30'],
    daysOff: 'ASMTWR',
    note: 'Printed as 02:20, 06:30: 12-hour times in a 24-hour field (a university bus does not leave campus before dawn), read as 14:20, 18:30.',
  },
  {
    id: 'friday-mirpur-10',
    name: 'Friday Schedule: Mirpur-10 <> Sony Cinema Hall <> DSC',
    service: 'friday',
    stops: [
      'Mirpur 10 (Hotel Al-Baraka)',
      'Mirpur-2 (Shopping Mall Overbridged)',
      'Mirpur-2 (Janata Housing)',
      'Mirpur-1 (Sony Cinema Hall- Rupayan Building )',
      'Mirpur Eidgah Mor',
      'Rainkhola Mor',
      'Mirpur Eastern Housing',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:30'],
    fromCampus: ['14:20', '18:30'],
    daysOff: 'ASMTWR',
    note: 'Printed as 02:20, 06:30: 12-hour times in a 24-hour field (a university bus does not leave campus before dawn), read as 14:20, 18:30.',
  },
  {
    id: 'friday-uttara-rajlokkhi',
    name: 'Friday Schedule: Uttara - Rajlokkhi <>Uttara Metro rail Center <> DSC',
    service: 'friday',
    stops: [
      'Rajlokkhi Shopping Complex',
      'Azampur Bus Stop',
      'House Building (Mascot Plaza)',
      'ZamZam Tower',
      'Thana Road',
      'Moylar Mor',
      'Khalpar Mor',
      'Uttara Metro North',
      'Uttara Metro Centre',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:30'],
    fromCampus: ['14:20', '18:30'],
    daysOff: 'ASMTWR',
    note: 'Printed as 02:20, 06:30: 12-hour times in a 24-hour field (a university bus does not leave campus before dawn), read as 14:20, 18:30.',
  },
  {
    id: 'friday-tongi-college-gate',
    name: 'Friday Schedule : Tongi College Gate <> Uttara <> DSC',
    service: 'friday',
    stops: [
      'Tongi College gate',
      'Cherag Ali',
      'Tongi Station Road',
      'Kamarpara',
      'East West Medical College',
      'Sundarban Courier',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:30'],
    fromCampus: ['18:30'],
    daysOff: 'ASMTWR',
    note: 'Printed as 06:30: 12-hour times in a 24-hour field (a university bus does not leave campus before dawn), read as 18:30.',
  },
  {
    id: 'friday-savar',
    name: 'Friday Schedule : Savar <> Nabinagar <> C&B <> DSC',
    service: 'friday',
    stops: [
      'Bis-mail',
      'Savar Model Mosque',
      'Savar Bus Stand',
      'Shimultola (CRP)',
      'Radio Colony',
      'Daffodil Smart City-DSC',
    ],
    towardsCampus: ['07:30'],
    fromCampus: ['18:30'],
    daysOff: 'ASMTWR',
    note: 'Printed as 06:30: 12-hour times in a 24-hour field (a university bus does not leave campus before dawn), read as 18:30.',
  },
];

export function findDiuBusRoute(id: string | null): DiuBusRoute | null {
  return DIU_BUS_ROUTES.find((route) => route.id === id) ?? null;
}

/**
 * A route's name without the service it is already listed under, and with the
 * feed's uneven `<>` separators evened out: "Friday Schedule : Savar  <>
 * Nabinagar <> C&B <> DSC" → "Savar ↔ Nabinagar ↔ C&B ↔ DSC".
 */
export function diuBusRouteLabel(route: DiuBusRoute): string {
  return route.name
    .replace(/^(Friday Schedule|Shuttle)\s*:\s*/, '')
    .split(/\s*<?>\s*/)
    .filter(Boolean)
    .join(' ↔ ');
}

const DIU_BUS_DAYS: readonly (readonly [string, string])[] = [
  ['A', 'Saturday'],
  ['S', 'Sunday'],
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['R', 'Thursday'],
  ['F', 'Friday'],
];

/** The days a route runs, Saturday first: every day its `daysOff` does not name. */
export function diuBusServiceDays(route: DiuBusRoute): readonly string[] {
  return DIU_BUS_DAYS.filter(([code]) => !route.daysOff.includes(code)).map(([, day]) => day);
}

/** "Saturday to Thursday", "Friday", or the days listed when they do not run together. */
export function formatDiuBusServiceDays(route: DiuBusRoute): string {
  const days = diuBusServiceDays(route);
  const [first, ...rest] = days;
  if (first === undefined) return 'No service day listed';
  const last = rest[rest.length - 1];
  if (last === undefined) return first;
  const order = DIU_BUS_DAYS.map(([, day]) => day);
  const start = order.indexOf(first);
  const consecutive = days.every((day, i) => order[start + i] === day);
  return consecutive ? `${first} to ${last}` : days.join(', ');
}

/** "14:20" → "2:20 PM". Anything that is not HH:MM is returned as it came. */
export function formatDiuBusTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const period = hours < 12 ? 'AM' : 'PM';
  return `${((hours + 11) % 12) + 1}:${match[2]} ${period}`;
}
