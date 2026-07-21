/**
 * Campus cafeteria & food-outlet guide data (#373) — a static directory of
 * where students can eat on campus, where each outlet is, when it's open, and
 * how to pay.
 *
 * DATA-HONESTY CONTRACT (the advising-tab lesson, same as the bus timetable):
 *   - NO daily menus. This schema has no "menu of the day" / dish / price-list
 *     field anywhere, by design — that data goes stale and undermines trust.
 *   - Opening hours are per-semester facts the outlets can change any time, so
 *     each outlet carries a `verified` flag. Until an outlet's hours are
 *     confirmed against a real source, `verified` is `false`: the UI then shows
 *     "Hours not yet confirmed" and SUPPRESSES the open/closed-now badge rather
 *     than assert a status from placeholder data. Flip `verified` to `true`
 *     only once the `hours` below are checked against the outlet itself.
 *   - `CAFETERIA_LAST_REVIEWED` is always shown so readers know the age of the
 *     data.
 *
 * FORMAT (documented so future edits stay consistent):
 *   Each `CafeteriaOutlet` has a stable `id` (used nowhere sensitive), a
 *   display `name`, a `kind`, a `floor` number that deep-links into the campus
 *   map (`/campus?floor=N`), an optional `zone` block letter, a human
 *   `locationNote`, a `payment` list, and `hours`.
 *
 *   `hours` is a length-7 array indexed by JS `Date.getDay()` — 0 = Sunday …
 *   6 = Saturday. Each element is a list of open `Interval`s for that day; an
 *   EMPTY list means "closed all day". Multiple intervals model a midday break
 *   (e.g. `[{open:'8:00 AM',close:'1:00 PM'},{open:'2:00 PM',close:'8:00 PM'}]`).
 *   Times are 12-hour "H:MM AM/PM" strings, same grammar as the bus data.
 *
 * Pure data + tiny time helpers; no I/O, so everything is unit-testable.
 */

export type OutletKind = 'cafeteria' | 'cafe' | 'canteen' | 'kiosk';

export interface Interval {
  /** Opening time, "8:00 AM". */
  open: string;
  /** Closing time, "8:00 PM". Must be later than `open` on the same day. */
  close: string;
}

export interface CafeteriaOutlet {
  /** Stable id used in URLs / React keys. */
  id: string;
  name: string;
  kind: OutletKind;
  /** Tower floor the outlet sits on; deep-links to `/campus?floor=N`. */
  floor: number;
  /** Block/zone letter on that floor, or null when it spans / is lobby-level. */
  zone: string | null;
  /** Human location, e.g. "Ground-floor lobby, near the main entrance". */
  locationNote: string;
  /** Accepted payment methods, e.g. ['bKash', 'Cash']. */
  payment: readonly string[];
  /** Weekly hours indexed by getDay() (0=Sun..6=Sat); [] = closed that day. */
  hours: readonly (readonly Interval[])[];
  /**
   * Whether `hours` have been checked against a real source. While false the
   * UI hides the open/closed badge and shows "Hours not yet confirmed".
   */
  verified: boolean;
  /** Optional extra note (halal, seating, seasonal, etc.). */
  note?: string;
}

/** Date the whole guide was last reviewed; always shown for staleness honesty. */
export const CAFETERIA_LAST_REVIEWED = 'Pending first review';

export const CAFETERIA_DISCLAIMER =
  'Outlets set their own hours and can change or close them at any time — ' +
  'especially during exams, semester breaks and holidays. Confirm on the ' +
  'day when it matters. This guide never lists daily menus or prices.';

const KIND_LABELS: Record<OutletKind, string> = {
  cafeteria: 'Cafeteria',
  cafe: 'Café',
  canteen: 'Canteen',
  kiosk: 'Kiosk',
};

export function outletKindLabel(kind: OutletKind): string {
  return KIND_LABELS[kind];
}

/**
 * PLACEHOLDER DATA. These outlets sketch the shape of the Badda-campus food
 * scene so the guide renders, but every one is `verified: false` — the hours
 * are unconfirmed starting templates, not facts. Replace names/locations/hours
 * with checked values and flip `verified` to `true` per outlet. Do NOT add any
 * menu/dish/price field here (see the data-honesty contract above).
 */
export const CAFETERIA_OUTLETS: readonly CafeteriaOutlet[] = [
  {
    id: 'main-cafeteria',
    name: 'Main Cafeteria',
    kind: 'cafeteria',
    floor: 2,
    zone: null,
    locationNote: 'Level 2 — main student dining hall.',
    payment: ['bKash', 'Cash'],
    hours: weekdayHours({ open: '8:00 AM', close: '8:00 PM' }, { sat: null, fri: null }),
    verified: false,
    note: 'Largest seating capacity; busiest around midday.',
  },
  {
    id: 'ground-cafe',
    name: 'Ground-floor Café',
    kind: 'cafe',
    floor: 1,
    zone: null,
    locationNote: 'Ground-floor lobby, near the main entrance.',
    payment: ['bKash', 'Cash', 'Card'],
    hours: weekdayHours({ open: '8:00 AM', close: '9:00 PM' }, { fri: null }),
    verified: false,
    note: 'Coffee, snacks and quick bites.',
  },
  {
    id: 'rooftop-canteen',
    name: 'Rooftop Canteen',
    kind: 'canteen',
    floor: 10,
    zone: null,
    locationNote: 'Top-floor open-air seating.',
    payment: ['bKash', 'Cash'],
    hours: weekdayHours({ open: '10:00 AM', close: '6:00 PM' }, { fri: null, sat: null }),
    verified: false,
  },
  {
    id: 'library-kiosk',
    name: 'Library Kiosk',
    kind: 'kiosk',
    floor: 6,
    zone: 'A',
    locationNote: 'Beside the library entrance, Block A.',
    payment: ['bKash', 'Cash'],
    hours: weekdayHours({ open: '9:00 AM', close: '5:00 PM' }, { fri: null }),
    verified: false,
    note: 'Grab-and-go only; no seating.',
  },
];

/**
 * Build a 7-day `hours` array from a single weekday interval, overriding
 * specific days. `overrides.fri`/`.sat`/`.sun` may be `null` (closed) or an
 * interval list. Small authoring helper — keeps the placeholder table readable.
 */
function weekdayHours(
  weekday: Interval,
  overrides: { sun?: Interval[] | null; fri?: Interval[] | null; sat?: Interval[] | null } = {},
): Interval[][] {
  const base = () => [weekday];
  return [
    overrides.sun === undefined ? base() : (overrides.sun ?? []), // 0 Sun
    base(), // 1 Mon
    base(), // 2 Tue
    base(), // 3 Wed
    base(), // 4 Thu
    overrides.fri === undefined ? base() : (overrides.fri ?? []), // 5 Fri
    overrides.sat === undefined ? base() : (overrides.sat ?? []), // 6 Sat
  ];
}

/** "8:00 AM" → minutes since midnight; null for null/unparseable input. */
export function outletTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const h24 = match[3] === 'PM' ? (hour % 12) + 12 : hour % 12;
  return h24 * 60 + minute;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type OutletStatus =
  /** Hours not yet confirmed — badge suppressed, no open/closed claim made. */
  | { readonly state: 'unconfirmed' }
  /** Open right now; `closesAt` is today's closing time. */
  | { readonly state: 'open'; readonly closesAt: string }
  /** Closed now; `opensAt`/`opensDay` describe the next opening, if any. */
  | { readonly state: 'closed'; readonly opensAt: string | null; readonly opensDay: string | null };

/**
 * The outlet's open/closed status at `now`. Unverified outlets always return
 * `unconfirmed` so placeholder data never asserts a status. For verified
 * outlets, scans today then up to 7 days ahead for the next opening.
 */
export function outletStatusNow(outlet: CafeteriaOutlet, now: Date): OutletStatus {
  if (!outlet.verified) return { state: 'unconfirmed' };

  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Open right now?
  for (const interval of outlet.hours[today] ?? []) {
    const open = outletTimeToMinutes(interval.open);
    const close = outletTimeToMinutes(interval.close);
    if (open === null || close === null) continue;
    if (nowMinutes >= open && nowMinutes < close) {
      return { state: 'open', closesAt: interval.close };
    }
  }

  // Next opening: rest of today, then the following days (wrap a week).
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = (today + ahead) % 7;
    for (const interval of outlet.hours[day] ?? []) {
      const open = outletTimeToMinutes(interval.open);
      if (open === null) continue;
      if (ahead === 0 && open <= nowMinutes) continue; // already passed today
      return {
        state: 'closed',
        opensAt: interval.open,
        opensDay: ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : DAY_NAMES[day],
      };
    }
  }

  return { state: 'closed', opensAt: null, opensDay: null };
}

export function findOutlet(id: string | null): CafeteriaOutlet | null {
  if (!id) return null;
  const wanted = id.trim().toLowerCase();
  return CAFETERIA_OUTLETS.find((outlet) => outlet.id === wanted) ?? null;
}
