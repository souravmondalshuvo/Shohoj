/**
 * BRAC University's Residential Campus at Khagan, Birulia, Savar — where every
 * BRACU undergraduate spends the Residential Semester — as data for the
 * Campus Map (#978).
 *
 * How much of this is known, and how:
 *
 *   - The site and the footprints are OpenStreetMap's, projected to metres
 *     about the middle of the campus wall (x east, y north). OSM gives the
 *     wall (way 1236280123, 11.1 acres), the buildings, the two fields, the
 *     basketball court, the gardens, the roads, the water tower and the two
 *     sculptures. The two small sheds with `osmWay: null` are not in OSM;
 *     their outlines are traced from the satellite image.
 *   - Names come from OSM and BRACU's RS handbooks (Spring 2026, Summer 2025,
 *     Fall 2022), which use them in their duty lists: Nikunjo and Maloncho
 *     dormitories, the Duranto and Durbar fields, Anandapur. A building no
 *     source names is described, never given a name.
 *   - Storey counts say where they come from (`levelsFrom`): OSM's level tag,
 *     a count in an RS-handbook photograph, or an estimate from how far the
 *     building leans in the satellite image (Esri World Imagery, WorldView-2,
 *     5 February 2026) against Nikunja's known ten storeys. Only the first is
 *     a confirmed figure.
 *   - Roof forms and colours are read off that image; wall finishes off the
 *     handbook photographs. Interiors are not drawn — nothing about them is
 *     published.
 *   - OSM has one more outline, between the central garden and the courtyard
 *     building (way 587837347). The February 2026 image shows bare ground
 *     there, so it is not drawn.
 *
 * Pure data and pure functions, no imports, so node tests can load it.
 */

/** A point in campus metres: [x east, y north]. */
export type Point = readonly [number, number];

/** Where a storey count comes from. Only `osm` is treated as confirmed. */
export type LevelsSource = 'osm' | 'photo' | 'imagery';

export type RsBuildingKind = 'dormitory' | 'hall' | 'shed' | 'unknown';

/**
 * - `hip`: hipped roof over each of `roofParts`
 * - `gable`: pitched roof, ridge along each part's length
 * - `flat`: flat roof with a parapet
 * - `flat-stubs`: flat roof with the column stubs of a floor yet to be built
 */
export type RsRoof = 'hip' | 'gable' | 'flat' | 'flat-stubs';

/** The look of the walls, from the handbook photographs. */
export type RsFacade = 'dorm' | 'fins' | 'bands' | 'hall' | 'shed';

/** An oriented rectangle: centre, size in metres, and the long side's angle from east in degrees. */
export interface RsRect {
  cx: number;
  cy: number;
  length: number;
  width: number;
  angle: number;
}

export interface RsBuilding {
  id: string;
  /** The building's name, when a source gives one; otherwise null. */
  name: string | null;
  /** What the page calls it: the name, or a plain description. */
  label: string;
  /** Another spelling a source uses. */
  aka?: string;
  kind: RsBuildingKind;
  levels: number;
  levelsFrom: LevelsSource;
  roof: RsRoof;
  /** The roof's parts, for pitched roofs. */
  roofParts?: readonly RsRect[];
  facade: RsFacade;
  /** OpenStreetMap way of the footprint, or null when traced from the image. */
  osmWay: number | null;
  /** One or two sentences: what it is and what is known about it. */
  about: string;
  footprint: readonly Point[];
}

export type RsGroundKind = 'pitch' | 'court' | 'garden';

export interface RsGround {
  id: string;
  name: string | null;
  kind: RsGroundKind;
  osmWay: number;
  about: string;
  outline: readonly Point[];
}

export interface RsLandmark {
  id: string;
  label: string;
  kind: 'water-tower' | 'sculpture';
  at: Point;
  osmNode: number;
}

export interface RsRoad {
  /** OpenStreetMap's highway class. */
  kind: string;
  /** True for the campus's own roads, inside the wall. */
  inside: boolean;
  name: string | null;
  path: readonly Point[];
}

/** Where campus metres are measured from: the middle of the campus wall. */
export const RS_ORIGIN = { lat: 23.86760876, lon: 90.30869422 } as const;

/** The campus wall (OpenStreetMap way 1236280123), x east and y north in metres. */
export const RS_WALL: readonly Point[] = [
  [140.4, 80.3],
  [104.9, 75.7],
  [-1.8, 66.9],
  [-127.0, 49.3],
  [-126.0, 114.7],
  [-162.6, 115.7],
  [-161.6, 40.2],
  [-149.1, -56.7],
  [-106.5, -61.0],
  [-6.4, -36.0],
  [-2.3, -67.0],
  [15.4, -64.8],
  [20.4, -104.2],
  [80.1, -92.7],
  [167.8, -80.5],
  [161.7, -15.8],
  [152.6, 36.1],
];

/** The gate in the east wall, onto the Birulia–Akran road (OpenStreetMap node 11478715412). */
export const RS_GATE: Point = [161.7, -15.8];

export const RS_BUILDINGS: readonly RsBuilding[] = [
  {
    id: 'nikunja',
    name: 'Nikunja',
    label: 'Nikunja',
    aka: 'Nikunjo',
    kind: 'dormitory',
    levels: 10,
    levelsFrom: 'osm',
    roof: 'hip',
    roofParts: [
      { cx: 109.2, cy: -74.5, length: 44.0, width: 21.7, angle: 30.8 },
      { cx: 149.9, cy: -51.7, length: 37.1, width: 24.2, angle: 30.8 },
    ],
    facade: 'dorm',
    osmWay: 1181827288,
    about:
      'Dormitory. OpenStreetMap names it Nikunja and gives it ten storeys; the RS handbook spells it Nikunjo. The tallest building on campus: two hipped red roofs with raised ridge lights, over white walls with balconies.',
    footprint: [
      [84.7, -76.5],
      [88.1, -82.1],
      [91.8, -88.3],
      [100.0, -83.5],
      [104.0, -90.2],
      [133.6, -72.6],
      [131.6, -69.2],
      [136.8, -66.0],
      [140.1, -71.5],
      [165.6, -56.4],
      [161.8, -50.0],
      [165.7, -47.8],
      [161.7, -41.1],
      [164.3, -39.6],
      [159.6, -31.8],
    ],
  },
  {
    id: 'maloncho',
    name: 'Maloncho',
    label: 'Maloncho',
    aka: 'Malancha',
    kind: 'dormitory',
    levels: 6,
    levelsFrom: 'osm',
    roof: 'flat-stubs',
    facade: 'dorm',
    osmWay: 1181827287,
    about:
      "Dormitory. OpenStreetMap names it Maloncho and gives it six storeys; the RS handbook's duty list mentions the Maloncho dormitory field. In the February 2026 satellite image its flat roof carries column stubs, the way a building is left ready for another floor.",
    footprint: [
      [71.3, -59.2],
      [76.5, -67.6],
      [112.4, -45.4],
      [110.0, -41.6],
      [117.3, -37.1],
      [119.2, -40.1],
      [148.8, -21.8],
      [140.7, -8.9],
      [133.7, -13.2],
      [127.4, -3.3],
      [104.0, -17.8],
      [108.9, -25.5],
      [102.0, -29.8],
      [97.6, -22.9],
      [74.8, -37.0],
      [81.0, -47.0],
      [75.6, -50.4],
      [78.3, -54.9],
    ],
  },
  {
    id: 'east-block',
    name: null,
    label: 'East block',
    kind: 'unknown',
    levels: 6,
    levelsFrom: 'photo',
    roof: 'flat',
    facade: 'fins',
    osmWay: 1181827284,
    about:
      "The building with the rounded west end, north of the gate. Six storeys counted in the RS handbook's photograph of it: white walls, yellow window fins and red-brick sills. OpenStreetMap tags it as a caf\u00e9; no public source says what it is used for.",
    footprint: [
      [125.8, 39.7],
      [122.0, 31.3],
      [127.2, 24.0],
      [152.3, 37.0],
      [142.5, 79.7],
      [105.6, 73.7],
      [109.7, 58.2],
      [119.5, 60.9],
      [120.6, 58.0],
      [118.5, 54.7],
      [118.5, 52.0],
      [118.5, 49.0],
      [120.1, 44.6],
      [122.6, 41.6],
    ],
  },
  {
    id: 'dorm-two-wing',
    name: null,
    label: 'Three-storey dormitory',
    kind: 'dormitory',
    levels: 3,
    levelsFrom: 'osm',
    roof: 'hip',
    roofParts: [
      { cx: 24.8, cy: 48.4, length: 32.6, width: 11.8, angle: 33.2 },
      { cx: 50.2, cy: 43.4, length: 30.3, width: 10.9, angle: 33.0 },
    ],
    facade: 'dorm',
    osmWay: 1236280106,
    about:
      'Two hipped-roof wings joined by a stair. OpenStreetMap tags it as a dormitory of three storeys but gives no name.',
    footprint: [
      [8.0, 44.5],
      [35.2, 62.3],
      [41.3, 53.0],
      [35.9, 49.5],
      [40.0, 43.2],
      [59.9, 56.2],
      [65.9, 47.1],
      [40.5, 30.6],
      [34.9, 39.1],
      [33.7, 38.3],
      [29.6, 44.5],
      [14.4, 34.6],
    ],
  },
  {
    id: 'north-block',
    name: null,
    label: 'North block',
    kind: 'unknown',
    levels: 3,
    levelsFrom: 'osm',
    roof: 'hip',
    roofParts: [{ cx: 85.0, cy: 52.9, length: 29.3, width: 14.4, angle: 21.2 }],
    facade: 'dorm',
    osmWay: 587837339,
    about:
      'Three storeys under a hipped red roof, like the dormitories beside it. OpenStreetMap gives its height but not its name or use.',
    footprint: [
      [68.8, 54.3],
      [96.0, 64.9],
      [101.3, 51.5],
      [74.0, 40.9],
    ],
  },
  {
    id: 'courtyard-building',
    name: null,
    label: 'Courtyard building',
    kind: 'unknown',
    levels: 4,
    levelsFrom: 'imagery',
    roof: 'flat',
    facade: 'bands',
    osmWay: 1181827286,
    about:
      'A U-shaped, flat-roofed building round a courtyard that opens to the north-east, with stepped terraces along one side. Probably the main academic building whose courtyard BRACU had redesigned, but no source names it. The storey count is estimated from how far it leans in the satellite image.',
    footprint: [
      [55.4, -69.6],
      [61.4, -63.3],
      [51.3, -48.1],
      [37.6, -56.3],
      [31.1, -61.2],
      [37.6, -97.3],
      [75.7, -90.0],
      [83.6, -88.1],
      [75.7, -76.9],
      [70.3, -77.9],
      [45.3, -82.6],
      [46.1, -78.6],
      [45.3, -74.2],
      [43.9, -71.2],
    ],
  },
  {
    id: 'anandapur',
    name: 'Anandapur',
    label: 'Anandapur',
    aka: 'Anondopur',
    kind: 'hall',
    levels: 1,
    levelsFrom: 'imagery',
    roof: 'gable',
    roofParts: [{ cx: -17.6, cy: 38.5, length: 37.2, width: 25.0, angle: -57.3 }],
    facade: 'hall',
    osmWay: 587837346,
    about:
      'The big red-roofed hall by the fields. OpenStreetMap names it Anandapur; the RS handbook lists Anandapur as a Wi-Fi zone and gives students cleaning duty in and around it. Single-storey; its height is estimated.',
    footprint: [
      [-38.2, 47.4],
      [-17.2, 60.8],
      [3.0, 29.6],
      [-18.1, 16.1],
    ],
  },
  {
    id: 'west-block',
    name: null,
    label: 'West block',
    kind: 'unknown',
    levels: 5,
    levelsFrom: 'imagery',
    roof: 'flat',
    facade: 'bands',
    osmWay: 1181827281,
    about:
      'A small white block near the west wall. Five storeys, estimated from its lean and shadow in the satellite image; no source names it.',
    footprint: [
      [-129.0, 37.8],
      [-115.6, 39.9],
      [-114.2, 31.0],
      [-127.6, 28.9],
    ],
  },
  {
    id: 'west-shed',
    name: null,
    label: 'Long shed, west',
    kind: 'shed',
    levels: 1,
    levelsFrom: 'imagery',
    roof: 'gable',
    roofParts: [{ cx: -143.6, cy: 33.9, length: 21.5, width: 8.1, angle: -3.2 }],
    facade: 'shed',
    osmWay: 1181827282,
    about: 'A single-storey shed with a red roof.',
    footprint: [
      [-154.0, 38.6],
      [-132.6, 37.4],
      [-133.1, 29.4],
      [-154.5, 30.5],
    ],
  },
  {
    id: 'north-west-shed',
    name: null,
    label: 'Long shed, north-west',
    kind: 'shed',
    levels: 1,
    levelsFrom: 'imagery',
    roof: 'gable',
    roofParts: [{ cx: -146.1, cy: 75.2, length: 22.3, width: 8.8, angle: 88.7 }],
    facade: 'shed',
    osmWay: 1341427979,
    about: 'A single-storey shed with a red roof in the strip of land along the north-west wall.',
    footprint: [
      [-142.0, 63.9],
      [-141.5, 86.2],
      [-150.2, 86.4],
      [-150.8, 64.1],
    ],
  },
  {
    id: 'hut-south',
    name: null,
    label: 'Small shed',
    kind: 'shed',
    levels: 1,
    levelsFrom: 'imagery',
    roof: 'gable',
    roofParts: [{ cx: -140.0, cy: 16.5, length: 8.1, width: 6.0, angle: 9.3 }],
    facade: 'shed',
    osmWay: null,
    about:
      'A small red-roofed shed among the trees, traced from the satellite image; not in OpenStreetMap.',
    footprint: [
      [-143.4, 12.9],
      [-135.5, 14.2],
      [-136.6, 20.1],
      [-144.5, 18.8],
    ],
  },
  {
    id: 'hut-south-2',
    name: null,
    label: 'Small shed',
    kind: 'shed',
    levels: 1,
    levelsFrom: 'imagery',
    roof: 'gable',
    roofParts: [{ cx: -128.5, cy: 7.5, length: 10.1, width: 5.0, angle: 15.0 }],
    facade: 'shed',
    osmWay: null,
    about:
      'A small red-roofed shed among the trees, traced from the satellite image; not in OpenStreetMap.',
    footprint: [
      [-132.7, 3.8],
      [-123.0, 6.4],
      [-124.3, 11.2],
      [-134.0, 8.6],
    ],
  },
];

export const RS_GROUNDS: readonly RsGround[] = [
  {
    id: 'duronto',
    name: 'Duronto',
    kind: 'pitch',
    osmWay: 1236280112,
    about: 'Football and cricket field. OpenStreetMap: Duronto; the RS handbook: Duranto.',
    outline: [
      [-106.2, -15.4],
      [-21.1, 6.5],
      [-12.1, -28.3],
      [-97.1, -50.2],
    ],
  },
  {
    id: 'durbar',
    name: 'Durbar',
    kind: 'pitch',
    osmWay: 1236280117,
    about: 'Football field.',
    outline: [
      [-84.5, 43.5],
      [-48.2, 50.5],
      [-28.3, 16.9],
      [-74.0, 4.6],
    ],
  },
  {
    id: 'basketball',
    name: 'Basketball court',
    kind: 'court',
    osmWay: 587837303,
    about: 'Paved basketball court.',
    outline: [
      [-102.7, 32.2],
      [-84.1, 36.6],
      [-77.0, 6.9],
      [-95.6, 2.5],
    ],
  },
  {
    id: 'garden-centre',
    name: null,
    kind: 'garden',
    osmWay: 1236280108,
    about: 'Garden.',
    outline: [
      [-10.7, 10.1],
      [1.2, -8.6],
      [14.6, -0.2],
      [30.8, -25.9],
      [54.5, -11.2],
      [26.5, 33.3],
    ],
  },
  {
    id: 'garden-east',
    name: null,
    kind: 'garden',
    osmWay: 1236280110,
    about: 'Garden.',
    outline: [
      [71.8, 34.9],
      [78.2, 36.8],
      [91.5, 15.9],
      [58.5, -7.2],
      [55.6, -7.2],
      [41.8, 15.1],
    ],
  },
  {
    id: 'garden-north-east',
    name: null,
    kind: 'garden',
    osmWay: 1236280109,
    about: 'Garden.',
    outline: [
      [118.5, 52.0],
      [118.5, 49.0],
      [120.1, 44.6],
      [122.6, 41.6],
      [125.8, 39.7],
      [122.0, 31.3],
      [97.4, 17.6],
      [83.9, 39.3],
    ],
  },
];

/** A cricket pitch strip, visible down the middle of Duronto in the satellite image. */
export const RS_CRICKET_STRIP = {
  cx: -58.0,
  cy: -21.5,
  length: 20.1,
  width: 3.0,
  angle: 14.4,
} as const;

export const RS_LANDMARKS: readonly RsLandmark[] = [
  {
    id: 'water-tower',
    label: 'Water tower',
    kind: 'water-tower',
    at: [94.0, -0.7],
    osmNode: 11478715374,
  },
  {
    id: 'sculpture-north',
    label: 'Sculpture',
    kind: 'sculpture',
    at: [21.6, -15.3],
    osmNode: 11478686935,
  },
  {
    id: 'sculpture-south',
    label: 'Sculpture',
    kind: 'sculpture',
    at: [28.8, -33.6],
    osmNode: 11478686934,
  },
];

/** Roads and paths (OpenStreetMap), inside the wall and around it. */
export const RS_ROADS: readonly RsRoad[] = [
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [1313.0, 167.3],
      [1129.8, 177.0],
      [1121.8, 178.0],
      [1074.4, 181.5],
      [1045.8, 184.6],
      [983.3, 188.2],
      [899.7, 193.8],
      [846.5, 197.9],
      [789.7, 202.2],
      [592.7, 215.1],
      [495.8, 221.4],
      [406.1, 230.7],
      [322.5, 237.1],
      [300.6, 238.5],
      [279.9, 239.8],
      [257.7, 241.9],
      [239.3, 242.0],
      [220.2, 240.9],
      [196.5, 239.8],
      [114.6, 235.1],
    ],
  },
  {
    kind: 'service',
    inside: false,
    name: null,
    path: [
      [164.1, 16.9],
      [187.9, 22.1],
      [200.4, 24.9],
      [215.3, -35.9],
      [235.8, -30.6],
      [220.9, 30.0],
      [200.4, 24.9],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [87.7, -97.6],
      [109.7, -213.4],
      [142.5, -216.7],
      [181.5, -218.9],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [178.1, -164.7],
      [143.0, -172.4],
      [142.5, -216.7],
    ],
  },
  {
    kind: 'service',
    inside: false,
    name: null,
    path: [
      [187.9, 22.1],
      [185.1, 32.8],
    ],
  },
  {
    kind: 'service',
    inside: false,
    name: null,
    path: [
      [176.0, -89.4],
      [210.0, -82.2],
      [206.4, -65.1],
    ],
  },
  {
    kind: 'service',
    inside: false,
    name: null,
    path: [
      [213.8, -128.8],
      [213.2, -117.4],
      [289.7, -106.6],
    ],
  },
  {
    kind: 'service',
    inside: false,
    name: null,
    path: [
      [176.0, -131.6],
      [213.8, -128.8],
      [215.8, -135.8],
      [224.1, -210.6],
      [227.1, -237.9],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [40.0, 15.7],
      [73.3, 37.7],
      [80.6, 39.7],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [110.7, 52.3],
      [80.6, 39.7],
      [95.2, 15.1],
      [85.7, 8.8],
      [56.6, -10.6],
      [38.6, -23.1],
      [23.1, -33.1],
      [8.0, -12.7],
      [6.9, -11.0],
      [5.8, -10.6],
      [3.9, -10.5],
      [2.5, -11.3],
      [-0.3, -13.1],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [130.0, 164.8],
      [26.6, 156.8],
      [27.3, 193.7],
      [1.9, 193.2],
      [-22.7, 254.6],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [-197.2, 253.7],
      [-199.9, 215.4],
      [-194.3, 206.8],
      [-206.2, 169.7],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [87.7, -97.6],
      [-18.2, -109.9],
      [-59.5, -110.7],
      [-95.3, -111.3],
      [-100.2, -110.2],
      [-103.1, -108.9],
      [-105.3, -104.6],
      [-107.0, -89.6],
      [-110.0, -84.5],
      [-114.8, -82.5],
      [-236.0, -97.8],
      [-421.5, -121.4],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [-362.8, 299.7],
      [-372.9, 205.3],
      [-275.7, 178.1],
      [-261.2, 181.3],
      [-206.2, 169.7],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [452.2, -457.9],
      [445.0, -434.1],
      [434.1, -401.4],
      [421.8, -380.8],
      [420.2, -352.5],
      [416.9, -332.7],
      [416.6, -306.9],
      [419.9, -288.4],
      [418.2, -274.6],
      [413.1, -254.5],
      [392.3, -237.6],
      [383.8, -219.4],
      [376.7, -201.2],
      [369.0, -192.8],
      [361.8, -192.2],
      [353.3, -194.4],
      [330.4, -204.7],
      [309.7, -212.5],
      [274.6, -224.2],
      [246.3, -232.9],
      [227.1, -237.9],
      [184.4, -243.3],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [95.2, 15.1],
      [119.1, 29.0],
    ],
  },
  {
    kind: 'footway',
    inside: true,
    name: null,
    path: [
      [85.7, 8.8],
      [92.6, -1.9],
      [93.7, -1.2],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [-47.0, 57.1],
      [-42.4, 49.2],
      [-20.9, 14.5],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [-12.9, 11.2],
      [26.6, 37.0],
      [40.0, 15.7],
      [56.6, -10.6],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [35.9, -54.5],
      [23.0, -63.1],
      [18.3, -64.2],
      [14.9, -63.5],
      [11.8, -62.0],
      [-1.7, -40.5],
      [-6.7, -32.8],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [79.8, -71.2],
      [75.9, -73.9],
      [74.6, -74.9],
      [72.1, -75.2],
      [69.9, -74.3],
      [56.1, -51.9],
      [53.8, -48.8],
      [51.8, -47.3],
      [48.9, -47.1],
      [46.5, -47.5],
      [35.9, -54.5],
      [35.2, -53.6],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [168.8, -11.2],
      [161.6, -15.8],
      [152.3, -22.3],
      [79.8, -71.2],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [23.1, -33.1],
      [35.2, -53.6],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [-108.7, 45.1],
      [-107.8, 31.0],
      [-97.9, -5.6],
    ],
  },
  {
    kind: 'footway',
    inside: true,
    name: null,
    path: [
      [-154.8, 41.8],
      [-127.6, 41.4],
      [-108.7, 45.1],
      [-47.0, 57.1],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [-15.7, 13.2],
      [-18.5, 14.3],
      [-20.9, 14.5],
      [-22.3, 14.3],
      [-33.7, 11.4],
      [-97.9, -5.6],
      [-111.6, -9.1],
      [-99.5, -56.4],
      [-6.7, -32.8],
      [-8.5, -28.7],
      [-9.6, -24.8],
      [-9.3, -21.2],
      [-6.9, -17.7],
      [-2.6, -14.5],
      [-0.3, -13.1],
      [-12.9, 11.2],
      [-15.7, 13.2],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [132.1, 2.5],
      [152.3, -22.3],
    ],
  },
  {
    kind: 'service',
    inside: true,
    name: null,
    path: [
      [119.1, 29.0],
      [132.1, 2.5],
    ],
  },
  {
    kind: 'trunk',
    inside: false,
    name: 'Birulia-Akran Road',
    path: [
      [195.6, 1108.5],
      [194.2, 1095.5],
      [194.9, 1043.1],
      [202.5, 983.7],
      [211.6, 940.9],
      [225.0, 884.7],
      [235.5, 846.4],
      [236.5, 828.8],
      [235.8, 813.4],
      [231.5, 788.3],
      [218.9, 749.4],
      [205.4, 715.2],
      [183.0, 670.7],
      [163.7, 624.1],
      [153.6, 598.8],
      [141.7, 564.3],
      [131.6, 532.7],
      [121.5, 486.2],
      [113.6, 435.4],
      [108.9, 400.0],
      [107.8, 394.5],
      [107.6, 362.6],
      [107.4, 323.1],
      [108.1, 285.6],
      [111.8, 257.9],
      [114.6, 235.1],
      [121.1, 203.6],
      [130.0, 164.8],
      [138.3, 122.9],
      [164.1, 16.9],
      [168.8, -11.2],
      [176.0, -89.4],
      [176.0, -131.6],
      [178.1, -164.7],
      [181.5, -218.9],
      [184.4, -243.3],
      [185.0, -251.0],
      [190.8, -289.6],
      [196.6, -332.1],
      [208.1, -434.2],
      [211.4, -465.1],
      [213.3, -500.9],
      [218.3, -561.2],
      [222.6, -624.6],
      [225.0, -651.4],
      [225.6, -675.0],
      [223.3, -710.8],
      [220.5, -733.7],
      [218.0, -746.3],
      [212.2, -783.5],
      [208.8, -813.0],
      [207.8, -840.4],
      [214.6, -901.2],
      [218.7, -933.5],
      [224.4, -965.7],
      [245.1, -1050.6],
      [254.8, -1096.3],
      [260.3, -1114.3],
      [262.2, -1117.2],
    ],
  },
  {
    kind: 'track',
    inside: false,
    name: null,
    path: [
      [-236.0, -97.8],
      [-248.6, 30.5],
    ],
  },
  {
    kind: 'residential',
    inside: false,
    name: null,
    path: [
      [87.7, -97.6],
      [176.0, -89.4],
    ],
  },
];

/**
 * Trees, one per canopy read off the February 2026 satellite image: dark-green
 * cover inside the wall, clear of roofs, their lean and their shadows, thinned
 * to one tree per 5 m. Positions, not species or sizes.
 */
export const RS_TREES: readonly Point[] = [
  [-160, 64],
  [-160, 94],
  [-158, 50],
  [-156, 28],
  [-156, 58],
  [-156, 74],
  [-156, 80],
  [-156, 86],
  [-154, 12],
  [-154, 22],
  [-154, 46],
  [-154, 64],
  [-154, 94],
  [-154, 100],
  [-154, 106],
  [-152, 54],
  [-150, -40],
  [-150, -28],
  [-150, -22],
  [-150, -4],
  [-150, 4],
  [-148, -10],
  [-148, 24],
  [-148, 44],
  [-148, 96],
  [-148, 104],
  [-146, -54],
  [-146, -46],
  [-146, 0],
  [-146, 8],
  [-144, -38],
  [-144, -30],
  [-140, -56],
  [-140, -46],
  [-140, -26],
  [-140, 0],
  [-140, 26],
  [-140, 88],
  [-138, -40],
  [-138, 106],
  [-136, -52],
  [-136, 6],
  [-136, 12],
  [-136, 50],
  [-136, 94],
  [-134, -2],
  [-134, 26],
  [-134, 64],
  [-132, 104],
  [-130, 18],
  [-130, 60],
  [-130, 68],
  [-130, 80],
  [-130, 88],
  [-130, 96],
  [-128, -4],
  [-128, 12],
  [-128, 74],
  [-128, 108],
  [-126, 24],
  [-124, -58],
  [-124, 0],
  [-124, 16],
  [-122, -52],
  [-120, -18],
  [-120, -8],
  [-120, 20],
  [-120, 26],
  [-118, -34],
  [-118, 0],
  [-116, -56],
  [-116, -26],
  [-116, -14],
  [-114, -48],
  [-114, -20],
  [-114, -4],
  [-114, 26],
  [-112, -34],
  [-112, -10],
  [-112, 8],
  [-110, -40],
  [-110, -16],
  [-110, 16],
  [-110, 22],
  [-108, -28],
  [-108, -2],
  [-108, 4],
  [-108, 32],
  [-106, -44],
  [-106, -8],
  [-106, 12],
  [-106, 50],
  [-104, 24],
  [-102, -48],
  [-102, -4],
  [-102, 4],
  [-102, 16],
  [-102, 46],
  [-98, 10],
  [-96, 4],
  [-94, 44],
  [-92, -50],
  [-92, 50],
  [-88, -2],
  [-86, -48],
  [-86, 40],
  [-86, 46],
  [-86, 52],
  [-82, 0],
  [-80, -52],
  [-80, 48],
  [-78, 6],
  [-76, -46],
  [-76, 0],
  [-76, 12],
  [-70, -48],
  [-70, 56],
  [-68, 2],
  [-66, 52],
  [-64, -42],
  [-60, -46],
  [-56, 56],
  [-54, 50],
  [-52, -42],
  [-50, 58],
  [-48, 10],
  [-48, 52],
  [-44, -38],
  [-42, 10],
  [-42, 60],
  [-38, 34],
  [-36, 8],
  [-36, 14],
  [-36, 60],
  [-26, 62],
  [-16, -36],
  [-14, -30],
  [-14, 14],
  [-10, -22],
  [-10, -16],
  [-10, 2],
  [-8, -30],
  [-8, -4],
  [-8, 8],
  [-8, 16],
  [-6, 60],
  [-4, 20],
  [-2, -30],
  [-2, -2],
  [-2, 8],
  [-2, 64],
  [0, -62],
  [0, 16],
  [0, 24],
  [2, 2],
  [2, 48],
  [6, 16],
  [6, 22],
  [6, 40],
  [8, 0],
  [8, 32],
  [8, 64],
  [10, -6],
  [12, 56],
  [14, 66],
  [16, -58],
  [16, -2],
  [20, -86],
  [20, 60],
  [22, -100],
  [22, -80],
  [22, -70],
  [22, -58],
  [24, 64],
  [26, -92],
  [26, -86],
  [26, -76],
  [26, -8],
  [28, 40],
  [28, 68],
  [30, -100],
  [30, -22],
  [30, -16],
  [32, 36],
  [34, -26],
  [36, -42],
  [36, -20],
  [38, 64],
  [40, -24],
  [40, -12],
  [42, -18],
  [42, -2],
  [44, 4],
  [44, 66],
  [46, -22],
  [46, 30],
  [46, 58],
  [48, -12],
  [50, -4],
  [50, 62],
  [52, -20],
  [52, 2],
  [54, 8],
  [56, -38],
  [56, -32],
  [56, -2],
  [56, 70],
  [58, -44],
  [58, 64],
  [60, -50],
  [60, 4],
  [64, -38],
  [64, -8],
  [64, -2],
  [64, 60],
  [66, -50],
  [66, -24],
  [68, -32],
  [68, 70],
  [70, -42],
  [70, -4],
  [70, 6],
  [70, 12],
  [70, 64],
  [74, -68],
  [76, -26],
  [76, -4],
  [78, 4],
  [78, 10],
  [80, -8],
  [82, -14],
  [82, 68],
  [84, 2],
  [86, -8],
  [86, 8],
  [86, 14],
  [88, -14],
  [90, -2],
  [90, 72],
  [92, -10],
  [92, 14],
  [100, 6],
  [104, 2],
  [104, 10],
  [112, 12],
  [112, 32],
  [116, 6],
  [118, 28],
  [126, 20],
  [130, -84],
  [132, -78],
  [132, 12],
  [134, 6],
  [136, 16],
  [136, 22],
  [140, 6],
  [144, 10],
  [144, 20],
  [148, 6],
  [150, -12],
  [150, 0],
  [150, 16],
  [152, -6],
  [152, 10],
  [156, -18],
  [156, 4],
  [158, -2],
  [160, -24],
];

/**
 * Buildings outside the wall, for context only. OpenStreetMap gives none of
 * them a height, so the map draws them all at one low, uniform height.
 */
export const RS_NEIGHBOURS: readonly (readonly Point[])[] = [
  [
    [187.3, -134.6],
    [197.0, -133.5],
    [203.7, -133.3],
    [207.2, -134.6],
    [209.0, -138.9],
    [211.0, -156.3],
    [189.1, -158.0],
  ],
  [
    [190.1, -163.5],
    [211.0, -162.0],
    [213.7, -198.3],
    [192.8, -199.8],
  ],
  [
    [236.6, -215.8],
    [245.1, -215.4],
    [246.1, -235.9],
    [237.7, -236.3],
  ],
  [
    [230.2, -205.0],
    [242.1, -204.8],
    [242.3, -213.4],
    [230.3, -213.6],
  ],
  [
    [191.2, -205.3],
    [216.5, -202.4],
    [220.6, -237.9],
    [195.3, -240.8],
  ],
  [
    [13.4, -209.3],
    [25.6, -209.5],
    [25.5, -215.1],
    [13.4, -214.9],
  ],
  [
    [1.3, -210.2],
    [12.4, -210.4],
    [12.3, -214.7],
    [1.2, -214.5],
  ],
  [
    [-41.5, -208.2],
    [-1.8, -209.4],
    [-2.0, -216.4],
    [-41.7, -215.3],
  ],
  [
    [190.0, -119.6],
    [195.2, -119.4],
    [195.7, -127.7],
    [190.5, -128.0],
  ],
  [
    [151.8, -177.9],
    [178.4, -176.8],
    [178.8, -185.0],
    [184.1, -184.8],
    [184.6, -198.2],
    [181.1, -198.3],
    [181.5, -207.6],
    [153.1, -208.8],
  ],
  [
    [128.6, -192.0],
    [139.8, -191.4],
    [140.2, -198.8],
    [129.0, -199.4],
  ],
  [
    [255.0, -82.0],
    [262.2, -81.3],
    [262.8, -87.1],
    [255.6, -87.8],
  ],
  [
    [207.1, 35.1],
    [212.5, 36.6],
    [213.4, 33.3],
    [208.0, 31.9],
  ],
  [
    [206.3, 39.6],
    [211.1, 40.8],
    [211.9, 37.6],
    [207.1, 36.3],
  ],
  [
    [212.3, 41.0],
    [218.9, 42.4],
    [220.1, 36.9],
    [213.4, 35.5],
  ],
  [
    [190.5, 36.1],
    [205.8, 39.7],
    [207.5, 32.3],
    [192.2, 28.7],
  ],
  [
    [188.9, -96.5],
    [205.2, -93.8],
    [206.3, -100.4],
    [190.0, -103.0],
  ],
  [
    [308.5, -140.3],
    [313.1, -140.3],
    [313.2, -159.4],
    [309.0, -159.5],
    [308.9, -151.3],
    [304.9, -151.4],
    [304.9, -143.7],
    [308.5, -143.6],
  ],
  [
    [243.9, -115.8],
    [283.7, -112.1],
    [290.0, -181.2],
    [269.9, -183.1],
    [270.4, -187.4],
    [250.7, -189.2],
  ],
  [
    [218.4, -119.3],
    [238.4, -117.1],
    [246.7, -190.1],
    [226.6, -192.4],
  ],
  [
    [240.3, -91.9],
    [280.2, -87.6],
    [281.9, -103.5],
    [242.0, -107.7],
  ],
  [
    [299.3, -31.4],
    [311.8, -28.2],
    [313.2, -33.8],
    [300.8, -37.0],
  ],
  [
    [207.1, -52.3],
    [295.8, -28.8],
    [303.5, -57.5],
    [228.4, -77.4],
    [229.2, -80.1],
    [220.1, -82.5],
    [219.4, -79.8],
    [214.8, -81.0],
    [211.6, -69.1],
    [210.0, -69.5],
    [208.1, -62.3],
    [209.7, -61.9],
  ],
  [
    [231.7, -10.6],
    [241.4, -8.2],
    [242.7, -13.4],
    [233.0, -15.8],
  ],
  [
    [237.6, 12.9],
    [242.2, 14.1],
    [242.9, 11.6],
    [248.8, 13.2],
    [258.5, -22.0],
    [248.0, -24.9],
  ],
  [
    [252.2, -25.0],
    [317.7, -8.0],
    [320.4, -18.4],
    [254.9, -35.4],
  ],
  [
    [235.9, -30.0],
    [249.8, -27.0],
    [251.9, -36.5],
    [238.0, -39.6],
  ],
  [
    [180.7, -47.6],
    [194.8, -44.7],
    [202.6, -82.8],
    [188.5, -85.6],
  ],
  [
    [195.1, -40.5],
    [220.5, -34.9],
    [223.3, -47.7],
    [198.0, -53.3],
  ],
  [
    [195.2, -32.8],
    [206.7, -29.5],
    [208.7, -36.5],
    [197.3, -39.8],
  ],
  [
    [176.8, 9.0],
    [194.0, 13.5],
    [195.7, 7.4],
    [201.5, 8.7],
    [206.4, -0.4],
    [207.2, -10.6],
    [205.3, -11.6],
    [209.6, -28.0],
    [188.2, -33.7],
  ],
  [
    [145.2, -148.6],
    [149.7, -148.5],
    [150.0, -158.3],
    [145.5, -158.4],
  ],
  [
    [139.5, -148.7],
    [144.4, -148.5],
    [144.7, -157.7],
    [139.8, -157.8],
  ],
  [
    [136.4, -131.4],
    [146.0, -131.1],
    [146.5, -146.5],
    [136.9, -146.8],
  ],
  [
    [175.4, -129.4],
    [181.1, -129.3],
    [181.4, -137.5],
    [175.7, -137.7],
  ],
  [
    [165.5, -135.4],
    [175.2, -135.1],
    [175.4, -141.2],
    [165.7, -141.5],
  ],
  [
    [146.3, -105.0],
    [174.5, -104.4],
    [175.0, -118.0],
    [155.4, -119.0],
    [155.3, -114.3],
    [146.6, -114.5],
  ],
  [
    [22.4, 211.2],
    [27.1, 211.3],
    [27.2, 199.4],
    [22.6, 199.3],
  ],
  [
    [119.2, 167.2],
    [125.6, 167.3],
    [125.7, 158.1],
    [119.3, 158.0],
  ],
  [
    [126.4, 152.7],
    [132.2, 152.8],
    [132.4, 138.0],
    [126.7, 137.9],
  ],
  [
    [117.6, 147.9],
    [124.9, 148.1],
    [125.0, 139.2],
    [117.8, 139.1],
  ],
  [
    [110.7, 149.8],
    [116.9, 149.9],
    [117.1, 138.2],
    [110.8, 138.1],
  ],
  [
    [120.4, 136.7],
    [133.9, 136.9],
    [134.1, 126.5],
    [127.3, 126.4],
    [127.3, 128.3],
    [120.5, 128.2],
  ],
  [
    [114.2, 125.0],
    [134.2, 125.3],
    [134.3, 119.3],
    [114.2, 119.0],
  ],
  [
    [139.1, 108.6],
    [142.1, 108.7],
    [142.2, 105.5],
    [139.1, 105.4],
  ],
  [
    [139.3, 104.3],
    [143.4, 104.4],
    [143.5, 96.7],
    [139.4, 96.6],
  ],
  [
    [130.3, 102.7],
    [138.4, 102.8],
    [138.5, 99.2],
    [130.4, 99.1],
  ],
  [
    [130.0, 108.6],
    [138.7, 108.8],
    [138.8, 103.9],
    [130.1, 103.8],
  ],
  [
    [122.8, 108.5],
    [129.2, 108.6],
    [129.3, 98.5],
    [123.0, 98.4],
  ],
  [
    [112.7, 111.8],
    [118.4, 111.9],
    [118.6, 97.2],
    [112.9, 97.1],
  ],
  [
    [103.2, 102.1],
    [111.9, 102.3],
    [112.0, 96.7],
    [103.3, 96.5],
  ],
  [
    [94.2, 104.9],
    [101.8, 105.0],
    [102.0, 94.8],
    [94.4, 94.7],
  ],
  [
    [80.9, 116.9],
    [92.0, 117.1],
    [92.1, 110.3],
    [81.0, 110.1],
  ],
  [
    [80.7, 123.2],
    [103.0, 123.6],
    [103.1, 117.9],
    [80.8, 117.6],
  ],
  [
    [77.3, 136.5],
    [83.8, 136.6],
    [84.0, 123.8],
    [77.5, 123.7],
  ],
  [
    [85.2, 136.2],
    [102.4, 136.4],
    [102.6, 125.7],
    [85.3, 125.5],
  ],
  [
    [89.2, 150.5],
    [99.7, 150.6],
    [99.9, 137.8],
    [89.4, 137.7],
  ],
  [
    [76.6, 154.5],
    [87.5, 154.6],
    [87.7, 137.4],
    [76.9, 137.2],
  ],
  [
    [40.6, 193.9],
    [68.9, 194.7],
    [69.5, 175.3],
    [41.1, 174.5],
  ],
  [
    [76.3, 200.1],
    [91.0, 200.0],
    [90.9, 194.4],
    [76.2, 194.5],
  ],
  [
    [97.3, 202.5],
    [105.9, 202.4],
    [105.9, 197.2],
    [97.3, 197.3],
  ],
  [
    [89.7, 192.1],
    [99.5, 192.0],
    [99.5, 186.7],
    [89.6, 186.7],
  ],
  [
    [69.7, 185.5],
    [91.9, 185.3],
    [91.9, 178.1],
    [69.6, 178.4],
  ],
  [
    [105.2, 186.5],
    [125.7, 187.7],
    [126.5, 173.4],
    [106.0, 172.2],
  ],
  [
    [73.3, 177.3],
    [103.6, 177.3],
    [108.5, 165.0],
    [98.9, 163.9],
    [96.2, 169.4],
    [73.3, 168.9],
  ],
  [
    [79.2, 163.5],
    [87.2, 163.5],
    [87.1, 157.8],
    [79.2, 157.9],
  ],
  [
    [64.1, 170.3],
    [70.8, 170.3],
    [70.8, 163.6],
    [78.6, 163.6],
    [78.6, 158.1],
    [64.1, 158.2],
  ],
  [
    [44.8, 153.6],
    [57.1, 153.6],
    [57.0, 135.2],
    [44.7, 135.3],
  ],
  [
    [31.0, 178.4],
    [39.6, 178.4],
    [39.5, 158.7],
    [30.9, 158.8],
  ],
  [
    [-1.8, 159.4],
    [24.1, 159.3],
    [24.0, 153.0],
    [-1.8, 153.1],
  ],
  [
    [19.9, 152.3],
    [42.3, 152.2],
    [42.3, 142.5],
    [19.9, 142.6],
  ],
  [
    [-58.9, 177.8],
    [-53.4, 177.7],
    [-53.4, 173.2],
    [-58.9, 173.2],
  ],
  [
    [-18.2, 196.2],
    [-1.0, 196.2],
    [-1.0, 181.1],
    [-18.3, 181.2],
  ],
  [
    [0.5, 190.3],
    [21.5, 190.2],
    [21.5, 178.9],
    [0.5, 179.0],
  ],
  [
    [-14.9, 177.0],
    [24.0, 176.9],
    [23.9, 161.0],
    [-15.0, 161.1],
  ],
  [
    [-107.9, 109.5],
    [-104.1, 109.4],
    [-104.3, 103.0],
    [-108.0, 103.1],
  ],
  [
    [223.2, -38.3],
    [234.0, -35.5],
    [235.1, -39.9],
    [224.4, -42.7],
  ],
  [
    [319.4, -189.3],
    [323.1, -188.8],
    [324.2, -197.6],
    [320.6, -198.0],
  ],
  [
    [318.7, -184.1],
    [325.6, -182.6],
    [326.5, -186.9],
    [319.6, -188.4],
  ],
  [
    [325.7, -178.1],
    [333.1, -176.1],
    [334.2, -180.0],
    [326.8, -182.0],
  ],
  [
    [229.6, 40.9],
    [245.1, 45.0],
    [251.2, 20.4],
    [234.7, 18.5],
    [224.6, 24.8],
    [223.4, 31.8],
  ],
  [
    [203.7, 158.5],
    [207.9, 158.6],
    [208.1, 149.6],
    [203.8, 149.5],
  ],
  [
    [196.9, 157.9],
    [202.6, 158.0],
    [202.6, 153.4],
    [196.9, 153.3],
  ],
  [
    [147.0, 151.0],
    [165.6, 152.7],
    [166.7, 140.7],
    [148.1, 138.9],
  ],
  [
    [160.1, 121.9],
    [165.0, 122.2],
    [165.2, 119.3],
    [160.3, 119.0],
  ],
  [
    [162.5, 128.3],
    [167.2, 128.6],
    [167.5, 122.7],
    [162.8, 122.5],
  ],
  [
    [147.9, 127.6],
    [160.6, 128.3],
    [160.9, 122.9],
    [148.2, 122.2],
  ],
  [
    [162.3, 117.7],
    [169.5, 118.1],
    [169.7, 114.5],
    [162.4, 114.1],
  ],
  [
    [164.8, 111.3],
    [171.8, 111.7],
    [172.4, 100.7],
    [165.5, 100.3],
  ],
  [
    [162.7, 93.4],
    [170.9, 93.9],
    [171.3, 87.1],
    [163.0, 86.6],
  ],
  [
    [151.9, 94.9],
    [157.2, 95.2],
    [157.3, 92.9],
    [160.7, 93.1],
    [161.1, 85.7],
    [152.5, 85.3],
  ],
  [
    [148.9, 115.5],
    [161.5, 117.4],
    [163.2, 106.0],
    [159.5, 105.5],
    [160.5, 98.6],
    [151.6, 97.3],
  ],
  [
    [142.7, 94.3],
    [146.2, 94.4],
    [146.3, 90.8],
    [142.8, 90.7],
  ],
  [
    [136.5, 86.3],
    [141.8, 86.4],
    [141.9, 82.5],
    [136.5, 82.5],
  ],
  [
    [134.0, 94.8],
    [141.9, 94.9],
    [142.0, 87.8],
    [134.1, 87.7],
  ],
  [
    [64.1, 88.7],
    [69.7, 88.8],
    [69.9, 80.4],
    [64.3, 80.3],
  ],
  [
    [79.9, 102.0],
    [83.6, 102.1],
    [83.7, 96.1],
    [79.9, 96.0],
  ],
  [
    [62.6, 103.3],
    [70.5, 103.4],
    [70.7, 92.5],
    [62.7, 92.4],
  ],
  [
    [55.8, 108.1],
    [62.0, 108.2],
    [62.1, 104.4],
    [60.0, 104.4],
    [60.1, 101.2],
    [55.9, 101.1],
  ],
  [
    [-48.8, 219.0],
    [-44.2, 219.1],
    [-44.2, 209.4],
    [-48.8, 209.4],
  ],
  [
    [-41.3, 209.3],
    [-26.7, 209.4],
    [-26.7, 203.4],
    [-41.3, 203.3],
  ],
  [
    [-32.8, 229.4],
    [-27.8, 229.4],
    [-27.8, 224.8],
    [-32.8, 224.8],
  ],
  [
    [-44.5, 228.6],
    [-39.4, 228.6],
    [-39.4, 223.9],
    [-44.5, 223.9],
  ],
  [
    [-43.9, 220.6],
    [-36.2, 220.6],
    [-36.2, 216.9],
    [-43.9, 216.9],
  ],
  [
    [-25.3, 212.8],
    [-19.1, 212.8],
    [-19.0, 204.3],
    [-25.3, 204.3],
  ],
  [
    [-314.7, -157.3],
    [-309.3, -157.4],
    [-309.4, -161.7],
    [-314.7, -161.7],
  ],
  [
    [-316.7, -124.6],
    [-310.8, -124.7],
    [-310.9, -143.8],
    [-316.9, -143.7],
  ],
  [
    [-307.9, -137.0],
    [-297.6, -137.1],
    [-297.7, -143.0],
    [-308.0, -142.9],
  ],
  [
    [-307.5, -154.4],
    [-291.5, -154.6],
    [-291.5, -161.3],
    [-307.6, -161.2],
  ],
  [
    [-279.0, 194.8],
    [-271.1, 193.8],
    [-271.9, 187.2],
    [-279.8, 188.1],
  ],
  [
    [-211.8, 131.6],
    [-199.8, 131.2],
    [-200.1, 124.6],
    [-212.0, 125.0],
  ],
  [
    [-164.1, 132.7],
    [-157.0, 132.4],
    [-157.2, 126.6],
    [-164.3, 126.8],
  ],
  [
    [-184.1, 168.5],
    [-177.2, 168.1],
    [-177.4, 163.9],
    [-184.3, 164.2],
  ],
  [
    [-135.1, 189.4],
    [-124.8, 188.1],
    [-129.3, 153.2],
    [-139.6, 154.5],
  ],
  [
    [-141.2, 189.4],
    [-136.4, 188.8],
    [-138.3, 174.5],
    [-143.0, 175.1],
  ],
  [
    [-159.1, 193.3],
    [-142.0, 191.1],
    [-142.4, 187.8],
    [-145.1, 188.2],
    [-146.1, 180.7],
    [-160.5, 182.5],
  ],
  [
    [-249.1, 231.0],
    [-243.0, 230.9],
    [-243.2, 222.9],
    [-249.2, 223.0],
  ],
  [
    [-204.7, 220.0],
    [-201.8, 219.9],
    [-201.9, 215.2],
    [-204.8, 215.3],
  ],
  [
    [-209.8, 224.4],
    [-206.4, 224.4],
    [-206.5, 220.1],
    [-209.9, 220.2],
  ],
  [
    [-205.6, 228.4],
    [-200.3, 228.2],
    [-200.5, 221.7],
    [-205.7, 221.8],
  ],
  [
    [250.6, 208.8],
    [254.7, 208.8],
    [254.7, 201.4],
    [250.6, 201.4],
  ],
  [
    [228.8, 224.6],
    [232.7, 224.4],
    [232.5, 220.5],
    [228.6, 220.7],
  ],
  [
    [307.3, 173.4],
    [316.3, 173.9],
    [316.6, 167.7],
    [307.7, 167.2],
  ],
  [
    [156.9, 183.8],
    [160.9, 183.7],
    [160.8, 173.8],
    [156.8, 173.9],
  ],
  [
    [136.0, 183.7],
    [155.1, 185.7],
    [156.2, 175.7],
    [137.1, 173.6],
  ],
  [
    [143.6, 211.1],
    [160.2, 211.5],
    [160.8, 187.2],
    [153.0, 187.0],
    [152.6, 205.9],
    [143.7, 205.7],
  ],
  [
    [160.2, 230.6],
    [166.0, 230.5],
    [165.8, 221.8],
    [160.0, 221.9],
  ],
  [
    [-187.3, -103.2],
    [-155.8, -99.6],
    [-153.3, -120.5],
    [-184.8, -124.1],
  ],
  [
    [-213.3, -104.9],
    [-226.5, -105.6],
    [-225.2, -132.4],
    [-211.9, -131.8],
  ],
  [
    [-286.9, -118.8],
    [-271.5, -116.5],
    [-271.1, -119.4],
    [-269.3, -119.2],
    [-266.3, -139.5],
    [-268.5, -139.9],
    [-267.8, -144.0],
    [-276.0, -145.2],
    [-277.0, -138.4],
    [-287.8, -140.0],
    [-290.2, -123.5],
    [-286.2, -122.9],
  ],
];

/** Storey heights the map draws, in metres. Drawing constants, not a survey. */
export const RS_STOREY_HEIGHT: Readonly<Record<RsFacade, number>> = {
  dorm: 3.2,
  fins: 3.4,
  bands: 3.6,
  hall: 7.5,
  shed: 3.4,
};

/** The wall's height, from the handbook photograph of it: brick between concrete posts. */
export const RS_WALL_HEIGHT = 2.4;

/** Eaves height of a building: its storeys and nothing of the roof. */
export function rsWallTop(building: RsBuilding): number {
  return building.levels * RS_STOREY_HEIGHT[building.facade];
}

/** True when the storey count is a published figure, not an estimate. */
export function rsLevelsConfirmed(building: RsBuilding): boolean {
  return building.levelsFrom === 'osm';
}

/** Where a storey count comes from, in words for the page. */
export function rsLevelsSourceLabel(source: LevelsSource): string {
  switch (source) {
    case 'osm':
      return 'OpenStreetMap';
    case 'photo':
      return 'counted in an RS-handbook photo';
    case 'imagery':
      return 'estimated from the satellite image';
  }
}

const BUILDING_BY_ID = new Map<string, RsBuilding>(RS_BUILDINGS.map((b) => [b.id, b]));

/** The building with this id, or null. */
export function rsBuilding(id: string | null | undefined): RsBuilding | null {
  return (id != null && BUILDING_BY_ID.get(id)) || null;
}

/** Corner `i` of a closed outline, wrapping round at either end. */
export function corner(points: readonly Point[], i: number): Point {
  const n = points.length;
  const p = points[((i % n) + n) % n];
  if (!p) throw new RangeError('empty outline');
  return p;
}

/** Signed area of a polygon, positive when counter-clockwise. */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = corner(points, i);
    const [x2, y2] = corner(points, i + 1);
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Even-odd test: is the point inside the polygon? */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = corner(polygon, i);
    const [xj, yj] = corner(polygon, j);
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The average of a polygon's corners — a label point, not a centroid of area. */
export function polygonCentre(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** Bounds of the campus wall, for framing the camera. */
export function rsSiteBounds(): { x1: number; x2: number; y1: number; y2: number } {
  const xs = RS_WALL.map((p) => p[0]);
  const ys = RS_WALL.map((p) => p[1]);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
}

/** A latitude/longitude for a point in campus metres (equirectangular; good to centimetres here). */
export function rsToLatLon(point: Point): { lat: number; lon: number } {
  const lat0 = (RS_ORIGIN.lat * Math.PI) / 180;
  const metresPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0);
  const metresPerDegLon = 111412.84 * Math.cos(lat0);
  return {
    lat: RS_ORIGIN.lat + point[1] / metresPerDegLat,
    lon: RS_ORIGIN.lon + point[0] / metresPerDegLon,
  };
}
