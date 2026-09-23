/**
 * Campus place directory for the /campus route (#748).
 *
 * The CONNECT feed only knows classroom and lab codes on floors 7–12, so the
 * map could not answer "where is the Registrar?" or "which floor is the
 * Medical Center on?". This registry lists every named place on every level of
 * the Merul Badda campus, transcribed from BRACU's Campus 360 page
 * (https://www.bracu.ac.bd/campus-360, checked 2026-09-23) — the same source
 * the revision-4 BRACU campus Blender model uses for its facility floors.
 *
 * Precision is FLOOR-LEVEL ONLY. Campus 360 says which level a place is on,
 * not where on that level; the Blender model's in-floor positions are flagged
 * unverified, so none are carried here. Names follow Campus 360's wording; the
 * `aliases` are search helpers added here (acronyms, everyday words), not
 * official names.
 *
 * Pure data in, pure data out, no imports — node tests load this file directly.
 */

export type PlaceKind =
  | 'office'
  | 'department'
  | 'study'
  | 'lab'
  | 'food'
  | 'health'
  | 'venue'
  | 'recreation'
  | 'service';

export interface CampusPlace {
  /** Stable id: `<floor>-<slug>`, unique across the registry. */
  id: string;
  /** Name as Campus 360 lists it. */
  name: string;
  /** Level: BASEMENT_LEVEL, GROUND_LEVEL, 1–13, or UPPER_ROOF_LEVEL. */
  floor: number;
  kind: PlaceKind;
  /** Extra search terms (lowercase). Not shown as names. */
  aliases: readonly string[];
}

/** Campus 360 groups Basements 1–3 into one listing; so does the directory. */
export const BASEMENT_LEVEL = -1;
export const GROUND_LEVEL = 0;
/** The level above the 13th floor (jogging track). */
export const UPPER_ROOF_LEVEL = 14;

/** Human label for a level, matching the route's "Floor N" buttons. */
export function levelLabel(floor: number): string {
  if (floor === BASEMENT_LEVEL) return 'Basements 1–3';
  if (floor === GROUND_LEVEL) return 'Ground floor';
  if (floor === UPPER_ROOF_LEVEL) return 'Upper roof';
  return `Floor ${floor}`;
}

/** Human label for a place kind. */
export function placeKindLabel(kind: PlaceKind): string {
  switch (kind) {
    case 'office':
      return 'Office';
    case 'department':
      return 'School / department';
    case 'study':
      return 'Study space';
    case 'lab':
      return 'Lab';
    case 'food':
      return 'Food & drink';
    case 'health':
      return 'Health';
    case 'venue':
      return 'Venue';
    case 'recreation':
      return 'Recreation';
    default:
      return 'Service';
  }
}

type Row = readonly [name: string, kind: PlaceKind, aliases?: readonly string[]];

// Level → places, in Campus 360's order. Keep names verbatim from the source.
const LEVELS: ReadonlyArray<readonly [number, readonly Row[]]> = [
  [BASEMENT_LEVEL, [['Car and Motorbike Parking', 'service', ['parking', 'car', 'bike']]]],
  [
    GROUND_LEVEL,
    [
      ['Reception', 'service', ['front desk', 'information']],
      ['Auditorium', 'venue', ['hall', 'convocation']],
      ['Multipurpose Hall', 'venue', ['mph', 'hall']],
      ['Central Control Room', 'service', ['security', 'control room']],
      ['ATM Booth', 'service', ['atm', 'cash']],
      ['Arabika Coffee', 'food', ['coffee', 'cafe']],
      ['Merchandise Shop', 'service', ['merch', 'souvenir']],
      ['Maidan (Football Field)', 'recreation', ['football', 'field', 'playground']],
      ['Cricket Practice Tracks', 'recreation', ['cricket', 'nets']],
      ['Biotope Lake', 'recreation', ['lake', 'pond']],
      ['Green Room', 'venue', ['backstage']],
    ],
  ],
  [
    1,
    [
      ['Auditorium Upper Gallery', 'venue', ['balcony', 'gallery']],
      ['Medical Center', 'health', ['doctor', 'clinic', 'medical', 'sick']],
      ['BRAC Bank & ATM', 'service', ['bank', 'atm', 'cash']],
      ['Medicine Shop', 'health', ['pharmacy', 'medicine', 'drug']],
    ],
  ],
  [
    2,
    [
      ['Student Information Center', 'office', ['sic', 'information', 'help desk']],
      ['Exhibition Gallery', 'venue', ['exhibition', 'gallery']],
      ['Rehearsal Room', 'venue', ['rehearsal', 'practice']],
    ],
  ],
  [
    3,
    [
      ['Student Life', 'office', ['student affairs']],
      [
        'Office of Co-Curricular Activities (OCA)',
        'office',
        ['clubs', 'co-curricular', 'extracurricular'],
      ],
      [
        'Office of Career Services & Alumni Relations (OCSAR)',
        'office',
        ['career', 'jobs', 'internship', 'alumni'],
      ],
      ['Office of Academic Advising (OAA)', 'office', ['advising', 'advisor', 'probation']],
      ['Counseling and Wellness Centre', 'health', ['counselling', 'mental health', 'wellness']],
      ['Centre for Entrepreneurship Development (CED)', 'office', ['startup', 'entrepreneurship']],
      ['Childcare Centre', 'service', ['daycare', 'child care']],
    ],
  ],
  [
    4,
    [
      [
        'Office of the Vice-Chancellor, Pro-Vice-Chancellor and Treasurer',
        'office',
        ['vc', 'pro-vc', 'treasurer'],
      ],
      ['Office of the Registrar', 'office', ['registrar', 'certificate', 'transcript']],
      ['Admissions Office', 'office', ['admission', 'admissions']],
      [
        'Office of the Controller of Examinations',
        'office',
        ['exam', 'exams', 'coe', 'result', 'results'],
      ],
      ['Office of the Proctor', 'office', ['proctor', 'discipline']],
      ['Finance & Accounts', 'office', ['fees', 'payment', 'tuition', 'accounts']],
      ['Human Resources Department', 'office', ['hr', 'human resources']],
      [
        'Sexual Harassment, Exploitation, Bullying, and Ragging Elimination Committee (SHEBREC)',
        'office',
        ['harassment', 'complaint'],
      ],
      ['Procurement Department', 'office', ['procurement', 'purchase']],
      ['Office of Communications', 'office', ['communications', 'media', 'pr']],
      ['IT Systems', 'office', ['it', 'its', 'wifi', 'email']],
      ['Operations Office', 'office', ['operations', 'facilities']],
      [
        'International and Scholarship Office (ISO)',
        'office',
        ['scholarship', 'waiver', 'international'],
      ],
      ['Internal Audit and Compliance', 'office', ['audit', 'compliance']],
      ['Learning and Teaching Innovation Center', 'office', ['ltic', 'teaching']],
    ],
  ],
  [
    5,
    [
      ['BSRM School of Engineering', 'department', ['soe', 'engineering']],
      ['Department of Electrical and Electronic Engineering', 'department', ['eee', 'ece']],
      ['School of Data and Sciences', 'department', ['sds']],
      ['Department of Computer Science and Engineering (CSE)', 'department', ['cse']],
      ['Department of Computer Science (CS)', 'department', ['cs']],
      [
        'Department of Mathematics and Natural Science (MNS) (Physical)',
        'department',
        ['mns', 'math', 'physics'],
      ],
      ['School of Law', 'department', ['law', 'llb']],
      ['RA and TA Lounge', 'study', ['ra', 'ta']],
      ['School of Humanities and Social Sciences', 'department', ['shss']],
      ['Department of Economics and Social Sciences (ESS)', 'department', ['ess', 'economics']],
      ['Department of English and Humanities (ENH)', 'department', ['enh', 'english']],
      ['School of Pharmacy', 'department', ['sop', 'pharmacy']],
      ['School of Life Sciences', 'department', ['sls']],
      ['Department of Microbiology', 'department', ['mic', 'microbiology']],
      ['Department of Biotechnology', 'department', ['bt', 'biotech']],
      [
        'Department of Mathematics and Natural Science (MNS) (Microbiology, Biotech)',
        'department',
        ['mns', 'biotech'],
      ],
      ['School of Architecture and Design', 'department', ['architecture']],
      ['Department of Architecture', 'department', ['arch']],
      ['BRAC Business School', 'department', ['bbs', 'bba', 'business', 'mba']],
      ['BRAC Institute of Languages', 'department', ['bil', 'languages']],
      ['School of General Education', 'department', ['sge', 'gened', 'general education']],
    ],
  ],
  [
    6,
    [
      ['Cafeteria', 'food', ['food', 'canteen', 'lunch']],
      ['Prayer Room', 'service', ['namaz', 'salah', 'mosque', 'prayer']],
      ['Club Activity Rooms', 'recreation', ['clubs']],
      ['Alumni & EMBA Lounges', 'study', ['alumni', 'emba']],
      ['Girls Lounge', 'study', ['women', 'female']],
      ['Robotics Lab', 'lab', ['robotics']],
      ['BRACU Express', 'service', []],
      ['Indoor Games Room', 'recreation', ['games', 'table tennis', 'carrom']],
    ],
  ],
  [7, [['Classrooms', 'study', ['class', 'classroom']]]],
  [
    8,
    [
      ['Classrooms', 'study', ['class', 'classroom']],
      ['Ayesha Abed Library', 'study', ['library', 'books']],
    ],
  ],
  [
    9,
    [
      ['Classrooms', 'study', ['class', 'classroom']],
      ['Lecture Theaters', 'study', ['theater', 'theatre']],
      ['Library', 'study', ['library', 'books']],
      ['Computer Lab', 'lab', ['computer', 'pc']],
    ],
  ],
  [
    10,
    [
      ['Classrooms', 'study', ['class', 'classroom']],
      ['CSE Lab', 'lab', ['cse']],
      ['MNS Lab', 'lab', ['mns']],
      ['Computer Lab', 'lab', ['computer', 'pc']],
    ],
  ],
  [
    11,
    [
      ['Pharmacy Labs', 'lab', ['pharmacy']],
      ['EEE/ECE Labs', 'lab', ['eee', 'ece']],
      ['CSE/CE Labs', 'lab', ['cse', 'ce']],
      ['Architecture Studios', 'lab', ['architecture', 'studio', 'arch']],
      ['Computer Lab', 'lab', ['computer', 'pc']],
      ['MNS Lab', 'lab', ['mns']],
    ],
  ],
  [
    12,
    [
      ['Learning Labs/Classrooms', 'study', ['class', 'classroom', 'learning lab']],
      ['EEE/ECE Labs', 'lab', ['eee', 'ece']],
      ['CSE/CE Labs', 'lab', ['cse', 'ce']],
      ['MNS Labs', 'lab', ['mns']],
    ],
  ],
  [
    13,
    [
      ['Green Field', 'recreation', ['field', 'lawn']],
      ['Yoga Pavilion', 'recreation', ['yoga']],
      ['Gymnasium', 'recreation', ['gym', 'fitness']],
      ['Swimming Pool', 'recreation', ['pool', 'swim', 'swimming']],
    ],
  ],
  [UPPER_ROOF_LEVEL, [['Jogging Track', 'recreation', ['jogging', 'running', 'track']]]],
];

/** Lowercase, punctuation → spaces, collapsed — the form both sides are compared in. */
export function normalizePlaceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(name: string): string {
  return normalizePlaceText(name).replace(/ /g, '-');
}

/** Every place, in level order (basements first), Campus 360 order within a level. */
export const CAMPUS_PLACES: readonly CampusPlace[] = LEVELS.flatMap(([floor, rows]) =>
  rows.map(([name, kind, aliases]) => ({
    id: `${floor}-${slug(name)}`,
    name,
    floor,
    kind,
    aliases: aliases ?? [],
  })),
);

export interface PlaceLevel {
  floor: number;
  label: string;
  places: CampusPlace[];
}

/** The directory grouped by level, ascending (basements → upper roof). */
export function placesByLevel(places: readonly CampusPlace[] = CAMPUS_PLACES): PlaceLevel[] {
  const byFloor = new Map<number, CampusPlace[]>();
  for (const place of places) {
    const list = byFloor.get(place.floor);
    if (list) list.push(place);
    else byFloor.set(place.floor, [place]);
  }
  return [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, list]) => ({ floor, label: levelLabel(floor), places: list }));
}

/**
 * How well a place matches a normalized query, lower is better, or null for no
 * match: 0 name starts with it, 1 a word in the name starts with it, 2 an alias
 * starts with it, 3 the name contains it anywhere.
 */
function matchRank(place: CampusPlace, query: string): number | null {
  const name = normalizePlaceText(place.name);
  if (name.startsWith(query)) return 0;
  if (name.includes(` ${query}`)) return 1;
  if (place.aliases.some((alias) => normalizePlaceText(alias).startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return null;
}

/**
 * Places matching a free-text query, best first; ties keep level order. An
 * empty (or punctuation-only) query matches nothing — the route shows the full
 * directory instead.
 */
export function searchPlaces(
  query: string,
  places: readonly CampusPlace[] = CAMPUS_PLACES,
): CampusPlace[] {
  const needle = normalizePlaceText(query);
  if (!needle) return [];
  return places
    .map((place, order) => ({ place, order, rank: matchRank(place, needle) }))
    .filter((hit): hit is { place: CampusPlace; order: number; rank: number } => hit.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((hit) => hit.place);
}
