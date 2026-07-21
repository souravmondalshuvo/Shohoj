/**
 * BRAC University students' transport data (#372) — transcribed verbatim from
 * the official Transport Office brochure, schedule effective 09 June 2026.
 *
 * STALENESS CONTRACT (the advising-tab lesson): this is per-semester data the
 * university can change at any time. The UI must always show
 * `BUS_SCHEDULE_EFFECTIVE_FROM` and point at the Transport Office contacts as
 * the source of truth. When a new brochure ships, this file is the single
 * place to update.
 *
 * Pure data + tiny time helpers; no I/O, so everything is unit-testable.
 */

export interface BusStop {
  name: string;
  /** Pickup time of the 1st inbound trip, e.g. "6:40 AM"; null if none. */
  firstTrip: string | null;
  /** Pickup time of the 2nd inbound trip; null when the variant runs once. */
  secondTrip: string | null;
}

export interface BusRouteVariant {
  /** Stable id used in URLs (?route=...). */
  id: string;
  routeNo: number;
  /** Display name, e.g. "Abdullahpur-A". */
  name: string;
  /**
   * Inbound stoppages in boarding order. The LAST entry is always the
   * "BRAC University (arrival time)" row.
   */
  inbound: BusStop[];
  /** Outbound (drop-off) departures from Basement 01. */
  outbound: { first: string | null; second: string | null };
  /** Service attendant phone for this variant. */
  attendantPhone: string;
  /** BDT per passenger per trip / round trip. */
  fareOneWay: number;
  fareRoundTrip: number;
}

export const BUS_SCHEDULE_EFFECTIVE_FROM = '9 June 2026';

export const BUS_SERVICE_AVAILABILITY =
  'Saturday to Thursday — excluding weekends, government holidays, semester ' +
  'breaks, heavy equipment maintenance and online classes.';

export const BUS_FARE_NOTE =
  'BDT 110 per trip (BDT 220 round trip) on all routes except Narayanganj ' +
  '(BDT 160 / 320) and Bashundhara (BDT 50 / 100). Fares are payable ' +
  'through bKash.';

export const BUS_CONTACTS = [
  {
    name: 'Md. Lutfor Rahman',
    title: 'Assistant Director, Operations, Transport Office',
    email: 'rahman@bracu.ac.bd',
  },
  {
    name: 'Mijan Hosen',
    title: 'Assistant Manager, Operations, Transport Office',
    email: 'mijan.hosen@bracu.ac.bd',
  },
] as const;

export const BUS_GENERAL_INSTRUCTIONS: readonly string[] = [
  'Be present at the designated stop at least five minutes before the scheduled boarding time — the bus leaves each stop on time.',
  'Seats are first come, first served.',
  'Only designated stoppages are used for pickup and drop off.',
  'The bus is for students only — display your ID card before boarding (new students: show a photocopy of your payment receipt).',
  'Wait in a safe place and form a queue before boarding.',
  'No disturbances that may distract the driver; use personal headphones for music.',
  'Remain seated while the bus is in motion.',
  'Smoking, dangerous objects, and pets are strictly prohibited inside the bus.',
  'Throwing anything inside or out of the bus is strictly prohibited.',
  'CC cameras are installed in all buses; all buses are under GPS coverage.',
  'If the service becomes unavailable due to unavoidable circumstances, passengers make their own travel arrangements.',
  'The university may change any route, stoppage, schedule or fare at any point in time.',
] as const;

const ARRIVAL = 'BRAC University (arrival time)';
const FARE_STANDARD = { fareOneWay: 110, fareRoundTrip: 220 };
const FARE_NARAYANGANJ = { fareOneWay: 160, fareRoundTrip: 320 };
const FARE_BASHUNDHARA = { fareOneWay: 50, fareRoundTrip: 100 };

const stop = (
  name: string,
  firstTrip: string | null,
  secondTrip: string | null = null,
): BusStop => ({ name, firstTrip, secondTrip });

export const BUS_ROUTES: readonly BusRouteVariant[] = [
  {
    id: 'abdullahpur-a',
    routeNo: 1,
    name: 'Abdullahpur-A',
    inbound: [
      stop('Abdullahpur (Polwel Carnation Shopping Centre)', '6:40 AM', '8:30 AM'),
      stop('House Building (Labaid Diagnostic)', '6:43 AM', '8:33 AM'),
      stop('Azampur (in front of Uttara East Police Station)', '6:46 AM', '8:36 AM'),
      stop('Jasimuddin (Popular Diagnostic Centre)', '6:49 AM', '8:39 AM'),
      stop('Airport (in front of passenger shed situated 50 yards back)', '6:51 AM', '8:43 AM'),
      stop('Kawla (near foot over-bridge)', '6:52 AM', '8:44 AM'),
      stop('Khilket (first foot over-bridge)', '6:56 AM', '8:47 AM'),
      stop('Biswa Road (near foot over-bridge)', '6:59 AM', '8:49 AM'),
      stop(ARRIVAL, '7:30 AM', '10:40 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01312-467316',
    ...FARE_STANDARD,
  },
  {
    id: 'abdullahpur-b',
    routeNo: 1,
    name: 'Abdullahpur-B',
    inbound: [
      stop(
        'Jashimuddin (opposite to RAK Shopping Complex, Uttara Sector #01, Road #14)',
        '6:20 AM',
      ),
      stop(
        'Korotoa Courier Point (opposite to Korotoa Courier Service, Uttara Sector #03, Road #18)',
        '6:22 AM',
      ),
      stop('Shahid Mugdho Corner (in front of Shahid Mugdho Corner, Robindro Sorobor)', '6:23 AM'),
      stop('Lake Drive Road — Uttara Model Town (opposite to Brac Bank, Sector #07)', '6:25 AM'),
      stop('Zam Zam Tower (in front of Zam Zam Tower, Sector #13, Uttara)', '6:27 AM'),
      stop(
        'Tagore University Point (in front of Tagore University of Creative Arts, Sector #12)',
        '6:29 AM',
      ),
      stop('Khalpar Mor (in front of Police Box)', '6:30 AM'),
      stop('Diabari Gol Chattar (in front of Fresh Ceramics, Uttara)', '6:32 AM'),
      stop('Uttara Centre (MRT Station) — under Metro Rail Station', '6:34 AM'),
      stop('Mirpur Ceramics (near CNG filling station)', '6:38 AM'),
      stop('Mirpur DOHS Gate (near Trust bus stop)', '6:43 AM'),
      stop('Pallabi Thana (Shagufta mour)', '6:45 AM'),
      stop('Kalshi Bus Stand', '6:48 AM'),
      stop('ECB Chattar', '6:51 AM'),
      stop(ARRIVAL, '7:40 AM'),
    ],
    outbound: { first: null, second: '5:15 PM' },
    attendantPhone: '01322-821524',
    ...FARE_STANDARD,
  },
  {
    id: 'mirpur-a',
    routeNo: 2,
    name: 'Mirpur-A',
    inbound: [
      stop('Mirpur Bangla College', '6:20 AM', '8:20 AM'),
      stop('Dhaka Laboratory School and College (in front of Staff Quarter)', '6:22 AM', '8:22 AM'),
      stop('Sony Cinema Hall (near KFC)', '6:24 AM', '8:25 AM'),
      stop('Mirpur College Gate (Mirpur 2)', '6:26 AM', '8:27 AM'),
      stop('Swimming Federation Gate (Mirpur stadium)', '6:28 AM', '8:29 AM'),
      stop('Popular Diagnostic Centre (Mirpur 6)', '6:31 AM', '8:33 AM'),
      stop('Pallabi Post Office (near Purobi Cinema Hall)', '6:34 AM', '8:37 AM'),
      stop('Mirpur 11.5 (Banalata Sweets)', '6:35 AM', '8:38 AM'),
      stop('Mirpur Ceramics (near CNG Filling Station)', '6:36 AM', '8:40 AM'),
      stop('Mirpur DOHS Gate (near Trust Bus Stop)', '6:40 AM', '8:45 AM'),
      stop('Pallabi Thana (Shagufta mour)', '6:43 AM', '8:47 AM'),
      stop('Kalshi Bus Stand', '6:45 AM', '8:49 AM'),
      stop('ECB Chattar', '6:48 AM', '8:52 AM'),
      stop(ARRIVAL, '7:30 AM', '10:20 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01700-926202',
    ...FARE_STANDARD,
  },
  {
    id: 'mirpur-b',
    routeNo: 2,
    name: 'Mirpur-B',
    inbound: [
      stop(
        'Mirpur 14 Bus Stand (opposite to Marks Medical College Hospital)',
        '6:35 AM',
        '8:35 AM',
      ),
      stop(
        'In front of NAM Garden Officers Quarter, Mirpur 13 (near BRTA 2nd Gate)',
        '6:37 AM',
        '8:37 AM',
      ),
      stop('Opposite to Water Tank (Mirpur 10)', '6:39 AM', '8:40 AM'),
      stop('Al Helal Specialized Hospital (Mirpur 10)', '6:43 AM', '8:44 AM'),
      stop('In front of BRAC Healthcare, Kazipara', '6:46 AM', '8:46 AM'),
      stop('Shewrapara (near Jamuna Plaza and Metro Rail Station)', '6:48 AM', '8:48 AM'),
      stop('Taltola Bus Stand (opposite to Glory School & College)', '6:51 AM', '8:50 AM'),
      stop(ARRIVAL, '7:30 AM', '10:30 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01322-821505',
    ...FARE_STANDARD,
  },
  {
    id: 'jigatola-a',
    routeNo: 3,
    name: 'Jigatola-A',
    inbound: [
      stop(
        'Jigatola Bus Stand (in front of Japan-Bangladesh Friendship Hospital)',
        '6:35 AM',
        '8:40 AM',
      ),
      stop('Keari Plaza, Dhanmondi 15 Bus Stand', '6:37 AM', '8:42 AM'),
      stop('Shankar Bus Stand', '6:40 AM', '8:45 AM'),
      stop('Meena Bazar (Dhanmondi 27)', '6:42 AM', '8:47 AM'),
      stop('In front of Lalmatia Mother Care Hospital', '6:45 AM', '8:50 AM'),
      stop(ARRIVAL, '7:30 AM', '10:30 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01312-467317',
    ...FARE_STANDARD,
  },
  {
    id: 'jigatola-b',
    routeNo: 3,
    name: 'Jigatola-B',
    inbound: [
      stop('Jigatola Bus Stand (in front of Japan-Bangladesh Friendship Hospital)', '7:40 AM'),
      stop('Keari Plaza, Dhanmondi 15 Bus Stand', '7:42 AM'),
      stop('Shankar Bus Stand', '7:45 AM'),
      stop('Meena Bazar (Dhanmondi 27)', '7:47 AM'),
      stop('In front of Lalmatia Mother Care Hospital', '7:50 AM'),
      stop(ARRIVAL, '8:45 AM'),
    ],
    outbound: { first: null, second: '5:15 PM' },
    attendantPhone: '01322-821572',
    ...FARE_STANDARD,
  },
  {
    id: 'azimpur',
    routeNo: 4,
    name: 'Azimpur',
    inbound: [
      stop('Azimpur Etimkhana Mour', '6:25 AM', '8:30 AM'),
      stop('Azimpur Chowrasta', '6:27 AM', '8:33 AM'),
      stop('New Market (gate no 2, Janata Bank)', '6:29 AM', '8:36 AM'),
      stop('Happy Arcade Shopping Mall (beside City College)', '6:31 AM', '8:39 AM'),
      stop('Dhanmondi, Road No 7 (ARA Center Shopping Mall)', '6:33 AM', '8:42 AM'),
      stop('Kalabagan Krira Chokro (near foot over-bridge)', '6:35 AM', '8:44 AM'),
      stop('Sobhanbag (near foot over-bridge)', '6:37 AM', '8:47 AM'),
      stop('West End of Manik Mia Avenue (opposite Aarong)', '6:39 AM', '8:51 AM'),
      stop('Khejur Bagan Mour (Manik Mia Avenue)', '6:41 AM', '8:53 AM'),
      stop(ARRIVAL, '7:30 AM', '10:45 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01700-597095',
    ...FARE_STANDARD,
  },
  {
    id: 'baldha-garden',
    routeNo: 5,
    name: 'Baldha Garden',
    inbound: [
      stop('Doyaganj Mour (near mandir)', '6:30 AM', '8:30 AM'),
      stop('Baldha Garden', '6:35 AM', '8:35 AM'),
      stop('Ittefaq Mour', '6:38 AM', '8:38 AM'),
      stop('Motijheel (foot over-bridge)', '6:40 AM', '8:40 AM'),
      stop('Arambag (near Janata Bank)', '6:41 AM', '8:42 AM'),
      stop('Fakirapool Mour (Apex showroom)', '6:43 AM', '8:44 AM'),
      stop('Purana Paltan (Hatil showroom)', '6:44 AM', '8:45 AM'),
      stop('Kakrail Mour (near Eastern Bank)', '6:46 AM', '8:48 AM'),
      stop('Shantinagar Mour (One Bank)', '6:48 AM', '8:50 AM'),
      stop('Moghbazar T&T Office', '6:51 AM', '8:54 AM'),
      stop('Moghbazar Mour (NCC Bank)', '6:55 AM', '9:00 AM'),
      stop(ARRIVAL, '7:40 AM', '10:30 AM'),
    ],
    outbound: { first: '2:10 PM', second: '5:15 PM' },
    attendantPhone: '01307-462100',
    ...FARE_STANDARD,
  },
  {
    id: 'mohammadpur-a',
    routeNo: 6,
    name: 'Mohammadpur-A',
    inbound: [
      stop('Shiya Masjid (near Top Ten shop)', '6:30 AM', '8:30 AM'),
      stop('Opposite to Suchona Community Center', '6:32 AM', '8:42 AM'),
      stop('Shampa Market', '6:34 AM', '8:45 AM'),
      stop('Shyamoli (Bata mour)', '6:37 AM', '8:48 AM'),
      stop('Opposite to Shyamoli Cinema Hall', '6:39 AM', '8:51 AM'),
      stop('Agargaon Radio Office', '6:42 AM', '8:53 AM'),
      stop('Opposite to Agargaon flower shops', '6:44 AM', '8:55 AM'),
      stop(ARRIVAL, '7:35 AM', '10:45 AM'),
    ],
    outbound: { first: '2:10 PM', second: '5:10 PM' },
    attendantPhone: '01321-205471',
    ...FARE_STANDARD,
  },
  {
    id: 'mohammadpur-b',
    routeNo: 6,
    name: 'Mohammadpur-B',
    inbound: [
      stop(
        "In front of Bata Showroom (opposite to Japan Garden City's main gate)",
        '6:35 AM',
        '8:30 AM',
      ),
      stop(
        'In front of Baitus Sujud Jame Mosque (near Mohammadpur Bus Stand/Nurjahan Road)',
        '6:40 AM',
        '8:36 AM',
      ),
      stop('Town Hall Market (in front of Bikrampur Mistanna Bhandar)', '6:42 AM', '8:38 AM'),
      stop('West end of Manik Mia Avenue (opposite to Aarong)', '6:45 AM', '8:43 AM'),
      stop(
        'New Model Multilateral High School (opposite to Kalabagan bus counters)',
        '6:50 AM',
        '8:48 AM',
      ),
      stop('Water Bhaban (near Panthapath Mour)', '6:53 AM', '8:53 AM'),
      stop(ARRIVAL, '7:30 AM', '10:30 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:15 PM' },
    attendantPhone: '01322-821521',
    ...FARE_STANDARD,
  },
  {
    id: 'narayanganj',
    routeNo: 7,
    name: 'Narayanganj',
    inbound: [
      stop('Narayanganj Central Shahid Minar (Chashara)', '6:30 AM'),
      stop('Himaloy Chinese & Community Centre (opposite to Narayanganj Zila Parishad)', '6:34 AM'),
      stop('Shibu Market (in front of Dutch Bangla Bank)', '6:37 AM'),
      stop('Jalkuri Bus Stand, Fatullah (in front of First Security Islami Bank)', '6:40 AM'),
      stop('Bhuighar (near Darussunnah Islamia Kamil Madrasah)', '6:43 AM'),
      stop('Signboard (near Islamia Eye Hospital)', '6:48 AM'),
      stop('Shamsul Hoque School & College (under foot over-bridge)', '6:51 AM'),
      stop('Sanarpar Bus Stand, Siddhirganj', '6:54 AM'),
      stop('Madaninagar Fazil Madrasah, Siddhirganj (near foot over-bridge)', '6:57 AM'),
      stop('Khankaye Jame Masjid, Narayanganj (near foot over-bridge)', '7:02 AM'),
      stop('Opposite of Rani Mahal Cinema Hall, Demra', '7:04 AM'),
      stop('IFIC Bank Ltd (opposite to Sarulia Bazar)', '7:05 AM'),
      stop('In front of Demra Ideal College', '7:11 AM'),
      stop(ARRIVAL, '7:35 AM'),
    ],
    outbound: { first: null, second: '5:15 PM' },
    attendantPhone: '01322-821541',
    ...FARE_NARAYANGANJ,
  },
  {
    id: 'bashundhara',
    routeNo: 8,
    name: 'Bashundhara',
    inbound: [
      stop('Ebenezer International School, Bashundhara R/A', '7:00 AM', '9:00 AM'),
      stop('Block-F, Road No: 08, Bashundhara R/A (opposite to IFIC Bank)', '7:05 AM', '9:05 AM'),
      stop('In front of Aga Khan Academy, Bashundhara R/A', '7:10 AM', '9:10 AM'),
      stop(ARRIVAL, '7:40 AM', '10:35 AM'),
    ],
    outbound: { first: '2:05 PM', second: '5:10 PM' },
    attendantPhone: '01789-720482',
    ...FARE_BASHUNDHARA,
  },
] as const;

/** "6:40 AM" → minutes since midnight; null for null/unparseable input. */
export function busTimeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const h24 = match[3] === 'PM' ? (hour % 12) + 12 : hour % 12;
  return h24 * 60 + minute;
}

/** Buses run Saturday–Thursday; Friday (getDay() === 5) is the weekend. */
export function isBusServiceDay(dayIndex: number): boolean {
  return dayIndex !== 5;
}

export function findBusRoute(id: string | null): BusRouteVariant | null {
  if (!id) return null;
  const wanted = id.trim().toLowerCase();
  return BUS_ROUTES.find((route) => route.id === wanted) ?? null;
}
